import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [cart, provider, header, readiness, utilities] = await Promise.all([
  readFile(new URL("./CartPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CartStatusProvider.tsx", import.meta.url), "utf8"),
  readFile(new URL("./Header.tsx", import.meta.url), "utf8"),
  readFile(new URL("./checkout-readiness.ts", import.meta.url), "utf8"),
  readFile(new URL("./StoreUtilities.tsx", import.meta.url), "utf8"),
]);

const [checkout, summary, promotionField, promotionDetails, css] = await Promise.all([
  readFile(new URL("./CheckoutForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("./CheckoutSummary.tsx", import.meta.url), "utf8"),
  readFile(new URL("./PromotionCouponField.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("./PromotionDetails.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);
const promotionModel = await readFile(new URL("../lib/promotions/model.ts", import.meta.url), "utf8").catch(() => "");
const [cartPage, checkoutPage] = await Promise.all([
  readFile(new URL("../app/cart/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/checkout/page.tsx", import.meta.url), "utf8"),
]);

test("cart renders persisted lines totals quantity removal and checkout readiness", () => {
  for (const proof of ["Sepetiniz boş", "Ara toplam", "Kargo", "Toplam", "Adedi güncelle", "Sepetten çıkar", "/checkout"]) assert.match(cart, new RegExp(proof, "u"));
  assert.match(cart, /setQuantity/u);
  assert.match(cart, /remove/u);
  assert.match(cart, /refresh/u);
  assert.doesNotMatch(cart, /storeId|tenantId|credential/u);
});

test("recovered cart explains current price and stock revalidation", () => {
  for (const proof of ["recovered", "omittedItems", "Sepetiniz geri yüklendi", "fiyatı veya stok durumu güncellenmiş olabilir"]) assert.match(cart, new RegExp(proof, "u"));
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

test("async cart counts preserve the server loading snapshot until each consumer hydrates", () => {
  for (const source of [provider, utilities, cart]) assert.match(source, /useHydrated/u);
  assert.match(provider, /!hydrated \|\| loading/u);
  assert.match(utilities, /hydrated \? cart\?\.itemCount \?\? 0 : 0/u);
  assert.match(utilities, /hydrated \? favoriteCount : 0/u);
  assert.match(cart, /const visibleCart = hydrated \? cart : null/u);
  assert.match(cart, /const visibleLoading = !hydrated \|\| loading/u);
});

test("cart and checkout apply and remove coupons only by re-quoting V2 and pass validated codes into both completion paths", () => {
  for (const source of [cart, checkout]) {
    assert.match(source, /quotePromotions/u);
  }
  assert.match(checkout, /normalizedCodes/u);
  assert.match(promotionField, /type="submit"/u);
  assert.match(promotionField, /type="button"/u);
  assert.match(checkout, /startHosted\([\s\S]*normalizedCodes/u);
  assert.match(checkout, /\/api\/checkout\/complete[\s\S]*normalizedCodes/u);
  assert.doesNotMatch(`${cart}\n${checkout}\n${promotionField}`, /discount(?:Cents)?\s*[+*/-]|Math[.](?:round|floor|ceil)/u);
});

test("promotion UX exposes keyboard controls, polite live feedback and no inaccessible campaign identity", () => {
  assert.match(promotionField, /<label[\s\S]*htmlFor=/u);
  assert.match(promotionField, /aria-live="polite"/u);
  assert.match(promotionField, /aria-busy/u);
  assert.match(promotionDetails, /Otomatik kampanya/u);
  assert.match(`${promotionDetails}\n${promotionModel}`, /Bu kod şu anda uygulanamıyor/u);
  assert.doesNotMatch(`${promotionDetails}\n${promotionModel}`, /audience|segment|campaignId|promotionId|customerId/iu);
});

test("duplicate server labels messages and same-variant gift rows use collision-free deterministic keys", () => {
  assert.match(promotionDetails, /labels[.]map\(\(promotion,\s*index\)/u);
  assert.match(promotionDetails, /progressMessages[.]map\(\(message,\s*index\)/u);
  assert.match(promotionDetails, /gifts[.]map\(\(gift,\s*index\)/u);
  assert.match(summary, /items[.]map\(\(item,\s*index\)/u);
  assert.match(summary, /key=\{`\$\{item[.]variantId\}-\$\{index\}`\}/u);
});

test("promotion layout has a focused 390px no-horizontal-overflow contract", () => {
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*[.]promotion-coupon-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
  assert.match(css, /[.]promotion-coupon[^{}]*\{[^}]*min-width:\s*0/u);
  assert.match(css, /[.]promotion-coupon input[^{}]*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/u);
  assert.doesNotMatch(css, /[.]promotion-(?:coupon|details)[^{}]*\{[^}]*(?:min-width:\s*[4-9]\d\dpx|width:\s*[4-9]\d\dpx)/u);
  assert.match(summary, /lineDiscountCents/u);
});

test("HttpOnly stacked candidates bootstrap cart then checkout and the new UI opts into V2 with an empty set", () => {
  for (const page of [cartPage, checkoutPage]) {
    assert.match(page, /cookies/u);
    assert.match(page, /readCouponCandidateCookie/u);
    assert.match(page, /initialNormalizedCodes/u);
  }
  assert.match(cart, /initialNormalizedCodes[\s\S]*quotePromotions/u);
  assert.match(checkout, /initialNormalizedCodes[\s\S]*quotePromotions/u);
  assert.match(checkout, /normalizedCodes:\s*appliedCodes/u);
  assert.match(cart, /initialNormalizedCodes\s*=\s*\[\]/u);
  assert.match(checkout, /initialNormalizedCodes\s*=\s*\[\]/u);
  assert.match(cartPage, /initialNormalizedCodes=\{candidateCodes\}/u);
  assert.match(checkoutPage, /initialNormalizedCodes=\{candidateCodes\}/u);
  assert.doesNotMatch(checkout, /storefrontCartClient[.]quote\(intentKind\)/u);
  assert.match(checkout, /operation[.]current\s*=\s*null/u);
});

test("cart clears stale promotion facts before every version or candidate re-quote", () => {
  assert.match(cart, /useEffect\(\(\) => \{[\s\S]*?setPromotionQuote\(null\);[\s\S]*?quotePromotions\("cart", appliedCodes\)/u);
  assert.match(cart, /const quoteCodes[\s\S]*?setPromotionQuote\(null\);[\s\S]*?quotePromotions\("cart", requested\)/u);
});

test("cart renders promotion facts only when the quote matches the visible cart version", () => {
  assert.match(
    cart,
    /const activePromotionQuote\s*=\s*promotionQuote[?][.]cart[.]version\s*===\s*visibleCart[.]version/u,
  );
  assert.match(cart, /const summaryCart\s*=\s*activePromotionQuote[?][.]cart\s*[?][?]\s*visibleCart/u);
  assert.doesNotMatch(cart, /promotionQuote[?][.]cart[.](?:lineDiscountCents|shippingDiscountCents|discountCents)/u);
  assert.match(cart, /<PromotionDetails quote=\{activePromotionQuote\}/u);
});

test("cart serializes merchandise coupon and checkout interactions behind the first V2 quote", () => {
  assert.match(cart, /useState\(true\)/u);
  assert.match(cart, /const interactionPending\s*=\s*pending\s*\|\|\s*promotionPending/u);
  assert.match(cart, /<CartLineControls[\s\S]*?disabled=\{interactionPending\}/u);
  assert.match(cart, /<PromotionCouponField[\s\S]*?pending=\{interactionPending\}/u);
  assert.match(cart, /!interactionPending\s*&&[\s\S]*?href="\/checkout"/u);
});
