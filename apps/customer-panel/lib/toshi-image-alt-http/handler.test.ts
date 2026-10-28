import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { createToshiImageAltHttpHandler } from './handler.ts';
const ID = '72000000-0000-4000-8000-000000000001', NOW = new Date('2026-10-27T12:00:00Z');
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYpQAAAAASUVORK5CYII=';
const input = { draftId: ID, productId: null, context: { title: 'Ürün' }, images: [{ id: 'image-0', dataUrl: PNG }] };
const result = { results: [{ id: 'image-0', altText: 'Ürün' }], failedIds: [], chargedCredits: 1, wallet: { balance: 9, reserved: 0, available: 9 } };
function req(body: unknown = input, headers: HeadersInit = {}) { return new Request('https://fixture.admin.celebix.site/api/content-ai/image-alts', { method: 'POST', headers: { host: 'fixture.admin.celebix.site', cookie: `__Host-celebix_panel=${COOKIE}`, origin: 'https://fixture.admin.celebix.site', 'content-type': 'application/json', 'idempotency-key': ID, ...Object.fromEntries(new Headers(headers)) }, body: JSON.stringify(body) }); }
function fixture(planIndex = 3, requestBudgetMs?: number) {
  let calls = 0; const plan = COMMERCIAL_PACKAGES[planIndex]!;
  const h = createToshiImageAltHttpHandler({ resolveRuntime: async () => ({ access: { panelOrigin: 'https://panel.celebix.site', resolveCredential: async () => ({ kind: 'authenticated', tenantContext: { store: { id: ID, slug: 'fixture', status: 'active' }, membership: { role: 'editor', status: 'active' }, entitlements: { schemaVersion: 1, planId: plan.id, planCode: plan.code, version: plan.version, status: 'active', features: plan.features, limits: plan.limits, validFrom: '2026-01-01T00:00:00Z' } } }) }, service: { generate: async (value: any) => { calls++; assert.equal(value.operationId, ID); assert.equal(value.request.images[0].id, 'image-0'); return result; } } } as never), now: () => NOW, requestId: () => ID, requestBudgetMs });
  return { h, calls: () => calls };
}
test('image alt endpoint uses authenticated tenant authority and uncached response', async () => { const f = fixture(), response = await f.h(req()); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(await response.json(), result); assert.equal(f.calls(), 1); });
test('origin, cookie and caller authority forgery fail before service dispatch', async () => {
  for (const [headers, status] of [[{ origin: 'https://evil.test' }, 403], [{ origin: 'https://other.admin.celebix.site' }, 403], [{ cookie: '' }, 401], [{ 'x-store-id': ID }, 400], [{ 'idempotency-key': '' }, 400]] as const) { const f = fixture(); assert.equal((await f.h(req(input, headers))).status, status); assert.equal(f.calls(), 0); }
});
test('AI entitlement and bounded data URL inputs are mandatory', async () => {
  const free = fixture(0); assert.equal((await free.h(req())).status, 403); assert.equal(free.calls(), 0);
  for (const body of [{ ...input, images: [{ id: 'x', dataUrl: 'https://example.test/image.jpg' }] }, { ...input, provider: 'openai' }, { ...input, context: { title: 'x'.repeat(1_048_576) } }]) { const f = fixture(); assert.equal((await f.h(req(body))).status, 400); assert.equal(f.calls(), 0); }
});
test('unfinished request body is cancelled at the bounded deadline before paid work', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const request = new Request('https://fixture.admin.celebix.site/api/content-ai/image-alts', { method: 'POST', headers: req().headers, body: stream, duplex: 'half' } as RequestInit);
  const f = fixture(3, 10), response = await f.h(request); assert.equal(response.status, 504); assert.equal(cancelled, true); assert.equal(f.calls(), 0);
});
