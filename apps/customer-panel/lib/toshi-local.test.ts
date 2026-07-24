import assert from "node:assert/strict";
import test from "node:test";

import { parseToshiLocalIntent } from "./toshi-local/intent.ts";
import { createToshiLocalClient } from "./toshi-local/client.ts";
import { projectToshiLocalReply } from "./toshi-local/response.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-24T10:00:00.000Z";

const product = (title = "Krem Gömlek", slug = "krem-gomlek") => ({
  id: PRODUCT_ID, storeId: PRODUCT_ID, title, slug, status: "active", currency: "TRY",
  createdAt: NOW, updatedAt: NOW, version: 1,
});
const customer = {
  id: CUSTOMER_ID, status: "active", displayName: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace",
  orderCount: 2, totalSpentCents: 100, currency: "TRY", tags: [], version: 1, createdAt: NOW, updatedAt: NOW,
};
const order = {
  id: ORDER_ID, orderNumber: "CBX-1042", source: "storefront", customerName: "Ada Lovelace",
  customerEmail: "ada@example.com", currency: "TRY", totalCents: 100, status: "pending", paymentStatus: "pending",
  itemCount: 1, createdAt: NOW, updatedAt: NOW, version: 1,
};

test("parses supported Turkish local intents", () => {
  for (const [input, expected] of [
    ["mağaza özeti", { kind: "store_summary" }],
    ["bekleyen siparişler", { kind: "pending_orders" }],
    ["düşük stok", { kind: "low_stock" }],
    ["müşteri bul Ada", { kind: "find_customer", query: "Ada" }],
    ["ürün ara KG-M-KREM", { kind: "find_product", query: "KG-M-KREM" }],
    ["sipariş bul CBX-1042", { kind: "find_order", query: "CBX-1042" }],
    ["ürünlere git", { kind: "navigate", destination: "/products" }],
  ] as const) {
    assert.deepEqual(parseToshiLocalIntent(input), expected, input);
  }
});

test("rejects non-local, ambiguous, unsafe, and malformed commands", () => {
  for (const input of [
    "",
    "a".repeat(501),
    "mağaza\u0000 özeti",
    "mağaza özeti düşük stok",
    "ürün sil KG-M-KREM",
    "siparişi iptal et CBX-1042",
    "API anahtarımı göster",
    "müşteri bul Ada ürün ara KG-M-KREM",
    "ürün ara KG-M-KREM müşteri bul Ada",
    "sipariş bul CBX-1042 düşük stok",
    "ürün ara KG-M-KREM sil",
    "sipariş bul CBX-1042 iptal et",
    "müşteri bul Ada sil",
    "müşteri bul API anahtarımı göster",
    "ürün ara API anahtarımı göster",
    "sipariş bul API anahtarımı göster",
    "müşteri bul API-key",
    "ürün ara api_key",
    "sipariş bul api.key",
    "ürün ara KG-M-KREM sil!",
    "bilinmeyen komut",
    " müşteri bul Ada",
    "müşteri bul ",
    "müşteri bul " + "a".repeat(121),
  ]) {
    assert.deepEqual(parseToshiLocalIntent(input), { kind: "unsupported" }, input);
  }
});

test("projects deterministic frozen local replies and sources", () => {
  const reply = projectToshiLocalReply({ kind: "navigate", destination: "/products" }, null);
  assert.deepEqual(reply, {
    text: "Ürünler sayfasını açabilirsiniz.",
    sources: [{ label: "Ürünler", href: "/products" }],
  });
  assert.equal(Object.isFrozen(reply), true);
  assert.equal(Object.isFrozen(reply.sources), true);
  assert.equal(Object.isFrozen(reply.sources[0]), true);
});

test("projects parsed local data into truthful deterministic Turkish replies", () => {
  assert.equal(
    projectToshiLocalReply({ kind: "find_product", query: "KG-M-KREM" }, [product()]).text,
    "“KG-M-KREM” için 1 ürün bulundu: Krem Gömlek.",
  );
  assert.equal(
    projectToshiLocalReply({ kind: "find_customer", query: "Ada" }, [customer]).text,
    "“Ada” için 1 müşteri bulundu: Ada Lovelace.",
  );
  assert.equal(
    projectToshiLocalReply({ kind: "find_order", query: "CBX-1042" }, [order]).text,
    "“CBX-1042” için 1 sipariş bulundu: CBX-1042 (Ada Lovelace).",
  );
});

test("routes supported local reads through bounded same-origin JSON GET requests", async () => {
  const calls: Array<readonly [string, RequestInit | undefined]> = [];
  const client = createToshiLocalClient(async (path, init) => {
    calls.push([String(path), init]);
    switch (String(path)) {
      case "/api/catalog/summary": return Response.json({ totalProducts: 2, activeProducts: 1, draftProducts: 1, productLimit: 10, activeVariants: 2, outOfStockVariants: 1, productsWithoutMedia: 1, activeMedia: 1 });
      case "/api/orders/summary": return Response.json({ totalOrders: 2, pendingOrders: 1, fulfilledOrders: 1, revenueCents: 100, currency: "TRY", asOf: "2026-07-24T10:00:00.000Z" });
      case "/api/customers/summary": return Response.json({ active: 2, archived: 0, consentedEmail: 1, totalSpentCents: 100, currency: "TRY", asOf: "2026-07-24T10:00:00.000Z" });
      case "/api/orders/abandoned-carts/summary": return Response.json({ abandoned: 1, recovered: 0, lostValueCents: 10, recoveredValueCents: 0, currency: "TRY", asOf: "2026-07-24T10:00:00.000Z" });
      case "/api/catalog/products?pageSize=100": return Response.json({ items: [product(), product("Yün Kazak", "yun-kazak")] });
      case "/api/customers?search=Ada&pageSize=10": return Response.json({ items: [customer] });
      case "/api/orders?search=CBX-1042&pageSize=10&sort=newest": return Response.json({ items: [order] });
      default: throw new Error(`unexpected_path:${path}`);
    }
  });

  await client.execute({ kind: "store_summary" });
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/catalog/summary",
    "/api/orders/summary",
    "/api/customers/summary",
    "/api/orders/abandoned-carts/summary",
  ]);
  const summaryCalls = [...calls];

  calls.length = 0;
  await Promise.all([
    client.execute({ kind: "find_product", query: "KG-M-KREM" }),
    client.execute({ kind: "find_customer", query: "Ada" }),
    client.execute({ kind: "find_order", query: "CBX-1042" }),
  ]);

  assert.deepEqual(calls.map(([path]) => path), [
    "/api/catalog/products?pageSize=100",
    "/api/customers?search=Ada&pageSize=10",
    "/api/orders?search=CBX-1042&pageSize=10&sort=newest",
  ]);
  for (const [, init] of [...summaryCalls, ...calls]) {
    assert.deepEqual(init, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: undefined,
    });
  }
});

test("returns the validated summary and bounded matching search results", async () => {
  const client = createToshiLocalClient(async (path) => {
    switch (String(path)) {
      case "/api/catalog/summary": return Response.json({ totalProducts: 2, activeProducts: 1, draftProducts: 1, productLimit: 10, activeVariants: 2, outOfStockVariants: 1, productsWithoutMedia: 1, activeMedia: 1 });
      case "/api/orders/summary": return Response.json({ totalOrders: 2, pendingOrders: 1, fulfilledOrders: 1, revenueCents: 100, currency: "TRY", asOf: NOW });
      case "/api/customers/summary": return Response.json({ active: 2, archived: 0, consentedEmail: 1, totalSpentCents: 100, currency: "TRY", asOf: NOW });
      case "/api/orders/abandoned-carts/summary": return Response.json({ abandoned: 1, recovered: 0, lostValueCents: 10, recoveredValueCents: 0, currency: "TRY", asOf: NOW });
      case "/api/catalog/products?pageSize=100": return Response.json({ items: Array.from({ length: 11 }, (_, index) => product(`Krem Ürün ${index + 1}`, `krem-urun-${index + 1}`)) });
      case "/api/customers?search=Ada&pageSize=10": return Response.json({ items: [customer] });
      case "/api/orders?search=CBX-1042&pageSize=10&sort=newest": return Response.json({ items: [order] });
      default: throw new Error(`unexpected_path:${path}`);
    }
  });

  assert.equal((await client.execute({ kind: "store_summary" })).text, "Mağazada 2 ürün, 1 bekleyen sipariş, 2 aktif müşteri ve 1 terk edilmiş sepet var.");
  assert.equal((await client.execute({ kind: "pending_orders" })).text, "1 bekleyen sipariş var.");
  assert.equal((await client.execute({ kind: "low_stock" })).text, "Stokta olmayan 1 varyant var.");
  assert.match((await client.execute({ kind: "find_product", query: "Krem" })).text, /^“Krem” için 10 ürün bulundu:/u);
  assert.doesNotMatch((await client.execute({ kind: "find_product", query: "Krem" })).text, /Krem Ürün 11/u);
  assert.equal((await client.execute({ kind: "find_customer", query: "Ada" })).text, "“Ada” için 1 müşteri bulundu: Ada Lovelace.");
  assert.equal((await client.execute({ kind: "find_order", query: "CBX-1042" })).text, "“CBX-1042” için 1 sipariş bulundu: CBX-1042 (Ada Lovelace).");
});

test("does not fetch for navigate or unsupported intents", async () => {
  let calls = 0;
  const client = createToshiLocalClient(async () => {
    calls += 1;
    return Response.json({});
  });

  await client.execute({ kind: "navigate", destination: "/products" });
  await client.execute({ kind: "unsupported" });

  assert.equal(calls, 0);
});

test("fails closed when a local response is not JSON or exceeds the search cap", async () => {
  const nonJson = createToshiLocalClient(async () => new Response("unavailable", {
    headers: { "content-type": "text/plain" },
  }));
  await assert.rejects(
    nonJson.execute({ kind: "find_customer", query: "Ada" }),
    { name: "ToshiLocalError", code: "unavailable" },
  );

  const oversized = createToshiLocalClient(async () => Response.json({ items: Array.from({ length: 11 }, () => customer) }));
  await assert.rejects(
    oversized.execute({ kind: "find_customer", query: "Ada" }),
    { name: "ToshiLocalError", code: "unavailable" },
  );

  const overlongCursor = createToshiLocalClient(async () => Response.json({ items: [customer], nextCursor: "a".repeat(1025) }));
  await assert.rejects(
    overlongCursor.execute({ kind: "find_customer", query: "Ada" }),
    { name: "ToshiLocalError", code: "unavailable" },
  );
});
