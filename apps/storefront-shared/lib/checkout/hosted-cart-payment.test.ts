import assert from "node:assert/strict";
import { test } from "node:test";

import {
  initializeHostedCartPayment,
  type HostedCartPaymentRuntime,
} from "./hosted-cart-payment.ts";

const HOSTNAME = "shop.celebix.site";
const ATTEMPT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const METHOD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const address = Object.freeze({
  firstName: "Ada",
  lastName: "Lovelace",
  line1: "Örnek Sokak 1",
  district: "Kadıköy",
  city: "İstanbul",
  countryCode: "TR" as const,
  phone: "+905551112233",
});

function authority() {
  return Object.freeze({
    storeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    paymentMethodId: METHOD_ID,
    profileId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    providerCode: "iyzico_iframe",
    orderReference: "SF-2026-000001",
    amountMinor: 12_500,
    currency: "TRY",
    customer: Object.freeze({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+905551112233",
      identityNumber: "74300864791",
      shippingAddress: address,
      billingAddress: null,
    }),
    basket: Object.freeze([
      Object.freeze({
        reference: "line-1",
        name: "Ürün",
        quantity: 1,
        unitAmountMinor: 12_500,
        itemType: "PHYSICAL",
      }),
    ]),
    attemptId: ATTEMPT_ID,
    bridgeId: ATTEMPT_ID,
    environment: "test",
    reservationStatus: "held",
  });
}

function runtime(
  initializeCommitted: HostedCartPaymentRuntime["initializeCommitted"],
): HostedCartPaymentRuntime {
  return Object.freeze({ initializeCommitted });
}

function request(): Request {
  return new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      "x-celebix-storefront-proxy": "trusted",
      "x-forwarded-for": "93.184.216.34",
    },
  });
}

test("hosted bridge passes only stable attempt, begin callback, and trusted client IP", async () => {
  let observed: Parameters<HostedCartPaymentRuntime["initializeCommitted"]>[0] | undefined;
  const response = await initializeHostedCartPayment({
    request: request(),
    attemptId: ATTEMPT_ID,
    begin: async () => authority(),
    runtime: runtime(async (input) => {
      observed = input;
      return Object.freeze({
        kind: "redirect",
        url: "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890abcdefghijklmnop&lang=tr",
      });
    }),
    trustedClientIp: "93.184.216.34",
  });
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890abcdefghijklmnop&lang=tr",
  );
  assert.equal(observed?.attemptId, ATTEMPT_ID);
  assert.equal(observed?.trustedClientIp, "93.184.216.34");
  assert.equal(typeof observed?.begin, "function");
  assert.equal(JSON.stringify(observed).includes("credential"), false);
  assert.equal(JSON.stringify(observed).includes("profileId"), false);
});

test("hosted bridge contains processing, rejected, and off-origin presentations", async () => {
  const cases = [
    [{ kind: "processing" as const }, 202],
    [{ kind: "rejected" as const }, 503],
    [{ kind: "redirect" as const, url: "https://evil.test/pay" }, 503],
    [{
      kind: "iframe" as const,
      url: "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890abcdefghijklmnop&lang=tr",
      token: "differentToken1234567890abcdefghijklmnop",
    }, 503],
  ] as const;
  for (const [presentation, status] of cases) {
    const response = await initializeHostedCartPayment({
      request: request(),
      attemptId: ATTEMPT_ID,
      begin: async () => authority(),
      runtime: runtime(async () => presentation),
      trustedClientIp: "93.184.216.34",
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("location"), null);
  }
});
