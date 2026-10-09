import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderBumpHandlers } from './handler.ts';
import { createDefaultOrderBumpSettings } from '@celebix/saas-contracts';
import { OrderBumpRepositoryError } from '@celebix/saas-data';
import type { ServerOrderBumpRuntime } from '../server-order-bumps/runtime.ts';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const OP = '79000000-0000-4000-8000-000000000001';
const ID = '79000000-0000-4000-8000-000000000002';
function harness(role = 'store_owner', failure?: Error) {
  const calls: unknown[] = [];
  const config = createDefaultOrderBumpSettings();
  const workspace = { version: 0, updatedAt: null, config };
  const context = { store: { id: ID, slug: 'siora' }, membership: { role } };
  const runtime = {
    access: { panelOrigin: 'https://panel.saas-staging.celebix.site', resolveCredential: async () => ({ kind: 'authenticated', tenantContext: context }) },
    orderBumps: {
      get: async (x: unknown) => { calls.push(x); if (failure) throw failure; return workspace; },
      save: async (x: unknown) => { calls.push(x); if (failure) throw failure; return { ...workspace, version: 1, updatedAt: NOW.toISOString() }; },
      options: async (x: unknown) => { calls.push(x); if (failure) throw failure; return { page: 1, totalCount: 1, items: [{ id: ID, label: 'Kırmızı / M', productId: OP, priceCents: 25000, available: true }] }; },
    },
  } as unknown as ServerOrderBumpRuntime;
  return { calls, config, workspace, context, handlers: createOrderBumpHandlers({ resolveRuntime: async () => runtime, now: () => NOW, requestId: () => OP }) };
}
function request(body?: unknown, headers: HeadersInit = {}, path = '/api/order-bumps') {
  const h = new Headers({ cookie: `__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`, origin: 'https://panel.saas-staging.celebix.site', 'content-type': 'application/json', 'idempotency-key': OP });
  new Headers(headers).forEach((value, key) => h.set(key, value));
  return new Request('http://internal:3400' + path, { method: body === undefined ? 'GET' : 'POST', headers: h, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test('read and first direct save bind the authenticated tenant, never client authority', async () => {
  const h = harness();
  const read = await h.handlers.get(request());
  assert.equal(read.status, 200); assert.deepEqual(await read.json(), { workspace: h.workspace });
  const saved = await h.handlers.save(request({ expectedVersion: 0, config: h.config }));
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { workspace: { ...h.workspace, version: 1, updatedAt: NOW.toISOString() } });
  assert.deepEqual(h.calls[1], { tenantContext: h.context, now: NOW, operationId: OP, expectedVersion: 0, config: h.config });
  assert.equal(saved.headers.get('cache-control'), 'no-store');
});
test('forged tenant, price fields, malformed CAS and absent operation are rejected before writes', async () => {
  const h = harness(); const value = { expectedVersion: 0, config: h.config };
  for (const raw of [{ ...value, storeId: ID }, { ...value, priceCents: 1 }, { ...value, expectedVersion: -1 }, { ...value, expectedVersion: 0.5 }, { ...value, config: { ...h.config, priceCents: 1 } }, { config: h.config }]) {
    assert.equal((await h.handlers.save(request(raw))).status, 400);
  }
  assert.equal((await h.handlers.save(request(value, { 'idempotency-key': '' }))).status, 400);
  assert.equal(h.calls.length, 0);
});
test('origin/session/role guards run before read or save', async () => {
  const h = harness(); const value = { expectedVersion: 0, config: h.config };
  assert.equal((await h.handlers.save(request(value, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await h.handlers.save(request(value, { cookie: '' }))).status, 401);
  assert.equal((await h.handlers.get(request(undefined, { cookie: '' }))).status, 401);
  assert.equal(h.calls.length, 0);
  const cashier = harness('cashier');
  assert.equal((await cashier.handlers.get(request())).status, 403);
  assert.equal((await cashier.handlers.save(request(value))).status, 403);
  assert.equal((await cashier.handlers.options(request(undefined, {}, '/api/order-bumps/options?kind=variant&page=1'))).status, 403);
  assert.equal(cashier.calls.length, 0);
});
test('options are bounded, paged and server-scoped', async () => {
  const h = harness();
  const response = await h.handlers.options(request(undefined, {}, '/api/order-bumps/options?kind=variant&page=1&search=K%C4%B1rm%C4%B1z%C4%B1&productId=' + OP));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls[0], { tenantContext: h.context, now: NOW, kind: 'variant', page: 1, search: 'Kırmızı', productId: OP });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('options reject spoofing, repeated queries and incompatible filters', async () => {
  const h = harness();
  for (const query of ['kind=variant&page=0', 'kind=all&page=1', 'kind=product&page=1&storeId=' + ID, 'kind=product&page=1&page=2', 'kind=category&page=1&productId=' + ID, 'kind=variant&page=1&ids=bad', 'kind=variant&page=2&ids=' + ID, 'kind=variant&page=1&search=x&ids=' + ID, 'kind=variant&page=1&ids=' + ID + ',' + ID]) {
    assert.equal((await h.handlers.options(request(undefined, {}, '/api/order-bumps/options?' + query))).status, 400, query);
  }
  assert.equal(h.calls.length, 0);
});
test('selected references retain their ids without granting client-supplied catalog values', async () => {
  const h = harness();
  assert.equal((await h.handlers.options(request(undefined, {}, '/api/order-bumps/options?kind=variant&page=1&ids=' + ID))).status, 200);
  assert.deepEqual(h.calls[0], { tenantContext: h.context, now: NOW, kind: 'variant', page: 1, ids: [ID] });
});
test('CAS, operation mismatch and invalid references have explicit conflict receipts', async () => {
  for (const code of ['version_conflict', 'operation_mismatch', 'invalid_reference'] as const) {
    const h = harness('store_owner', new OrderBumpRepositoryError(code));
    const response = await h.handlers.save(request({ expectedVersion: 0, config: h.config }));
    assert.equal(response.status, 409); assert.deepEqual(await response.json(), { code });
  }
});
test('uncertain or unexpected backend failures never return success or expose database messages', async () => {
  const h = harness('store_owner', new Error('SQL secret connection details'));
  const response = await h.handlers.save(request({ expectedVersion: 0, config: h.config }));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'unavailable' });
});
