import assert from "node:assert/strict";
import test from "node:test";
import { ContentResourceAuthoringRepositoryError } from "./errors.ts";
import { PostgresContentResourceAuthoringRepository } from "./repository.ts";
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
const target = { kind: 'page', draftId: id, recordId: null, recordVersion: null };
const generation: any = { id, target, stage: 'outline', status: 'pending', requestFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64), configId: id, provider: 'deepseek', model: 'deepseek-flash', credentialVersion: 1, promptVersion: 'resource-v1', version: 1, dispatchState: 'not_dispatched', claimToken: null, leaseExpiresAt: now.toISOString(), usage: null, outline: null, draft: null, safeCode: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), finishedAt: null };
function setup(commit: 'ok' | 'throw' | 'hang' = 'ok') {
    const calls: string[] = [], parameters: unknown[][] = [], releases: unknown[] = [];
    let result = generation, outcome = 'pending';
    const client = { async query(text: string, values: unknown[] = []) { calls.push(text); parameters.push(values); if (text === 'COMMIT') {
            if (commit === 'throw')
                throw Error('lost');
            if (commit === 'hang')
                return new Promise<any>(() => { });
        } return text.includes('saas.content_resource_authoring_') ? { rows: [{ outcome, result_payload: result }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release(destroy?: boolean) { releases.push(destroy); } };
    const repo = new PostgresContentResourceAuthoringRepository({ pool: { async connect() { return client; } }, role: 'celebix_saas_app', timeouts: { poolCheckoutMs: 50, statementMs: 40, lockMs: 20, idleTransactionMs: 50 }, audit() { } });
    return { repo, calls, parameters, releases, response(g: any, o = 'failed') { result = g; outcome = o; } };
}
const begin = () => ({ tenantContext, now, operationId: id, requestFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64), target, stage: 'outline' as const, providerBinding: { configId: id, provider: 'deepseek', model: 'deepseek-flash', credentialVersion: 1, promptVersion: 'resource-v1' } });
const failure = (usage?: unknown) => ({ tenantContext, now, operationId: id, expectedVersion: 2, claimToken: id, safeCode: 'invalid_output', dispatchState: 'dispatched' as const, ...(usage === undefined ? {} : { usage }) });
test('begin uses separate resource RPC and immutable target binding', async () => { const s = setup(); assert.equal((await s.repo.beginGeneration(begin() as any)).kind, 'pending'); assert.equal(s.calls.filter(x => x.includes('saas.content_resource_authoring_begin')).length, 1); assert.ok(s.parameters.some(p => p.some(v => typeof v === 'string' && v.includes('draftId')))); });
test('known invalid-output usage is preserved and absent usage stays SQLNULL', async () => { for (const measured of [undefined, null, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, { inputTokens: 1440, outputTokens: 354, totalTokens: 1794 }]) {
    const s = setup();
    s.response({ ...generation, status: 'failed', version: 3, dispatchState: 'dispatched', claimToken: id, usage: measured ?? null, safeCode: 'invalid_output', finishedAt: now.toISOString() });
    const g = await s.repo.failGeneration(failure(measured) as any);
    assert.deepEqual(g.usage, measured ?? null);
    const p = s.parameters[s.calls.findIndex(x => x.includes('saas.content_resource_authoring_fail'))]!;
    assert.equal(p.at(-1), measured == null ? null : JSON.stringify(measured));
} });
test('malformed usage and accessor/symbol/hidden values reject without query or invocation', async () => { let invoked = 0; const getter = Object.defineProperty({ outputTokens: 0, totalTokens: 0 }, 'inputTokens', { enumerable: true, get() { invoked++; return 0; } }); for (const measured of [getter, { inputTokens: 0, outputTokens: 0, totalTokens: 0, [Symbol('x')]: 0 }, Object.defineProperty({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }, 'hidden', { value: 0 }), { inputTokens: 2147483647, outputTokens: 1, totalTokens: 2147483648 }, { inputTokens: -1, outputTokens: 0, totalTokens: -1 }, { inputTokens: '1', outputTokens: 0, totalTokens: 1 }, { inputTokens: 0.5, outputTokens: 0, totalTokens: 0.5 }]) {
    const s = setup();
    await assert.rejects(s.repo.failGeneration(failure(measured) as any));
    assert.equal(s.calls.length, 0);
} assert.equal(invoked, 0); });
test('usage is disallowed outside claimed dispatched invalid-output', async () => { for (const changes of [{ safeCode: 'provider_timeout' }, { dispatchState: 'unknown' }, { claimToken: null }]) {
    const s = setup();
    await assert.rejects(s.repo.failGeneration({ ...failure({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }), ...changes } as any));
    assert.equal(s.calls.length, 0);
} });
test('COMMIT lost or blackholed destroys connection once and does not retry dispatch', async () => { for (const mode of ['throw', 'hang'] as const) {
    const s = setup(mode), started = Date.now();
    await assert.rejects(s.repo.beginGeneration(begin() as any), { code: 'commit_unknown' });
    assert.ok(Date.now() - started < 500);
    assert.deepEqual(s.releases, [true]);
    assert.equal(s.calls.filter(x => x.includes('saas.content_resource_authoring_begin')).length, 1);
    assert.equal(s.calls.filter(x => x === 'ROLLBACK').length, 0);
} });
