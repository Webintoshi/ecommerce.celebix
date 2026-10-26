import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createPlatformIyzicoGateway } from "./iyzico.ts";

const ATTEMPT = "c66a2e06-3157-43e6-9f6c-fb57c30be94e";
const ORDER = "bac47ad6-6bbb-4e43-8e94-5f801d751faa";
const TOKEN = "d00b47f6-627a-43ac-aeb7-e4373d82b67a";
const OTHER_TOKEN = "5fcf6356-1a20-4d31-b7c4-41eeb2fbfe87";
const CONFIG = {
  mode: "test" as const,
  apiKey: "sandbox-test-key",
  secretKey: "only-a-test-secret",
  callbackOrigin: "https://celebix.net",
};
const INIT = {
  attemptId: ATTEMPT,
  orderId: ORDER,
  description: "Celebix araç lisansı",
  totalCents: 125050,
  buyer: {
    id: "platform-buyer-123",
    name: "Ayşe",
    surname: "Yılmaz",
    identityNumber: "74300864791",
    email: "buyer@example.test",
    gsmNumber: "+905551112233",
    registrationAddress: "Örnek Mahallesi No 42",
    city: "Istanbul",
    country: "Turkey",
  },
  ip: "203.0.113.25",
  callbackUrl: "https://celebix.net/api/platform-commerce/iyzico/callback/opaque-binding",
};
const QUERY = { attemptId: ATTEMPT, orderId: ORDER, totalCents: 125050, token: TOKEN };

function signature(message: string): string {
  return createHmac("sha256", CONFIG.secretKey).update(message).digest("hex");
}

function initialized(overrides: Record<string, unknown> = {}) {
  return {
    status: "success", locale: "tr", conversationId: ATTEMPT,
    token: TOKEN, tokenExpireTime: 1800,
    paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`,
    signature: signature(`${ATTEMPT}:${TOKEN}`),
    ...overrides,
  };
}

function retrieved(overrides: Record<string, unknown> = {}) {
  const response: Record<string, unknown> = {
    status: "success", conversationId: ATTEMPT, basketId: ORDER,
    price: "1250.50000000", paidPrice: "1250.50", currency: "TRY",
    token: TOKEN, paymentId: "25760123", paymentStatus: "SUCCESS", fraudStatus: 1,
    itemTransactions: [{
      itemId: ORDER, paymentTransactionId: "28120001", price: "1250.5",
      paidPrice: "1250.50000000", transactionStatus: 2,
    }],
    ...overrides,
  };
  response.signature = signature([
    response.paymentStatus, response.paymentId, response.currency, response.basketId,
    response.conversationId, normalize(response.paidPrice), normalize(response.price), response.token,
  ].join(":"));
  return response;
}

function normalize(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : value;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function responseGateway(response: Response) {
  return createPlatformIyzicoGateway(CONFIG, async () => response);
}

test("initialization signs exact outgoing bytes and charges one virtual platform line", async () => {
  let called = 0;
  const gateway = createPlatformIyzicoGateway(CONFIG, async (url, options) => {
    called += 1;
    assert.equal(String(url), "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.credentials, "omit");
    const bodyText = String(options?.body);
    const body = JSON.parse(bodyText);
    assert.equal(body.price, "1250.50");
    assert.equal(body.paidPrice, "1250.50");
    assert.equal(body.currency, "TRY");
    assert.equal(body.conversationId, ATTEMPT);
    assert.equal(body.basketId, ORDER);
    assert.equal(body.buyer.id, INIT.buyer.id);
    assert.equal(body.buyer.identityNumber, INIT.buyer.identityNumber);
    assert.equal(body.buyer.ip, INIT.ip);
    assert.equal(body.shippingAddress, undefined);
    assert.deepEqual(body.billingAddress, {
      address: INIT.buyer.registrationAddress, contactName: "Ayşe Yılmaz", city: "Istanbul", country: "Turkey",
    });
    assert.deepEqual(body.basketItems, [{ id: ORDER, name: INIT.description, price: "1250.50", category1: "Software", itemType: "VIRTUAL" }]);
    assert.deepEqual(body.enabledInstallments, [1]);
    const headers = new Headers(options?.headers);
    const authorization = headers.get("authorization")!;
    assert.match(authorization, /^IYZWSv2 /);
    const decoded = Buffer.from(authorization.slice(8), "base64").toString("utf8");
    const values = Object.fromEntries(decoded.split("&").map((entry) => [entry.slice(0, entry.indexOf(":")), entry.slice(entry.indexOf(":") + 1)]));
    assert.equal(values.apiKey, CONFIG.apiKey);
    assert.equal(values.randomKey, headers.get("x-iyzi-rnd"));
    assert.equal(values.signature, signature(`${values.randomKey}/payment/iyzipos/checkoutform/initialize/auth/ecom${bodyText}`));
    return json(initialized());
  });
  const before = Date.now();
  const result = await gateway.initialize(INIT);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.token, TOKEN);
  assert.equal(result.paymentPageUrl, `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr`);
  assert.ok(Date.parse(result.expiresAt) >= before + 1_799_000);
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + 1_800_000);
  assert.equal(called, 1);
});

test("live mode derives the production host and accepts only its checkout origin", async () => {
  const gateway = createPlatformIyzicoGateway({ ...CONFIG, mode: "live" }, async (url) => {
    assert.equal(String(url), "https://api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom");
    return json(initialized({ paymentPageUrl: `https://cpp.iyzipay.com/?token=${TOKEN}&lang=tr` }));
  });
  assert.equal((await gateway.initialize(INIT)).status, "ready");
  const wrong = createPlatformIyzicoGateway({ ...CONFIG, mode: "live" }, async () => json(initialized()));
  assert.equal((await wrong.initialize(INIT)).status, "unknown");
});

test("config prevents arbitrary origins, provider hosts, and live localhost callbacks", () => {
  for (const override of [
    { callbackOrigin: "https://evil.test" }, { callbackOrigin: "https://celebix.net.evil.test" },
    { callbackOrigin: "http://celebix.net" }, { callbackOrigin: "https://celebix.net:444" },
    { callbackOrigin: "https://celebix.net/path" }, { apiHost: "https://evil.test" },
    { mode: "bogus" }, { apiKey: "" }, { secretKey: "" },
    { mode: "live", callbackOrigin: "http://localhost:3100", allowLocalhostForTests: true },
  ]) {
    assert.throws(() => createPlatformIyzicoGateway({ ...CONFIG, ...override } as never), /platform_iyzico_config_invalid/);
  }
});

test("explicit test configuration permits a localhost return without changing provider host", async () => {
  const gateway = createPlatformIyzicoGateway({ ...CONFIG, callbackOrigin: "http://localhost:3100", allowLocalhostForTests: true }, async (url) => {
    assert.ok(String(url).startsWith("https://sandbox-api.iyzipay.com/"));
    return json(initialized());
  });
  assert.equal((await gateway.initialize({ ...INIT, callbackUrl: "http://localhost:3100/api/platform-commerce/iyzico/callback/binding" })).status, "ready");
});

test("invalid buyer identity, totals, IP and callback are rejected before any request", async () => {
  let called = 0;
  const gateway = createPlatformIyzicoGateway(CONFIG, async () => { called += 1; return json(initialized()); });
  for (const input of [
    { ...INIT, totalCents: 0 }, { ...INIT, totalCents: 12.5 },
    { ...INIT, buyer: { ...INIT.buyer, identityNumber: "" } },
    { ...INIT, buyer: { ...INIT.buyer, identityNumber: "11111111111" } },
    { ...INIT, buyer: { ...INIT.buyer, identityNumber: "12345678901" } },
    { ...INIT, buyer: { ...INIT.buyer, city: "" } },
    { ...INIT, buyer: { ...INIT.buyer, surname: "" } },
    { ...INIT, buyer: { ...INIT.buyer, email: "no-address" } },
    { ...INIT, ip: "x-forwarded-for:127.0.0.1" },
    { ...INIT, callbackUrl: "https://celebix.net.evil.test/api/callback" },
    { ...INIT, callbackUrl: "https://attacker@celebix.net/api/callback" },
  ]) assert.equal((await gateway.initialize(input)).status, "failed");
  assert.equal(called, 0);
});

test("init accepts only a signed token and an allowlisted checkout URL", async () => {
  for (const override of [
    { signature: "0".repeat(64) }, { conversationId: "other" },
    { token: OTHER_TOKEN }, { tokenExpireTime: -1 }, { tokenExpireTime: "1800" },
    { paymentPageUrl: `https://sandbox-cpp.iyzipay.com.evil.test/?token=${TOKEN}&lang=tr` },
    { paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${OTHER_TOKEN}&lang=tr` },
    { paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&token=${TOKEN}&lang=tr` },
    { paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr&redirect=https://evil.test` },
    { paymentPageUrl: `http://sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr` },
    { paymentPageUrl: `https://user@sandbox-cpp.iyzipay.com/?token=${TOKEN}&lang=tr` },
    { paymentPageUrl: `https://sandbox-cpp.iyzipay.com/wrong?token=${TOKEN}&lang=tr` },
  ]) assert.equal((await responseGateway(json(initialized(override))).initialize(INIT)).status, "unknown", JSON.stringify(override));
});

test("retrieval validates the signed result and retains settlement line identifiers", async () => {
  const gateway = createPlatformIyzicoGateway(CONFIG, async (url, options) => {
    assert.equal(String(url), "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail");
    assert.deepEqual(JSON.parse(String(options?.body)), { locale: "tr", conversationId: ATTEMPT, token: TOKEN });
    return json(retrieved());
  });
  const result = await gateway.retrieve(QUERY);
  assert.equal(result.status, "payment");
  if (result.status !== "payment") return;
  assert.equal(result.paymentStatus, "approved");
  assert.equal(result.paymentId, "25760123");
  assert.equal(result.token, TOKEN);
  assert.deepEqual(result.itemTransactions, [{ itemId: ORDER, paymentTransactionId: "28120001", priceCents: 125050, paidPriceCents: 125050 }]);
});

test("fraud review remains pending and a signed fraud rejection never approves", async () => {
  const pending = await responseGateway(json(retrieved({ fraudStatus: 0, itemTransactions: [{ itemId: ORDER, paymentTransactionId: "28120001", price: "1250.5", paidPrice: "1250.5", transactionStatus: 0 }] }))).retrieve(QUERY);
  assert.equal(pending.status, "payment");
  if (pending.status === "payment") assert.equal(pending.paymentStatus, "pending");
  const rejected = await responseGateway(json(retrieved({ fraudStatus: -1, paymentStatus: "FAILURE", itemTransactions: [{ itemId: ORDER, paymentTransactionId: "28120001", price: "1250.5", paidPrice: "1250.5", transactionStatus: -1 }] }))).retrieve(QUERY);
  assert.deepEqual(rejected, { status: "failed", code: "provider_rejected" });
});

test("signed financial and order mismatches remain unknown", async () => {
  for (const override of [
    { price: "1250.51" }, { paidPrice: "1250.49" }, { price: "1250.50000001" },
    { currency: "USD" }, { conversationId: "other" }, { basketId: "other" },
    { token: OTHER_TOKEN }, { fraudStatus: 2 }, { fraudStatus: "1" },
    { paymentStatus: "FAILURE", fraudStatus: 1 }, { paymentId: "" },
  ]) assert.equal((await responseGateway(json(retrieved(override))).retrieve(QUERY)).status, "unknown", JSON.stringify(override));
  assert.equal((await responseGateway(json({ ...retrieved(), signature: "0".repeat(64) })).retrieve(QUERY)).status, "unknown");
});

test("missing, duplicate, foreign and inconsistent transaction mappings never settle", async () => {
  const line = { itemId: ORDER, paymentTransactionId: "28120001", price: "1250.5", paidPrice: "1250.5", transactionStatus: 2 };
  for (const itemTransactions of [
    undefined, [], [line, line], [{ ...line, itemId: "other-order" }],
    [{ ...line, paymentTransactionId: "" }], [{ ...line, paidPrice: "1250.49" }],
    [{ ...line, price: "1250.51" }], [{ ...line, transactionStatus: 0 }],
  ]) assert.equal((await responseGateway(json(retrieved({ itemTransactions }))).retrieve(QUERY)).status, "unknown");
});

test("malformed provider responses and duplicate JSON keys cannot become payments", async () => {
  for (const response of [
    new Response("not-json", { headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify(retrieved()), { headers: { "content-type": "text/html" } }),
    new Response(JSON.stringify(retrieved()).replace('"fraudStatus":1', '"fraudStatus":-1,"fraudStatus":1'), { headers: { "content-type": "application/json" } }),
    json(retrieved(), 503), json(retrieved(), 302),
    json({ status: "failure", errorCode: "1001", errorMessage: "secret-key-is-private" }),
  ]) {
    const result = await responseGateway(response).retrieve(QUERY);
    assert.equal(result.status, "unknown");
    assert.ok(!JSON.stringify(result).includes("secret-key-is-private"));
  }
});

test("initialization never retries on timeouts, network errors or server failures", async () => {
  for (const behavior of ["timeout", "network", "server"] as const) {
    let calls = 0;
    const gateway = createPlatformIyzicoGateway({ ...CONFIG, timeoutMs: 20 }, async () => {
      calls += 1;
      if (behavior === "timeout") return await new Promise<Response>(() => {});
      if (behavior === "network") throw new Error("private credentials and request body");
      return json(initialized(), 503);
    });
    const start = Date.now();
    assert.deepEqual(await gateway.initialize(INIT), { status: "unknown", code: "provider_unavailable" });
    assert.equal(calls, 1);
    assert.ok(Date.now() - start < 1000);
  }
});

test("response reading has a byte cap and a whole-operation timeout", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const slow = createPlatformIyzicoGateway({ ...CONFIG, timeoutMs: 20 }, async () => new Response(body, { headers: { "content-type": "application/json" } }));
  assert.equal((await slow.retrieve(QUERY)).status, "unknown");
  assert.equal(cancelled, true);
  const large = createPlatformIyzicoGateway({ ...CONFIG, maxResponseBytes: 512 }, async () => json({ ...retrieved(), oversized: "x".repeat(3000) }));
  assert.equal((await large.retrieve(QUERY)).status, "unknown");
});

test("an explicit init rejection is sanitized and invalid retrieve input makes no call", async () => {
  const init = await responseGateway(json({ status: "failure", errorCode: "1", errorMessage: CONFIG.secretKey })).initialize(INIT);
  assert.deepEqual(init, { status: "failed", code: "provider_rejected" });
  let calls = 0;
  const gateway = createPlatformIyzicoGateway(CONFIG, async () => { calls += 1; return json(retrieved()); });
  assert.deepEqual(await gateway.retrieve({ ...QUERY, token: "invalid" }), { status: "failed", code: "invalid_request" });
  assert.equal(calls, 0);
});
