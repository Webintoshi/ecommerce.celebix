import assert from "node:assert/strict";
import test from "node:test";
import { ContentAuthoringRepositoryError } from "./errors.ts";
import { PostgresContentAuthoringRepository, toContentGenerationView } from "./repository.ts";
const id = "33333333-3333-4333-8333-333333333333", now = new Date("2026-09-29T12:00:00.000Z");
const tenantContext: any = {
    schemaVersion: 1, requestId: "request", principal: {
        id, issuer: "https://id.example", subject: "owner"
    }, store: {
        id, slug: "store", status: "active"
    }, membership: {
        id, role: "store_owner", status: "active"
    }, entitlements: {
        schemaVersion: 1, planId: id, planCode: "starter", version: 1, status: "active", features: ["catalog"], limits: {
            products: 100, staff: 5, storageBytes: 1024
        }, validFrom: "2026-01-01T00:00:00.000Z"
    }, locale: "tr-TR"
};
const generation: any = {
    id, draftId: id, productId: null, status: "pending", requestFingerprint: "a".repeat(64), sourceFingerprint: "b".repeat(64), provider: "deepseek", model: "model", configId: id, credentialVersion: 1, promptVersion: "v1", version: 1, dispatchState: "not_dispatched", claimToken: null, leaseExpiresAt: now.toISOString(), usage: null, draft: null, safeCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), finishedAt: null
};
function setup(commitError = false, outcome = "pending") {
    const calls: string[] = [];
    const parameters: unknown[][] = [];
    const client = {
        async query(text: string, values: unknown[] = []) {
            calls.push(text); parameters.push(values);
            if (text === "COMMIT" && commitError)
                throw Error("lost");
            return text.includes("saas.content_authoring_") ? {
                rows: [{
                        outcome, result_payload: generation
                    }], rowCount: 1, command: "", oid: 0, fields: []
            } : {
                rows: [], rowCount: 0, command: "", oid: 0, fields: []
            };
        }, release() {
        }
    };
    return {
        calls, parameters, repo: new PostgresContentAuthoringRepository({
            pool: {
                async connect() {
                    return client;
                }
            }, role: "celebix_saas_app", timeouts: {
                poolCheckoutMs: 100, statementMs: 500, lockMs: 500, idleTransactionMs: 500
            }, audit() {
            }
        })
    };
}
const begin = () => ({
    tenantContext, now, operationId: id, requestFingerprint: "a".repeat(64), providerBinding: {
        configId: id, provider: "deepseek", model: "model", credentialVersion: 1, promptVersion: "v1"
    }, envelope: {
        draftId: id, productId: null, sourceFingerprint: "b".repeat(64)
    }
});
test("begin persists exactly once and preserves unknown usage", async () => {
    const { repo, calls } = setup();
    assert.equal((await repo.beginGeneration(begin())).generation.usage, null);
    assert.equal(calls.filter(t => t.includes("content_authoring_begin_shared(")).length, 1);
    assert.equal(calls.at(-1), "COMMIT");
});
test("claim commit uncertainty never grants dispatch or retries mutation", async () => {
    const { repo, calls } = setup(true, "claimed");
    await assert.rejects(() => repo.claimGenerationDispatch({
        tenantContext, now, operationId: id, expectedVersion: 1
    }), /commit_unknown/);
    assert.equal(calls.filter(t => t.includes("content_authoring_claim")).length, 1);
});
test("cashier denied before pool checkout", async () => {
    const { repo, calls } = setup();
    await assert.rejects(() => repo.beginGeneration({
        ...begin(), tenantContext: {
            ...tenantContext, membership: {
                id, role: "cashier", status: "active"
            }
        }
    }), /membership_denied/);
    assert.equal(calls.length, 0);
});
test("public view removes credentials and lease authority", () => {
    const view = toContentGenerationView(generation);
    assert.equal(view.usage, null);
    for (const key of ["claimToken", "leaseExpiresAt", "configId", "credentialVersion", "requestFingerprint", "version", "dispatchState"])
        assert.equal(Object.hasOwn(view, key), false);
});
test("malformed nested provider payload cannot be persisted as a validated draft", async () => {
    const { repo, calls } = setup();
    await assert.rejects(() => repo.completeGeneration({
        tenantContext, now, operationId: id, claimToken: id, expectedVersion: 2, validatedDraft: {
            sourceFingerprint: 'b'.repeat(64), seoTitle: 'Title', suggestions: [], claims: [], sealedCredentials: 'secret'
        } as never, usage: null
    }));
    assert.equal(calls.length, 0);
});
test("canonical authority errors use the authoring error class and preserve recognized codes", async () => {
    for (const [code, context] of [
        ['unauthenticated', {
                ...tenantContext, principal: null
            }],
        ['feature_not_enabled', {
                ...tenantContext, entitlements: {
                    ...tenantContext.entitlements, features: []
                }
            }]
    ] as const) {
        for (const method of ['begin', 'get', 'claim', 'fail', 'complete', 'setting']) {
            const { repo, calls } = setup();
            const authority = {
                tenantContext: context, now, operationId: id
            };
            const invoke = () => method === 'begin' ? repo.beginGeneration({
                ...begin(), ...authority
            }) : method === 'get' ? repo.getGeneration(authority) : method === 'claim' ? repo.claimGenerationDispatch({
                ...authority, expectedVersion: 1
            }) : method === 'fail' ? repo.failGeneration({
                ...authority, expectedVersion: 1, claimToken: null, safeCode: 'cancelled', dispatchState: 'not_dispatched'
            }) : method === 'complete' ? repo.completeGeneration({
                ...authority, expectedVersion: 2, claimToken: id, validatedDraft: {
                    seoTitle: 'Title', suggestions: [], claims: [], sourceFingerprint: 'b'.repeat(64)
                }, usage: null
            }) : repo.setDailyLimit({
                ...authority, dailyLimit: 100
            });
            await assert.rejects(invoke, (e: unknown) => e instanceof ContentAuthoringRepositoryError && e.code === code, `${method}: ${code}`);
            assert.equal(calls.length, 0);
        }
    }
});
test("completion rejects nested shape and malformed usage before checkout", async () => {
    const valid = {
        seoTitle: 'Title', suggestions: [], claims: [], sourceFingerprint: 'b'.repeat(64)
    };
    for (const draft of [{
            ...valid, suggestions: [{
                    sealedCredentials: 'synthetic'
                }]
        }, {
            ...valid, claims: [{
                    field: 'seoTitle', factRef: 'r', value: 1
                }]
        }, {
            ...valid, description: [{
                    type: 'paragraph', children: [{
                            type: 'text', text: 't', credential: 'synthetic'
                        }]
                }]
        }, {
            suggestions: [], claims: [], sourceFingerprint: valid.sourceFingerprint
        }]) {
        const { repo, calls } = setup();
        await assert.rejects(() => repo.completeGeneration({
            tenantContext, now, operationId: id, claimToken: id, expectedVersion: 2, validatedDraft: draft as never, usage: null
        }));
        assert.equal(calls.length, 0);
    }
    for (const usage of [{
            inputTokens: 1, outputTokens: 1, totalTokens: 2, raw: 'synthetic'
        }, {
            inputTokens: null, outputTokens: 1, totalTokens: 1
        }, {
            inputTokens: 0.5, outputTokens: 0.5, totalTokens: 1
        }, {
            inputTokens: 2147483648, outputTokens: 0, totalTokens: 2147483648
        }]) {
        const { repo, calls } = setup();
        await assert.rejects(() => repo.completeGeneration({
            tenantContext, now, operationId: id, claimToken: id, expectedVersion: 2, validatedDraft: valid, usage: usage as never
        }));
        assert.equal(calls.length, 0);
    }
});
test("service reservation and provider limit errors can fail durably, arbitrary codes cannot", async () => {
    for (const safeCode of ['invalid_input', 'rate_limited', 'quota_exceeded']) {
        const { repo, calls } = setup();
        await repo.failGeneration({
            tenantContext, now, operationId: id, expectedVersion: 1, claimToken: null, safeCode, dispatchState: 'not_dispatched'
        });
        assert.equal(calls.filter(c => c.includes('content_authoring_fail')).length, 1);
    }
    const { repo, calls } = setup();
    await assert.rejects(() => repo.failGeneration({
        tenantContext, now, operationId: id, expectedVersion: 1, claimToken: null, safeCode: 'arbitrary_client_message', dispatchState: 'not_dispatched'
    }), e => e instanceof ContentAuthoringRepositoryError && e.code === 'invalid_input');
    assert.equal(calls.length, 0);
});


const failInput=()=>({tenantContext,now,operationId:id,expectedVersion:2,claimToken:id,safeCode:'invalid_output',dispatchState:'dispatched' as const});
test('failure v2 preserves optional NULL and measured usage in exact thirteen SQL parameters',async()=>{
 for(const measured of [undefined,null,{inputTokens:0,outputTokens:0,totalTokens:0},{inputTokens:2147483647,outputTokens:0,totalTokens:2147483647}]){
  const {repo,calls,parameters}=setup();await repo.failGeneration({...failInput(),...(measured===undefined?{}:{usage:measured})} as any);
  const pos=calls.findIndex(x=>x.includes('content_authoring_fail_v2('));assert.ok(pos>=0);assert.equal(parameters[pos].length,13);
  assert.deepEqual(parameters[pos].slice(7),[id,id,2,'invalid_output','dispatched',measured==null?null:JSON.stringify(measured)]);
 }
});
test('failure usage rejects malformed descriptor range sum and unauthorized dispatch before checkout',async()=>{
 let invoked=0;const getter=Object.defineProperty({outputTokens:1,totalTokens:2},'inputTokens',{enumerable:true,get(){invoked++;return 1;}});
 const hidden=Object.defineProperty({inputTokens:1,outputTokens:1,totalTokens:2},'raw',{value:'x'});
 const bad=[getter,hidden,{inputTokens:1,outputTokens:1,totalTokens:2,[Symbol('extra')]:1},{inputTokens:1,outputTokens:1,totalTokens:3},{inputTokens:2147483647,outputTokens:1,totalTokens:2147483648},{inputTokens:-1,outputTokens:2,totalTokens:1},{inputTokens:1.5,outputTokens:0,totalTokens:1.5},{inputTokens:'1',outputTokens:1,totalTokens:2},{inputTokens:null,outputTokens:1,totalTokens:1},{inputTokens:NaN,outputTokens:0,totalTokens:0},new Proxy({inputTokens:1,outputTokens:1,totalTokens:2},{getOwnPropertyDescriptor(){invoked++;throw Error();}})];
 for(const measured of bad){const{repo,calls}=setup();await assert.rejects(()=>repo.failGeneration({...failInput(),usage:measured}as any),e=>e instanceof ContentAuthoringRepositoryError&&e.code==='invalid_input');assert.equal(calls.length,0);}
 for(const change of [{claimToken:null},{safeCode:'cancelled'},{dispatchState:'not_dispatched'},{dispatchState:'unknown'}]){const{repo,calls}=setup();await assert.rejects(()=>repo.failGeneration({...failInput(),...change,usage:{inputTokens:1,outputTokens:1,totalTokens:2}}as any),/invalid_input/);assert.equal(calls.length,0);}
 const {repo,calls}=setup();const accessor=Object.defineProperty(failInput(),'usage',{enumerable:true,get(){invoked++;return null;}});await assert.rejects(()=>repo.failGeneration(accessor),/invalid_input/);assert.equal(calls.length,0);assert.equal(invoked,0);
});
test('failure v2 COMMIT uncertainty is never retried',async()=>{const{repo,calls}=setup(true);await assert.rejects(()=>repo.failGeneration({...failInput(),usage:{inputTokens:1,outputTokens:2,totalTokens:3}}as any),/commit_unknown/);assert.equal(calls.filter(x=>x.includes('content_authoring_fail_v2')).length,1);});
