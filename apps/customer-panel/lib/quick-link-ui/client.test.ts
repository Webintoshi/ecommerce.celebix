import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { Product, ProductVariant, QuickOrderLinkListItem } from "@celebix/saas-contracts";

const ROOT = new URL("../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");
const LINK_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-21T09:30:00.000Z";
const EXPIRES_AT = "2026-07-22T09:30:00.000Z";
const SHARE_URL = `https://shop.example.com/odeme/hizli/${"a".repeat(43)}`;

const listItem = Object.freeze({
  id: LINK_ID,
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  firstProductName: "Atlas Kupa",
  itemCount: 1,
  status: "active" as const,
  currency: "TRY",
  totalCents: 14_500,
  expiresAt: EXPIRES_AT,
  createdAt: NOW,
  version: 1,
}) satisfies QuickOrderLinkListItem;

const address = Object.freeze({
  recipientName: "Ada Lovelace",
  phone: "+905551112233",
  line1: "Örnek Sokak 1",
  district: "Kadıköy",
  city: "İstanbul",
  postalCode: "34710",
  country: "TR",
});

const intent = Object.freeze({
  items: Object.freeze([Object.freeze({ variantId: VARIANT_ID, quantity: 2 })]),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  shippingAddress: address,
  billingAddress: address,
  customerNote: "Zili çalmayın.",
  internalLabel: "VIP",
  shippingCents: 1_000,
  discountCents: 500,
  expiryHours: 24 as const,
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("quick-link client uses exact same-origin routes, idempotency, and allowed create intent", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const calls: Array<[string, RequestInit]> = [];
  const bodies = [
    { items: [listItem] },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { id: LINK_ID, status: "cancelled", version: 2, expiresAt: EXPIRES_AT, updatedAt: NOW, replayed: false },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { url: SHARE_URL, expiresAt: EXPIRES_AT },
    { status: "active", version: 1 },
    { status: "revoked", version: 2 },
  ];
  const client = createQuickLinkUiClient({
    fetch: async (input, init) => {
      calls.push([String(input), init ?? {}]);
      return response(bodies.shift(), String(input).endsWith("/cancel") ? 200 : 200);
    },
    randomUUID: () => OPERATION_ID,
    catalog: { async listProducts() { return Object.freeze({ items: Object.freeze([]) }); }, async getProduct() { throw new Error("not used"); } },
  });

  const listed = await client.listLinks({ pageSize: 20, status: "active" });
  const created = await client.createLink(intent);
  const cancelled = await client.cancelLink(LINK_ID, 1);
  const duplicated = await client.duplicateLink(LINK_ID);
  const revealed = await client.revealUrl(LINK_ID);
  const activated = await client.activateProvider();
  const revoked = await client.revokeProvider();

  assert.deepEqual(calls.map(([path]) => path), [
    "/api/orders/quick-links?pageSize=20&status=active",
    "/api/orders/quick-links",
    `/api/orders/quick-links/${LINK_ID}/cancel`,
    `/api/orders/quick-links/${LINK_ID}/duplicate`,
    `/api/orders/quick-links/${LINK_ID}/url`,
    "/api/orders/quick-links/provider/activate",
    "/api/orders/quick-links/provider/revoke",
  ]);
  assert.deepEqual(calls[0]?.[1], { method: "GET", credentials: "same-origin", cache: "no-store" });
  for (const index of [1, 2, 3, 5, 6]) {
    const headers = new Headers(calls[index]?.[1].headers);
    assert.equal(calls[index]?.[1].method, "POST");
    assert.equal(calls[index]?.[1].credentials, "same-origin");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("idempotency-key"), OPERATION_ID);
  }
  assert.equal(new Headers(calls[4]?.[1].headers).has("idempotency-key"), false);
  assert.deepEqual(JSON.parse(String(calls[1]?.[1].body)), intent);
  assert.deepEqual(JSON.parse(String(calls[2]?.[1].body)), { expectedVersion: 1 });
  assert.deepEqual(JSON.parse(String(calls[3]?.[1].body)), {});
  assert.deepEqual(JSON.parse(String(calls[4]?.[1].body)), {});
  assert.equal(JSON.stringify(calls[1]?.[1].body).includes("productName"), false);
  assert.equal(JSON.stringify(calls[1]?.[1].body).includes("price"), false);
  assert.equal(listed.items[0]?.id, LINK_ID);
  assert.equal(created.url, SHARE_URL);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(duplicated.url, SHARE_URL);
  assert.equal(revealed.url, SHARE_URL);
  assert.deepEqual(activated, { status: "active", version: 1 });
  assert.deepEqual(revoked, { status: "revoked", version: 2 });
  assert.equal([listed, listed.items, listed.items[0], created, cancelled, duplicated, revealed, activated, revoked].every(Object.isFrozen), true);
});

test("catalog search uses real active products and exposes only selectable variant display data", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const storeId = "55555555-5555-4555-8555-555555555555";
  const product = Object.freeze({
    id: PRODUCT_ID,
    storeId,
    slug: "atlas-kupa",
    title: "Atlas Kupa",
    status: "active" as const,
    currency: "TRY",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  }) satisfies Product;
  const variants = Object.freeze([
    Object.freeze({
      id: VARIANT_ID,
      productId: PRODUCT_ID,
      storeId,
      title: "Turuncu",
      sku: "ATLAS-TR",
      priceCents: 7_000,
      stockTracking: true,
      stockQuantity: 4,
      status: "active" as const,
      attributes: Object.freeze({ renk: "Turuncu" }),
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    }),
    Object.freeze({
      id: "66666666-6666-4666-8666-666666666666",
      productId: PRODUCT_ID,
      storeId,
      title: "Arşiv",
      priceCents: 9_000,
      stockTracking: false,
      stockQuantity: 0,
      status: "archived" as const,
      attributes: Object.freeze({}),
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    }),
  ]) satisfies readonly ProductVariant[];
  const listCalls: unknown[] = [];
  const detailCalls: string[] = [];
  const client = createQuickLinkUiClient({
    fetch: async () => response({}),
    randomUUID: () => OPERATION_ID,
    catalog: {
      async listProducts(input) { listCalls.push(input); return Object.freeze({ items: Object.freeze([product]) }); },
      async getProduct(id) { detailCalls.push(id); return Object.freeze({ product, variants }); },
    },
  });

  const results = await client.searchProducts("atlas-tr");
  assert.deepEqual(listCalls, [{ status: "active" }]);
  assert.deepEqual(detailCalls, [PRODUCT_ID]);
  assert.deepEqual(results, [Object.freeze({
    title: "Atlas Kupa",
    variants: Object.freeze([Object.freeze({
      variantId: VARIANT_ID,
      title: "Turuncu",
      sku: "ATLAS-TR",
      priceCents: 7_000,
      availableQuantity: 4,
    })]),
  })]);
  assert.equal(JSON.stringify(results).includes(storeId), false);
  assert.equal(JSON.stringify(results).includes(PRODUCT_ID), false);
  assert.equal(Object.isFrozen(results), true);
  assert.equal(Object.isFrozen(results[0]?.variants), true);
  assert.deepEqual(await client.searchProducts("   "), []);
});

test("client maps finite conflict and readiness errors and rejects hostile response shapes", async () => {
  const { QuickLinkUiApiError, createQuickLinkUiClient } = await import("./client.ts");
  const conflict = createQuickLinkUiClient({
    fetch: async () => response({ code: "version_conflict", detail: "private" }, 409),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => conflict.cancelLink(LINK_ID, 1),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "version_conflict" && !error.message.includes("private"),
  );
  const readiness = createQuickLinkUiClient({
    fetch: async () => response({ code: "provider_not_ready" }, 409),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => readiness.createLink(intent),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "provider_not_ready" && /PayTR/.test(error.message),
  );
  const hostile = createQuickLinkUiClient({
    fetch: async () => response({ items: [{ ...listItem, tokenDigest: "secret" }] }),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => hostile.listLinks(),
    (error: unknown) => error instanceof QuickLinkUiApiError && error.code === "unavailable",
  );
});

test("share responses preserve Task 7 canonical six-digit PostgreSQL timestamps", async () => {
  const { createQuickLinkUiClient } = await import("./client.ts");
  const expiresAt = "2026-07-22T09:30:00.123456Z";
  const client = createQuickLinkUiClient({
    fetch: async () => response({ url: SHARE_URL, expiresAt }),
    randomUUID: () => OPERATION_ID,
  });
  assert.deepEqual(await client.createLink(intent), { url: SHARE_URL, expiresAt });
});

test("quick-order presentation preserves donor hierarchy while omitting fake customer search", async () => {
  const consoleSource = await source("components/orders/QuickOrderLinksConsole.tsx");
  assert.match(consoleSource, /data-presentation="hemenaku-quick-order"/);
  for (const label of [
    "Sipariş Detayı", "Teslimat Bilgileri", "Sipariş Özeti", "Müşteri Notu",
    "Dahili Etiket", "Ödeme Yöntemi", "Oluşturulan Linkler",
  ]) assert.match(consoleSource, new RegExp(label));
  assert.match(consoleSource, /Ürün ara/);
  assert.match(consoleSource, /searchProducts/);
  assert.match(consoleSource, /selectedLines/);
  assert.match(consoleSource, /4 saat geçerli/);
  assert.match(consoleSource, /72 saat geçerli/);
  assert.doesNotMatch(consoleSource, /Müşteri ara|customerSearch|selectedCustomerId|\/api\/customers/i);
});

test("builder keeps recipient, addresses, note, internal label, readiness, and totals as separate intent", async () => {
  const consoleSource = await source("components/orders/QuickOrderLinksConsole.tsx");
  for (const field of [
    "customerName", "customerEmail", "customerPhone", "shippingAddress", "billingAddress",
    "customerNote", "internalLabel", "shippingCents", "discountCents", "expiryHours",
  ]) assert.match(consoleSource, new RegExp(`\\b${field}\\b`));
  assert.match(consoleSource, /billingSameAsShipping/);
  assert.match(consoleSource, /Ara Toplam/);
  assert.match(consoleSource, /Kargo/);
  assert.match(consoleSource, /İndirim/);
  assert.match(consoleSource, /Toplam/);
  assert.match(consoleSource, /PayTR/);
  assert.match(consoleSource, /activateProvider/);
  assert.match(consoleSource, /Ödeme linki oluştur/);
  assert.doesNotMatch(consoleSource, /buildSavedNote|allowedPaymentMethodIds|unitPrice\s*:/);
});

test("created links render truthful lifecycle states and real copy, open, cancel, and duplicate actions", async () => {
  const consoleSource = await source("components/orders/QuickOrderLinksConsole.tsx");
  for (const label of ["Aktif", "Açıldı", "Ödendi", "İptal", "Süresi doldu"]) {
    assert.match(consoleSource, new RegExp(label));
  }
  assert.match(consoleSource, /revealUrl/);
  assert.match(consoleSource, /clipboard\.writeText/);
  assert.match(consoleSource, /window\.open/);
  assert.match(consoleSource, /cancelLink/);
  assert.match(consoleSource, /duplicateLink/);
  assert.match(consoleSource, /aria-label="Linki kopyala"/);
  assert.match(consoleSource, /aria-label="Ödeme sayfasını aç"/);
  assert.match(consoleSource, /aria-label="Kopyasını oluştur"/);
  assert.match(consoleSource, /aria-label="Linki iptal et"/);
  const openFlow = consoleSource.match(/function openLink[\s\S]*?function duplicateLink/)?.[0] ?? "";
  assert.ok(openFlow.indexOf("window.open") > -1);
  assert.ok(openFlow.indexOf("window.open") < openFlow.indexOf("await quickLinkUi.revealUrl"));
});

test("console exposes loading, empty, error, conflict recovery, keyboard, and focus states", async () => {
  const consoleSource = await source("components/orders/QuickOrderLinksConsole.tsx");
  assert.match(consoleSource, /Linkler yükleniyor/);
  assert.match(consoleSource, /Henüz hızlı sipariş linki oluşturulmadı/);
  assert.match(consoleSource, /Linkler yüklenemedi/);
  assert.match(consoleSource, /Ürünler aranıyor/);
  assert.match(consoleSource, /Sonuç bulunamadı/);
  assert.match(consoleSource, /version_conflict/);
  assert.match(consoleSource, /await loadLinks\(\)/);
  assert.match(consoleSource, /onKeyDown/);
  assert.match(consoleSource, /Escape/);
  assert.match(consoleSource, /\.focus\(\)/);
  assert.match(consoleSource, /aria-live="polite"/);
  assert.match(consoleSource, /role="alert"/);
});

test("responsive table/cards, 48px targets, and visible focus stay in the accepted panel tokens", async () => {
  const styles = await source("components/orders/quick-order-links.module.css");
  assert.match(styles, /#F9F9F9/i);
  assert.match(styles, /#FF6A00/i);
  assert.match(styles, /#E1E6EF/i);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)[^]*\.desktopTable\s*\{\s*display:\s*none/s);
  assert.match(styles, /@media\s*\(min-width:\s*1025px\)[^]*\.mobileCards\s*\{\s*display:\s*none/s);
  assert.match(styles, /prefers-reduced-motion/);
});

test("client and console contain no browser authority, private provider material, or donor runtime", async () => {
  const combined = (await Promise.all([
    source("lib/quick-link-ui/client.ts"),
    source("components/orders/QuickOrderLinksConsole.tsx"),
  ])).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(combined, /TenantContext|storeId|tenantId|principalId|membershipId|providerConfigId|tokenDigest|sealedToken/i);
  assert.doesNotMatch(combined, /document\.cookie|localStorage|sessionStorage|authorization|x-celebix|\/api\/admin|supabase/i);
  assert.doesNotMatch(combined, /apps\/admin|fetchAdminJson|buildStorefrontUrl|sonner/i);
});
