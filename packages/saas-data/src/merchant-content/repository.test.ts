import assert from 'node:assert/strict';
import test from 'node:test';
const module = await import('./repository.ts').catch(() => ({ PostgresMerchantContentRepository: undefined }));
const id = '11111111-1111-4111-8111-111111111111', now = new Date('2026-09-29T12:00:00.000Z');
const tenantContext: any = { schemaVersion: 1, requestId: 'request', principal: { id, issuer: 'https://id.example.test', subject: 'owner' }, store: { id, slug: 'store', status: 'active' }, membership: { id, role: 'store_owner', status: 'active' }, entitlements: { schemaVersion: 1, planId: id, planCode: 'free_starter', version: 1, status: 'active', features: ['catalog'], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: '2026-01-01T00:00:00.000Z' }, locale: 'tr' };
const request: any = { draftId: id, recordId: null, expectedVersion: null, expectedBodyDigest: null, kind: 'page', bodyAction: 'replace', values: { name: 'Page', slug: 'page', locale: 'tr', body: '<p>Body</p>', excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' }, origins: {} };
const document: any = { ...request.values, id, kind: 'page', version: 1, publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), bodyFormat: 'normalized_html', bodyDigest: 'sha256:' + 'a'.repeat(64), origins: {} };
function setup(options: {
    commitLost?: boolean;
    neverCommit?: boolean;
    payload?: unknown;
    outcome?: string;
    recoveryMissing?: boolean;
} = {}) {
    assert.equal(typeof module.PostgresMerchantContentRepository, 'function', 'typed repository must exist');
    const calls: {
        text: string;
        values: unknown[];
        connection: number;
    }[] = [], released: boolean[] = [];
    let connections = 0;
    const pool = { async connect() { const connection = ++connections; return { async query(text: string, values: unknown[] = []) { calls.push({ text, values, connection }); if (text === 'COMMIT' && connection === 1) {
                if (options.neverCommit)
                    return new Promise<any>(() => { });
                if (options.commitLost)
                    throw Error('lost');
            } const recovering = text.includes('merchant_content_recover_operation'); const outcome = recovering ? (options.recoveryMissing ? 'operation_not_found' : 'operation_replayed') : (options.outcome ?? (text.includes('merchant_content_get') ? 'found' : 'saved')); return { rows: text.includes('FROM saas.') ? [{ outcome, result_payload: options.payload ?? document }] : [], rowCount: text.includes('FROM saas.') ? 1 : 0, fields: [], command: '', oid: 0 }; }, release(destroy?: boolean) { released.push(!!destroy); } }; } };
    const repo = new module.PostgresMerchantContentRepository!({ pool, role: 'celebix_saas_app', timeouts: { poolCheckoutMs: 100, statementMs: 50, lockMs: 50, idleTransactionMs: 100 }, audit() { } });
    return { repo, calls, released };
}
const input = () => ({ tenantContext, now, operationId: id, request });
test('save sends full parsed 80000-byte body once with stable request fingerprint', async () => { const { repo, calls } = setup(); const long = { ...request, values: { ...request.values, body: '<pre>' + '\n'.repeat(79989) + '</pre>' } }; await repo.save({ ...input(), request: long }); const saved = calls.filter(c => c.text.includes('merchant_content_save')); assert.equal(saved.length, 1); assert.equal(JSON.parse(saved[0]!.values[9] as string).values.body, long.values.body); assert.match(saved[0]!.values[8] as string, /^[a-f0-9]{64}$/); assert.equal(calls.at(-1)?.text, 'COMMIT'); });
test('unknown COMMIT destroys writer and recovers exact saved document on fresh read connection without re-save', async () => { const { repo, calls, released } = setup({ commitLost: true }); const value = await repo.save(input()); assert.deepEqual(value, { document, replayed: true }); assert.equal(calls.filter(c => c.text.includes('merchant_content_save')).length, 1); assert.equal(calls.filter(c => c.text.includes('merchant_content_recover_operation')).length, 1); assert.ok(calls.some(c => c.connection === 2 && c.text === 'BEGIN READ ONLY')); assert.equal(released[0], true); });
test('never-resolving COMMIT is bounded and not retried', async () => { const { repo, calls } = setup({ neverCommit: true }); const start = Date.now(); assert.equal((await repo.save(input())).replayed, true); assert.ok(Date.now() - start < 1000); assert.equal(calls.filter(c => c.text.includes('merchant_content_save')).length, 1); });
test('unknown COMMIT with no committed operation remains commit_unknown', async () => { const { repo, calls } = setup({ commitLost: true, recoveryMissing: true }); await assert.rejects(() => repo.save(input()), /commit_unknown/); assert.equal(calls.filter(c => c.text.includes('merchant_content_save')).length, 1); });
test('getter symbol and hidden request/authority fields reject before checkout or invocation', async () => { let invoked = 0; for (const level of ['input', 'request', 'authority']) {
    const { repo, calls } = setup();
    const value: any = input();
    value.tenantContext = { ...tenantContext };
    value.request = { ...request };
    const target = level === 'input' ? value : level === 'request' ? value.request : value.tenantContext;
    Object.defineProperty(target, 'extra', { enumerable: true, get() { invoked++; return 1; } });
    await assert.rejects(() => repo.save(value), /invalid_input/);
    assert.equal(calls.length, 0);
} assert.equal(invoked, 0); for (const key of [Symbol('hidden'), 'hidden']) {
    const { repo, calls } = setup();
    const value = input();
    Object.defineProperty(value, key, { value: 1, enumerable: false });
    await assert.rejects(() => repo.save(value), /invalid_input/);
    assert.equal(calls.length, 0);
} });
test('read response is exact and bound to requested record and kind', async () => { for (const bad of [{ ...document, id: '22222222-2222-4222-8222-222222222222' }, { ...document, kind: 'blog_post' }, { ...document, secret: 'x' }]) {
    const { repo } = setup({ payload: bad });
    await assert.rejects(() => repo.get({ tenantContext, now, kind: 'page', recordId: id }), /unavailable/);
} });
test('required page metadata is negotiated inside each read and recovery transaction',async()=>{
 const {repo,calls}=setup({payload:{...document,requiredPageKey:'about'}});
 assert.equal((await repo.get({tenantContext,now,kind:'page',recordId:id})).requiredPageKey,'about');
 // Separate connections are used by the read, write and lost-commit recovery.
 const recovery=setup({commitLost:true,payload:{...document,requiredPageKey:'about'}});
 assert.equal((await recovery.repo.save(input())).document.requiredPageKey,'about');
 for(const connection of [1,2]){
  const scoped=recovery.calls.filter(call=>call.connection===connection);
  const negotiation=scoped.findIndex(call=>call.text.includes('saas.required_pages_projection_version'));
  assert.ok(negotiation>scoped.findIndex(call=>call.text.startsWith('BEGIN')));
  assert.ok(negotiation<scoped.findIndex(call=>call.text.includes('FROM saas.')));
  assert.deepEqual(scoped[negotiation]?.values,['1']);
  assert.match(scoped[negotiation]!.text,/\$1, true\)/);
 }
 assert.ok(calls.some(call=>call.text.includes('saas.required_pages_projection_version')));
});
test('current content writer permissions deny analyst and cashier before database acquisition', async () => { for (const role of ['analyst', 'cashier']) {
    const { repo, calls } = setup();
    await assert.rejects(() => repo.save({ ...input(), tenantContext: { ...tenantContext, membership: { ...tenantContext.membership, role } } }), /membership_denied/);
    assert.equal(calls.length, 0);
} });
test('versions enforces finite integer cursor and bounded page before acquisition', async () => { for (const parameters of [{ limit: 0 }, { limit: 51 }, { limit: 1, beforeVersion: 0 }, { limit: 1, beforeVersion: 1.5 }]) {
    const { repo, calls } = setup();
    await assert.rejects(() => repo.listVersions({ tenantContext, now, kind: 'page', recordId: id, ...parameters }), /invalid_input/);
    assert.equal(calls.length, 0);
} });
test('malformed response getter is never invoked while classifying a contract error', async () => { let reads = 0; const payload = { ...document }; Object.defineProperty(payload, 'body', { enumerable: true, get() { reads++; return '<p>x</p>'; } }); const { repo } = setup({ payload }); await assert.rejects(() => repo.get({ tenantContext, now, kind: 'page', recordId: id }), /unavailable/); assert.equal(reads, 0); });
test('unrecoverable historical window is explicitly surfaced rather than empty history',async()=>{
 const {repo}=setup({outcome:'history_unavailable'});
 await assert.rejects(()=>repo.listVersions({tenantContext,now,kind:'page',recordId:id,limit:50}),/history_unavailable/);
});
