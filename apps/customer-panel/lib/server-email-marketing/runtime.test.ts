import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./runtime.ts').catch(() => ({})) as typeof import('./runtime.ts');
test('email capabilities are bound to one approved access runtime', () => { assert.equal(typeof api.registerServerEmailMarketingRepository, 'function'); const access: any = { readiness: { mode: 'approved_staging' }, panelOrigin: 'https://panel.saas-staging.celebix.net' }, other: any = { ...access }; const repo: any = Object.fromEntries(['overview', 'candidateProvider', 'validate', 'lists', 'preview', 'apply', 'rotate', 'recheck', 'disconnect', 'sync'].map(m => [m, () => Promise.resolve(null)])); api.registerServerEmailMarketingRepository(access, repo); assert.ok(api.resolveServerEmailMarketingRuntime(access)); assert.equal(api.resolveServerEmailMarketingRuntime(other), null); assert.throws(() => api.registerServerEmailMarketingRepository(access, repo)); assert.throws(() => api.registerServerEmailMarketingRepository({ readiness: { mode: 'disabled' } } as never, repo)); });

test('registered manual sync capability reaches the HTTP handler with its repository binding', async () => {
  const {createEmailMarketingHttpHandlers} = await import('../email-marketing-http/handler.ts');
  const id = '22900000-0000-4000-8000-000000000001', operationId = '22900000-0000-4000-8000-000000000002';
  const panelOrigin = 'https://panel.saas-staging.celebix.net';
  const inputs: any[] = [];
  const access: any = {readiness: {mode: 'approved_staging'}, panelOrigin,
    resolveCredential: async () => ({kind: 'authenticated', tenantContext: {schemaVersion: 1, requestId: id, principal: {id}, store: {id, slug: 'fixture', status: 'active'}, membership: {id, role: 'store_owner', status: 'active'}, entitlements: {status: 'active', features: ['integrations']}}})};
  const repository: any = {...Object.fromEntries(['overview', 'candidateProvider', 'validate', 'lists', 'preview', 'apply', 'rotate', 'recheck', 'disconnect'].map(method => [method, async () => null])), accountName: 'Registered account',
    async sync(input: any) {inputs.push(input); return {status: 'connected', accountName: this.accountName};}};
  api.registerServerEmailMarketingRepository(access, repository, {brevo:true,klaviyo:true});
  const handlers = createEmailMarketingHttpHandlers({resolveRuntime: async () => api.resolveServerEmailMarketingRuntime(access), now: () => new Date('2026-10-09T12:00:00Z'), requestId: () => id});
  const request = new Request('http://internal:3400/api/marketing/email-connections/sync', {method: 'POST', headers: {host: new URL(panelOrigin).hostname, origin: panelOrigin, cookie: `__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`, 'content-type': 'application/json', 'idempotency-key': operationId}, body: JSON.stringify({expectedVersion: 3})});
  const response = await handlers.post(request, 'sync');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {status: 'connected', accountName: 'Registered account'});
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].operationId, operationId);
  assert.equal(inputs[0].expectedVersion, 3);
  assert.equal(inputs[0].tenantContext.store.id, id);
});
