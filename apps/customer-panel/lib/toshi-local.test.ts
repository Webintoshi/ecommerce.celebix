import assert from "node:assert/strict";
import test from "node:test";

import { parseToshiLocalIntent } from "./toshi-local/intent.ts";
import { createToshiLocalClient } from "./toshi-local/client.ts";
import { projectToshiLocalReply } from "./toshi-local/response.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID_2 = "12111111-1111-4111-8111-111111111111";
const PRODUCT_ID_3 = "13111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-24T10:00:00.000Z";

function productId(index: number): string {
  return `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`;
}

const product = (title = "Krem Gömlek", slug = "krem-gomlek", id = PRODUCT_ID) => ({
  id, storeId: PRODUCT_ID, title, slug, status: "active", currency: "TRY",
  createdAt: NOW, updatedAt: NOW, version: 1,
});
const detail = (entry: ReturnType<typeof product>, sku?: string) => ({
  product: entry,
  variants: sku === undefined ? [] : [{
    id: "44444444-4444-4444-8444-444444444444", productId: entry.id, storeId: PRODUCT_ID,
    title: entry.title, sku, priceCents: 100, stockTracking: true, stockQuantity: 1,
    status: "active", attributes: {}, createdAt: NOW, updatedAt: NOW, version: 1,
  }],
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
    projectToshiLocalReply({ kind: "find_product", query: "KG-M-KREM" }, { products: [product()], truncated: false }).text,
    "“KG-M-KREM” için ilk 1 eşleşme: Krem Gömlek.",
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
      case "/api/catalog/products?limit=20&status=active": return Response.json({ items: [product()] });
      case "/api/catalog/products?limit=20&status=draft": return Response.json({ items: [] });
      case `/api/catalog/products/${PRODUCT_ID}`: return Response.json(detail(product(), "KG-M-KREM"));
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

  assert.deepEqual(calls.map(([path]) => path).sort(), [
    "/api/catalog/products?limit=20&status=active",
    "/api/catalog/products?limit=20&status=draft",
    `/api/catalog/products/${PRODUCT_ID}`,
    "/api/customers?search=Ada&pageSize=10",
    "/api/orders?search=CBX-1042&pageSize=10&sort=newest",
  ].sort());
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
      case "/api/catalog/products?limit=20&status=active": return Response.json({ items: Array.from({ length: 11 }, (_, index) => product(`Krem Ürün ${index + 1}`, `krem-urun-${index + 1}`, productId(index + 1))) });
      case "/api/catalog/products?limit=20&status=draft": return Response.json({ items: [] });
      default: {
        const id = String(path).replace("/api/catalog/products/", "");
        if (/^[0-9a-f-]{36}$/u.test(id)) return Response.json(detail(product("Krem Ürün", "krem-urun", id)));
        throw new Error(`unexpected_path:${path}`);
      }
      case "/api/customers?search=Ada&pageSize=10": return Response.json({ items: [customer] });
      case "/api/orders?search=CBX-1042&pageSize=10&sort=newest": return Response.json({ items: [order] });
    }
  });

  assert.equal((await client.execute({ kind: "store_summary" })).text, "Mağazada 2 ürün, 1 bekleyen sipariş, 2 aktif müşteri ve 1 terk edilmiş sepet var.");
  assert.equal((await client.execute({ kind: "pending_orders" })).text, "1 bekleyen sipariş var.");
  assert.equal((await client.execute({ kind: "low_stock" })).text, "Stokta olmayan 1 varyant var.");
  assert.match((await client.execute({ kind: "find_product", query: "Krem" })).text, /^“Krem” için ilk 10 eşleşme:/u);
  assert.doesNotMatch((await client.execute({ kind: "find_product", query: "Krem" })).text, /Krem Ürün 11/u);
  assert.equal((await client.execute({ kind: "find_customer", query: "Ada" })).text, "“Ada” için 1 müşteri bulundu: Ada Lovelace.");
  assert.equal((await client.execute({ kind: "find_order", query: "CBX-1042" })).text, "“CBX-1042” için 1 sipariş bulundu: CBX-1042 (Ada Lovelace).");
});

test("scans bounded catalog pages and product details for later title and SKU matches", async () => {
  const first = product("İlk Ürün", "ilk-urun", PRODUCT_ID);
  const laterTitle = product("Geç Başlık", "gec-baslik", PRODUCT_ID_2);
  const laterSku = product("Diğer Ürün", "diger-urun", PRODUCT_ID_3);
  let inflightDetails = 0;
  let maximumDetails = 0;
  const client = createToshiLocalClient(async (path) => {
    const value = String(path);
    if (value === "/api/catalog/products?limit=20&status=active") return Response.json({ items: [first], nextCursor: "later" });
    if (value === "/api/catalog/products?limit=20&status=active&cursor=later") return Response.json({ items: [laterTitle, laterSku] });
    if (value === "/api/catalog/products?limit=20&status=draft") return Response.json({ items: [] });
    const entries = new Map([
      [`/api/catalog/products/${PRODUCT_ID}`, detail(first)],
      [`/api/catalog/products/${PRODUCT_ID_2}`, detail(laterTitle)],
      [`/api/catalog/products/${PRODUCT_ID_3}`, detail(laterSku, "SKU-LATE")],
    ]);
    const body = entries.get(value);
    if (body === undefined) throw new Error(`unexpected_path:${path}`);
    inflightDetails += 1;
    maximumDetails = Math.max(maximumDetails, inflightDetails);
    await Promise.resolve();
    inflightDetails -= 1;
    return Response.json(body);
  });

  assert.equal((await client.execute({ kind: "find_product", query: "Geç" })).text, "“Geç” için ilk 1 eşleşme: Geç Başlık.");
  assert.equal((await client.execute({ kind: "find_product", query: "SKU-LATE" })).text, "“SKU-LATE” için ilk 1 eşleşme: Diğer Ürün.");
  assert.ok(maximumDetails <= 4);
});

test("fails closed on a catalog cursor loop and labels a bounded zero-result scan as incomplete", async () => {
  const loop = createToshiLocalClient(async (path) => {
    const value = String(path);
    if (value === "/api/catalog/products?limit=20&status=active") return Response.json({ items: [], nextCursor: "loop" });
    if (value === "/api/catalog/products?limit=20&status=active&cursor=loop") return Response.json({ items: [], nextCursor: "loop" });
    throw new Error(`unexpected_path:${path}`);
  });
  await assert.rejects(loop.execute({ kind: "find_product", query: "Krem" }), { name: "ToshiLocalError", code: "unavailable" });

  const entries = [product("Yün", "yun", PRODUCT_ID), product("Pamuk", "pamuk", PRODUCT_ID_2), product("İpek", "ipek", PRODUCT_ID_3)];
  const bounded = createToshiLocalClient(async (path) => {
    const value = String(path);
    const cursor = new URL(`https://panel.invalid${value}`).searchParams.get("cursor");
    if (value.includes("status=active")) return Response.json({ items: [entries[cursor === null ? 0 : Number(cursor)]!], nextCursor: cursor === "2" ? "3" : String((cursor === null ? 0 : Number(cursor)) + 1) });
    if (value.includes("status=draft")) return Response.json({ items: [] });
    const id = value.replace("/api/catalog/products/", "");
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry) return Response.json(detail(entry));
    throw new Error(`unexpected_path:${path}`);
  });
  assert.equal((await bounded.execute({ kind: "find_product", query: "Krem" })).text, "“Krem” için eşleşme bulunamadı; daha fazla ürün olabilir.");
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
