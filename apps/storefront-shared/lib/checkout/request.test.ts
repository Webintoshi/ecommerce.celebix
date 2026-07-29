import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readCheckoutDeliveryRequest,
  readCheckoutSubmitRequest,
} from "./request.ts";

const HOSTNAME = "shop.celebix.site";
const CART_CREDENTIAL = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OPERATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYMENT_METHOD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NONCE = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const address = Object.freeze({
  firstName: "Ada",
  lastName: "Lovelace",
  line1: "Örnek Sokak 1",
  district: "Kadıköy",
  city: "İstanbul",
  countryCode: "TR" as const,
  phone: "+905551112233",
});

function deliveryRequest(overrides: Readonly<{
  origin?: string;
  headers?: Readonly<Record<string, string>>;
  body?: string;
  url?: string;
}> = {}): Request {
  return new Request(overrides.url ?? `https://${HOSTNAME}/api/checkout/delivery`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      origin: overrides.origin ?? `https://${HOSTNAME}`,
      ...overrides.headers,
    },
    body: overrides.body ?? JSON.stringify({
      cartVersion: 4,
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      email: "ada@example.com",
      marketingOptIn: false,
      shippingAddress: address,
      billingAddress: null,
      shippingId: "standard",
      discountCode: null,
    }),
  });
}

test("delivery request rejects cross-origin authority before parsing the body", async () => {
  const selected = await readCheckoutDeliveryRequest(
    deliveryRequest({ origin: "https://evil.test", body: "not-json" }),
    HOSTNAME,
  );
  assert.deepEqual(selected, { kind: "error", code: "origin_denied" });
});

test("delivery request rejects browser tenant authority", async () => {
  const selected = await readCheckoutDeliveryRequest(
    deliveryRequest({ headers: { "x-store-id": "browser-store" } }),
    HOSTNAME,
  );
  assert.deepEqual(selected, { kind: "error", code: "invalid_input" });
});

test("delivery request returns only trusted host, server digest, and parsed contract input", async () => {
  const selected = await readCheckoutDeliveryRequest(deliveryRequest(), HOSTNAME);
  assert.equal(selected.kind, "valid");
  if (selected.kind !== "valid") return;
  assert.deepEqual(Object.keys(selected).sort(), [
    "credentialDigest",
    "delivery",
    "hostname",
    "kind",
  ]);
  assert.equal(selected.hostname, HOSTNAME);
  assert.match(selected.credentialDigest, /^[a-f0-9]{64}$/);
  assert.equal(selected.delivery.shippingId, "standard");
  assert.equal(JSON.stringify(selected).includes(CART_CREDENTIAL), false);
});

test("submit accepts only one canonical URL-encoded contract form", async () => {
  const request = new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      origin: `https://${HOSTNAME}`,
    },
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "74300864791",
      distanceSales: "true",
      preInformation: "true",
    }).toString(),
  });
  const selected = await readCheckoutSubmitRequest(request, HOSTNAME);
  assert.equal(selected.kind, "valid");
  if (selected.kind !== "valid") return;
  assert.deepEqual(selected.submission, {
    cartVersion: 4,
    checkoutNonce: NONCE,
    operationId: OPERATION_ID,
    paymentMethodId: PAYMENT_METHOD_ID,
    identityNumber: "74300864791",
    consents: { distanceSales: true, preInformation: true },
  });
});

test("submit rejects duplicate cart cookies and duplicate form fields", async () => {
  const base = {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: `https://${HOSTNAME}`,
    },
  } as const;
  const duplicateCookie = new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    ...base,
    headers: {
      ...base.headers,
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}; __Host-celebix_cart=${CART_CREDENTIAL}`,
    },
    body: `cartVersion=4&checkoutNonce=${NONCE}&operationId=${OPERATION_ID}&paymentMethodId=${PAYMENT_METHOD_ID}&identityNumber=&distanceSales=true&preInformation=true`,
  });
  assert.deepEqual(await readCheckoutSubmitRequest(duplicateCookie, HOSTNAME), {
    kind: "error",
    code: "invalid_input",
  });

  const duplicateField = new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    ...base,
    headers: {
      ...base.headers,
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
    },
    body: `cartVersion=4&cartVersion=4&checkoutNonce=${NONCE}&operationId=${OPERATION_ID}&paymentMethodId=${PAYMENT_METHOD_ID}&identityNumber=&distanceSales=true&preInformation=true`,
  });
  assert.deepEqual(await readCheckoutSubmitRequest(duplicateField, HOSTNAME), {
    kind: "error",
    code: "invalid_input",
  });
});

test("request boundary rejects exact-path near matches and malformed UTF-8", async () => {
  const wrongPath = new Request(`https://${HOSTNAME}/api/checkout/delivery?tenant=browser`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      origin: `https://${HOSTNAME}`,
    },
    body: "{}",
  });
  assert.deepEqual(await readCheckoutDeliveryRequest(wrongPath, HOSTNAME), {
    kind: "error",
    code: "invalid_input",
  });

  const malformed = new Request(`https://${HOSTNAME}/api/checkout/delivery`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      origin: `https://${HOSTNAME}`,
    },
    body: new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
  });
  assert.deepEqual(await readCheckoutDeliveryRequest(malformed, HOSTNAME), {
    kind: "error",
    code: "invalid_input",
  });
});

test("request boundary requires the exact trusted HTTPS URL authority", async () => {
  for (const url of [
    `http://${HOSTNAME}/api/checkout/delivery`,
    "https://other.celebix.site/api/checkout/delivery",
    `https://${HOSTNAME}:8443/api/checkout/delivery`,
    `https://${HOSTNAME}/api/checkout/delivery?`,
    `https://${HOSTNAME}/api/checkout/delivery#`,
  ]) {
    assert.deepEqual(await readCheckoutDeliveryRequest(
      deliveryRequest({ url }),
      HOSTNAME,
    ), {
      kind: "error",
      code: "invalid_input",
    }, url);
  }
  const credentialed = deliveryRequest();
  Object.defineProperty(credentialed, "url", {
    value: `https://user@${HOSTNAME}/api/checkout/delivery`,
  });
  assert.deepEqual(await readCheckoutDeliveryRequest(credentialed, HOSTNAME), {
    kind: "error",
    code: "invalid_input",
  });
});
