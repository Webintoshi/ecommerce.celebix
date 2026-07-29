import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CheckoutDeliveryInput,
  CheckoutQuote,
  CheckoutStatus,
  CheckoutSubmissionResult,
} from "@celebix/saas-contracts";
import {
  PublicCheckoutRepositoryError,
  type HostedCheckoutAuthority,
  type PublicCheckoutRepository,
} from "@celebix/saas-data";

import type { HostedPaymentRuntime } from "../payment-adapters/runtime.ts";
import {
  createPublicCheckoutHandlers,
  resolveCheckoutPage,
} from "./public-checkout.ts";

const HOSTNAME = "shop.celebix.site";
const CART_CREDENTIAL = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CART_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAYMENT_METHOD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NONCE = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const NOW = new Date("2026-07-29T12:00:00.000Z");

function quote(overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
  return Object.freeze({
    schemaVersion: 1,
    cartId: CART_ID,
    cartVersion: 4,
    checkoutNonce: NONCE,
    storeName: "Örnek Mağaza",
    currency: "TRY",
    locale: "tr",
    items: Object.freeze([
      Object.freeze({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        title: "Ürün",
        variantLabel: null,
        quantity: 1,
        unitPriceCents: 12_500,
        lineTotalCents: 12_500,
        imagePath: null,
      }),
    ]),
    shippingOptions: Object.freeze([
      Object.freeze({
        id: "standard",
        label: "Standart",
        description: null,
        priceCents: 0,
      }),
    ]),
    selectedShippingId: "standard",
    paymentMethods: Object.freeze([
      Object.freeze({
        id: PAYMENT_METHOD_ID,
        kind: "cash_on_delivery",
        label: "Kapıda ödeme",
        instructions: "Teslimatta ödeyin.",
      }),
    ]),
    policyLinks: Object.freeze([]),
    subtotalCents: 12_500,
    shippingCents: 0,
    discountCents: 0,
    totalCents: 12_500,
    discountCode: null,
    ...overrides,
  });
}

function repository(overrides: Partial<PublicCheckoutRepository> = {}): PublicCheckoutRepository {
  return Object.freeze({
    issueNonce: async () => quote(),
    updateDelivery: async () => quote({ cartVersion: 5 }),
    submitBuiltIn: async (): Promise<CheckoutSubmissionResult> =>
      Object.freeze({
        kind: "placed",
        orderNumber: "SF-2026-000001",
        statusPath: "/checkout/status",
      }),
    beginHosted: async () => { throw new PublicCheckoutRepositoryError("payment_method_unavailable"); },
    getStatus: async (): Promise<CheckoutStatus> => Object.freeze({ kind: "ready" }),
    getPolicy: async () => { throw new PublicCheckoutRepositoryError("not_found"); },
    recover: async () => quote(),
    ...overrides,
  });
}

function trusted() {
  return Object.freeze({ kind: "trusted" as const, hostname: HOSTNAME });
}

function hostedAuthority(attemptId: string): HostedCheckoutAuthority {
  return Object.freeze({
    storeId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    paymentMethodId: PAYMENT_METHOD_ID,
    profileId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    providerCode: "iyzico_iframe",
    orderReference: "SF-2026-000002",
    amountMinor: 12_500,
    currency: "TRY",
    customer: Object.freeze({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+905551112233",
      identityNumber: "74300864791",
      shippingAddress: delivery().shippingAddress,
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
    attemptId,
    bridgeId: "99999999-9999-4999-8999-999999999999",
    environment: "test",
    reservationStatus: "held",
  });
}

function headers(contentType?: string): Record<string, string> {
  return {
    ...(contentType === undefined ? {} : { "content-type": contentType }),
    cookie: `__Host-celebix_cart=${CART_CREDENTIAL}`,
    origin: `https://${HOSTNAME}`,
  };
}

function delivery(): CheckoutDeliveryInput {
  return Object.freeze({
    cartVersion: 4,
    checkoutNonce: NONCE,
    operationId: OPERATION_ID,
    email: "ada@example.com",
    marketingOptIn: false,
    shippingAddress: Object.freeze({
      firstName: "Ada",
      lastName: "Lovelace",
      line1: "Örnek Sokak 1",
      district: "Kadıköy",
      city: "İstanbul",
      countryCode: "TR",
      phone: "+905551112233",
    }),
    billingAddress: null,
    shippingId: "standard",
    discountCode: null,
  });
}

test("checkout page resolves only an exact cookie-bound public quote", async () => {
  const selected = await resolveCheckoutPage({
    hostname: HOSTNAME,
    cookieHeader: `__Host-celebix_cart=${CART_CREDENTIAL}`,
    now: NOW,
    repository: repository(),
  });
  assert.deepEqual(selected, { kind: "active", quote: quote() });
  assert.equal(JSON.stringify(selected).includes(CART_CREDENTIAL), false);
});

test("checkout page maps missing cart and sealed repository failures", async () => {
  for (const [error, kind] of [
    [new PublicCheckoutRepositoryError("not_found"), "not_found"],
    [new Error("password=private sql"), "unavailable"],
  ] as const) {
    const selected = await resolveCheckoutPage({
      hostname: HOSTNAME,
      cookieHeader: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      now: NOW,
      repository: repository({ issueNonce: async () => { throw error; } }),
    });
    assert.deepEqual(selected, { kind });
    assert.equal(JSON.stringify(selected).includes("private"), false);
  }
});

test("delivery denies cross-origin and browser tenant authority before repository access", async () => {
  let calls = 0;
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        updateDelivery: async () => { calls += 1; return quote(); },
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const evil = new Request(`https://${HOSTNAME}/api/checkout/delivery`, {
    method: "POST",
    headers: { ...headers("application/json"), origin: "https://evil.test" },
    body: JSON.stringify(delivery()),
  });
  assert.equal((await handlers.delivery(evil)).status, 403);
  const tenant = new Request(`https://${HOSTNAME}/api/checkout/delivery`, {
    method: "POST",
    headers: { ...headers("application/json"), "x-store-id": CART_ID },
    body: JSON.stringify(delivery()),
  });
  assert.equal((await handlers.delivery(tenant)).status, 400);
  assert.equal(calls, 0);
});

test("built-in submit redirects only to the fixed same-origin result path", async () => {
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({ checkout: repository(), hosted: null }),
    now: () => NOW,
  });
  const request = new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: headers("application/x-www-form-urlencoded"),
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "",
      distanceSales: "true",
      preInformation: "true",
    }),
  });
  const response = await handlers.submit(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/odeme/sonuc");
});

test("submit redirects only to an exact hosted presentation", async () => {
  const location = "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr";
  let beginCalls = 0;
  let observedAttemptId: string | null = null;
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async (input) => {
      observedAttemptId = input.attemptId;
      await input.begin({
        attemptId: input.attemptId,
        callbackBindingDigest: "a".repeat(64),
      });
      return Object.freeze({ kind: "redirect" as const, url: location });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        beginHosted: async (input) => {
          beginCalls += 1;
          assert.equal(input.attemptId, observedAttemptId);
          assert.match(input.callbackBindingDigest, /^[a-f0-9]{64}$/);
          assert.equal(input.submission.identityNumber, "74300864791");
          return hostedAuthority(input.attemptId);
        },
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const request = new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      ...headers("application/x-www-form-urlencoded"),
      "x-forwarded-for": "93.184.216.34",
    },
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "74300864791",
      distanceSales: "true",
      preInformation: "true",
    }),
  });
  const response = await handlers.submit(request);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), location);
  assert.equal(beginCalls, 1);
});

test("hosted commit uncertainty recovers once and resumes the same initialization", async () => {
  const location = "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr";
  let attemptId = "";
  let beginCalls = 0;
  const recoverCalls: Parameters<PublicCheckoutRepository["recover"]>[0][] = [];
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async (input) => {
      await input.begin({
        attemptId: input.attemptId,
        callbackBindingDigest: "b".repeat(64),
      });
      return Object.freeze({ kind: "redirect" as const, url: location });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        beginHosted: async (input) => {
          beginCalls += 1;
          attemptId = input.attemptId;
          throw new PublicCheckoutRepositoryError("commit_unknown");
        },
        recover: async (input) => {
          recoverCalls.push(input);
          return hostedAuthority(attemptId);
        },
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(
    `https://${HOSTNAME}/api/checkout/submit`,
    {
      method: "POST",
      headers: {
        ...headers("application/x-www-form-urlencoded"),
        "x-forwarded-for": "93.184.216.34",
      },
      body: new URLSearchParams({
        cartVersion: "4",
        checkoutNonce: NONCE,
        operationId: OPERATION_ID,
        paymentMethodId: PAYMENT_METHOD_ID,
        identityNumber: "74300864791",
        distanceSales: "true",
        preInformation: "true",
      }),
    },
  ));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), location);
  assert.equal(beginCalls, 1);
  assert.equal(recoverCalls.length, 1);
  assert.equal(recoverCalls[0]?.operationId, OPERATION_ID);
  assert.match(recoverCalls[0]?.fingerprint ?? "", /^[a-f0-9]{64}$/);
});

test("all public checkout responses are finite JSON and no-store", async () => {
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        updateDelivery: async () => { throw new PublicCheckoutRepositoryError("version_conflict"); },
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const response = await handlers.delivery(new Request(
    `https://${HOSTNAME}/api/checkout/delivery`,
    {
      method: "POST",
      headers: headers("application/json"),
      body: JSON.stringify(delivery()),
    },
  ));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "cart_changed" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});
