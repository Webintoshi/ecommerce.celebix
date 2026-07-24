import assert from "node:assert/strict";
import test from "node:test";

import { parseToshiLocalIntent } from "./toshi-local/intent.ts";
import { createToshiLocalClient } from "./toshi-local/client.ts";
import { projectToshiLocalReply } from "./toshi-local/response.ts";

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

test("uses capability wording when payload has not been projected", () => {
  const reply = projectToshiLocalReply({ kind: "find_product", query: "KG-M-KREM" }, { id: "ignored" });

  assert.equal(reply.text, "“KG-M-KREM” için ürünlerde arama yapabilirsiniz.");
  assert.doesNotMatch(reply.text, /gösteriyorum|sonuçları/u);
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
      default: return Response.json({ items: [] });
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
    "/api/catalog/products?search=KG-M-KREM&limit=10&status=all",
    "/api/customers?search=Ada&limit=10",
    "/api/orders?search=CBX-1042&limit=10&sort=updated_desc",
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

  const oversized = createToshiLocalClient(async () => Response.json({ items: Array.from({ length: 11 }, () => ({})) }));
  await assert.rejects(
    oversized.execute({ kind: "find_product", query: "KG-M-KREM" }),
    { name: "ToshiLocalError", code: "unavailable" },
  );
});
