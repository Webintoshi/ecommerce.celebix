import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  CheckoutPaymentRepositoryError,
  digestCanonicalPaytrConfiguration,
  openQuickLinkSecret,
  sealQuickLinkSecret,
  serializeCanonicalPaytrConfiguration,
  type CheckoutPaymentRepository,
  type PublicQuickOrderRepository,
} from "@celebix/saas-data";

import { digestRedemptionCredential } from "./redemption-cookie.ts";

type PaytrModule = typeof import("./paytr.ts");

const paytr = await import("./paytr.ts").catch(() => ({} as Partial<PaytrModule>));
const configuration = Object.freeze({
  version: 1 as const,
  merchantId: "123456",
  merchantKey: "test-merchant-key",
  merchantSalt: "test-merchant-salt",
  callbackUrl: "https://pilot.saas-staging.celebix.site/api/payments/paytr/callback",
  testMode: 1 as const,
});
const merchantOid = "abc123def456abc123def456abc123de";
const userBasket = "W1siw5ZybmVrIMO8csO8biIsIjE4LjAwIiwyXV0=";
const runtimeModule = await import("./runtime.ts");

test("PayTR creates the documented iframe HMAC from canonical UTF-8 bytes", () => {
  assert.equal(typeof paytr.createPaytrToken, "function");
  assert.equal(paytr.createPaytrToken!({
    configuration,
    userIp: "8.8.8.8",
    merchantOid,
    email: "ada@example.com",
    paymentAmount: 3_600,
    userBasket,
    noInstallment: 0,
    maxInstallment: 0,
    currency: "TL",
  }), "GgNqUVAdw+xF+ISBw/2efKnwdab+iYhaXb/NMUCXz8U=");
});

test("PayTR callback and status HMACs match the documented byte order", () => {
  assert.equal(paytr.createPaytrStatusToken!(configuration, merchantOid), "5QldwMdWkWyumPa40DcWsT8JluSOLN9L59Nplx9owlo=");
  assert.equal(paytr.verifyPaytrCallback!({
    configuration,
    merchantOid,
    status: "success",
    totalAmount: "3600",
    providedHash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  }), true);
  assert.equal(paytr.verifyPaytrCallback!({
    configuration,
    merchantOid,
    status: "success",
    totalAmount: "3600",
    providedHash: "ArJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  }), false);
  for (const totalAmount of ["03600", "+3600", "3600 ", "36.00", "1e3"]) {
    assert.equal(paytr.verifyPaytrCallback!({ configuration, merchantOid, status: "success", totalAmount, providedHash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=" }), false);
  }
});

test("PayTR authenticates only the exact bounded callback vocabulary and strict collected amount", () => {
  assert.equal(typeof paytr.authenticatePaytrCallback, "function");
  const success = new URLSearchParams({
    merchant_oid: merchantOid,
    status: "success",
    total_amount: "3601",
    hash: createHmac("sha256", configuration.merchantKey)
      .update(`${merchantOid}${configuration.merchantSalt}success3601`, "utf8").digest("base64"),
    payment_type: "card",
    test_mode: "1",
  }).toString();
  assert.deepEqual(paytr.authenticatePaytrCallback!({
    configuration,
    form: success,
    expectedPaymentAmount: 3_600,
  }), {
    status: "success", merchantOid, totalAmount: 3_601, paymentAmount: 3_600,
    paymentType: "card", currency: "TRY", testMode: 1,
  });

  const failedReasonMessage = "provider detail must never be persisted";
  const failed = new URLSearchParams({
    merchant_oid: merchantOid,
    status: "failed",
    total_amount: "3600",
    hash: createHmac("sha256", configuration.merchantKey)
      .update(`${merchantOid}${configuration.merchantSalt}failed3600`, "utf8").digest("base64"),
    payment_type: "eft",
    test_mode: "1",
    failed_reason_code: "12",
    failed_reason_msg: failedReasonMessage,
  }).toString();
  assert.deepEqual(paytr.authenticatePaytrCallback!({
    configuration,
    form: failed,
    expectedPaymentAmount: 3_600,
  }), {
    status: "failed", merchantOid, totalAmount: 3_600, paymentType: "eft", testMode: 1,
    failedReasonCode: "12",
    failedReasonMessageDigest: createHash("sha256").update(failedReasonMessage, "utf8").digest("hex"),
  });

  for (const form of [
    success.replace("total_amount=3601", "total_amount=3599"),
    `${success}&merchant_oid=${merchantOid}`,
    `${success}&unknown=1`,
    success.replace("payment_type=card", "payment_type=wallet"),
    success.replace("test_mode=1", "test_mode=0"),
    success.replace("status=success", "status=pending"),
    success.replace("total_amount=3601", "total_amount=9007199254740992"),
  ]) {
    assert.equal(paytr.authenticatePaytrCallback!({ configuration, form, expectedPaymentAmount: 3_600 }), null, form);
  }
});

async function withFetch<T>(implementation: typeof fetch, operation: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try { return await operation(); } finally { globalThis.fetch = original; }
}

function jsonResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

test("PayTR iframe initiation sends one exact manual-redirect form POST", { concurrency: false }, async () => {
  let observed: Readonly<{ url: string; init: RequestInit; body: string }> | undefined;
  const result = await withFetch(async (url, init) => {
    observed = { url: String(url), init: init!, body: String(init?.body) };
    return jsonResponse('{"status":"success","token":"28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa"}');
  }, async () => paytr.requestPaytrIframeToken!({
    configuration,
    userIp: "8.8.8.8",
    merchantOid,
    email: "ada@example.com",
    paymentAmount: 3_600,
    userBasket,
    userName: "Ada Lovelace",
    userAddress: "Örnek 1 İstanbul",
    userPhone: "+905551112233",
    successUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz",
    noInstallment: 0,
    maxInstallment: 0,
    signal: new AbortController().signal,
  }));
  assert.deepEqual(result, { status: "success", token: "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa" });
  assert.equal(observed?.url, "https://www.paytr.com/odeme/api/get-token");
  assert.equal(observed?.init.method, "POST");
  assert.equal(observed?.init.redirect, "manual");
  assert.equal(new Headers(observed?.init.headers).get("content-type"), "application/x-www-form-urlencoded");
  const keys = [...new URLSearchParams(observed?.body).keys()];
  assert.deepEqual(keys, [
    "merchant_id", "user_ip", "merchant_oid", "email", "payment_amount", "paytr_token", "user_basket",
    "debug_on", "no_installment", "max_installment", "user_name", "user_address", "user_phone",
    "merchant_ok_url", "merchant_fail_url", "timeout_limit", "currency", "test_mode",
  ]);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(observed?.body)), {
    merchant_id: "123456", user_ip: "8.8.8.8", merchant_oid: merchantOid, email: "ada@example.com",
    payment_amount: "3600", paytr_token: "GgNqUVAdw+xF+ISBw/2efKnwdab+iYhaXb/NMUCXz8U=", user_basket: userBasket,
    debug_on: "0", no_installment: "0", max_installment: "0", user_name: "Ada Lovelace",
    user_address: "Örnek 1 İstanbul", user_phone: "+905551112233",
    merchant_ok_url: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili",
    merchant_fail_url: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz",
    timeout_limit: "30", currency: "TL", test_mode: "1",
  });
});

test("PayTR iframe initiation contains provider rejection and ambiguous failures without retry", { concurrency: false }, async () => {
  const input = {
    configuration, userIp: "8.8.8.8", merchantOid, email: "ada@example.com", paymentAmount: 3_600,
    userBasket, userName: "Ada Lovelace", userAddress: "Örnek 1 İstanbul", userPhone: "+905551112233",
    successUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarisiz", noInstallment: 0 as const,
    maxInstallment: 0, signal: new AbortController().signal,
  };
  let calls = 0;
  assert.deepEqual(await withFetch(async () => { calls += 1; return jsonResponse('{"status":"failed","reason":"secret provider detail"}'); }, () => paytr.requestPaytrIframeToken!(input)), { status: "rejected" });
  assert.equal(calls, 1);
  calls = 0;
  assert.deepEqual(await withFetch(async () => { calls += 1; throw new TypeError("network secret"); }, () => paytr.requestPaytrIframeToken!(input)), { status: "unknown" });
  assert.equal(calls, 1);
  for (const response of [
    new Response(null, { status: 302, headers: { location: "https://evil.example" } }),
    jsonResponse('{"status":"success","token":"bad/token"}'),
    jsonResponse('{"status":"success","token":"28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa","extra":1}'),
    jsonResponse("{" + '"status":"success","status":"failed","token":"28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa"' + "}"),
    jsonResponse("x".repeat(4_097)),
    new Response("{}", { status: 200, headers: { "content-type": "text/html" } }),
  ]) {
    assert.deepEqual(await withFetch(async () => response, () => paytr.requestPaytrIframeToken!(input)), { status: "unknown" });
  }
});

test("PayTR response reader cancels an unannounced body at the 4097th byte", { concurrency: false }, async () => {
  let pulls = 0;
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls <= 4) controller.enqueue(new Uint8Array(2_048).fill(0x78));
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const result = await withFetch(async () => new Response(oversized, {
    status: 200,
    headers: { "content-type": "application/json" },
  }), () => paytr.queryPaytrStatus!({ configuration, merchantOid, signal: new AbortController().signal }));
  assert.deepEqual(result, { status: "unknown" });
  assert.equal(cancelled, true);
  assert.ok(pulls < 5, `reader consumed the entire ${pulls}-chunk body`);
});

test("PayTR status query validates the complete documented success vocabulary and projects cents only", { concurrency: false }, async () => {
  let observed: Readonly<{ url: string; init: RequestInit; body: string }> | undefined;
  const rich = JSON.stringify({
    status: "success", payment_amount: "10,80", payment_total: "11.25", payment_date: "2026-07-21 12:30:45",
    currency: "TL", test_mode: "1", net_tutar: "9.76", kesinti_tutari: "1.04", taksit: "0",
    kart_marka: "BONUS", masked_pan: "455359AAA6747", auth_code: "123456", auth_date: "21.07.2026 12:30:45",
    odeme_tipi: "KART", returns: [{ return_amount: "1.00", return_date: "2026-07-21 13:00:00", return_type: "",
      date_completed: "2026-07-21 13:01:00", return_auth_code: "", return_ref_num: "", reference_no: "ABC123", return_source: "api" }],
  });
  const result = await withFetch(async (url, init) => {
    observed = { url: String(url), init: init!, body: String(init?.body) };
    return jsonResponse(rich);
  }, () => paytr.queryPaytrStatus!({ configuration, merchantOid, signal: new AbortController().signal }));
  assert.deepEqual(result, { status: "success", paymentAmount: 1_080, totalAmount: 1_125, currency: "TRY", testMode: 1 });
  assert.equal(observed?.url, "https://www.paytr.com/odeme/durum-sorgu");
  assert.equal(observed?.init.method, "POST");
  assert.equal(observed?.init.redirect, "manual");
  assert.equal(observed?.body, `merchant_id=123456&merchant_oid=${merchantOid}&paytr_token=5QldwMdWkWyumPa40DcWsT8JluSOLN9L59Nplx9owlo%3D`);
});

test("PayTR status query rejects noncanonical money, hostile objects, and unknown fields", { concurrency: false }, async () => {
  const valid = { status: "success", payment_amount: "10.80", payment_total: "11.25", payment_date: "2026-07-21 12:30:45", currency: "TRY", test_mode: "1" };
  const invalidAmounts = ["1", "01.00", "1.000", "1.", ".10", "+1.00", "-1.00", "1e2", "1 000.00", "1,0.00", "90071992547410.00", " 1.00"];
  for (const value of invalidAmounts) {
    const result = await withFetch(async () => jsonResponse(JSON.stringify({ ...valid, payment_amount: value })), () => paytr.queryPaytrStatus!({ configuration, merchantOid, signal: new AbortController().signal }));
    assert.deepEqual(result, { status: "unknown" }, value);
  }
  for (const body of [
    JSON.stringify({ ...valid, payment_amount: "11.26", payment_total: "11.25" }),
    JSON.stringify({ ...valid, unknown: "x" }),
    '{"status":"success","status":"error","payment_amount":"1.00","payment_total":"1.00","payment_date":"2026-07-21 12:30:45","currency":"TL","test_mode":"1"}',
    JSON.stringify({ ...valid, returns: [{ return_amount: "1.00", hostile: "x" }] }),
    JSON.stringify({ ...valid, test_mode: "0" }),
    JSON.stringify({ ...valid, currency: "USD" }),
  ]) {
    assert.deepEqual(await withFetch(async () => jsonResponse(body), () => paytr.queryPaytrStatus!({ configuration, merchantOid, signal: new AbortController().signal })), { status: "unknown" });
  }
});

test("PayTR official error, timeout, response limit, and parse failures are opaque unknown", { concurrency: false }, async () => {
  for (const operation of [
    () => Promise.resolve(jsonResponse('{"status":"error","err_no":"005","err_msg":"sensitive provider text"}')),
    () => Promise.resolve(jsonResponse('{"status":"error","err_no":"005","err_msg":"sensitive provider text","extra":"x"}')),
    () => Promise.resolve(new Response("{}", { status: 500, headers: { "content-type": "application/json" } })),
    () => Promise.resolve(jsonResponse("not-json")),
    () => Promise.reject(new DOMException("timed out", "AbortError")),
  ]) {
    assert.deepEqual(await withFetch(operation, () => paytr.queryPaytrStatus!({ configuration, merchantOid, signal: new AbortController().signal })), { status: "unknown" });
  }
});

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";
const CREDENTIAL = `q1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const HOSTNAME = "pilot.saas-staging.celebix.site";
const keyring = Object.freeze({ activeKeyId: "quick.current", keys: Object.freeze([
  Object.freeze({ keyId: "quick.current", key: new Uint8Array(32).fill(7) }),
]) });
const serializedConfiguration = serializeCanonicalPaytrConfiguration(configuration);
const configurationDigest = digestCanonicalPaytrConfiguration(serializedConfiguration);
const sealedConfiguration = sealQuickLinkSecret({
  plaintext: serializedConfiguration, purpose: "provider-config", storeId: STORE_ID,
  objectId: PROVIDER_ID, digest: configurationDigest, keyring,
});

function callbackRequest(status: "success" | "failed" = "success", overrides: Record<string, string> = {}): Request {
  const totalAmount = overrides.total_amount ?? "3600";
  const selected = {
    merchant_oid: merchantOid,
    status,
    total_amount: totalAmount,
    hash: createHmac("sha256", configuration.merchantKey)
      .update(`${merchantOid}${configuration.merchantSalt}${status}${totalAmount}`, "utf8").digest("base64"),
    payment_type: "card",
    test_mode: "1",
    ...(status === "failed" ? { failed_reason_code: "12", failed_reason_msg: "sensitive provider message" } : {}),
    ...overrides,
  };
  return new Request(configuration.callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(selected).toString(),
  });
}

test("callback verifies sealed merchant authority before exact plain OK settlement", async () => {
  assert.equal(typeof runtimeModule.createPaytrCallbackRoute, "function");
  const calls = { authority: 0, settle: [] as Array<Record<string, unknown>> };
  const handler = runtimeModule.createPaytrCallbackRoute!({
    selectAuthority: () => ({ kind: "trusted" as const, hostname: HOSTNAME }),
    resolveRuntime: async () => ({
      keyring,
      paymentRepository: {
        async getCallbackAuthority() {
          calls.authority += 1;
          return { storeId: STORE_ID, attemptId: ATTEMPT_ID, merchantOid, providerConfigId: PROVIDER_ID,
            status: "provider_ready" as const, expectedPaymentAmount: 3_600, currency: "TRY" as const,
            configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration };
        },
        async settleCallback(input: Record<string, unknown>) { calls.settle.push(input); return { outcome: "settled" as const, orderNumber: "QO-safe" }; },
      },
    }),
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const response = await handler(callbackRequest());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "OK");
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(calls.authority, 1);
  assert.equal(calls.settle.length, 1);
  assert.equal(calls.settle[0]?.merchantOid, merchantOid);
  assert.equal(calls.settle[0]?.paymentAmount, 3_600);
  assert.equal(calls.settle[0]?.totalAmount, 3_600);
  assert.equal(calls.settle[0]?.currency, "TRY");
  assert.equal(calls.settle[0]?.paymentType, "card");
  assert.equal(calls.settle[0]?.testMode, 1);
  assert.match(String(calls.settle[0]?.callbackDigest), /^[a-f0-9]{64}$/);
  assert.match(String(calls.settle[0]?.operationId), /^[a-f0-9-]{36}$/);
  assert.match(String(calls.settle[0]?.fingerprint), /^[a-f0-9]{64}$/);
  assert.equal("hash" in calls.settle[0]!, false);
  assert.equal("merchantKey" in calls.settle[0]!, false);
});

test("callback maps only unresolved commit to retry and accepts replay or signed failure as exact OK", async () => {
  for (const [outcome, expectedStatus, expectedBody, callbackStatus] of [
    ["replayed", 200, "OK", "success"],
    ["failed", 200, "OK", "failed"],
    ["commit_unknown", 503, "RETRY", "success"],
  ] as const) {
    const settlements: Array<Record<string, unknown>> = [];
    const handler = runtimeModule.createPaytrCallbackRoute!({
      selectAuthority: () => ({ kind: "trusted" as const, hostname: HOSTNAME }),
      resolveRuntime: async () => ({ keyring, paymentRepository: {
        async getCallbackAuthority() { return { storeId: STORE_ID, attemptId: ATTEMPT_ID, merchantOid,
          providerConfigId: PROVIDER_ID, status: "provider_ready" as const, expectedPaymentAmount: 3_600,
          currency: "TRY" as const, configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration }; },
        async settleCallback(input: Record<string, unknown>) { settlements.push(input); return { outcome }; },
      } }),
      now: () => new Date("2026-07-21T12:00:00.000Z"),
    });
    const response = await handler(callbackRequest(callbackStatus));
    assert.equal(response.status, expectedStatus, outcome);
    assert.equal(await response.text(), expectedBody, outcome);
    if (callbackStatus === "failed") {
      assert.match(String(settlements[0]?.failedReasonMessageDigest), /^[a-f0-9]{64}$/);
      assert.equal("failedReasonMessage" in settlements[0]!, false);
    }
  }
});

test("callback rejects invalid HMAC, underpayment, external host mismatch, and browser authority before settlement", async () => {
  let settlements = 0;
  const handler = runtimeModule.createPaytrCallbackRoute!({
    selectAuthority: (headers: Headers) => headers.has("origin")
      ? ({ kind: "invalid" as const })
      : ({ kind: "trusted" as const, hostname: HOSTNAME }),
    resolveRuntime: async () => ({ keyring, paymentRepository: {
      async getCallbackAuthority() { return { storeId: STORE_ID, attemptId: ATTEMPT_ID, merchantOid,
        providerConfigId: PROVIDER_ID, status: "provider_ready" as const, expectedPaymentAmount: 3_600,
        currency: "TRY" as const, configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration }; },
      async settleCallback() { settlements += 1; return { outcome: "settled" as const }; },
    } }),
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const badHash = callbackRequest("success", { hash: Buffer.alloc(32, 0x31).toString("base64") });
  const underpaid = callbackRequest("success", { total_amount: "3599" });
  const browser = callbackRequest(); browser.headers.set("origin", `https://${HOSTNAME}`);
  for (const selected of [badHash, underpaid, browser]) {
    const response = await handler(selected);
    assert.equal(response.status, 400);
    assert.notEqual(await response.text(), "OK");
  }
  assert.equal(settlements, 0);
});

function paymentFixture(status: "reserved" | "provider_ready" | "initiation_unknown" = "reserved", outcome: "created" | "replayed" = "created") {
  const calls = { begin: 0, ready: 0, unknown: 0, failed: 0, presentation: 0, provider: 0, status: 0 };
  const providerToken = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
  const providerTokenDigest = createHash("sha256").update(providerToken).digest("hex");
  const sealedProviderToken = sealQuickLinkSecret({ plaintext: providerToken, purpose: "provider-token", storeId: STORE_ID, objectId: ATTEMPT_ID, digest: providerTokenDigest, keyring });
  let currentStatus: "reserved" | "provider_ready" | "initiation_unknown" | "failed" = status;
  let selectedAttemptId = ATTEMPT_ID;
  let selectedMerchantOid = merchantOid;
  const paymentRepository: Pick<CheckoutPaymentRepository,
    "beginAttempt" | "markProviderReady" | "markInitiationUnknown" | "markInitiationFailed" | "getPaymentPresentation"> = {
    async beginAttempt(input?: Readonly<{ attemptId: string; merchantOid: string }>) {
      calls.begin += 1;
      selectedAttemptId = input?.attemptId ?? ATTEMPT_ID;
      selectedMerchantOid = input?.merchantOid ?? merchantOid;
      return {
        outcome, status, storeId: STORE_ID, attemptId: selectedAttemptId, merchantOid: selectedMerchantOid, currency: "TRY" as const,
        paymentAmount: 3_600, customerEmail: "ada@example.com", customerName: "Ada Lovelace",
        customerPhone: "+905551112233", customerAddress: "Örnek 1 İstanbul",
        basket: [{ name: "Örnek ürün", unitPriceCents: 1_800, quantity: 2 }], providerConfigId: PROVIDER_ID,
        configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration,
      };
    },
    async markProviderReady(input?: ReadyInput) { calls.ready += 1; currentStatus = "provider_ready"; return { attemptId: input?.attemptId ?? selectedAttemptId, status: "provider_ready" as const, replayed: false,
      providerTokenDigest: input?.providerTokenDigest ?? providerTokenDigest, sealedProviderToken: input?.sealedProviderToken ?? sealedProviderToken }; },
    async markInitiationUnknown() { calls.unknown += 1; currentStatus = "initiation_unknown"; },
    async markInitiationFailed() { calls.failed += 1; currentStatus = "failed"; },
    async getPaymentPresentation() {
      calls.presentation += 1;
      if (currentStatus !== "provider_ready") throw new CheckoutPaymentRepositoryError("unavailable");
      return { attemptId: selectedAttemptId, storeId: STORE_ID, merchantOid: selectedMerchantOid, providerTokenDigest, sealedProviderToken };
    },
  };
  const quickOrderRepository: PublicQuickOrderRepository = {
    async claimRedemption() { throw new Error("unused"); }, async resolveRedemption() { throw new Error("unused"); },
    async getStatus() { calls.status += 1; return currentStatus === "failed" ? { kind: "failed" as const } : { kind: "processing" as const }; },
    async revokeRedemption() { throw new Error("unused"); },
  };
  const storefrontRepository = { async getPublicStorefront() { throw new Error("unused"); }, async listPublicProducts() { throw new Error("unused"); }, async getPublicProductBySlug() { throw new Error("unused"); }, async listPublicProductMedia() { throw new Error("unused"); } };
  return { calls, providerToken, paymentRepository, runtime: Object.freeze({ checkout: { storefrontRepository, quickOrderRepository }, paymentRepository, keyring }) };
}

function checkoutRequest(body = `operation_id=${OPERATION_ID}`, overrides: { path?: string; headers?: Record<string, string>; method?: string; rawBody?: string | null } = {}): Request {
  const headers = new Headers({
    origin: `https://${HOSTNAME}`, "content-type": "application/x-www-form-urlencoded",
    cookie: `__Host-celebix_quick=${CREDENTIAL}`, "x-forwarded-for": "8.8.8.8", ...overrides.headers,
  });
  const method = overrides.method ?? "POST";
  return new Request(`https://${HOSTNAME}${overrides.path ?? "/api/quick-order/checkout"}`, {
    method, headers, ...(method === "POST" && overrides.rawBody !== null ? { body: overrides.rawBody ?? body } : {}),
  });
}

function checkoutHandler(fixture = paymentFixture(), providerStatus: "success" | "rejected" | "unknown" = "success") {
  assert.equal(typeof runtimeModule.createQuickOrderCheckoutRoute, "function");
  return {
    fixture,
    handler: runtimeModule.createQuickOrderCheckoutRoute!({
      selectAuthority: () => ({ kind: "trusted" as const, hostname: HOSTNAME }),
      resolveRuntime: async () => fixture.runtime,
      now: () => new Date("2026-07-21T12:00:00.000Z"),
      initiate: async () => { fixture.calls.provider += 1; return providerStatus === "success" ? { status: "success" as const, token: fixture.providerToken } : { status: providerStatus }; },
    }),
  };
}

type BeginInput = Parameters<CheckoutPaymentRepository["beginAttempt"]>[0];
type ReadyInput = Parameters<CheckoutPaymentRepository["markProviderReady"]>[0];
type FinalInput = Parameters<CheckoutPaymentRepository["markInitiationUnknown"]>[0];

function sqlSemanticFixture() {
  const fixture = paymentFixture();
  const operations = new Map<string, Readonly<{ kind: string; attemptId: string; fingerprint: string }>>();
  const inputs = { begin: [] as BeginInput[], ready: [] as ReadyInput[], unknown: [] as FinalInput[], failed: [] as FinalInput[] };
  let state: "none" | "reserved" | "provider_ready" | "initiation_unknown" | "failed" = "none";
  const reserved = (input: BeginInput, outcome: "created" | "replayed") => ({
    outcome, status: "reserved" as const, storeId: STORE_ID, attemptId: input.attemptId, merchantOid: input.merchantOid,
    currency: "TRY" as const, paymentAmount: 3_600, customerEmail: "ada@example.com", customerName: "Ada Lovelace",
    customerPhone: "+905551112233", customerAddress: "Örnek 1 İstanbul",
    basket: [{ name: "Örnek ürün", unitPriceCents: 1_800, quantity: 2 }], providerConfigId: PROVIDER_ID,
    configurationDigest, configurationKeyId: sealedConfiguration.keyId, sealedConfiguration,
  });
  const accept = (kind: string, input: Readonly<{ attemptId: string; operationId: string; fingerprint: string }>) => {
    const prior = operations.get(input.operationId);
    if (prior !== undefined) {
      if (prior.kind !== kind || prior.attemptId !== input.attemptId || prior.fingerprint !== input.fingerprint) {
        throw new CheckoutPaymentRepositoryError("operation_mismatch");
      }
      return false;
    }
    operations.set(input.operationId, Object.freeze({ kind, attemptId: input.attemptId, fingerprint: input.fingerprint }));
    return true;
  };
  fixture.paymentRepository.beginAttempt = async (input: BeginInput) => {
    fixture.calls.begin += 1; inputs.begin.push(input);
    const created = accept("begin_attempt", input);
    if (!created) return reserved(input, "replayed");
    if (state !== "none") throw new CheckoutPaymentRepositoryError("attempt_in_progress");
    state = "reserved";
    return reserved(input, "created");
  };
  fixture.paymentRepository.markProviderReady = async (input: ReadyInput) => {
    fixture.calls.ready += 1; inputs.ready.push(input); accept("provider_ready", input);
    if (state !== "reserved") throw new CheckoutPaymentRepositoryError("invalid_transition");
    state = "provider_ready";
    return { attemptId: input.attemptId, status: "provider_ready" as const, replayed: false,
      providerTokenDigest: input.providerTokenDigest, sealedProviderToken: input.sealedProviderToken };
  };
  fixture.paymentRepository.markInitiationUnknown = async (input: FinalInput) => {
    fixture.calls.unknown += 1; inputs.unknown.push(input); accept("initiation_unknown", input);
    if (state !== "reserved") throw new CheckoutPaymentRepositoryError("invalid_transition");
    state = "initiation_unknown";
  };
  fixture.paymentRepository.markInitiationFailed = async (input: FinalInput) => {
    fixture.calls.failed += 1; inputs.failed.push(input); accept("initiation_failed", input);
    if (state !== "reserved") throw new CheckoutPaymentRepositoryError("invalid_transition");
    state = "failed";
  };
  fixture.paymentRepository.getPaymentPresentation = async () => {
    fixture.calls.presentation += 1;
    if (state !== "provider_ready") throw new CheckoutPaymentRepositoryError("unavailable");
    const ready = inputs.ready.at(-1)!;
    return { attemptId: ready.attemptId, storeId: STORE_ID, merchantOid: inputs.begin[0]!.merchantOid,
      providerTokenDigest: ready.providerTokenDigest, sealedProviderToken: ready.sealedProviderToken };
  };
  fixture.runtime.checkout.quickOrderRepository.getStatus = async () => {
    fixture.calls.status += 1;
    return state === "failed" ? { kind: "failed" as const } : { kind: "processing" as const };
  };
  return { ...fixture, inputs, operations, state: () => state };
}

test("checkout uses stable replay identities and globally unique phase operations", async () => {
  const fixture = sqlSemanticFixture();
  const selected = checkoutHandler(fixture);
  const first = await selected.handler(checkoutRequest());
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("location"), "/odeme/hizli/odeme");
  const replay = await selected.handler(checkoutRequest());
  assert.equal(replay.status, 303);
  assert.equal(replay.headers.get("location"), "/odeme/hizli/odeme");
  assert.equal(fixture.calls.provider, 1);
  assert.equal(fixture.inputs.begin.length, 2);
  for (const field of ["attemptId", "merchantOid", "operationId", "fingerprint"] as const) {
    assert.equal(fixture.inputs.begin[0]![field], fixture.inputs.begin[1]![field], field);
  }
  const begin = fixture.inputs.begin[0]!;
  const ready = fixture.inputs.ready[0]!;
  assert.notEqual(begin.operationId, OPERATION_ID);
  assert.notEqual(ready.operationId, OPERATION_ID);
  assert.notEqual(begin.operationId, ready.operationId);
  assert.notEqual(begin.fingerprint, ready.fingerprint);
  assert.equal(ready.attemptId, begin.attemptId);
  assert.match(begin.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(begin.merchantOid, /^[a-f0-9]{32}$/);
  assert.equal(fixture.operations.size, 2);
});

test("checkout derives distinct deterministic unknown and failed phase authorities", async () => {
  const unknown = sqlSemanticFixture();
  const rejected = sqlSemanticFixture();
  assert.equal((await checkoutHandler(unknown, "unknown").handler(checkoutRequest())).status, 202);
  assert.equal((await checkoutHandler(rejected, "rejected").handler(checkoutRequest())).status, 502);
  const unknownBegin = unknown.inputs.begin[0]!; const unknownFinal = unknown.inputs.unknown[0]!;
  const failedBegin = rejected.inputs.begin[0]!; const failedFinal = rejected.inputs.failed[0]!;
  assert.equal(unknownBegin.attemptId, failedBegin.attemptId);
  assert.equal(unknownBegin.merchantOid, failedBegin.merchantOid);
  assert.equal(unknownBegin.operationId, failedBegin.operationId);
  assert.notEqual(unknownFinal.operationId, unknownBegin.operationId);
  assert.notEqual(failedFinal.operationId, failedBegin.operationId);
  assert.notEqual(unknownFinal.operationId, failedFinal.operationId);
  assert.notEqual(unknownFinal.fingerprint, failedFinal.fingerprint);
});

test("checkout cancels an unannounced streamed form above 128 bytes before repository access", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls <= 2) controller.enqueue(new Uint8Array(100).fill(0x61));
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const selected = checkoutHandler();
  const request = new Request(`https://${HOSTNAME}/api/quick-order/checkout`, {
    method: "POST", duplex: "half", body,
    headers: { origin: `https://${HOSTNAME}`, "content-type": "application/x-www-form-urlencoded",
      cookie: `__Host-celebix_quick=${CREDENTIAL}`, "x-forwarded-for": "8.8.8.8" },
  } as RequestInit & { duplex: "half" });
  const response = await selected.handler(request);
  assert.equal(response.status, 400);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 2, `reader pulled ${pulls} chunks`);
  assert.equal(selected.fixture.calls.begin, 0);
  assert.equal(selected.fixture.calls.provider, 0);
});

test("checkout native form reserves once, calls PayTR once outside begin, seals readiness, and 303s same-origin", async () => {
  const selected = checkoutHandler();
  const response = await selected.handler(checkoutRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/odeme/hizli/odeme");
  assert.deepEqual(selected.fixture.calls, { begin: 1, ready: 1, unknown: 0, failed: 0, presentation: 0, provider: 1, status: 0 });
});

test("checkout rejects malformed authority, body, cookie and client IP before repository or provider access", async () => {
  const cases = [
    checkoutRequest("", { rawBody: null }), checkoutRequest(""), checkoutRequest(`operation_id=${OPERATION_ID}&extra=1`),
    checkoutRequest(`operation_id=${OPERATION_ID}&operation_id=${OPERATION_ID}`), checkoutRequest("operation_id=NOT-A-UUID"),
    checkoutRequest(undefined, { path: "/api/quick-order/checkout?x=1" }),
    checkoutRequest(undefined, { headers: { "content-type": "application/json" } }),
    checkoutRequest(undefined, { headers: { "content-type": "multipart/form-data; boundary=x" } }),
    checkoutRequest(undefined, { headers: { "transfer-encoding": "chunked" } }),
    checkoutRequest(undefined, { headers: { cookie: "bad=1" } }),
    checkoutRequest(undefined, { headers: { "x-forwarded-for": "127.0.0.1" } }),
    checkoutRequest(undefined, { headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" } }),
  ];
  for (const request of cases) {
    const selected = checkoutHandler();
    const response = await selected.handler(request);
    assert.ok(response.status === 400 || response.status === 404, `${request.url}: ${response.status}`);
    assert.equal(response.headers.has("location"), false);
    assert.equal(selected.fixture.calls.begin, 0);
    assert.equal(selected.fixture.calls.provider, 0);
  }
  const selected = paymentFixture();
  const denied = runtimeModule.createQuickOrderCheckoutRoute!({
    selectAuthority: () => ({ kind: "invalid_proxy_authority" }), resolveRuntime: async () => selected.runtime,
    initiate: async () => { selected.calls.provider += 1; return { status: "unknown" as const }; },
  });
  assert.equal((await denied(checkoutRequest(undefined, { headers: { "x-forwarded-for": "8.8.8.8" } }))).status, 404);
  assert.equal(selected.calls.begin, 0);
  assert.equal(selected.calls.provider, 0);
});

test("checkout replay, concurrent, unknown and duplicate merchant outcomes never re-initiate", async () => {
  for (const [status, expectedStatus, location] of [
    ["provider_ready", 303, "/odeme/hizli/odeme"], ["reserved", 202, null], ["initiation_unknown", 202, null],
  ] as const) {
    const selected = checkoutHandler(paymentFixture(status, "replayed"));
    const response = await selected.handler(checkoutRequest());
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("location"), location);
    assert.equal(selected.fixture.calls.provider, 0);
  }
  const duplicate = paymentFixture();
  duplicate.paymentRepository.beginAttempt = async () => { duplicate.calls.begin += 1; throw new CheckoutPaymentRepositoryError("attempt_in_progress"); };
  const selected = checkoutHandler(duplicate);
  const response = await selected.handler(checkoutRequest());
  assert.equal(response.status, 409);
  assert.equal(response.headers.has("location"), false);
  assert.equal(duplicate.calls.provider, 0);
});

test("checkout terminal conflict renders the persisted public state without re-initiation", async () => {
  const terminal = paymentFixture();
  terminal.paymentRepository.beginAttempt = async () => { terminal.calls.begin += 1; throw new CheckoutPaymentRepositoryError("invalid_transition"); };
  terminal.runtime.checkout.quickOrderRepository.getStatus = async () => { terminal.calls.status += 1; return { kind: "paid" as const, orderNumber: "CBX-2026-000001" }; };
  const selected = checkoutHandler(terminal);
  const response = await selected.handler(checkoutRequest());
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CBX-2026-000001/);
  assert.equal(terminal.calls.status, 1);
  assert.equal(terminal.calls.provider, 0);
});

test("checkout releases proven rejection and records ambiguous initiation without Location", async () => {
  const rejected = checkoutHandler(paymentFixture(), "rejected");
  const rejectedResponse = await rejected.handler(checkoutRequest());
  assert.equal(rejectedResponse.status, 502);
  assert.equal(rejectedResponse.headers.has("location"), false);
  assert.equal(rejected.fixture.calls.failed, 1);
  assert.equal(rejected.fixture.calls.unknown, 0);
  const unknown = checkoutHandler(paymentFixture(), "unknown");
  const unknownResponse = await unknown.handler(checkoutRequest());
  assert.equal(unknownResponse.status, 202);
  assert.equal(unknownResponse.headers.has("location"), false);
  assert.equal(unknown.fixture.calls.unknown, 1);
  assert.equal(unknown.fixture.calls.failed, 0);
});

test("checkout withholds Location when persisted provider readiness does not match the attempt", async () => {
  const mismatch = paymentFixture();
  mismatch.paymentRepository.markProviderReady = async (input) => {
    mismatch.calls.ready += 1;
    return { attemptId: "55555555-5555-4555-8555-555555555555", status: "provider_ready" as const, replayed: false,
      providerTokenDigest: "a".repeat(64), sealedProviderToken: input.sealedProviderToken };
  };
  const selected = checkoutHandler(mismatch);
  const response = await selected.handler(checkoutRequest());
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("location"), false);
  assert.equal(mismatch.calls.provider, 1);
});

test("iframe route opens the current sealed token server-side into one inert, non-RSC document", async () => {
  const fixture = paymentFixture("provider_ready");
  assert.equal(typeof runtimeModule.createQuickOrderIframeRoute, "function");
  const handler = runtimeModule.createQuickOrderIframeRoute!({
    selectAuthority: () => ({ kind: "trusted" as const, hostname: HOSTNAME }),
    resolveRuntime: async () => fixture.runtime,
    now: () => new Date("2026-07-21T12:00:00.000Z"),
  });
  const response = await handler(new Request(`https://${HOSTNAME}/odeme/hizli/odeme`, { headers: { cookie: `__Host-celebix_quick=${CREDENTIAL}` } }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.has("content-security-policy"), false);
  assert.equal(response.headers.has("location"), false);
  assert.match(body, new RegExp(`src="https://www[.]paytr[.]com/odeme/guvenli/${fixture.providerToken}"`));
  assert.match(body, /width="100%" height="720" scrolling="yes" frameborder="0" title="PayTR güvenli ödeme"/);
  assert.doesNotMatch(body, /<script|<style|style=|__next|self.__next_f|application\/json|sealed|merchant_oid/i);
  assert.equal(body.split(fixture.providerToken).length - 1, 1);
  assert.equal(fixture.calls.presentation, 1);
  assert.equal(openQuickLinkSecret({ envelope: (await fixture.paymentRepository.getPaymentPresentation({ hostname: HOSTNAME,
    redemptionDigest: digestRedemptionCredential(CREDENTIAL), now: new Date("2026-07-21T12:00:00.000Z") })).sealedProviderToken,
    purpose: "provider-token", storeId: STORE_ID, objectId: ATTEMPT_ID,
    digest: createHash("sha256").update(fixture.providerToken).digest("hex"), keyring }), fixture.providerToken);
});

test("iframe route denies near-match/query/missing cookie without token or presentation access", async () => {
  for (const path of ["/odeme/hizli/odeme/", "/odeme/hizli/odeme?x=1", "/odeme/hizli/ODeme"]) {
    const fixture = paymentFixture();
    const handler = runtimeModule.createQuickOrderIframeRoute!({ selectAuthority: () => ({ kind: "trusted" as const, hostname: HOSTNAME }), resolveRuntime: async () => fixture.runtime });
    const response = await handler(new Request(`https://${HOSTNAME}${path}`, { headers: { cookie: `__Host-celebix_quick=${CREDENTIAL}` } }));
    assert.equal(response.status, 404);
    assert.equal((await response.text()).includes(fixture.providerToken), false);
    assert.equal(fixture.calls.presentation, 0);
  }
  assert.equal(digestRedemptionCredential(CREDENTIAL).length, 64);
});
