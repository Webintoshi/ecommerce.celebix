import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useState } from "react";
import { compile, click, mounted } from "../../lib/mira-final-test-support.ts";

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const item = { id: "93000000-0000-4000-8000-000000000001", orderNumber: "WEB-000001", source: "storefront", customerName: "Test müşteri", customerEmail: "test@example.test", currency: "TRY", totalCents: 10000, status: "confirmed", paymentStatus: "completed", itemCount: 1, createdAt: "2026-09-26T12:00:00Z", updatedAt: "2026-09-26T12:00:00Z", version: 1 };

test("explicit same-query order refresh retains rows and reports a failed refresh beside them", async () => {
  const refresh = deferred<any>(); let calls = 0;
  const Component = compile("components/orders/OrderListConsole.tsx", {
    "@/lib/order-ui/client": { OrderApiError: Error, orderApi: { listOrders: async () => ++calls === 1 ? { items: [item] } : refresh.promise } },
  }).OrderListConsole;
  await mounted(Component, {}, async host => {
    const row = host.querySelector('a[href="/orders/' + item.id + '"]'); assert.ok(row);
    await click(host, "Siparişleri yenile");
    assert.ok(host.querySelector('a[href="/orders/' + item.id + '"]') === row, "existing row remains mounted");
    await act(async () => refresh.reject(new Error("Yenileme başarısız")));
    assert.ok(host.querySelector('a[href="/orders/' + item.id + '"]') === row, "existing row remains mounted");
    assert.ok(host.querySelector('[role="alert"]'));
  });
});

test("a new order status hides the previous query while it is unresolved", async () => {
  const next = deferred<any>(); let calls = 0;
  const Component = compile("components/orders/OrderListConsole.tsx", {
    "@/lib/order-ui/client": { OrderApiError: Error, orderApi: { listOrders: async () => ++calls === 1 ? { items: [item] } : next.promise } },
  }).OrderListConsole;
  await mounted(Component, {}, async host => {
    await click(host, "Hazırlanıyor");
    assert.equal(host.querySelector('a[href="/orders/' + item.id + '"]'), null);
    await act(async () => next.resolve({ items: [] }));
    assert.match(host.textContent, /Filtrelerle eşleşen sipariş yok/);
  });
});

test("payment-link conflict refresh retains the current rows and local filter", async () => {
  const refresh = deferred<any>(); let calls = 0;
  class QuickLinkUiApiError extends Error { constructor(readonly code: string) { super("Sürüm değişti"); } }
  const link = { id: item.id, customerName: "Test bağlantı", customerEmail: "test@example.test", firstProductName: "Ürün", itemCount: 1, status: "active", totalCents: 1500, expiresAt: "2026-10-30T12:00:00Z", version: 7 };
  const Component = compile("components/orders/QuickOrderLinksConsole.tsx", {
    "@/lib/quick-link-ui/client": { QuickLinkUiApiError, quickLinkUi: { listPaymentMethods: async () => [], listLinks: async () => ++calls === 1 ? { items: [link] } : refresh.promise, cancelLink: async () => { throw new QuickLinkUiApiError("version_conflict"); } } },
    "@/lib/customer-ui/client": { CustomerApiError: Error, customerApi: {} },
  }).QuickOrderLinksConsole;
  await mounted(Component, {}, async host => {
    const table = host.querySelector('table[aria-label="Oluşturulan hızlı sipariş linkleri"]'); assert.ok(table);
    await act(async () => host.querySelector('button[aria-label="Linki iptal et"]').click());
    assert.ok(host.querySelector('table[aria-label="Oluşturulan hızlı sipariş linkleri"]') === table, "existing row remains mounted");
    await act(async () => refresh.resolve({ items: [{ ...link, version: 8 }] }));
    assert.ok(host.querySelector('button[aria-label="Linki iptal et"]'));
  });
});

const cart = { id: item.id, customerName: "Sepet müşterisi", status: "abandoned", currency: "TRY", totalCents: 1500, subtotalCents: 1500, discountCents: 0, itemCount: 0, items: [], checkoutStartedAt: item.createdAt, lastActivityAt: item.createdAt, createdAt: item.createdAt, updatedAt: item.createdAt, version: 1 };

test("abandoned cart refresh failure keeps the current workspace mounted", async () => {
  const refresh = deferred<any>(); let calls = 0;
  const Component = compile("components/orders/AbandonedCartConsole.tsx", { "@/lib/abandoned-cart-ui/client": { AbandonedCartApiError: Error, abandonedCartApi: { get: async () => ++calls === 1 ? cart : refresh.promise, archive: async () => ({}) } } }).AbandonedCartDetailConsole;
  await mounted(Component, { cartId: cart.id, canManage: true }, async host => {
    const panel = host.querySelector('.detailGrid'); assert.ok(panel);
    await click(host, "Arşivle");
    assert.ok(host.querySelector('.detailGrid') === panel, "same cart workspace remains mounted while refreshing");
    await act(async () => refresh.reject(new Error("Yenileme başarısız")));
    assert.ok(host.querySelector('.detailGrid') === panel, "same cart workspace remains mounted after refresh failure");
    assert.ok(host.querySelector('[role="alert"]'));
  });
});

test("late abandoned cart responses cannot replace the current record", async () => {
  const first = deferred<any>(), second = deferred<any>(); let change!: (id: string) => void;
  const Component = compile("components/orders/AbandonedCartConsole.tsx", { "@/lib/abandoned-cart-ui/client": { AbandonedCartApiError: Error, abandonedCartApi: { get: (id: string) => id === "a" ? first.promise : second.promise } } }).AbandonedCartDetailConsole;
  function Wrapper() { const [id, setId] = useState("a"); change = setId; return createElement(Component, { cartId: id, canManage: true }); }
  await mounted(Wrapper, {}, async host => {
    await act(async () => change("b"));
    await act(async () => second.resolve({ ...cart, id: "b", customerName: "Doğru sepet" }));
    assert.match(host.textContent, /Doğru sepet/);
    await act(async () => first.resolve({ ...cart, id: "a", customerName: "Eski sepet" }));
    assert.doesNotMatch(host.textContent, /Eski sepet/);
    assert.match(host.textContent, /Doğru sepet/);
  });
});
