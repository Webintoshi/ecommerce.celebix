import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [cart, provider, header, readiness] = await Promise.all([
  readFile(new URL("./CartPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CartStatusProvider.tsx", import.meta.url), "utf8"),
  readFile(new URL("./Header.tsx", import.meta.url), "utf8"),
  readFile(new URL("./checkout-readiness.ts", import.meta.url), "utf8"),
]);

test("cart renders persisted lines totals quantity removal and checkout readiness", () => {
  for (const proof of ["Sepetiniz boş", "Ara toplam", "Kargo", "Toplam", "Adedi güncelle", "Sepetten çıkar", "/checkout"]) assert.match(cart, new RegExp(proof, "u"));
  assert.match(cart, /setQuantity/u);
  assert.match(cart, /remove/u);
  assert.match(cart, /refresh/u);
  assert.doesNotMatch(cart, /storeId|tenantId|credential/u);
});

test("cart explains the exact checkout blocker without a false stock warning", () => {
  for (const proof of [
    "Sepetinizde stok veya fiyatı değişen bir ürün var.",
    "Teslimat yöntemi henüz yapılandırılmadı.",
    "Ödeme yöntemi henüz yapılandırılmadı.",
    "checkoutBlockerMessage",
    "configurationBlocker",
  ]) assert.match(`${cart}\n${readiness}`, new RegExp(proof, "u"));
  assert.doesNotMatch(cart, /Stok bilgilerini kontrol edin/u);
  assert.match(cart, /configurationBlocker[\s\S]+href="\/checkout"/u);
  assert.match(cart, /checkoutBlocker === "stock_unavailable"/u);
});

test("one provider owns canonical count and Header mounts all fixed utilities", () => {
  assert.match(provider, /storefrontCartClient[.]resolve/u);
  assert.match(provider, /itemCount/u);
  assert.match(provider, /aria-live/u);
  assert.match(header, /StoreUtilities/u);
});
