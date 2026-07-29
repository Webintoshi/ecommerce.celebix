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
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
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
const PROXY_TOKEN = Buffer.alloc(32, 0x42).toString("base64url");
const PROXY_ENVIRONMENT = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
  CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: PROXY_TOKEN,
});

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
    classifyPaymentMethod: async () => Object.freeze({ kind: "built_in" as const }),
    submitBuiltIn: async (): Promise<CheckoutSubmissionResult> =>
      Object.freeze({
        kind: "placed",
        orderNumber: "SF-2026-000001",
        statusPath: "/checkout/status",
      }),
    beginHosted: async () => { throw new PublicCheckoutRepositoryError("payment_method_unavailable"); },
    getStatus: async (): Promise<CheckoutStatus> => Object.freeze({ kind: "ready" }),
    getPolicy: async () => { throw new PublicCheckoutRepositoryError("not_found"); },
    recover: async () => Object.freeze({
      kind: "built_in" as const,
      submission: Object.freeze({
        kind: "placed" as const,
        orderNumber: "SF-2026-000001",
        statusPath: "/checkout/status",
      }),
    }),
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
    bridgeId: attemptId,
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

test("signed proxy authority canonicalizes one internal Next request and preserves exact failures", async () => {
  let updates = 0;
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: (selectedHeaders) =>
      selectTrustedStorefrontHostAuthority(selectedHeaders, PROXY_ENVIRONMENT),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        updateDelivery: async () => {
          updates += 1;
          return quote({ cartVersion: 5 });
        },
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const signedHeaders = Object.freeze({
    ...headers("application/json"),
    "x-celebix-storefront-proxy": `p1.${PROXY_TOKEN}`,
    "x-forwarded-host": HOSTNAME,
    "x-forwarded-proto": "https",
  });
  let bodyPulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      bodyPulls += 1;
      controller.enqueue(new TextEncoder().encode(JSON.stringify(delivery())));
      controller.close();
    },
  });
  const internal = new Request("http://127.0.0.1:3450/api/checkout/delivery", {
    method: "POST",
    headers: signedHeaders,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.equal((await handlers.delivery(internal)).status, 200);
  assert.equal(internal.bodyUsed, true);
  assert.equal(bodyPulls, 1);
  assert.equal(updates, 1);

  const cases = [
    {
      label: "unsigned",
      status: 503,
      url: "http://127.0.0.1:3450/api/checkout/delivery",
      selectedHeaders: { ...signedHeaders, "x-celebix-storefront-proxy": "p1.invalid" },
    },
    {
      label: "forged forwarded host",
      status: 503,
      url: "http://127.0.0.1:3450/api/checkout/delivery",
      selectedHeaders: { ...signedHeaders, "x-forwarded-host": `${HOSTNAME},evil.test` },
    },
    {
      label: "signed host mismatch",
      status: 403,
      url: "http://127.0.0.1:3450/api/checkout/delivery",
      selectedHeaders: { ...signedHeaders, origin: "https://other.example.test" },
    },
    {
      label: "wrong pathname",
      status: 400,
      url: "http://127.0.0.1:3450/api/checkout/submit",
      selectedHeaders: signedHeaders,
    },
    {
      label: "query",
      status: 400,
      url: "http://127.0.0.1:3450/api/checkout/delivery?store=other",
      selectedHeaders: signedHeaders,
    },
    {
      label: "http origin",
      status: 403,
      url: "http://127.0.0.1:3450/api/checkout/delivery",
      selectedHeaders: { ...signedHeaders, origin: `http://${HOSTNAME}` },
    },
  ];
  for (const selected of cases) {
    const hostile = new Request(selected.url, {
      method: "POST",
      headers: selected.selectedHeaders,
      body: JSON.stringify(delivery()),
    });
    assert.equal((await handlers.delivery(hostile)).status, selected.status, selected.label);
  }
  assert.equal(updates, 1);
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

test("exact JSON accept converts a built-in redirect to the finite submit-success contract", async () => {
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({ checkout: repository(), hosted: null }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      ...headers("application/x-www-form-urlencoded"),
      accept: "application/json",
    },
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "",
      distanceSales: "true",
      preInformation: "true",
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(await response.json(), {
    kind: "redirect",
    location: "/odeme/sonuc",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("non-exact JSON accept preserves the progressive native 303 fallback", async () => {
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({ checkout: repository(), hosted: null }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      ...headers("application/x-www-form-urlencoded"),
      accept: "application/json, text/plain",
    },
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "",
      distanceSales: "true",
      preInformation: "true",
    }),
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/odeme/sonuc");
});

test("hosted-enabled built-ins place without client IP or hosted initialization", async () => {
  let classificationCalls = 0;
  let builtInCalls = 0;
  let hostedCalls = 0;
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async () => {
      hostedCalls += 1;
      return Object.freeze({ kind: "rejected" as const });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        classifyPaymentMethod: async () => {
          classificationCalls += 1;
          return Object.freeze({ kind: "built_in" as const });
        },
        submitBuiltIn: async () => {
          builtInCalls += 1;
          return Object.freeze({
            kind: "placed" as const,
            orderNumber: "SF-2026-000001",
            statusPath: "/checkout/status",
          });
        },
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
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
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/odeme/sonuc");
  assert.equal(classificationCalls, 1);
  assert.equal(builtInCalls, 1);
  assert.equal(hostedCalls, 0);
});

test("hosted classification requires trusted IP without attempting built-in submission", async () => {
  let classificationCalls = 0;
  let builtInCalls = 0;
  let hostedCalls = 0;
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async () => {
      hostedCalls += 1;
      return Object.freeze({ kind: "rejected" as const });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        classifyPaymentMethod: async () => {
          classificationCalls += 1;
          return Object.freeze({ kind: "hosted" as const });
        },
        submitBuiltIn: async () => {
          builtInCalls += 1;
          return Object.freeze({
            kind: "placed" as const,
            orderNumber: "SF-2026-000001",
            statusPath: "/checkout/status",
          });
        },
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: headers("application/x-www-form-urlencoded"),
    body: new URLSearchParams({
      cartVersion: "4",
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
      identityNumber: "74300864791",
      distanceSales: "true",
      preInformation: "true",
    }),
  }));
  assert.equal(response.status, 400);
  assert.equal(classificationCalls, 1);
  assert.equal(builtInCalls, 0);
  assert.equal(hostedCalls, 0);
});

test("built-in classification never falls through to hosted after a submit race", async () => {
  let hostedCalls = 0;
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async () => {
      hostedCalls += 1;
      return Object.freeze({ kind: "rejected" as const });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        classifyPaymentMethod: async () => Object.freeze({ kind: "built_in" as const }),
        submitBuiltIn: async () => {
          throw new PublicCheckoutRepositoryError("payment_method_unavailable");
        },
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
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
      identityNumber: "",
      distanceSales: "true",
      preInformation: "true",
    }),
  }));
  assert.equal(response.status, 409);
  assert.equal(hostedCalls, 0);
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
        classifyPaymentMethod: async () => Object.freeze({ kind: "hosted" as const }),
        submitBuiltIn: async () => {
          throw new PublicCheckoutRepositoryError("payment_method_unavailable");
        },
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

test("exact JSON accept converts a hosted redirect without following it", async () => {
  const location = "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr";
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async (input) => {
      await input.begin({
        attemptId: input.attemptId,
        callbackBindingDigest: "d".repeat(64),
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
        classifyPaymentMethod: async () => Object.freeze({ kind: "hosted" as const }),
        beginHosted: async (input) => hostedAuthority(input.attemptId),
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
    method: "POST",
    headers: {
      ...headers("application/x-www-form-urlencoded"),
      accept: "application/json",
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
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { kind: "redirect", location });
});

test("JSON submit keeps processing, stale, and unavailable outcomes as finite errors", async () => {
  const cases = [
    [new PublicCheckoutRepositoryError("commit_unknown"), 503, "unavailable"],
    [new PublicCheckoutRepositoryError("version_conflict"), 409, "cart_changed"],
    [new Error("private provider detail"), 503, "unavailable"],
  ] as const;
  for (const [failure, status, code] of cases) {
    const handlers = createPublicCheckoutHandlers({
      selectAuthority: () => trusted(),
      resolveRuntime: async () => Object.freeze({
        checkout: repository({
          submitBuiltIn: async () => { throw failure; },
          recover: async () => { throw new Error("no_recovery"); },
        }),
        hosted: null,
      }),
      now: () => NOW,
    });
    const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
      method: "POST",
      headers: {
        ...headers("application/x-www-form-urlencoded"),
        accept: "application/json",
      },
      body: new URLSearchParams({
        cartVersion: "4",
        checkoutNonce: NONCE,
        operationId: OPERATION_ID,
        paymentMethodId: PAYMENT_METHOD_ID,
        identityNumber: "",
        distanceSales: "true",
        preInformation: "true",
      }),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code });
  }

  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async () => Object.freeze({ kind: "processing" as const }),
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const processingHandlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        classifyPaymentMethod: async () => Object.freeze({ kind: "hosted" as const }),
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const processing = await processingHandlers.submit(new Request(
    `https://${HOSTNAME}/api/checkout/submit`,
    {
      method: "POST",
      headers: {
        ...headers("application/x-www-form-urlencoded"),
        accept: "application/json",
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
  assert.equal(processing.status, 202);
  assert.deepEqual(await processing.json(), { code: "processing" });
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
        classifyPaymentMethod: async () => Object.freeze({ kind: "hosted" as const }),
        submitBuiltIn: async () => {
          throw new PublicCheckoutRepositoryError("payment_method_unavailable");
        },
        beginHosted: async (input) => {
          beginCalls += 1;
          attemptId = input.attemptId;
          throw new PublicCheckoutRepositoryError("commit_unknown");
        },
        recover: async (input) => {
          recoverCalls.push(input);
          return Object.freeze({
            kind: "hosted" as const,
            authority: hostedAuthority(attemptId),
          });
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
  assert.equal(recoverCalls[0]?.expected.kind, "hosted");
});

test("delivery commit uncertainty never performs route recovery with the submitted nonce", async () => {
  let deliveryRecoveries = 0;
  const deliveryHandlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        updateDelivery: async () => { throw new PublicCheckoutRepositoryError("commit_unknown"); },
        recover: async () => {
          deliveryRecoveries += 1;
          throw new Error("route_delivery_recovery_forbidden");
        },
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const deliveryResponse = await deliveryHandlers.delivery(new Request(
    `https://${HOSTNAME}/api/checkout/delivery`,
    {
      method: "POST",
      headers: headers("application/json"),
      body: JSON.stringify(delivery()),
    },
  ));
  assert.equal(deliveryResponse.status, 202);
  const deliveryBody = await deliveryResponse.clone().text();
  assert.deepEqual(await deliveryResponse.json(), { code: "processing" });
  assert.equal(deliveryBody.includes(NONCE), false);
  assert.equal(deliveryRecoveries, 0);
});

test("built-in uncertainty recovers one exact typed result", async () => {
  const builtInRecoveries: Parameters<PublicCheckoutRepository["recover"]>[0][] = [];
  const builtInHandlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        submitBuiltIn: async () => { throw new PublicCheckoutRepositoryError("commit_unknown"); },
        recover: async (input) => {
          builtInRecoveries.push(input);
          return Object.freeze({
            kind: "built_in" as const,
            submission: Object.freeze({
              kind: "placed" as const,
              orderNumber: "SF-2026-000001",
              statusPath: "/checkout/status",
            }),
          });
        },
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const builtInResponse = await builtInHandlers.submit(new Request(
    `https://${HOSTNAME}/api/checkout/submit`,
    {
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
    },
  ));
  assert.equal(builtInResponse.status, 303);
  assert.equal(builtInResponse.headers.get("location"), "/odeme/sonuc");
  assert.equal(builtInRecoveries.length, 1);
  assert.deepEqual(builtInRecoveries[0]?.expected, { kind: "built_in" });
});

test("wrong-kind hosted recovery fails closed before presentation", async () => {
  let hostedPresentations = 0;
  const hosted: HostedPaymentRuntime = Object.freeze({
    initialize: async () => Object.freeze({ kind: "rejected" as const }),
    initializeCommitted: async (input) => {
      await input.begin({
        attemptId: input.attemptId,
        callbackBindingDigest: "c".repeat(64),
      });
      hostedPresentations += 1;
      return Object.freeze({
        kind: "redirect" as const,
        url: "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr",
      });
    },
    callback: async () => Object.freeze({ kind: "rejected" as const }),
    callbackByDigest: async () => Object.freeze({ kind: "rejected" as const }),
    reconcile: async () => Object.freeze({ kind: "rejected" as const }),
  });
  const handlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        classifyPaymentMethod: async () => Object.freeze({ kind: "hosted" as const }),
        submitBuiltIn: async () => {
          throw new PublicCheckoutRepositoryError("payment_method_unavailable");
        },
        beginHosted: async () => { throw new PublicCheckoutRepositoryError("commit_unknown"); },
        recover: async () => Object.freeze({
          kind: "built_in" as const,
          submission: Object.freeze({
            kind: "placed" as const,
            orderNumber: "SF-2026-000001",
            statusPath: "/checkout/status",
          }),
        }),
      }),
      hosted,
    }),
    now: () => NOW,
  });
  const response = await handlers.submit(new Request(`https://${HOSTNAME}/api/checkout/submit`, {
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
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
  assert.equal(hostedPresentations, 0);
});

test("wrong-kind built-in recovery fails closed", async () => {
  const builtInHandlers = createPublicCheckoutHandlers({
    selectAuthority: () => trusted(),
    resolveRuntime: async () => Object.freeze({
      checkout: repository({
        submitBuiltIn: async () => { throw new PublicCheckoutRepositoryError("commit_unknown"); },
        recover: async () => Object.freeze({
          kind: "hosted" as const,
          authority: hostedAuthority("99999999-9999-4999-8999-999999999999"),
        }),
      }),
      hosted: null,
    }),
    now: () => NOW,
  });
  const builtInResponse = await builtInHandlers.submit(new Request(
    `https://${HOSTNAME}/api/checkout/submit`,
    {
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
    },
  ));
  assert.equal(builtInResponse.status, 503);
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
