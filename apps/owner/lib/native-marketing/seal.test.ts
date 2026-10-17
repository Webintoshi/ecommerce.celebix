import assert from "node:assert/strict";
import test from "node:test";
import { openNativeMarketingRequest, sealNativeMarketingRequest, type NativeMarketingProviderRequest } from "./seal.ts";
const STORE = "11111111-1111-4111-8111-111111111111", DELIVERY = "22222222-2222-4222-8222-222222222222";
const identity = { storeId: STORE, deliveryId: DELIVERY };
const keyring = { activeKeyId: "marketing_01", keys: { marketing_01: Buffer.alloc(32, 7) } };
const request: NativeMarketingProviderRequest = { from: "Mağaza <noreply@marketing.celebix.co>", to: "ada@example.test", subject: "Yeni ürünler", html: "<p>Yeni ürünler</p>", text: "Yeni ürünler", headers: { "List-Unsubscribe": "<https://owner.saas-staging.celebix.net/api/marketing/unsubscribe?token=" + "a".repeat(43) + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: [{ name: "tenant_id", value: STORE }, { name: "delivery_id", value: DELIVERY }] };
test("marketing ciphertext freezes exact request while binding it to tenant and delivery", () => {
  const sealed = sealNativeMarketingRequest(request, keyring, identity, () => Buffer.alloc(12, 4));
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
