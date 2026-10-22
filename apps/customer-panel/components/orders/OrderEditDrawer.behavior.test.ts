import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { compile, mounted, click, input as inputField } from '../../lib/mira-final-test-support.ts';
const ID = '26000000-0000-4000-8000-000000000001', OP = '26000000-0000-4000-8000-000000000002', LINE = '26000000-0000-4000-8000-000000000003', PRODUCT = '26000000-0000-4000-8000-000000000004', VARIANT = '26000000-0000-4000-8000-000000000005';
const workspace = { orderId: ID, orderNumber: 'WEB-001', version: 1, currency: 'TRY', source: 'manual_import', canEdit: true, blockReason: null, canEditPrices: true, discountLimitBps: 9999, customerName: 'Ada', customerEmail: null, customerPhone: null, shippingAddress: null, billingAddress: null, subtotalCents: 1000, shippingCents: 0, discountCents: 0, totalCents: 1000, lines: [{ lineId: LINE, productId: null, variantId: null, quantity: 1, unitPriceCents: 1000, discountCents: 0, productName: 'Eski ürün', variantName: null, sku: null, lineTotalCents: 1000 }], finance: { collectedCents: 1500, settlementDiscountCents: 100, dueCents: 0, refundDueCents: 600 } };
const preview = { orderId: ID, expectedVersion: 1, fingerprint: 'a'.repeat(64), beforeTotalCents: 1000, afterSubtotalCents: 1000, afterShippingCents: 0, afterDiscountCents: 0, afterTotalCents: 1000, collectedCents: 1500, settlementDiscountCents: 100, dueCents: 0, refundDueCents: 600, stockChanges: [], commissionDeltaCents: null };
const result = { orderId: ID, version: 2, operationId: OP, replayed: false, preview };
const clientModule = compile('lib/order-edit-ui/client.ts');
const Drawer = () => compile('components/orders/OrderEditDrawer.tsx', { '../../lib/order-edit-ui/client.ts': clientModule }).OrderEditDrawer;
const client = (extra: any = {}) => ({ newId: () => OP, workspace: async () => workspace, products: async () => ({ items: [], hasMore: false }), preview: async () => preview, apply: async () => result, ...extra });
const storage = () => { const rows = new Map<string, string>(); return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } }; };
const setup = (window: any) => { window.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; window.HTMLDialogElement.prototype.close = function () { this.open = false; }; };
const field = (host: any, name: string) => { const node = host.querySelector(`[name="${name}"]`); assert.ok(node, name); return node; };
async function input(window: any, element: any, value: string) { if (element.tagName !== 'TEXTAREA')
    return inputField(window, element, value); await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })); }); }
async function submit(host: any, window: any) { await act(async () => host.querySelector('form[data-order-edit]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }
test('drawer retains imported references, separates finance summary and submits one preview/apply gesture', async () => {
    let applied: any, previews = 0, saved = 0;
    const journal = storage();
    await mounted(Drawer(), { orderId: ID, storage: journal, client: client({ preview: async () => { previews++; return preview; }, apply: async (_id: string, value: any) => { assert.equal(journal.rows.size, 1); applied = value; return result; } }), onClose: () => { }, onSaved: () => saved++ }, async (host, window) => {
        assert.match(host.textContent, /Tahsil edilen/);
        assert.match(host.textContent, /Tahsilat indirimi/);
        assert.match(host.textContent, /İade edilecek/);
        assert.match(host.textContent, /6,00/);
        await input(window, field(host, 'reason'), 'Adet düzeltmesi');
        await submit(host, window);
        assert.equal(previews, 1);
        assert.equal(saved, 1);
        assert.equal(applied.intent.lines[0].productId, null);
        assert.equal(applied.intent.lines[0].variantId, null);
        assert.equal(journal.rows.size, 0);
    }, setup);
});
test('lost save locks the draft and retries the identical durable operation without another preview', async () => {
    const journal = storage(), writes: any[] = [];
    let previews = 0;
    await mounted(Drawer(), { orderId: ID, storage: journal, client: client({ preview: async () => { previews++; return preview; }, apply: async (_id: string, body: any) => { writes.push(body); if (writes.length === 1)
                throw new clientModule.OrderEditUiError('unavailable', 503); return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => {
        await input(window, field(host, 'reason'), 'Düzeltme');
        await submit(host, window);
        assert.equal(field(host, 'reason').disabled, true);
        assert.match(host.textContent, /Kaydı doğrula/);
        assert.equal(journal.rows.size, 1);
        await submit(host, window);
        assert.equal(previews, 1);
        assert.deepEqual(writes[1], writes[0]);
        assert.equal(journal.rows.size, 0);
    }, setup);
});
test('unverified journal prevents apply and double submit cannot race a pending preview', async () => {
    const gate = deferred<any>();
    let previews = 0, applies = 0;
    const broken = { getItem: () => null, setItem: () => { }, removeItem: () => { } };
    await mounted(Drawer(), { orderId: ID, storage: broken, client: client({ preview: async () => { previews++; return gate.promise; }, apply: async () => { applies++; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => {
        await input(window, field(host, 'reason'), 'Düzeltme');
        await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
        assert.equal(previews, 1);
        await act(async () => gate.resolve(preview));
        assert.equal(applies, 0);
        assert.match(host.textContent, /tarayıcıda/);
    }, setup);
});
test('dirty close has an inline cancellation choice and safe denial keeps all field buffers', async () => {
    let closes = 0;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ apply: async () => { throw new clientModule.OrderEditUiError('version_conflict', 409); } }), onClose: () => closes++, onSaved: () => { } }, async (host, window) => {
        await input(window, field(host, 'reason'), 'Adres düzeltmesi');
        await click(host, 'Vazgeç');
        assert.equal(closes, 0);
        assert.match(host.textContent, /Değişiklikleri bırak/);
        await click(host, 'Düzenlemeye devam et');
        await submit(host, window);
        assert.equal(field(host, 'reason').value, 'Adres düzeltmesi');
        assert.equal(field(host, 'reason').disabled, false);
        await click(host, 'Vazgeç');
        await click(host, 'Değişiklikleri bırak');
        assert.equal(closes, 1);
        assert.equal(host.querySelectorAll('dialog').length, 1);
    }, setup);
});
test('pending reload recovers the same expected version even when current workspace is blocked', async () => {
    const journal = storage(), pending = { schemaVersion: 1, orderId: ID, operationId: OP, previewFingerprint: preview.fingerprint, intent: { expectedVersion: 1, customerName: 'Ada', customerEmail: null, customerPhone: null, shippingAddress: null, billingAddress: null, shippingCents: 0, discountCents: 0, reason: 'Korunan kayıt', lines: [{ lineId: LINE, productId: null, variantId: null, quantity: 1, unitPriceCents: 1000, discountCents: 0 }] } };
    clientModule.persistPendingEdit(journal, 'panel.example.test', ID, pending);
    let saved: any, previews = 0;
    await mounted(Drawer(), { orderId: ID, storage: journal, client: client({ workspace: async () => ({ ...workspace, version: 2, canEdit: false, blockReason: 'shipment_exists' }), preview: async () => { previews++; return preview; }, apply: async (_id: string, body: any) => { saved = body; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => { assert.equal(field(host, 'reason').value, 'Korunan kayıt'); assert.equal(field(host, 'reason').disabled, true); await submit(host, window); assert.equal(saved.intent.expectedVersion, 1); assert.equal(saved.operationId, OP); assert.equal(previews, 0); }, setup);
});
test('variant replacement uses a fresh line ID, server variant and price while restricted prices stay disabled', async () => {
    let saved: any;
    const replacement = { productId: PRODUCT, variantId: VARIANT, productName: 'Yeni ürün', variantName: 'L', sku: 'SKU-L', unitPriceCents: 2500 };
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ workspace: async () => ({ ...workspace, canEditPrices: false }), products: async () => ({ items: [replacement], hasMore: true }), apply: async (_id: string, body: any) => { saved = body; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => {
        assert.equal(field(host, `price-${LINE}`).disabled, true);
        await click(host, 'Ürün/varyant değiştir');
        await act(async () => new Promise(resolve => setTimeout(resolve, 340)));
        assert.match(host.textContent, /Daha fazla sonuç/);
        const choice = host.querySelector('ul[aria-label] button');
        assert.ok(choice);
        await act(async () => choice.click());
        assert.equal(host.querySelector(`[name="quantity-${LINE}"]`), null);
        assert.equal(field(host, `price-${OP}`).value, '25,00');
        assert.equal(field(host, `price-${OP}`).disabled, true);
        await input(window, field(host, 'reason'), 'Varyant değişimi');
        await submit(host, window);
        assert.equal(saved.intent.lines[0].lineId, OP);
        assert.notEqual(saved.intent.lines[0].lineId, LINE);
        assert.equal(saved.intent.lines[0].variantId, VARIANT);
        assert.equal(saved.intent.lines[0].unitPriceCents, 2500);
    }, setup);
});
test('same variant quantity and price edits retain line identity and update debt immediately', async () => {
    let saved: any;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ apply: async (_id: string, body: any) => { saved = body; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => {
        await input(window, field(host, `quantity-${LINE}`), '2');
        assert.match(host.querySelector('[data-edit-due]').textContent, /4,00/);
        assert.match(host.querySelector('[data-edit-refund]').textContent, /0,00/);
        await input(window, field(host, `price-${LINE}`), '12,50');
        await input(window, field(host, 'reason'), 'Adet ve fiyat');
        await submit(host, window);
        assert.equal(saved.intent.lines[0].lineId, LINE);
        assert.equal(saved.intent.lines[0].quantity, 2);
        assert.equal(saved.intent.lines[0].unitPriceCents, 1250);
    }, setup);
});
test('stale product responses are aborted and cannot replace the current search', async () => {
    const old = deferred<any>(), fresh = deferred<any>(), calls: any[] = [];
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ products: async (_id: string, query: string, signal: AbortSignal) => { calls.push({ query, signal }); return query === 'Eski' ? old.promise : fresh.promise; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => {
        await input(window, field(host, 'productSearch'), 'Eski');
        await act(async () => new Promise(resolve => setTimeout(resolve, 340)));
        await input(window, field(host, 'productSearch'), 'Yeni');
        assert.equal(calls[0].signal.aborted, true);
        await act(async () => new Promise(resolve => setTimeout(resolve, 340)));
        await act(async () => fresh.resolve({ items: [{ productId: PRODUCT, variantId: VARIANT, productName: 'Güncel sonuç', variantName: 'M', sku: null, unitPriceCents: 100 }], hasMore: false }));
        await act(async () => old.resolve({ items: [{ productId: PRODUCT, variantId: OP, productName: 'Eski sonuç', variantName: 'M', sku: null, unitPriceCents: 100 }], hasMore: false }));
        assert.match(host.textContent, /Güncel sonuç/);
        assert.doesNotMatch(host.textContent, /Eski sonuç/);
    }, setup);
});
test('a late workspace read from another order cannot overwrite the active drawer', async () => {
    const old = deferred<any>();
    let change!: (id: string) => void;
    const journal = storage(), api = client({ workspace: async (id: string) => id === ID ? old.promise : { ...workspace, orderId: PRODUCT, customerName: 'Yeni sipariş' } });
    const Component = Drawer();
    function Harness() { const [id, setId] = React.useState(ID); change = setId; return React.createElement(Component, { orderId: id, storage: journal, client: api, onClose: () => { }, onSaved: () => { } }); }
    await mounted(Harness, {}, async (host) => { await act(async () => change(PRODUCT)); assert.equal(field(host, 'customerName').value, 'Yeni sipariş'); await act(async () => old.resolve(workspace)); assert.equal(field(host, 'customerName').value, 'Yeni sipariş'); }, setup);
});
test('pending saves may close with their journal intact and malformed journals never allow a new write', async () => {
    const journal = storage();
    let closes = 0;
    await mounted(Drawer(), { orderId: ID, storage: journal, client: client({ apply: async () => { throw new clientModule.OrderEditUiError('unavailable', 503); } }), onClose: () => closes++, onSaved: () => { } }, async (host, window) => { await input(window, field(host, 'reason'), 'Korunan kayıt'); await submit(host, window); await click(host, 'Vazgeç'); assert.equal(closes, 1); assert.equal(journal.rows.size, 1); }, setup);
    let calls = 0;
    const bad = { getItem: () => '{broken', setItem: () => { }, removeItem: () => { } };
    await mounted(Drawer(), { orderId: ID, storage: bad, client: client({ apply: async () => { calls++; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => { assert.match(host.textContent, /doğrulanamadı/); await submit(host, window); assert.equal(calls, 0); assert.equal(field(host, 'reason').disabled, true); }, setup);
});
test('existing settlement discount cannot exceed the new total and blocks save locally', async () => {
    let previews = 0;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ preview: async () => { previews++; return preview; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => { await input(window, field(host, `price-${LINE}`), '0,50'); await input(window, field(host, 'reason'), 'Düzeltme'); assert.match(host.textContent, /Yeni tutar, daha önce uygulanan tahsilat iskontosundan düşük olamaz/); const save = [...host.querySelectorAll('button')].find((button: any) => button.textContent === 'Kaydet') as any; assert.equal(save.disabled, true); await submit(host, window); assert.equal(previews, 0); }, setup);
});
test('failed initial workspace read offers a manual retry without creating a write', async () => {
    let reads = 0, writes = 0;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ workspace: async () => { if (++reads === 1)
                throw new clientModule.OrderEditUiError('unavailable', 503); return workspace; }, apply: async () => { writes++; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host) => { assert.equal(host.querySelector('form[data-order-edit]'), null); await click(host, 'Yeniden dene'); assert.equal(field(host, 'customerName').value, 'Ada'); assert.equal(reads, 2); assert.equal(writes, 0); }, setup);
});
test('fresh contact read preserves edited fields and product buffers while untouched contacts follow current profile', async () => {
    let reads = 0, saved: any;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ workspace: async () => ++reads === 1 ? workspace : { ...workspace, customerName: 'Güncel ad', customerEmail: 'crm@example.test', lines: workspace.lines.map(line => ({ ...line, quantity: 4 })) }, apply: async (_id: string, body: any) => { saved = body; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => { await input(window, field(host, `quantity-${LINE}`), '2'); await input(window, field(host, 'customerEmail'), 'edited@example.test'); await input(window, field(host, 'reason'), 'Düzeltme'); await submit(host, window); assert.equal(saved.intent.customerName, 'Güncel ad'); assert.equal(saved.intent.customerEmail, 'edited@example.test'); assert.equal(saved.intent.lines[0].quantity, 2); assert.equal(reads, 2); }, setup);
});
test('new order version before preview reports conflict without replacing any product buffers', async () => {
    let reads = 0, previews = 0, writes = 0;
    await mounted(Drawer(), { orderId: ID, storage: storage(), client: client({ workspace: async () => ++reads === 1 ? workspace : { ...workspace, version: 2 }, preview: async () => { previews++; return preview; }, apply: async () => { writes++; return result; } }), onClose: () => { }, onSaved: () => { } }, async (host, window) => { await input(window, field(host, `quantity-${LINE}`), '2'); await input(window, field(host, 'reason'), 'Düzeltme'); await submit(host, window); assert.equal(previews, 0); assert.equal(writes, 0); assert.equal(field(host, `quantity-${LINE}`).value, '2'); assert.equal(field(host, 'reason').value, 'Düzeltme'); assert.match(host.textContent, /Sipariş değişti/); }, setup);
});
test('a malformed successful adapter receipt cannot clear the durable pending operation', async () => {
    const journal = storage();
    let confirmed = 0;
    await mounted(Drawer(), { orderId: ID, storage: journal, client: client({ apply: async () => ({}) }), onClose: () => { }, onSaved: () => confirmed++ }, async (host, window) => { await input(window, field(host, 'reason'), 'Düzeltme'); await submit(host, window); assert.equal(confirmed, 0); assert.equal(journal.rows.size, 1); assert.equal(field(host, 'reason').disabled, true); assert.match(host.textContent, /Kaydı doğrula/); }, setup);
});
