import assert from "node:assert/strict";
import test from "node:test";

import type {
  HostedPaymentInitializeInput,
  HostedPaymentQueryInput,
  ProviderTransportRequest,
  ProviderTransportResult,
} from "../../index.ts";
import {
  PAYTR_IFRAME_PACKET,
  authenticatePaytrIframeCallback,
  createPaytrIframeAdapter,
  createPaytrIframeCallbackHash,
  validatePaytrIframeCredentialWithTransport,
} from "./adapter.ts";

const BINDING = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";
const MERCHANT_OID = "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0";
const TOKEN = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
const EXPECTED_INITIALIZE_BODY = "merchant_id=123456&user_ip=8.8.8.8&merchant_oid=4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0&email=ada%40example.com&payment_amount=10000&paytr_token=MlwYy6rJ%2FsZOITp%2FeIHzwkPLZoJCwSQW4twPHmxK0gQ%3D&user_basket=W1siw5ZybmVrIMO8csO8biIsIjEwMC4wMCIsMV1d&debug_on=0&no_installment=0&max_installment=0&user_name=Ada+Lovelace&user_address=%C3%96rnek+1+%C4%B0stanbul&user_phone=%2B905551112233&merchant_ok_url=https%3A%2F%2Fpilot.saas-staging.celebix.site%2Fodeme%2Fhizli%2Fsonuc%3Fdurum%3Dbasarili&merchant_fail_url=https%3A%2F%2Fpilot.saas-staging.celebix.site%2Fodeme%2Fhizli%2Fsonuc%3Fdurum%3Dbasarisiz&timeout_limit=30&currency=TL&test_mode=1";
const EXPECTED_STATUS_BODY = "merchant_id=123456&merchant_oid=4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0&paytr_token=%2B5RdXM%2FoQ7nTugbI5RnCMWURfHfcwM9Tcgt7XzGmbpc%3D";
const credential = {
  merchantId: "123456",
  merchantKey: "test-merchant-key",
  merchantSalt: "test-merchant-salt",
};

function response(body: string, status = 200): ProviderTransportResult {
  return Object.freeze({
    kind: "response" as const,
    status,
    contentType: "application/json; charset=utf-8",
    body: new TextEncoder().encode(body),
  });
}

function legacyTokenResponse(body: string): ProviderTransportResult {
  return Object.freeze({
    kind: "response" as const,
    status: 200,
    contentType: "text/html; charset=UTF-8",
    body: new TextEncoder().encode(body),
  });
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

function initializeInput(
  overrides: Partial<HostedPaymentInitializeInput<typeof credential>> = {},
): HostedPaymentInitializeInput<typeof credential> {
  return Object.freeze({
    environment: "test",
    preferences: Object.freeze({
      environment: "test" as const,
      locale: "tr" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "all" as const,
      maxInstallment: 0 as const,
    }),
    credential,
    attemptId: "11111111-1111-4111-8111-111111111111",
    orderReference: "merchant-order-123",
    amountMinor: 10_000,
    currency: "TRY",
    callbackUrl: `https://pilot.saas-staging.celebix.site/api/payments/paytr_iframe/callback/${BINDING}`,
    successUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz",
    customer: Object.freeze({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+905551112233",
      ipAddress: "8.8.8.8",
      address: "Örnek 1 İstanbul",
    }),
    basket: Object.freeze([
      Object.freeze({
        reference: "SKU-1",
        name: "Örnek ürün",
        quantity: 1,
        unitAmountMinor: 10_000,
      }),
    ]),
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
    attemptId: "11111111-1111-4111-8111-111111111111",
    orderReference: "merchant-order-123",
    providerReference: MERCHANT_OID,
    amountMinor: 10_000,
    currency: "TRY",
    signal: new AbortController().signal,
    ...overrides,
  });
}

test("exports the immutable verification-only PayTR iframe packet and exact capabilities", () => {
  assert.equal(Object.isFrozen(PAYTR_IFRAME_PACKET), true);
  assert.deepEqual(PAYTR_IFRAME_PACKET.readiness, {
    test: "verification",
    live: "verification",
  });
  assert.deepEqual(PAYTR_IFRAME_PACKET.capabilities, {
    initialize: true,
    callback: true,
    query: true,
    threeDSecure: true,
    installments: true,
    preAuth: false,
    capture: false,
    cancel: false,
    refund: false,
    partialRefund: false,
    tokenization: false,
  });
  assert.deepEqual(PAYTR_IFRAME_PACKET.presentation.test, {
    kind: "provider_token_url",
    urlPrefix: "https://www.paytr.com/odeme/guvenli/",
    token: { alphabet: "base64url", minimum: 32, maximum: 256 },
  });
});

test("initializes once with the exact documented body and provider-owned presentation URL", async () => {
  let calls = 0;
  let observed: ProviderTransportRequest | undefined;
  let observedBody = "";
  const returnedBody = new TextEncoder().encode(`{"status":"success","token":"${TOKEN}"}`);
  const adapter = createPaytrIframeAdapter(transport((request) => {
    calls += 1;
    observed = request;
    observedBody = new TextDecoder().decode(request.body);
    return Object.freeze({
      kind: "response" as const,
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: returnedBody,
    });
  }));
  const input = initializeInput();

  const result = await adapter.initialize(input);

  assert.deepEqual(result, {
    kind: "iframe",
    url: `https://www.paytr.com/odeme/guvenli/${TOKEN}`,
    token: TOKEN,
    providerReference: MERCHANT_OID,
  });
  assert.equal(calls, 1);
  assert.equal(observed?.url, "https://www.paytr.com/odeme/api/get-token");
  assert.equal(observed?.method, "POST");
  assert.deepEqual(observed?.headers, {
    "content-type": "application/x-www-form-urlencoded",
  });
  assert.strictEqual(observed?.signal, input.signal);
  assert.equal(observedBody, EXPECTED_INITIALIZE_BODY);
  assert.equal(observed?.body.every((byte) => byte === 0), true);
  assert.equal(returnedBody.every((byte) => byte === 0), true);
});

test("accepts PayTR legacy JSON content type only for get-token initialization", async () => {
  const initialization = createPaytrIframeAdapter(transport(() =>
    legacyTokenResponse(`{"status":"success","token":"${TOKEN}"}`)));

  assert.equal((await initialization.initialize(initializeInput())).kind, "iframe");

  const statusQuery = createPaytrIframeAdapter(transport(() =>
    legacyTokenResponse('{"status":"success","payment_amount":"100.00","payment_total":"100.00","payment_date":"2026-07-27","currency":"TRY","test_mode":"1"}')));

  assert.deepEqual(await statusQuery.query(queryInput()), {
    kind: "unknown",
    providerReference: MERCHANT_OID,
  });
});

test("maps immutable installment preferences to exact PayTR request fields", async () => {
  const cases = [
    [{ installmentMode: "all", maxInstallment: 0 }, ["0", "0"]],
    [{ installmentMode: "single_payment", maxInstallment: 0 }, ["1", "0"]],
    [{ installmentMode: "limited", maxInstallment: 6 }, ["0", "6"]],
  ] as const;
  for (const [preference, expected] of cases) {
    let observed = new URLSearchParams();
    const adapter = createPaytrIframeAdapter(transport((request) => {
      observed = new URLSearchParams(new TextDecoder().decode(request.body));
      return response(`{"status":"success","token":"${TOKEN}"}`);
    }));
    assert.equal((await adapter.initialize(initializeInput({
      preferences: Object.freeze({
        ...initializeInput().preferences,
        ...preference,
      }),
    }))).kind, "iframe");
    assert.deepEqual(
      [observed.get("no_installment"), observed.get("max_installment")],
      expected,
    );
  }
});

test("rejects malformed or environment-mismatched PayTR preferences before transport", async () => {
  let calls = 0;
  const adapter = createPaytrIframeAdapter(transport(() => {
    calls += 1;
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }));
  for (const preferences of [
    { ...initializeInput().preferences, environment: "live" },
    { ...initializeInput().preferences, installmentMode: "limited", maxInstallment: 0 },
    { ...initializeInput().preferences, extra: true },
  ]) {
    assert.deepEqual(await adapter.initialize(initializeInput({
      preferences: preferences as never,
    })), { kind: "rejected", code: "invalid_request" });
  }
  assert.equal(calls, 0);
});

test("contains rejection, timeout, malformed response, and thrown transport without retry", async () => {
  const cases: ReadonlyArray<Readonly<{
    result: ProviderTransportResult | Error;
    expected: unknown;
  }>> = [
    {
      result: response('{"status":"failed","reason":"secret provider detail"}'),
      expected: { kind: "rejected", code: "provider_rejected" },
    },
    {
      result: Object.freeze({ kind: "unknown", code: "transport_outcome_unknown" }),
      expected: {
        kind: "unknown",
        code: "provider_outcome_unknown",
        providerReference: MERCHANT_OID,
      },
    },
    {
      result: response(`{"status":"success","token":"${TOKEN}","extra":"raw"}`),
      expected: {
        kind: "unknown",
        code: "provider_outcome_unknown",
        providerReference: MERCHANT_OID,
      },
    },
    {
      result: new Error("raw transport secret"),
      expected: {
        kind: "unknown",
        code: "provider_outcome_unknown",
        providerReference: MERCHANT_OID,
      },
    },
  ];

  for (const selected of cases) {
    let calls = 0;
    const adapter = createPaytrIframeAdapter(transport(() => {
      calls += 1;
      if (selected.result instanceof Error) throw selected.result;
      return selected.result;
    }));
    assert.deepEqual(await adapter.initialize(initializeInput()), selected.expected);
    assert.equal(calls, 1);
  }
});

test("rejects locally invalid initiation before transport and preserves the historical return path", async () => {
  let calls = 0;
  const adapter = createPaytrIframeAdapter(transport(() => {
    calls += 1;
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }));
  const aborted = new AbortController();
  aborted.abort();
  for (const input of [
    initializeInput({
      customer: Object.freeze({
        ...initializeInput().customer,
        email: "invalid",
      }),
    }),
    initializeInput({
      customer: Object.freeze({
        ...initializeInput().customer,
        ipAddress: "127.0.0.999",
      }),
    }),
    initializeInput({
      successUrl: "https://pilot.saas-staging.celebix.site/odeme/sonuc?durum=basarili",
    }),
    initializeInput({ signal: aborted.signal }),
  ]) {
    assert.deepEqual(await adapter.initialize(input), {
      kind: "rejected",
      code: "invalid_request",
    });
  }
  assert.equal(calls, 0);
});

test("verifies callback HMAC and projects only durable order/provider facts", async () => {
  const adapter = createPaytrIframeAdapter(transport(async () => {
    throw new Error("callback must not use transport");
  }));
  const callbackHash = createPaytrIframeCallbackHash({
    credential,
    merchantOid: MERCHANT_OID,
    status: "success",
    totalAmount: "10000",
  });
  const form = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "10000",
    hash: callbackHash,
    payment_type: "card",
    test_mode: "1",
    payment_amount: "10000",
    currency: "TL",
  }).toString();

  assert.deepEqual(await adapter.verifyCallback({
    environment: "test",
    credential,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new TextEncoder().encode(form),
    expected: {
      attemptId: "11111111-1111-4111-8111-111111111111",
      orderReference: "merchant-order-123",
      amountMinor: 10_000,
      currency: "TRY",
    },
  }), {
    eventKey: "merchant-order-123:success",
    status: "succeeded",
    providerReference: MERCHANT_OID,
    paidAmountMinor: 10_000,
    currency: "TRY",
    safeCode: "success",
  });

  const installmentForm = `${form}&installment_count=0`;
  assert.deepEqual(await adapter.verifyCallback({
    environment: "test",
    credential,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new TextEncoder().encode(installmentForm),
    expected: {
      attemptId: "11111111-1111-4111-8111-111111111111",
      orderReference: "merchant-order-123",
      amountMinor: 10_000,
      currency: "TRY",
    },
  }), {
    eventKey: "merchant-order-123:success",
    status: "succeeded",
    providerReference: MERCHANT_OID,
    paidAmountMinor: 10_000,
    currency: "TRY",
    safeCode: "success",
  });

  const signedUnderpayment = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "9999",
    hash: "HLrGVd4NVupZSmNM97W4Yt/QgrzWHxMDQeXEfNbKFMo=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "10000",
    currency: "TL",
  }).toString();
  const wrongPaymentAmount = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "10000",
    hash: callbackHash,
    payment_type: "card",
    test_mode: "1",
    payment_amount: "9999",
    currency: "TL",
  }).toString();
  const wrongCurrency = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "10000",
    hash: callbackHash,
    payment_type: "card",
    test_mode: "1",
    payment_amount: "10000",
    currency: "USD",
  }).toString();
  const missingPaymentContext = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "10000",
    hash: callbackHash,
    payment_type: "card",
    test_mode: "1",
  }).toString();
  for (const invalid of [
    signedUnderpayment,
    wrongPaymentAmount,
    wrongCurrency,
    missingPaymentContext,
    `${form}&installment_count=1`,
    `${form}&installment_count=13`,
    form.replace(encodeURIComponent(callbackHash), encodeURIComponent(`A${callbackHash.slice(1)}`)),
    `${form}&merchant_oid=${MERCHANT_OID}`,
  ]) {
    await assert.rejects(
      adapter.verifyCallback({
        environment: "test",
        credential,
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new TextEncoder().encode(invalid),
        expected: {
          attemptId: "11111111-1111-4111-8111-111111111111",
          orderReference: "merchant-order-123",
          amountMinor: 10_000,
          currency: "TRY",
        },
      }),
      /paytr_callback_invalid/,
    );
  }

  const legacyForm = "merchant_oid=abc123def456abc123def456abc123de&status=success&total_amount=3600&hash=SrJicdvlvDikrVx%2BLFBeFuunzwB3upOVN2hMKAQxa6k%3D&payment_type=card&test_mode=1";
  assert.equal(authenticatePaytrIframeCallback({
    credential,
    form: legacyForm,
    expectedPaymentAmount: 3_600,
  })?.merchantOid, "abc123def456abc123def456abc123de");
  await assert.rejects(
    adapter.verifyCallback({
      environment: "test",
      credential,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new TextEncoder().encode(legacyForm),
      expected: {
        attemptId: "11111111-1111-4111-8111-111111111111",
        orderReference: "merchant-order-123",
        amountMinor: 3_600,
        currency: "TRY",
      },
    }),
    /paytr_callback_invalid/,
  );
});

test("queries the persisted digest once and treats amount or response ambiguity as unknown", async () => {
  let calls = 0;
  let observedBody = "";
  const adapter = createPaytrIframeAdapter(transport((request) => {
    calls += 1;
    observedBody = new TextDecoder().decode(request.body);
    return response('{"status":"success","payment_amount":"100.00","payment_total":"100,00","payment_date":"2026-07-27 12:30:45","currency":"TL","test_mode":"1"}');
  }));
  const input = queryInput();

  assert.deepEqual(await adapter.query(input), {
    kind: "succeeded",
    providerReference: MERCHANT_OID,
    paidAmountMinor: 10_000,
    currency: "TRY",
  });
  assert.equal(calls, 1);
  assert.equal(observedBody, EXPECTED_STATUS_BODY);

  let mismatchCalls = 0;
  const mismatch = createPaytrIframeAdapter(transport(() => {
    mismatchCalls += 1;
    return response('{"status":"success","payment_amount":"99.99","payment_total":"100.00","payment_date":"2026-07-27","currency":"TRY","test_mode":"1"}');
  }));
  assert.deepEqual(await mismatch.query(input), {
    kind: "unknown",
    providerReference: MERCHANT_OID,
  });
  assert.equal(mismatchCalls, 1);
});

test("rejects every locally invalid query before transport", async () => {
  let calls = 0;
  const adapter = createPaytrIframeAdapter(transport(() => {
    calls += 1;
    return response('{"status":"success","payment_amount":"100.00","payment_total":"100.00","payment_date":"2026-07-27","currency":"TRY","test_mode":"1"}');
  }));
  const aborted = new AbortController();
  aborted.abort();

  for (const input of [
    queryInput({ currency: "USD" }),
    queryInput({ providerReference: null }),
    queryInput({ providerReference: "A".repeat(64) }),
    queryInput({ credential: { ...credential, merchantKey: "" } }),
    queryInput({ attemptId: "not-a-uuid" }),
    queryInput({ orderReference: "invalid order reference" }),
    queryInput({ amountMinor: 0 }),
    queryInput({ signal: {} as AbortSignal }),
    queryInput({ signal: aborted.signal }),
  ]) {
    assert.deepEqual(await adapter.query(input), {
      kind: "rejected",
      code: "invalid_request",
    });
  }
  assert.equal(calls, 0);
});

test("keeps dispatched query transport ambiguity durable and reference-bound", async () => {
  for (const outcome of [
    Object.freeze({ kind: "unknown" as const, code: "transport_outcome_unknown" as const }),
    new Error("opaque transport ambiguity"),
  ]) {
    let calls = 0;
    const adapter = createPaytrIframeAdapter(transport(() => {
      calls += 1;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }));
    assert.deepEqual(await adapter.query(queryInput()), {
      kind: "unknown",
      providerReference: MERCHANT_OID,
    });
    assert.equal(calls, 1);
  }
});

test("PayTR live hosted initialize and callback require test_mode zero", async () => {
  let calls = 0;
  let requestEnvironment = "";
  let body = "";
  const adapter = createPaytrIframeAdapter(transport((request) => {
    calls += 1;
    requestEnvironment = request.environment;
    body = new TextDecoder().decode(request.body);
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }));
  const liveInput = initializeInput({
    environment: "live",
    preferences: Object.freeze({
      ...initializeInput().preferences,
      environment: "live" as const,
    }),
  });

  assert.equal((await adapter.initialize(liveInput)).kind, "iframe");
  assert.equal(calls, 1);
  assert.equal(requestEnvironment, "live");
  assert.equal(new URLSearchParams(body).get("test_mode"), "0");

  const callbackHash = createPaytrIframeCallbackHash({
    credential,
    merchantOid: MERCHANT_OID,
    status: "success",
    totalAmount: "10000",
  });
  const liveForm = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "10000",
    hash: callbackHash,
    payment_type: "card",
    test_mode: "0",
    payment_amount: "10000",
    currency: "TL",
  }).toString();
  const callbackInput = {
    environment: "live" as const,
    credential,
    method: "POST" as const,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    expected: {
      attemptId: "11111111-1111-4111-8111-111111111111",
      orderReference: "merchant-order-123",
      amountMinor: 10_000,
      currency: "TRY" as const,
    },
  };
  assert.equal((await adapter.verifyCallback({
    ...callbackInput,
    body: new TextEncoder().encode(liveForm),
  })).status, "succeeded");
  await assert.rejects(
    adapter.verifyCallback({
      ...callbackInput,
      body: new TextEncoder().encode(liveForm.replace("test_mode=0", "test_mode=1")),
    }),
    /paytr_callback_invalid/,
  );
});

test("PayTR live query accepts only provider test_mode zero", async () => {
  let observedEnvironment = "";
  const live = createPaytrIframeAdapter(transport((request) => {
    observedEnvironment = request.environment;
    return response('{"status":"success","payment_amount":"100.00","payment_total":"100.00","payment_date":"2026-07-27","currency":"TRY","test_mode":"0"}');
  }));

  assert.deepEqual(await live.query(queryInput({ environment: "live" })), {
    kind: "succeeded",
    providerReference: MERCHANT_OID,
    paidAmountMinor: 10_000,
    currency: "TRY",
  });
  assert.equal(observedEnvironment, "live");

  const mismatch = createPaytrIframeAdapter(transport(() =>
    response('{"status":"success","payment_amount":"100.00","payment_total":"100.00","payment_date":"2026-07-27","currency":"TRY","test_mode":"1"}')));
  assert.deepEqual(await mismatch.query(queryInput({ environment: "live" })), {
    kind: "unknown",
    providerReference: MERCHANT_OID,
  });
});

test("validates credentials only through one PayTR TEST get-token request without exposing or presenting the iframe token", async () => {
  let calls = 0;
  let body = "";
  const result = await validatePaytrIframeCredentialWithTransport(transport((request) => {
    calls += 1;
    body = new TextDecoder().decode(request.body);
    assert.equal(request.url, "https://www.paytr.com/odeme/api/get-token");
    assert.equal(request.environment, "test");
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }), Object.freeze({
    environment: "test" as const,
    credential,
    validationReference: "11111111-1111-4111-8111-111111111111",
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
    signal: new AbortController().signal,
  }));
  assert.deepEqual(result, { kind: "validated" });
  assert.equal(calls, 1);
  const form = new URLSearchParams(body);
  assert.equal(form.get("test_mode"), "1");
  assert.equal(form.get("payment_amount"), "100");
  assert.equal(form.get("merchant_oid"), "CV11111111111141118111111111111111");
  assert.equal(form.get("email"), "payments@celebix.co");
  assert.equal(form.get("user_ip"), "8.8.8.8");
  assert.equal(form.get("merchant_ok_url"), "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili");
  assert.equal(form.get("merchant_fail_url"), "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});

test("credential validation never retries rejection or ambiguity", async () => {
  for (const [providerResult, expected] of [
    [response('{"status":"failed","reason":"private"}'), { kind: "rejected", outcomeCode: "provider_rejected" }],
    [Object.freeze({ kind: "unknown" as const, code: "transport_outcome_unknown" as const }), { kind: "rejected", outcomeCode: "validation_unavailable" }],
  ] as const) {
    let calls = 0;
    const result = await validatePaytrIframeCredentialWithTransport(transport(() => {
      calls += 1;
      return providerResult;
    }), Object.freeze({
      environment: "test" as const,
      credential,
      validationReference: "11111111-1111-4111-8111-111111111111",
      userIp: "8.8.8.8",
      successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
      failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
      signal: new AbortController().signal,
    }));
    assert.deepEqual(result, expected);
    assert.equal(calls, 1);
  }
  let calls = 0;

  for (const invalidConfig of [
    {},
    { userIp: "198.51.100.1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "::ffff:127.0.0.1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "ff02::1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "0:0:0:0:0:0:0:1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "0000:0000:0000:0000:0000:ffff:7f00:1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "::ffff:7f00:1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "fe80::1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "2001:db8::1", successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "8.8.8.8", successUrl: "https://127.0.0.1/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://127.0.0.1/odeme/hizli/sonuc?durum=basarisiz" },
    { userIp: "8.8.8.8", successUrl: "https://validation.celebix.invalid/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz" },
  ]) {
    assert.deepEqual(await validatePaytrIframeCredentialWithTransport(transport(() => {
      calls += 1;
      return response(`{"status":"success","token":"${TOKEN}"}`);
    }), Object.freeze({
      environment: "test" as const,
      credential,
      validationReference: "11111111-1111-4111-8111-111111111111",
      signal: new AbortController().signal,
      ...invalidConfig,
    }) as never), { kind: "rejected", outcomeCode: "invalid_validation_request" });
  }
  assert.equal(calls, 0);
});

test("PayTR live credential validation signs test_mode zero without opening an iframe", async () => {
  let calls = 0;
  let body = "";
  const result = await validatePaytrIframeCredentialWithTransport(transport((request) => {
    calls += 1;
    body = new TextDecoder().decode(request.body);
    assert.equal(request.environment, "live");
    assert.equal(request.url, "https://www.paytr.com/odeme/api/get-token");
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }), Object.freeze({
    environment: "live" as const,
    credential,
    validationReference: "11111111-1111-4111-8111-111111111111",
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
    signal: new AbortController().signal,
  }));

  assert.deepEqual(result, { kind: "validated" });
  assert.equal(calls, 1);
  assert.equal(new URLSearchParams(body).get("test_mode"), "0");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});
