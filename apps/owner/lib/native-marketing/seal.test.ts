import assert from "node:assert/strict";
import test from "node:test";
import { openNativeMarketingRequest, sealNativeMarketingRequest, type NativeMarketingProviderRequest } from "./seal.ts";
const STORE = "11111111-1111-4111-8111-111111111111", DELIVERY = "22222222-2222-4222-8222-222222222222";
const identity = { storeId: STORE, deliveryId: DELIVERY };
const keyring = { activeKeyId: "marketing_01", keys: { marketing_01: Buffer.alloc(32, 7) } };
const request: NativeMarketingProviderRequest = { from: "Mağaza <noreply@marketing.celebix.co>", to: "ada@example.test", subject: "Yeni ürünler", html: "<p>Yeni ürünler</p>", text: "Yeni ürünler", headers: { "List-Unsubscribe": "<https://owner.saas-staging.celebix.net/api/marketing/unsubscribe?token=" + "a".repeat(43) + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: [{ name: "tenant_id", value: STORE }, { name: "delivery_id", value: DELIVERY }] };
test("marketing ciphertext freezes exact request while binding it to tenant and delivery", () => {
  const sealed = sealNativeMarketingRequest(request, keyring, identity, () => Buffer.alloc(12, 4));
  assert.equal(sealed.digest, "471fb0fb08273f5dc6820c3311187db342e7ab170ae4f94ab86b27574fea58f2");
  assert.equal(sealed.bytes.includes(Buffer.from(request.to)), false);
  assert.deepEqual(openNativeMarketingRequest(sealed, keyring, identity), request);
  assert.throws(() => openNativeMarketingRequest(sealed, keyring, { ...identity, deliveryId: STORE }), /native_marketing_seal_invalid/u);
  const bytes = Buffer.from(sealed.bytes); bytes[bytes.length - 1]! ^= 1;
  assert.throws(() => openNativeMarketingRequest({ ...sealed, bytes }, keyring, identity), /native_marketing_seal_invalid/u);
});
test("marketing request rejects reply-to and unsubscribe header injection", () => {
  assert.throws(() => sealNativeMarketingRequest({ ...request, replyTo: "merchant@example.test" } as NativeMarketingProviderRequest, keyring, identity), /native_marketing_seal_invalid/u);
  assert.throws(() => sealNativeMarketingRequest({ ...request, headers: { ...request.headers, "List-Unsubscribe": request.headers["List-Unsubscribe"] + "\r\nBcc: other@example.test" } }, keyring, identity), /native_marketing_seal_invalid/u);
});

import { renderNativeMarketingEmail } from '@celebix/saas-data/native-marketing-templates';
function renderedBlockRequest(): NativeMarketingProviderRequest {
  const rendered = renderNativeMarketingEmail({ storeId: STORE, unsubscribeUrl: request.headers['List-Unsubscribe'].slice(1, -1), projection: {
    recipient: request.to, senderLabel: 'Mağaza', storeName: 'Mağaza', primaryColor: '#292524', storefrontOrigin: 'https://shop.example.test', supportUrl: 'https://shop.example.test/contact', postalAddress: 'İstanbul', recoveryNeeded: false, isTest: true, items: [],
    template: { id: 'new_products', version: 1, subject: 'Yeni ürünler', heading: 'Başlık', body: 'Gövde', buttonLabel: 'Keşfet', buttonPath: '/products', schemaVersion: 2, blocks: [{ id: '33333333-3333-4333-8333-333333333333', type: 'text', text: 'Yeni ürünleri keşfedin', align: 'left', color: '#292524' }] },
  } });
  return { ...request, ...rendered };
}
test('real V2 renderer responsive head stylesheet survives sealing and opening byte exact', () => {
  const value = renderedBlockRequest();
  assert.match(value.html, /<style>@media only screen/u);
  const envelope = sealNativeMarketingRequest(value, keyring, identity, () => Buffer.alloc(12, 4));
  assert.deepEqual(openNativeMarketingRequest(envelope, keyring, identity), value);
});
test('responsive allowance rejects changed CSS, extra styles and body placement', () => {
  const value = renderedBlockRequest(), stylesheet = value.html.match(/<style>[^<]*<\/style>/u)![0];
  const unsafe = [
    value.html.replace('max-width:480px', 'max-width:481px'),
    value.html.replace('.email-stack{', '.email-stack{background:url(https://evil.test/pixel);'),
    value.html.replace('@media', '@import "https://evil.test/x.css";@media'),
    value.html.replace('.email-content{', '.email-content{display:none;'),
    value.html.replace('<style>', '<style media="screen">'),
    value.html.replace('<style>', '<STYLE>').replace('</style>', '</STYLE>'),
    value.html.replace('</head>', stylesheet + '</head>'),
    value.html.replace(stylesheet, '').replace('</body>', stylesheet + '</body>'),
    value.html.replace(stylesheet, '').replace('</head>', '<!--' + stylesheet + '--></head>'),
    value.html.replace('</head>', '<style>p{color:red}</style></head>'),
    value.html.replace('</body>', '</style></body>'),
    value.html.replace('</body>', '<script>alert(1)</script></body>'),
    value.html.replace('</body>', '<link rel="stylesheet" href="https://evil.test/x.css"></body>'),
  ];
  for (const html of unsafe) assert.throws(() => sealNativeMarketingRequest({ ...value, html }, keyring, identity), /native_marketing_seal_invalid/u);
});
