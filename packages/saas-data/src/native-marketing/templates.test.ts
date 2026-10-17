import assert from "node:assert/strict";
import test from "node:test";
import { NATIVE_MARKETING_TEMPLATE_DEFAULTS, renderNativeMarketingEmail } from "./templates.ts";
import type { NativeMarketingProjection } from "./types.ts";
const STORE = "11111111-1111-4111-8111-111111111111";
const unsubscribeUrl = "https://owner.saas-staging.celebix.net/api/marketing/unsubscribe?token=" + "u".repeat(43);
function projection(index = 0): NativeMarketingProjection {
  return { recipient: "ada@example.test", recipientName: "Ada <script>", senderLabel: "Mağaza", storeName: "Güzide & Mağaza", primaryColor: "#9B6C2C", storefrontOrigin: "https://shop.example.test", supportUrl: "https://shop.example.test/contact", template: NATIVE_MARKETING_TEMPLATE_DEFAULTS[index]!, recoveryNeeded: index === 0, isTest: false,
    logoUrl: `https://media.celebix.site/stores/${STORE}/design/22222222-2222-4222-8222-222222222222.jpg`, items: [{ productId: STORE, productName: "Ürün <script>", url: "https://shop.example.test/products/urun", quantity: 2, unitPriceCents: 12500, currency: "TRY" }] };
}
test("four ready templates render store branding and safe tenant product links", () => {
  assert.deepEqual(NATIVE_MARKETING_TEMPLATE_DEFAULTS.map(value => value.id), ["cart", "new_products", "offer", "welcome"]);
  for (let index = 0; index < 4; index++) {
    const rendered = renderNativeMarketingEmail({ storeId: STORE, projection: projection(index), unsubscribeUrl, recoveryUrl: "https://shop.example.test/cart/recover#token=" + "r".repeat(43), postalAddress: "İstanbul, Türkiye" });
    assert.ok(rendered.subject.length > 0); assert.match(rendered.html, /Güzide &amp; Mağaza/u);
    assert.ok(rendered.html.includes(unsubscribeUrl.replaceAll("&", "&amp;")));
    assert.ok(rendered.text.includes(unsubscribeUrl)); assert.match(rendered.html, /Ürün &lt;script&gt;/u);
    assert.doesNotMatch(rendered.html, /<script>|reply-to|mailto:/iu);
    assert.match(rendered.html, /Celebix işletmecisi: İstanbul, Türkiye/u);
  }
});
test("cart CTA uses existing fragment recovery route and rejects cross-store destination", () => {
  const recoveryUrl = "https://shop.example.test/cart/recover#token=" + "r".repeat(43);
  const input = { storeId: STORE, projection: projection(), unsubscribeUrl, recoveryUrl, postalAddress: "İstanbul" };
  assert.ok(renderNativeMarketingEmail(input).html.includes(recoveryUrl));
  assert.throws(() => renderNativeMarketingEmail({ ...input, recoveryUrl: recoveryUrl.replace("shop.example.test", "other.example.test") }), /native_marketing_template_invalid/u);
  assert.throws(() => renderNativeMarketingEmail({ ...input, projection: { ...projection(), template: { ...projection().template, buttonPath: "//evil.test" } } }), /native_marketing_template_invalid/u);
});
test("foreign tenant logo is omitted and canonical store address takes precedence", () => {
  const value = projection(1);
  const rendered = renderNativeMarketingEmail({ storeId: STORE, projection: { ...value, logoUrl: value.logoUrl!.replace(STORE, "33333333-3333-4333-8333-333333333333"), postalAddress: "Mağaza Adresi" }, unsubscribeUrl, postalAddress: "Platform Adresi" });
  assert.doesNotMatch(rendered.html, /<img/u); assert.match(rendered.text, /Mağaza Adresi/u); assert.doesNotMatch(rendered.text, /Platform Adresi/u);
});
test("Lilyum uses its exact live refined logo migration while subsequently published logos win", () => {
  const storeId = "89e1e15f-8282-4e9b-ae3e-f417501bd54a", original = `https://media.celebix.site/stores/${storeId}/design/c9c0df33-d646-59a4-ba36-a538b32d2a31.jpg`;
  const value = { ...projection(1), logoUrl: original };
  const rendered = renderNativeMarketingEmail({ storeId, projection: value, unsubscribeUrl });
  assert.match(rendered.html, /https:\/\/shop.example.test\/themes\/lilyum\/logo-refined-v1.webp/u);
  const custom = original.replace("c9c0df33-d646-59a4-ba36-a538b32d2a31", "22222222-2222-4222-8222-222222222222");
  const changed = renderNativeMarketingEmail({ storeId, projection: { ...value, logoUrl: custom }, unsubscribeUrl });
  assert.ok(changed.html.includes(custom)); assert.doesNotMatch(changed.html, /logo-refined-v1/u);
});
