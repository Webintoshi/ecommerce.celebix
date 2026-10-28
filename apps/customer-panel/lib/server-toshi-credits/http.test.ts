import assert from 'node:assert/strict';
import test from 'node:test';
import { TOSHI_CREDIT_OFFERS, TOSHI_CREDIT_PRICES } from '@celebix/saas-contracts';
import { createToshiCreditsHttpHandler } from './http.ts';
const ID = '72000000-0000-4000-8000-000000000001', NOW = new Date('2026-10-27T12:00:00Z'), COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`;
const wallet = { balance: 500, reserved: 10, available: 490 };
function request(headers: HeadersInit = {}, suffix = '') { return new Request('https://fixture.admin.celebix.site/api/toshi/credits' + suffix, { headers: { host: 'fixture.admin.celebix.site', cookie: `__Host-celebix_panel=${COOKIE}`, ...Object.fromEntries(new Headers(headers)) } }); }
function fixture(role = 'editor', status = 'active', suppliedWallet: unknown = wallet) {
  let calls = 0, authority: unknown;
  const tenantContext = { store: { id: ID, slug: 'fixture', status }, membership: { status: 'active', role } };
  const h = createToshiCreditsHttpHandler({ resolveRuntime: async () => ({ access: { resolveCredential: async (input: unknown) => { authority = input; return { kind: 'authenticated', tenantContext }; } }, repository: { getWallet: async (input: unknown) => { calls++; assert.deepEqual(input, { tenantContext, now: NOW }); return suppliedWallet; } } } as never), now: () => NOW, requestId: () => ID });
  return { h, calls: () => calls, authority: () => authority };
}
test('credits GET returns only fixed public prices and authenticated store wallet without caching', async () => {
  const f = fixture(), r = await f.h(request());
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { wallet, offers: TOSHI_CREDIT_OFFERS, prices: TOSHI_CREDIT_PRICES });
  assert.equal(f.calls(), 1); assert.deepEqual(f.authority(), { credential: COOKIE, hostname: 'fixture.admin.celebix.site', requestId: ID, now: NOW });
});
test('forged authority, query input and oversized cookies are rejected before wallet access', async () => {
  for (const [headers, suffix, status] of [[{ 'x-store-id': ID }, '', 400], [{ authorization: 'Bearer forged' }, '', 400], [{ cookie: '' }, '', 401], [{ cookie: 'x'.repeat(5000) }, '', 401], [{}, '?storeId=' + ID, 400]] as const) {
    const f = fixture(), r = await f.h(request(headers, suffix)); assert.equal(r.status, status); assert.equal(f.calls(), 0);
  }
});
test('inactive stores and roles lacking catalog access cannot read credits', async () => {
  for (const f of [fixture('viewer'), fixture('editor', 'suspended')]) { assert.equal((await f.h(request())).status, 403); assert.equal(f.calls(), 0); }
});
test('malformed wallet response is unavailable without private details', async () => {
  const f = fixture('editor', 'active', { ...wallet, providerKey: 'never-public' });
  const r = await f.h(request()); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { code: 'unavailable' });
});
test('stalled runtime resolution has a finite deadline', async () => {
  const h = createToshiCreditsHttpHandler({ resolveRuntime: () => new Promise(() => {}), now: () => NOW, requestId: () => ID, requestBudgetMs: 10 });
  assert.equal((await h(request())).status, 503);
});
