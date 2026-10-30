import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { createPolicyAuthoringHttpHandler } from './handler.ts';
const ID = '72000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-30T12:00:00Z');
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`;
const PATH = 'https://fixture.admin.celebix.site/api/content-ai/policies';
const input = { kind: 'policy', draftId: ID, policyKey: 'kvkk', policyVersion: 3, currentBody: '<p>Mevcut metin.</p>', locale: 'tr' };
const result = { kind: 'policy', operationId: ID, draftId: ID, policyKey: 'kvkk', policyVersion: 3, requestFingerprint: 'a'.repeat(64), body: '<p>Yeni metin.</p>', suggestions: [], chargedCredits: 7, wallet: { balance: 3, reserved: 0, available: 3 } };
function req(body: unknown = input, headers: HeadersInit = {}, url = PATH) {
  return new Request(url, { method: 'POST', headers: { host: 'fixture.admin.celebix.site', cookie: `__Host-celebix_panel=${COOKIE}`, origin: 'https://fixture.admin.celebix.site', 'content-type': 'application/json', 'idempotency-key': ID, ...Object.fromEntries(new Headers(headers)) }, body: JSON.stringify(body) });
}
function fixture(options: { role?: string; storeStatus?: string; membershipStatus?: string; planIndex?: number; requestBudgetMs?: number; accessKind?: string; error?: Error } = {}) {
  let calls = 0;
  let received: any;
  const plan = COMMERCIAL_PACKAGES[options.planIndex ?? 3]!;
  const tenantContext = { store: { id: ID, slug: 'fixture', status: options.storeStatus ?? 'active' }, membership: { role: options.role ?? 'editor', status: options.membershipStatus ?? 'active' }, entitlements: { schemaVersion: 1, planId: plan.id, planCode: plan.code, version: plan.version, status: 'active', features: plan.features, limits: plan.limits, validFrom: '2026-01-01T00:00:00Z' } };
  const h = createPolicyAuthoringHttpHandler({ resolveRuntime: async () => ({ access: { panelOrigin: 'https://panel.celebix.site', resolveCredential: async () => ({ kind: options.accessKind ?? 'authenticated', tenantContext }) }, service: { generate: async (value: any) => { calls++; received = value; if (options.error) throw options.error; return result; } } } as never), now: () => NOW, requestId: () => ID, requestBudgetMs: options.requestBudgetMs });
  return { h, calls: () => calls, received: () => received, tenantContext };
}
test('policy generation uses authenticated authority and returns an uncached direct result', async () => {
  const f = fixture(), response = await f.h(req());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), result);
  assert.equal(f.calls(), 1);
  assert.equal(f.received().tenantContext, f.tenantContext);
  assert.equal(f.received().operationId, ID);
  assert.deepEqual(f.received().request, input);
  assert.equal(f.received().signal instanceof AbortSignal, true);
  assert.equal(Number.isFinite(f.received().deadlineAt), true);
});
test('session, exact store origin and caller authority forgery fail before generation', async () => {
  for (const [headers, status] of [[{ origin: 'https://evil.test' }, 403], [{ origin: 'https://other.admin.celebix.site' }, 403], [{ cookie: '' }, 401], [{ authorization: 'Bearer forged' }, 400], [{ 'x-store-id': ID }, 400], [{ 'x-celebix-store': ID }, 400], [{ 'x-panel-session-credential': COOKIE }, 400], [{ 'idempotency-key': '' }, 400], [{ 'idempotency-key': `${ID},${ID}` }, 400]] as const) {
    const f = fixture();
    assert.equal((await f.h(req(input, headers))).status, status);
    assert.equal(f.calls(), 0);
  }
});
test('content authority, active membership and commercial AI are mandatory', async () => {
  for (const options of [{ role: 'analyst' }, { storeStatus: 'suspended' }, { membershipStatus: 'revoked' }, { planIndex: 0 }, { accessKind: 'unauthorized' }]) {
    const f = fixture(options);
    assert.equal((await f.h(req())).status, 403);
    assert.equal(f.calls(), 0);
  }
  const unauthenticated = fixture({ accessKind: 'unauthenticated' });
  assert.equal((await unauthenticated.h(req())).status, 401);
  assert.equal(unauthenticated.calls(), 0);
});
test('wrong policy, client facts and provider overrides are rejected before generation', async () => {
  for (const body of [{ ...input, policyKey: 'about' }, { ...input, policyVersion: 0 }, { ...input, provider: 'openai' }, { ...input, facts: { storeId: ID } }, { ...input, locale: 'en' }, { ...input, currentBody: 'ü'.repeat(50_001) }]) {
    const f = fixture();
    assert.equal((await f.h(req(body))).status, 400);
    assert.equal(f.calls(), 0);
  }
});
test('body size, encoding, content type and declared length are bounded before generation', async () => {
  const cases: Record<string, string>[] = [{ 'content-type': 'text/plain' }, { 'content-length': '125001' }, { 'content-length': '0' }, { 'transfer-encoding': 'chunked' }];
  for (const headers of cases) {
    const f = fixture();
    assert.equal((await f.h(req(input, headers))).status, 400);
    assert.equal(f.calls(), 0);
  }
  const f = fixture();
  assert.equal((await f.h(req({ ...input, currentBody: 'x'.repeat(125_001) }))).status, 400);
  const invalidUtf8 = new Request(PATH, { method: 'POST', headers: req().headers, body: new Uint8Array([123, 255, 125]) });
  assert.equal((await f.h(invalidUtf8)).status, 400);
  assert.equal(f.calls(), 0);
});
test('unfinished request body is cancelled at the deadline without starting generation', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const request = new Request(PATH, { method: 'POST', headers: req().headers, body: stream, duplex: 'half' } as RequestInit);
  const f = fixture({ requestBudgetMs: 10 }), response = await f.h(request);
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { code: 'provider_timeout' });
  assert.equal(cancelled, true);
  assert.equal(f.calls(), 0);
});
test('query, fragment and non-POST requests never dispatch generation', async () => {
  const f = fixture();
  assert.equal((await f.h(req(input, {}, `${PATH}?store=${ID}`))).status, 400);
  assert.equal((await f.h(req(input, {}, `${PATH}#fragment`))).status, 400);
  assert.equal((await f.h(new Request(PATH))).status, 405);
  assert.equal(f.calls(), 0);
});
test('unexpected service failures expose no private error details', async () => {
  const f = fixture({ error: Error('private merchant or provider material') });
  const response = await f.h(req());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'unavailable' });
});
