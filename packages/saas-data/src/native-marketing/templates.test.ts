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

import { createHash } from 'node:crypto';
import type { NativeMarketingBlock, NativeMarketingBlockContent } from './types.ts';
const assetId = '22222222-2222-4222-8222-222222222222';
const mediaUrl = `https://media.celebix.site/stores/${STORE}/design/${assetId}.jpg`;
function blockProjection(): NativeMarketingProjection {
  const blocks: NativeMarketingBlock[] = [
    { id: '00000001-1111-4111-8111-111111111111', type: 'heading', text: 'Yeni <ürünler>', align: 'center', color: '#123456', size: 'small' },
    { id: '00000002-1111-4111-8111-111111111111', type: 'text', text: 'Özel & güzel\nİkinci satır', align: 'right', color: '#654321' },
    { id: '00000003-1111-4111-8111-111111111111', type: 'image', assetId, alt: 'Görsel <alt>', linkPath: '/products?q=all#new' },
    { id: '00000004-1111-4111-8111-111111111111', type: 'image_text', assetId, alt: '', heading: 'Birlikte', text: 'Ayrıntılar', buttonLabel: 'İncele', buttonPath: '/products', imagePosition: 'right' },
    { id: '00000005-1111-4111-8111-111111111111', type: 'products', productIds: [STORE], columns: 2 },
    { id: '00000006-1111-4111-8111-111111111111', type: 'button', label: 'Keşfet', path: '/collections', color: '#000000', align: 'center' },
    { id: '00000007-1111-4111-8111-111111111111', type: 'banner', heading: 'Duyuru', text: 'Bu hafta', backgroundColor: '#FFEEDD', textColor: '#112233' },
    { id: '00000008-1111-4111-8111-111111111111', type: 'divider', color: '#ABCDEF' },
    { id: '00000009-1111-4111-8111-111111111111', type: 'spacer', height: 24 },
  ];
  const { label: _label, description: _description, ...template } = NATIVE_MARKETING_TEMPLATE_DEFAULTS[1]!;
  return { ...projection(1), template: { ...template, schemaVersion: 2, blocks }, blockImages: [{ assetId, url: mediaUrl }] };
}
test('legacy email output remains byte exact for existing frozen requests', () => {
  const p: NativeMarketingProjection = { recipient:'ada@example.test', storeName:'Mağaza',senderLabel:'Mağaza',primaryColor:'#9B6C2C',storefrontOrigin:'https://shop.example.test',supportUrl:'https://shop.example.test/contact',template:NATIVE_MARKETING_TEMPLATE_DEFAULTS[1]!,items:[],recoveryNeeded:false,isTest:false };
  const rendered = renderNativeMarketingEmail({ storeId: STORE, projection: p, unsubscribeUrl });
  assert.equal(createHash('sha256').update(JSON.stringify(rendered)).digest('hex'), '22e9c3805045814f93a11ae5e3ebbf787d2ce24510846383418dfdb65437eb44');
});
test('renders all nine block types in order with fixed branding, address and unsubscribe footer', () => {
  const p = blockProjection();
  const result = renderNativeMarketingEmail({ storeId: STORE, projection: { ...p, postalAddress: 'İstanbul' }, unsubscribeUrl });
  assert.match(result.html, /Yeni &lt;ürünler&gt;/u);
  assert.match(result.html, /Özel &amp; güzel<br>İkinci satır/u);
  assert.match(result.html, /alt="Görsel &lt;alt&gt;"/u);
  assert.match(result.html, /background:#FFEEDD;color:#112233/u);
  assert.match(result.html, /height="24"/u);
  assert.match(result.html, /Ürün &lt;script&gt;/u);
  assert.ok(result.html.indexOf('Yeni &lt;ürünler&gt;') < result.html.indexOf('Duyuru'));
  assert.ok(result.text.includes('https://shop.example.test/products?q=all#new'));
  assert.ok(result.text.includes('Ürün <script> · ₺125,00'));
  assert.ok(result.text.includes('İstanbul'));
  assert.ok(result.text.endsWith(unsubscribeUrl));
  assert.ok(result.html.includes('max-width:600px'));
  assert.ok(result.html.includes('email-stack'));
  assert.doesNotMatch(result.html, /<script>|Beğendikleriniz|Yeni favorilerinizle/u);
});
test('V2 images require canonical own-store projection assets and products require exact projection ids', () => {
  const p = blockProjection(), input = { storeId: STORE, projection: p, unsubscribeUrl };
  for (const changed of [ { ...p, blockImages: [] }, { ...p, blockImages: [{ assetId, url: 'https://shop.example.test/themes/lilyum/logo-refined-v1.webp' }] }, { ...p, blockImages: [{ assetId, url: 'https://evil.test/image.jpg' }] }, { ...p, blockImages: [{ assetId, url: mediaUrl.replace(STORE, '33333333-3333-4333-8333-333333333333') }] }, { ...p, items: [] }, { ...p, items: [{ ...p.items[0]!, url: 'https://evil.test/product' }] } ]) assert.throws(() => renderNativeMarketingEmail({ ...input, projection: changed }));
  assert.throws(() => renderNativeMarketingEmail({ ...input, projection: { ...p, template: { ...p.template, id: 'cart' } } }));
  const content = p.template as NativeMarketingBlockContent;
  assert.throws(() => renderNativeMarketingEmail({ ...input, projection: { ...p, template: { ...p.template, blocks: [...content.blocks, { ...content.blocks[0]!, id: '00000010-1111-4111-8111-111111111111', type: 'heading', text: '', align: 'left', color: '#123456', size: 'large' }] } } }));
});
test('historical V1 projection envelopes retain the renderer limits used before sealed delivery', () => {
  const p = projection(1);
  const template = { ...p.template, subject: 's'.repeat(240), buttonPath: 'https://shop.example.test/products?legacy=1' };
  const rendered = renderNativeMarketingEmail({ storeId: STORE, projection: { ...p, template }, unsubscribeUrl });
  assert.equal(rendered.subject, 's'.repeat(240));
  assert.ok(rendered.html.includes('https://shop.example.test/products?legacy=1'));
  assert.ok(rendered.text.includes('https://shop.example.test/products?legacy=1'));
});
