import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderBumpsApi, OrderBumpsApiError } from './client.ts';

const OP = '81000000-0000-4000-8000-000000000001';
const OTHER = '81000000-0000-4000-8000-000000000002';
const NOW = '2026-10-09T06:00:00.000Z';
const config = { schemaVersion: 1, enabled: false, heading: 'Birlikte alın', placements: { sideCart: true, checkout: true }, maxOffers: 3, rules: [] } as const;
const workspace = { version: 0, updatedAt: null, config: { ...config, heading: 'Bunları da beğenebilirsiniz' } };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }

test('loads the real zero-version workspace with session credentials and no caching', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createOrderBumpsApi({ fetch: async (url, init) => { calls.push({ url: String(url), init }); return response({ workspace }); } });
  assert.deepEqual(await api.get(), workspace);
  assert.equal(calls[0].url, '/api/order-bumps');
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.equal(calls[0].init?.cache, 'no-store');
});

test('an unknown save preserves its exact intent across remount and fences a different payload', async () => {
  const store = storage(), calls: { body: unknown; operation: string | null }[] = [];
  const fetcher: typeof fetch = async (_url, init) => { calls.push({ body: JSON.parse(String(init?.body)), operation: new Headers(init?.headers).get('idempotency-key') }); if (calls.length === 1) throw Error('lost response'); return response({ workspace: { version: 1, updatedAt: NOW, config } }); };
  const first = createOrderBumpsApi({ fetch: fetcher, scope: 'shop-one', storage: store, randomUUID: () => OP });
  await assert.rejects(() => first.save({ expectedVersion: 0, config }), OrderBumpsApiError);
  assert.equal(first.hasUnresolved(), true);
  const restored = createOrderBumpsApi({ fetch: fetcher, scope: 'shop-one', storage: store, randomUUID: () => OTHER });
  assert.deepEqual(restored.pendingIntent(), { expectedVersion: 0, config });
  await assert.rejects(() => restored.save({ expectedVersion: 0, config: { ...config, heading: 'Farklı giriş' } }), (error: any) => error.code === 'unresolved');
  assert.equal(calls.length, 1);
  assert.equal((await restored.save({ expectedVersion: 0, config })).version, 1);
  assert.deepEqual(calls.map(call => call.operation), [OP, OP]);
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(restored.hasUnresolved(), false);
});

test('the synchronous save guard prevents duplicate writes before the first response', async () => {
  let finish!: (value: Response) => void, writes = 0;
  const api = createOrderBumpsApi({ fetch: async () => { writes++; return new Promise(resolve => { finish = resolve; }); }, randomUUID: () => OP });
  const pending = api.save({ expectedVersion: 0, config });
  await assert.rejects(() => api.save({ expectedVersion: 0, config }), (error: any) => error.code === 'unresolved');
  assert.equal(writes, 1);
  finish(response({ workspace: { version: 1, updatedAt: NOW, config } }));
  await pending;
});

test('known conflicts release transport recovery while malformed successful receipts keep it', async () => {
  const conflict = createOrderBumpsApi({ fetch: async () => response({ code: 'version_conflict' }, 409), randomUUID: () => OP });
  await assert.rejects(() => conflict.save({ expectedVersion: 0, config }), (error: any) => error.code === 'version_conflict');
  assert.equal(conflict.hasUnresolved(), false);
  const malformed = createOrderBumpsApi({ fetch: async () => response({ workspace: { version: 1, updatedAt: NOW, config: { ...config, heading: 'Yanlış kayıt' } } }), randomUUID: () => OP });
  await assert.rejects(() => malformed.save({ expectedVersion: 0, config }));
  assert.equal(malformed.hasUnresolved(), true);
  assert.deepEqual(malformed.pendingIntent(), { expectedVersion: 0, config });
});

test('paged and selected option requests encode only supported configuration queries', async () => {
  const urls: string[] = [];
  const api = createOrderBumpsApi({ fetch: async url => { urls.push(String(url)); return response({ options: { items: [{ id: OTHER, label: 'Mavi / M', productId: OP, priceCents: 12000, available: true }], page: 1, totalCount: 1 } }); } });
  await api.options({ kind: 'variant', page: 1, search: 'Mavi', productId: OP });
  await api.options({ kind: 'variant', ids: [OTHER] });
  const first = new URL(urls[0], 'https://panel.test');
  assert.equal(first.pathname, '/api/order-bumps/options');
  assert.equal(first.searchParams.get('kind'), 'variant');
  assert.equal(first.searchParams.get('productId'), OP);
  assert.equal(first.searchParams.get('search'), 'Mavi');
  const selected = new URL(urls[1], 'https://panel.test');
  assert.equal(selected.searchParams.get('ids'), OTHER);
  await assert.rejects(() => api.options({ kind: 'variant', page: 2, ids: [OTHER] }), (error: any) => error.code === 'invalid_input');
  assert.equal(urls.length, 2);
});

test('storage failure and noncanonical successful envelopes never permit an untracked mutation', async () => {
  let writes = 0;
  const broken = createOrderBumpsApi({ scope: 'shop-one', storage: { getItem: () => null, setItem: () => { throw Error(); }, removeItem: () => {} }, fetch: async () => { writes++; return response({ workspace }); }, randomUUID: () => OP });
  await assert.rejects(() => broken.save({ expectedVersion: 0, config }), (error: any) => error.code === 'storage_unavailable');
  assert.equal(writes, 0);
  assert.equal(broken.hasUnresolved(), false);
  assert.equal(broken.persistenceAvailable(), false);
  const wrongEnvelope = createOrderBumpsApi({ fetch: async () => response({ workspace, extra: true }) });
  await assert.rejects(() => wrongEnvelope.get(), OrderBumpsApiError);
});

test('a verified save receipt allows safe completion when journal cleanup fails, while fencing new writes', async () => {
  const tracked = storage(); let writes = 0;
  const brokenCleanup = { ...tracked, removeItem: () => { throw Error('storage_cleanup_blocked'); } };
  const api = createOrderBumpsApi({ scope: 'shop-cleanup', storage: brokenCleanup, randomUUID: () => OP, fetch: async () => { writes++; return response({ workspace: { version: 1, updatedAt: NOW, config } }); } });
  assert.equal((await api.save({ expectedVersion: 0, config })).version, 1);
  assert.equal(api.hasUnresolved(), false); assert.equal(api.pendingIntent(), null); assert.equal(api.persistenceAvailable(), false);
  await assert.rejects(() => api.save({ expectedVersion: 1, config: { ...config, heading: 'Yeni giriş' } }));
  assert.equal(writes, 1);
  const restored = createOrderBumpsApi({ scope: 'shop-cleanup', storage: brokenCleanup, randomUUID: () => OTHER, fetch: async (_url, init) => { writes++; assert.equal(new Headers(init?.headers).get('idempotency-key'), OP); return response({ workspace: { version: 1, updatedAt: NOW, config } }); } });
  assert.deepEqual(restored.pendingIntent(), { expectedVersion: 0, config });
  assert.equal((await restored.save({ expectedVersion: 0, config })).version, 1); assert.equal(restored.hasUnresolved(), false);
});

test('a known rejection remains definitive when journal cleanup fails and never permits a new write', async () => {
  const tracked = storage(); let writes = 0;
  const api = createOrderBumpsApi({ scope: 'shop-rejected', storage: { ...tracked, removeItem: () => { throw Error('storage_cleanup_blocked'); } }, randomUUID: () => OP, fetch: async () => { writes++; return response({ code: 'version_conflict' }, 409); } });
  await assert.rejects(() => api.save({ expectedVersion: 0, config }), (error: any) => error.code === 'version_conflict');
  assert.equal(api.hasUnresolved(), false); assert.equal(api.pendingIntent(), null); assert.equal(api.persistenceAvailable(), false);
  await assert.rejects(() => api.save({ expectedVersion: 1, config })); assert.equal(writes, 1);
});
