import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderEditUiClient, OrderEditUiError, readPendingEdit, persistPendingEdit, clearPendingEdit } from './client.ts';
const ID = '26000000-0000-4000-8000-000000000001', OP = '26000000-0000-4000-8000-000000000002', LINE = '26000000-0000-4000-8000-000000000003';
const intent = { expectedVersion: 1, customerName: 'Ada', customerEmail: null, customerPhone: null, shippingAddress: null, billingAddress: null, shippingCents: 0, discountCents: 0, reason: 'Adet düzeltmesi', lines: [{ lineId: LINE, productId: null, variantId: null, quantity: 1, unitPriceCents: 1000, discountCents: 0 }] };
const preview = { orderId: ID, expectedVersion: 1, fingerprint: 'a'.repeat(64), beforeTotalCents: 1000, afterSubtotalCents: 1000, afterShippingCents: 0, afterDiscountCents: 0, afterTotalCents: 1000, collectedCents: 1500, settlementDiscountCents: 100, dueCents: 0, refundDueCents: 600, stockChanges: [], commissionDeltaCents: null };
const result = { orderId: ID, version: 2, operationId: OP, replayed: false, preview };
const reply = (value: unknown, status = 200) => Response.json(value, { status });
test('preview and apply use strict same-origin direct contracts and preserve the caller operation', async () => {
    const calls: any[] = [];
    const client = createOrderEditUiClient({ fetch: async (url, init) => { calls.push({ url, init }); return reply(String(url).endsWith('/preview') ? preview : result); } });
    assert.deepEqual(await client.preview(ID, intent), preview);
    assert.deepEqual(await client.apply(ID, { intent, operationId: OP, previewFingerprint: preview.fingerprint }), result);
    assert.equal(calls[0].url, `/api/orders/${ID}/edit/preview`);
    assert.equal(calls[1].url, `/api/orders/${ID}/edit`);
    assert.equal(calls[1].init.credentials, 'same-origin');
    assert.equal(calls[1].init.cache, 'no-store');
    assert.deepEqual(JSON.parse(calls[1].init.body), { intent, operationId: OP, previewFingerprint: preview.fingerprint });
    await assert.rejects(() => client.preview(ID, { ...intent, storeId: ID } as never));
    assert.equal(calls.length, 2);
});
test('network, unavailable and substituted receipts remain unknown while only safe known rejections may unlock', async () => {
    for (const response of [() => { throw Error('offline'); }, () => reply({ code: 'unavailable' }, 503), () => reply({ code: 'unavailable' }, 409), () => reply({ ...result, operationId: LINE }), () => reply({ ...result, preview: { ...preview, fingerprint: 'b'.repeat(64) } }), () => reply({ data: result })]) {
        const client = createOrderEditUiClient({ fetch: async () => response() });
        await assert.rejects(() => client.apply(ID, { intent, operationId: OP, previewFingerprint: preview.fingerprint }), (e: any) => e instanceof OrderEditUiError && !e.knownSafe);
    }
    for (const [status, code] of [[400, 'invalid_input'], [403, 'membership_denied'], [409, 'version_conflict']] as const) {
        const client = createOrderEditUiClient({ fetch: async () => reply({ code }, status) });
        await assert.rejects(() => client.apply(ID, { intent, operationId: OP, previewFingerprint: preview.fingerprint }), (e: any) => e instanceof OrderEditUiError && e.knownSafe);
    }
});
test('pending journal requires exact host/order record and verified readback before a write can proceed', () => {
    const rows = new Map<string, string>();
    const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
    const pending = { schemaVersion: 1 as const, orderId: ID, intent, operationId: OP, previewFingerprint: preview.fingerprint };
    persistPendingEdit(storage, 'panel.example.test', ID, pending);
    assert.deepEqual(readPendingEdit(storage, 'panel.example.test', ID), pending);
    assert.equal(readPendingEdit(storage, 'other.example.test', ID), null);
    assert.equal(readPendingEdit(storage, 'panel.example.test', LINE), null);
    assert.throws(() => persistPendingEdit({ ...storage, getItem: () => null }, 'panel.example.test', ID, pending));
    assert.throws(() => persistPendingEdit(storage, 'panel.example.test', LINE, pending));
    const key = [...rows.keys()][0];
    rows.set(key, JSON.stringify({ ...pending, principalId: ID }));
    assert.throws(() => readPendingEdit(storage, 'panel.example.test', ID));
    persistPendingEdit(storage, 'panel.example.test', ID, pending);
    clearPendingEdit(storage, 'panel.example.test', ID);
    assert.equal(rows.size, 0);
});
test('products are bounded, abortable and reject malformed server references', async () => {
    let target = '', signal: AbortSignal | null | undefined;
    const controller = new AbortController();
    const client = createOrderEditUiClient({ fetch: async (url, init) => { target = String(url); signal = init?.signal; return reply({ items: [], hasMore: false }); } });
    assert.deepEqual(await client.products(ID, 'Ürün', controller.signal), { items: [], hasMore: false });
    assert.equal(new URL(target, 'https://example.test').searchParams.get('limit'), '30');
    assert.equal(signal, controller.signal);
    const invalid = createOrderEditUiClient({ fetch: async () => reply({ items: [{ productId: ID, variantId: null, productName: 'Ürün', variantName: 'M', sku: null, unitPriceCents: 1000 }], hasMore: false }) });
    await assert.rejects(() => invalid.products(ID, 'ürün'));
});
test('bounded native block reason is human-readable and malformed extras keep a write uncertain', async () => {
    const client = createOrderEditUiClient({ fetch: async () => reply({ code: 'invalid_transition', blockReason: 'settlement_discount_exceeds_total' }, 409) });
    await assert.rejects(() => client.apply(ID, { intent, operationId: OP, previewFingerprint: preview.fingerprint }), (error: any) => error instanceof OrderEditUiError && error.knownSafe && error.message === 'Yeni tutar, daha önce uygulanan tahsilat iskontosundan düşük olamaz.');
    for (const blockReason of ['unreviewed_reason', { code: 'forged' }]) {
        const bad = createOrderEditUiClient({ fetch: async () => reply({ code: 'invalid_transition', blockReason }, 409) });
        await assert.rejects(() => bad.apply(ID, { intent, operationId: OP, previewFingerprint: preview.fingerprint }), (error: any) => !error.knownSafe);
    }
});

test('provider-managed native rejection remains definitive and explains the provider boundary in Turkish',async()=>{
 const client=createOrderEditUiClient({fetch:async()=>reply({code:'invalid_transition',blockReason:'provider_managed'},409)});
 await assert.rejects(client.apply(ID,{intent,operationId:OP,previewFingerprint:preview.fingerprint}),(error:any)=>error instanceof OrderEditUiError&&error.knownSafe&&error.code==='invalid_transition'&&/pazar yeri tarafından yönetiliyor/.test(error.message));
});
