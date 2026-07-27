import assert from "node:assert/strict";
import test from "node:test";

import type {
  HostedPaymentCallbackInput,
  HostedPaymentInitializeInput,
  HostedPaymentQueryInput,
  ProviderTransportRequest,
  ProviderTransportResult,
} from "../../index.ts";
import {
  createIyzicoCheckoutFormAdapter,
  validateIyzicoCredentialWithTransport,
} from "./adapter.ts";
import {
  createIyzicoInitializeResponseSignature,
  createIyzicoRetrieveResponseSignature,
} from "./config.ts";

const TOKEN = "A234567890123456789012345678901234567";
const OTHER_TOKEN = "B234567890123456789012345678901234567";
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_REFERENCE = "merchant-order-123";
const RANDOM_KEY = "fixedRandomKey0123456789";
const credential = Object.freeze({ apiKey: "sandbox-api-key", secretKey: "sandbox-secret-key" });

function response(value: unknown, status = 200): ProviderTransportResult {
  return Object.freeze({
    kind: "response" as const,
    status,
    contentType: "application/json",
    body: new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)),
  });
}

function unknown(): ProviderTransportResult {
  return Object.freeze({ kind: "unknown" as const, code: "transport_outcome_unknown" as const });
}

function transport(
  implementation: (request: ProviderTransportRequest) =>
    ProviderTransportResult | Promise<ProviderTransportResult>,
) {
  return Object.freeze({
    async request(request: ProviderTransportRequest) {
      return await implementation(request);
    },
  });
}

function signedInitialize(overrides: Record<string, unknown> = {}) {
  const base = {
    status: "success",
    conversationId: ATTEMPT_ID,
    token: TOKEN,
    paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=${TOKEN}&lang=tr`,
    ...overrides,
  };
  return {
    ...base,
    signature: createIyzicoInitializeResponseSignature({
      credential,
      conversationId: String(base.conversationId),
      token: String(base.token),
    }),
  };
}

function signedRetrieve(overrides: Record<string, unknown> = {}) {
  const base = {
    status: "success",
    paymentStatus: "SUCCESS",
    paymentId: "payment-123",
    currency: "TRY",
    basketId: ORDER_REFERENCE,
    conversationId: ATTEMPT_ID,
    paidPrice: "100.00",
    price: "100.00",
    token: TOKEN,
    fraudStatus: 1,
    ...overrides,
  };
  return {
    ...base,
    signature: createIyzicoRetrieveResponseSignature({
      credential,
      paymentStatus: String(base.paymentStatus),
      paymentId: String(base.paymentId),
      currency: String(base.currency),
      basketId: String(base.basketId),
      conversationId: String(base.conversationId),
      paidPrice: base.paidPrice as string | number,
      price: base.price as string | number,
      token: String(base.token),
    }),
  };
}

function initializeInput(
  overrides: Partial<HostedPaymentInitializeInput<typeof credential>> = {},
): HostedPaymentInitializeInput<typeof credential> {
  return Object.freeze({
    environment: "test",
    credential,
    attemptId: ATTEMPT_ID,
    orderReference: ORDER_REFERENCE,
    amountMinor: 10_000,
    currency: "TRY",
    callbackUrl: "https://pilot.saas-staging.celebix.site/api/payments/iyzico_iframe/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    successUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz",
    customer: Object.freeze({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+905551112233",
      ipAddress: "8.8.8.8",
      address: "Örnek Mahallesi 1",
      identityNumber: "74300864791",
      city: "İstanbul",
      country: "Türkiye",
      postalCode: "34000",
    }),
    basket: Object.freeze([
      Object.freeze({
        reference: "SKU-1",
        name: "Örnek ürün",
        quantity: 2,
        unitAmountMinor: 5_000,
        itemType: "PHYSICAL" as const,
      }),
    ]),
    signal: new AbortController().signal,
    ...overrides,
  });
}

function callbackInput(
  overrides: Partial<HostedPaymentCallbackInput<typeof credential>> = {},
): HostedPaymentCallbackInput<typeof credential> {
  return Object.freeze({
    environment: "test",
    credential,
    method: "POST",
    headers: Object.freeze({ "content-type": "application/x-www-form-urlencoded" }),
    body: new TextEncoder().encode(`token=${TOKEN}`),
    expected: Object.freeze({
      attemptId: ATTEMPT_ID,
      orderReference: ORDER_REFERENCE,
      providerReference: TOKEN,
      amountMinor: 10_000,
      currency: "TRY",
    }),
    signal: new AbortController().signal,
    ...overrides,
  });
}

function queryInput(
  overrides: Partial<HostedPaymentQueryInput<typeof credential>> = {},
): HostedPaymentQueryInput<typeof credential> {
  return Object.freeze({
    environment: "test",
    credential,
    attemptId: ATTEMPT_ID,
    orderReference: ORDER_REFERENCE,
    providerReference: TOKEN,
    amountMinor: 10_000,
    currency: "TRY",
    signal: new AbortController().signal,
    ...overrides,
  });
}

test("initializes an exact signed iyzico Checkout Form request and preserves basket totals", async () => {
  let captured: Omit<ProviderTransportRequest, "body"> & { body: Uint8Array } | undefined;
  let dispatchedBody: Uint8Array | undefined;
  const providerResponse = response(signedInitialize());
  const adapter = createIyzicoCheckoutFormAdapter(transport((request) => {
    captured = { ...request, body: request.body.slice() };
    dispatchedBody = request.body;
    return providerResponse;
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));

  assert.deepEqual(await adapter.initialize(initializeInput()), {
    kind: "iframe",
    url: `https://sandbox-cpp.iyzipay.com?token=${TOKEN}&lang=tr`,
    token: TOKEN,
    providerReference: TOKEN,
  });
  assert.ok(captured);
  assert.equal(captured.url, "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom");
  assert.equal(captured.environment, "test");
  assert.equal(captured.headers["x-iyzi-rnd"], RANDOM_KEY);
  assert.match(captured.headers.authorization ?? "", /^IYZWSv2 /);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(captured.body)), {
    locale: "tr",
    conversationId: ATTEMPT_ID,
    price: "100.00",
    paidPrice: "100.00",
    currency: "TRY",
    basketId: ORDER_REFERENCE,
    paymentGroup: "PRODUCT",
    callbackUrl: initializeInput().callbackUrl,
    buyer: {
      id: ATTEMPT_ID,
      name: "Ada",
      surname: "Lovelace",
      gsmNumber: "+905551112233",
      email: "ada@example.com",
      identityNumber: "74300864791",
      registrationAddress: "Örnek Mahallesi 1",
      ip: "8.8.8.8",
      city: "İstanbul",
      country: "Türkiye",
      zipCode: "34000",
    },
    shippingAddress: {
      contactName: "Ada Lovelace",
      city: "İstanbul",
      country: "Türkiye",
      address: "Örnek Mahallesi 1",
      zipCode: "34000",
    },
    billingAddress: {
      contactName: "Ada Lovelace",
      city: "İstanbul",
      country: "Türkiye",
      address: "Örnek Mahallesi 1",
      zipCode: "34000",
    },
    basketItems: [{
      id: "SKU-1",
      name: "Örnek ürün",
      category1: "Örnek ürün",
      itemType: "PHYSICAL",
      price: "100.00",
    }],
  });
  assert.ok(dispatchedBody);
  assert.equal(dispatchedBody.every((byte) => byte === 0), true);
  assert.equal(providerResponse.kind === "response" && providerResponse.body.every((byte) => byte === 0), true);
});

test("requires merchant-supplied buyer identity, address core, item type, and exact totals before transport", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport(() => {
    calls += 1;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  const base = initializeInput();
  const buyer = base.customer;
  for (const key of ["identityNumber", "city", "country"] as const) {
    const customer = { ...buyer };
    delete customer[key];
    assert.deepEqual(await adapter.initialize(initializeInput({
      customer: customer as typeof base.customer,
    })), {
      kind: "rejected", code: "invalid_request",
    }, key);
  }
  assert.deepEqual(await adapter.initialize(initializeInput({
    customer: { ...buyer, identityNumber: "11111111111" },
  })), { kind: "rejected", code: "invalid_request" });
  assert.deepEqual(await adapter.initialize(initializeInput({
    basket: [{ ...base.basket[0], itemType: undefined }],
  })), { kind: "rejected", code: "invalid_request" });
  assert.deepEqual(await adapter.initialize(initializeInput({ amountMinor: 9_999 })), {
    kind: "rejected", code: "invalid_request",
  });
  assert.deepEqual(await adapter.initialize(initializeInput({ environment: "live" })), {
    kind: "rejected", code: "environment_not_ready",
  });
  assert.equal(calls, 0);
});

test("rejects overlong, non-canonical, accessor, proxy, extra, and sparse buyer or basket data before transport", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport(() => {
    calls += 1;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  const base = initializeInput();
  const accessor = { ...base.customer };
  Object.defineProperty(accessor, "city", { enumerable: true, get: () => "İstanbul" });
  const sparse = new Array(1);
  const hostileCustomers = [
    { ...base.customer, city: `İ${"s".repeat(128)}` },
    { ...base.customer, city: " İstanbul" },
    { ...base.customer, secret: "not-allowed" },
    accessor,
    new Proxy({ ...base.customer }, {}),
  ];
  for (const customer of hostileCustomers) {
    assert.deepEqual(await adapter.initialize(initializeInput({
      customer: customer as typeof base.customer,
    })), { kind: "rejected", code: "invalid_request" });
  }
  for (const selectedBasket of [
    sparse,
    [{ ...base.basket[0], extra: "not-allowed" }],
    [new Proxy({ ...base.basket[0] }, {})],
    [{ ...base.basket[0], reference: "not canonical" }],
  ]) {
    assert.deepEqual(await adapter.initialize(initializeInput({
      basket: selectedBasket as typeof base.basket,
    })), { kind: "rejected", code: "invalid_request" });
  }
  assert.equal(calls, 0);
});

test("binds the callback and fixed local result URLs to one trusted origin before transport", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport(() => {
    calls += 1;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  const base = initializeInput();
  for (const overrides of [
    { callbackUrl: `https://evil.example/api/payments/iyzico_iframe/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` },
    { callbackUrl: `https://pilot.saas-staging.celebix.site/api/payments/paytr_iframe/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` },
    { callbackUrl: `https://pilot.saas-staging.celebix.site/api/payments/iyzico_iframe/callback/short` },
    { callbackUrl: `${base.callbackUrl}?next=https://evil.example` },
    { callbackUrl: `${base.callbackUrl}#fragment` },
    { callbackUrl: base.callbackUrl.replace("https://", "https://user@") },
    { callbackUrl: base.callbackUrl.replace(".site", ".site:443") },
    { successUrl: "https://evil.example/odeme/hizli/sonuc?durum=basarili" },
    { successUrl: "https://pilot.saas-staging.celebix.site/odeme/sonuc?durum=basarili" },
    { successUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz" },
    { failureUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili" },
  ]) {
    assert.deepEqual(await adapter.initialize(initializeInput(overrides)), {
      kind: "rejected", code: "invalid_request",
    });
  }
  assert.equal(calls, 0);
});

test("maps a multi-part buyer name to all given-name tokens and the final surname", async () => {
  let buyerPayload: Record<string, unknown> | undefined;
  const adapter = createIyzicoCheckoutFormAdapter(transport((request) => {
    const payload = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
    buyerPayload = payload.buyer as Record<string, unknown>;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  const base = initializeInput();
  assert.equal((await adapter.initialize(initializeInput({
    customer: { ...base.customer, name: "Ada Byron Lovelace" },
  }))).kind, "iframe");
  assert.equal(buyerPayload?.name, "Ada Byron");
  assert.equal(buyerPayload?.surname, "Lovelace");
});

test("omits optional zipCode and shipping for an all-virtual basket without inventing defaults", async () => {
  let sent: Record<string, unknown> | undefined;
  const adapter = createIyzicoCheckoutFormAdapter(transport((request) => {
    sent = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  const base = initializeInput();
  const customer = { ...base.customer };
  delete customer.postalCode;
  assert.equal((await adapter.initialize(initializeInput({
    customer,
    basket: [{ ...base.basket[0], itemType: "VIRTUAL" }],
  }))).kind, "iframe");
  assert.ok(sent);
  assert.equal(Object.hasOwn(sent, "shippingAddress"), false);
  assert.equal(Object.hasOwn(sent.buyer as object, "zipCode"), false);
  assert.equal(Object.hasOwn(sent.billingAddress as object, "zipCode"), false);
});

test("accepts only the exact signed iyzico payment URL and preserves a validated token on unknown outcomes", async () => {
  const withSlash = createIyzicoCheckoutFormAdapter(transport(() => response(signedInitialize({
    paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`,
  }))), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.equal((await withSlash.initialize(initializeInput())).kind, "iframe");
  const badUrls = [
    `https://cpp.iyzipay.com/?token=${TOKEN}&lang=tr`,
    `https://sandbox-cpp.iyzipay.com/?lang=tr&token=${TOKEN}`,
    `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr&extra=1`,
    `https://sandbox-cpp.iyzipay.com/path?token=${TOKEN}&lang=tr`,
    `https://user@sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`,
    `https://sandbox-cpp.iyzipay.com:443/?token=${TOKEN}&lang=tr`,
    `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr#fragment`,
    `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&token=${TOKEN}&lang=tr`,
  ];
  for (const paymentPageUrl of badUrls) {
    const adapter = createIyzicoCheckoutFormAdapter(transport(() =>
      response(signedInitialize({ paymentPageUrl }))),
    Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    assert.deepEqual(await adapter.initialize(initializeInput()), {
      kind: "unknown", code: "provider_outcome_unknown", providerReference: TOKEN,
    }, paymentPageUrl);
  }

  for (const value of [
    { ...signedInitialize(), signature: "0".repeat(64) },
    { status: "failure", errorCode: "12", errorMessage: "rejected" },
    "{",
    "{\"status\":\"success\",\"status\":\"failure\"}",
  ]) {
    const adapter = createIyzicoCheckoutFormAdapter(transport(() => response(value)),
      Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    const result = await adapter.initialize(initializeInput());
    if (typeof value === "object" && value !== null && value.status === "failure") {
      assert.deepEqual(result, { kind: "rejected", code: "provider_rejected" });
    } else {
      assert.equal(result.kind, "unknown");
    }
  }
  for (const result of [unknown(), response({}, 503)]) {
    const adapter = createIyzicoCheckoutFormAdapter(transport(() => result),
      Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    assert.equal((await adapter.initialize(initializeInput())).kind, "unknown");
  }
  const thrown = createIyzicoCheckoutFormAdapter(transport(() => {
    throw new Error("provider network detail must stay private");
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.deepEqual(await thrown.initialize(initializeInput()), {
    kind: "unknown", code: "provider_outcome_unknown", providerReference: null,
  });
});

test("tolerates inert provider response expansion while validating only signed security fields", async () => {
  const initializeAdapter = createIyzicoCheckoutFormAdapter(transport(() => response(signedInitialize({
    marketplacePayment: true,
    payoutSummary: { ignored: true },
  }))), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.equal((await initializeAdapter.initialize(initializeInput())).kind, "iframe");

  const retrieveAdapter = createIyzicoCheckoutFormAdapter(transport(() => response(signedRetrieve({
    merchantPayoutAmount: "99.00",
    paymentItems: [{ ignored: true }],
  }))), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.equal((await retrieveAdapter.query(queryInput())).kind, "succeeded");
});

test("matches callback token before retrieve and maps signed fraud outcomes without false success", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport((request) => {
    calls += 1;
    assert.equal(request.url, "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(request.body)), {
      locale: "tr", conversationId: ATTEMPT_ID, token: TOKEN,
    });
    return response(signedRetrieve());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.deepEqual(await adapter.verifyCallback(callbackInput()), {
    eventKey: "iyzico:payment-123:1",
    status: "succeeded",
    providerReference: TOKEN,
    paidAmountMinor: 10_000,
    currency: "TRY",
    safeCode: "success",
  });
  assert.equal(calls, 1);

  await assert.rejects(
    () => adapter.verifyCallback(callbackInput({ body: new TextEncoder().encode(`token=${OTHER_TOKEN}`) })),
    /iyzico_callback_invalid/,
  );
  assert.equal(calls, 1);

  for (const [fraudStatus, expectedStatus] of [[0, "pending"], [-1, "failed"]] as const) {
    const selected = createIyzicoCheckoutFormAdapter(transport(() =>
      response(signedRetrieve({ fraudStatus }))),
    Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    assert.equal((await selected.verifyCallback(callbackInput())).status, expectedStatus);
  }
});

test("returns retry for temporary callback retrieval failure and rejects signed invariant mismatches", async () => {
  for (const result of [unknown(), response({}, 503)]) {
    const adapter = createIyzicoCheckoutFormAdapter(transport(() => result),
      Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    assert.deepEqual(await adapter.verifyCallback(callbackInput()), {
      eventKey: `iyzico:${TOKEN}:retry`,
      status: "retry",
      providerReference: TOKEN,
      paidAmountMinor: 0,
      currency: "TRY",
      safeCode: "provider_temporarily_unavailable",
    });
  }
  const thrown = createIyzicoCheckoutFormAdapter(transport(() => {
    throw new Error("provider network detail must stay private");
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.equal((await thrown.verifyCallback(callbackInput())).status, "retry");
  for (const mismatch of [
    { conversationId: "22222222-2222-4222-8222-222222222222" },
    { basketId: "another-order" },
    { price: "99.99" },
    { paidPrice: "99.99" },
    { currency: "USD" },
    { token: OTHER_TOKEN },
    { signature: "0".repeat(64) },
  ]) {
    const payload = "signature" in mismatch
      ? { ...signedRetrieve(), ...mismatch }
      : signedRetrieve(mismatch);
    const adapter = createIyzicoCheckoutFormAdapter(transport(() => response(payload)),
      Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    await assert.rejects(() => adapter.verifyCallback(callbackInput()), /iyzico_callback_invalid/);
  }

  let duplicate = JSON.stringify(signedRetrieve());
  duplicate = duplicate.replace("\"status\":\"success\"", "\"status\":\"success\",\"status\":\"success\"");
  const ambiguous = createIyzicoCheckoutFormAdapter(transport(() => response(duplicate)),
    Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  await assert.rejects(() => ambiguous.verifyCallback(callbackInput()), /iyzico_callback_invalid/);
});

test("rejects non-canonical callback form and missing expected provider reference before retrieve", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport(() => {
    calls += 1;
    return response(signedRetrieve());
  }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  for (const body of [
    `token=${TOKEN}&token=${TOKEN}`,
    `extra=1&token=${TOKEN}`,
    `token=${TOKEN}%20`,
  ]) {
    await assert.rejects(
      () => adapter.verifyCallback(callbackInput({ body: new TextEncoder().encode(body) })),
      /iyzico_callback_invalid/,
    );
  }
  await assert.rejects(() => adapter.verifyCallback(callbackInput({
    expected: {
      attemptId: ATTEMPT_ID,
      orderReference: ORDER_REFERENCE,
      amountMinor: 10_000,
      currency: "TRY",
    },
  })), /iyzico_callback_invalid/);
  assert.equal(calls, 0);
});

test("queries using only the saved provider token and keeps fraud review pending", async () => {
  for (const [fraudStatus, expected] of [
    [1, { kind: "succeeded", providerReference: TOKEN, paidAmountMinor: 10_000, currency: "TRY" }],
    [0, { kind: "pending", providerReference: TOKEN }],
    [-1, { kind: "failed", providerReference: TOKEN, code: "provider_rejected" }],
  ] as const) {
    const adapter = createIyzicoCheckoutFormAdapter(transport((request) => {
      assert.equal(JSON.parse(new TextDecoder().decode(request.body)).token, TOKEN);
      return response(signedRetrieve({ fraudStatus }));
    }), Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
    assert.deepEqual(await adapter.query(queryInput()), expected);
  }
  const unavailable = createIyzicoCheckoutFormAdapter(transport(() => unknown()),
    Object.freeze({ randomKey: Object.freeze(() => RANDOM_KEY) }));
  assert.deepEqual(await unavailable.query(queryInput()), { kind: "unknown", providerReference: TOKEN });
});

test("validates credentials with the official fixed test BIN without payment or card data", async () => {
  let body: Record<string, unknown> | undefined;
  const result = await validateIyzicoCredentialWithTransport(transport((request) => {
    assert.equal(request.url, "https://sandbox-api.iyzipay.com/payment/bin/check");
    body = JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
    return response({
      status: "success",
      conversationId: ATTEMPT_ID,
      binNumber: "41579200",
      cardType: "CREDIT_CARD",
      cardAssociation: "MASTER_CARD",
    });
  }), {
    environment: "test",
    credential,
    validationReference: ATTEMPT_ID,
    signal: new AbortController().signal,
    randomKey: () => RANDOM_KEY,
  });
  assert.deepEqual(result, { kind: "validated" });
  assert.deepEqual(body, {
    locale: "tr",
    conversationId: ATTEMPT_ID,
    binNumber: "41579200",
  });
  assert.equal(JSON.stringify(body).includes("cardNumber"), false);
  assert.equal(JSON.stringify(body).includes("callbackUrl"), false);
});

test("credential validation fails closed on BIN or conversation mismatch and provider ambiguity", async () => {
  for (const providerResult of [
    response({ status: "success", conversationId: ATTEMPT_ID, binNumber: "41579201" }),
    response({ status: "success", conversationId: "22222222-2222-4222-8222-222222222222", binNumber: "41579200" }),
    response({ status: "failure", errorCode: "12", errorMessage: "rejected" }),
    response({}, 503),
    unknown(),
  ]) {
    const result = await validateIyzicoCredentialWithTransport(transport(() => providerResult), {
      environment: "test",
      credential,
      validationReference: ATTEMPT_ID,
      signal: new AbortController().signal,
      randomKey: () => RANDOM_KEY,
    });
    assert.equal(result.kind, "rejected");
  }
});

test("rejects invalid random generators and credentials without leaking or calling transport", async () => {
  let calls = 0;
  const adapter = createIyzicoCheckoutFormAdapter(transport(() => {
    calls += 1;
    return response(signedInitialize());
  }), Object.freeze({ randomKey: Object.freeze(() => "short") }));
  assert.deepEqual(await adapter.initialize(initializeInput()), {
    kind: "rejected", code: "invalid_request",
  });
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(await adapter.initialize(initializeInput({
    credential: { apiKey: "bad key", secretKey: "secret" } as unknown as typeof credential,
  }))).includes("secret"), false);
});
