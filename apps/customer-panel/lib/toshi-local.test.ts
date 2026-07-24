import assert from "node:assert/strict";
import test from "node:test";

import { parseToshiLocalIntent } from "./toshi-local/intent.ts";
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
