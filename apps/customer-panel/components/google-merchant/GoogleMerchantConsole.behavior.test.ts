import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { act, createElement } from "react";
import { compile, mounted, click, input } from "../../lib/mira-final-test-support.ts";

const productId = "f6d8029d-5456-4e82-85cf-e877d9bdaaa4";
const variantId = "947b39e9-f3f1-4a96-a101-4b4c46c1c383";
const overview = { storeDomain: "store.example.test", connection: { service: "merchant", version: 1, status: "connected", googleEmail: "owner@example.test", selection: { accountId: "123", resourceId: "456", resourceName: "Store" }, lastCheckedAt: null, errorCode: null }, dataSourceId: "456", lastSyncedAt: null, counts: { ready: 1, pending: 1, submitted: 1, approved: 0, limited: 0, disapproved: 0, excluded: 0, failed: 0 } };
const product = { productId, variantId, title: "Cotton shirt", sku: "SHIRT-M", productUrl: "https://store.example.test/products/shirt?variant=" + variantId, status: "submitted", issues: [], priceCents: 19900, lastSubmittedAt: null, updatedAt: "2026-10-14T00:00:00Z", enabled: true, attributes: {} };
function component(client: Record<string, unknown>) {
  assert.ok(existsSync(new URL("./GoogleMerchantConsole.tsx", import.meta.url)), "Merchant product screen is missing");
  return compile("components/google-merchant/GoogleMerchantConsole.tsx", {
    "./client": { googleMerchantClient: client },
    "@/components/google-marketing/GoogleMarketingConnections": { GoogleMarketingConnections: () => createElement("div", null, "Merchant connection") },
  }).GoogleMerchantConsole;
}

test("local submitted state never renders Google approval and read-only users cannot change export", async () => {
  const Component = component({ overview: async () => overview, products: async () => ({ items: [product], nextCursor: null }) });
  await mounted(Component, { canManage: false }, async (host: HTMLElement) => {
    assert.match(host.textContent ?? "", /Google’a gönderildi/);
    assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 0);
    assert.equal(host.querySelectorAll('[data-merchant-edit]').length, 0);
    assert.match(host.querySelector<HTMLAnchorElement>('a[href="/products/' + productId + '"]')?.textContent ?? "", /Ürünü düzenle/);
  });
});

test("uncertain manual sync keeps one operation key and performs no automatic refresh loop", async () => {
  const keys: string[] = [];
  let reads = 0;
  const Component = component({ overview: async () => { reads++; return overview; }, products: async () => ({ items: [product], nextCursor: null }), sync: async (key: string) => { keys.push(key); if (keys.length === 1) throw Object.assign(new Error("unknown"), { code: "unavailable" }); return { queued: 1, replayed: true }; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    assert.equal(reads, 1);
    await click(host, "Ürünleri yeniden kontrol et");
    await click(host, "Tekrar kontrol et");
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(reads, 2);
    assert.match(host.textContent ?? "", /sıraya alındı/);
  });
});

test("failed attribute save preserves the form and retries the same operation", async () => {
  const calls: any[] = [];
  const Component = component({ overview: async () => overview, products: async () => ({ items: [{ ...product, status: "excluded", issues: [{ code: "missing_gtin", message: "Üretici barkodunu ekleyin." }] }], nextCursor: null }), preferences: async (id: string, body: unknown, key: string) => { calls.push({ id, body, key }); if (calls.length === 1) throw Object.assign(new Error("unknown"), { code: "unavailable" }); return { saved: true, replayed: true }; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Cotton shirt Google bilgilerini düzenle");
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Üretici barkodu (GTIN)"]');
    assert.ok(field);
    await input(window, field, "4006381333931");
    await click(host, "Kaydet");
    assert.equal(field.value, "4006381333931");
    await click(host, "Tekrar kaydet");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].key, calls[1].key);
    assert.deepEqual(calls[0].body, calls[1].body);
    assert.equal(calls[0].body.attributes.gtin, "4006381333931");
    await act(async () => {});
  });
});
