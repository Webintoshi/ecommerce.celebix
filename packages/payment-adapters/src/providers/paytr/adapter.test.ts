import assert from "node:assert/strict";
import test from "node:test";

import type {
  HostedPaymentInitializeInput,
  ProviderTransportRequest,
  ProviderTransportResult,
} from "../../index.ts";
import {
  PAYTR_IFRAME_PACKET,
  authenticatePaytrIframeCallback,
  createPaytrIframeAdapter,
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
  const form = `merchant_oid=${MERCHANT_OID}&status=success&total_amount=10000&hash=Dea8%2B%2BoKQcs6TlVm%2Fy5iF1RQas2QZIkZ1quzDlUnvzM%3D&payment_type=card&test_mode=1`;

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

  const signedUnderpayment = new URLSearchParams({
    merchant_oid: MERCHANT_OID,
    status: "success",
    total_amount: "9999",
    hash: "HLrGVd4NVupZSmNM97W4Yt/QgrzWHxMDQeXEfNbKFMo=",
    payment_type: "card",
    test_mode: "1",
  }).toString();
  for (const invalid of [
    signedUnderpayment,
    form.replace("Dea8%2B%2B", "Aea8%2B%2B"),
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
  const input = {
    environment: "test" as const,
    credential,
    attemptId: "11111111-1111-4111-8111-111111111111",
    orderReference: "merchant-order-123",
    providerReference: MERCHANT_OID,
    amountMinor: 10_000,
    currency: "TRY",
    signal: new AbortController().signal,
  };

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

test("does not execute verification-only live inputs", async () => {
  let calls = 0;
  const adapter = createPaytrIframeAdapter(transport(() => {
    calls += 1;
    return response(`{"status":"success","token":"${TOKEN}"}`);
  }));
  assert.deepEqual(await adapter.initialize(initializeInput({ environment: "live" })), {
    kind: "rejected",
    code: "environment_not_ready",
  });
  assert.equal(calls, 0);
});
