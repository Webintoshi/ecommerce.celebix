import assert from "node:assert/strict";
import { test } from "node:test";

// A removed sender must fail an assertion, rather than hiding behind a skipped test.
const module = await import("./email.ts").catch(() => null);
const createSender = module?.createCustomerEngagementEmailSender;
const parseConfig = module?.parseCustomerEngagementEmailConfig;
const ID = "00000000-0000-4000-8000-000000000001";
const message = { to: "customer@example.com", fromLabel: "Örnek mağaza", subject: "Ürün yeniden stokta", html: "<p>Ürün hazır.</p>", text: "Ürün hazır." };
const config = { apiKey: "re_test_12345678901234567890", from: "noreply@noreply.celebix.net" };

test("engagement email exposes a working sender and platform credential parser", () => {
  assert.equal(typeof createSender, "function");
  assert.equal(typeof parseConfig, "function");
});

test("stock and review email use configured verified sender with stable event keys", async () => {
  assert.equal(typeof createSender, "function");
  const requests: Request[] = [];
  const send = createSender!({ ...config, fetch: async (request: Request) => { requests.push(request); return Response.json({ id: "provider-1" }); }, timeoutMs: 500 });
  for (const key of [`review-request/v1/${ID}`, `restock-confirmation/v1/${ID}`, `restock-stock/v1/${ID}`]) {
    assert.deepEqual(await send(message, key), { kind: "accepted", providerMessageId: "provider-1" });
    const request = requests.at(-1)!;
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.headers.get("idempotency-key"), key);
    assert.deepEqual(await request.json(), { from: "Örnek mağaza <noreply@noreply.celebix.net>", to: "customer@example.com", subject: message.subject, html: message.html, text: message.text });
  }
});

test("retry repeats the exact request body and key after a lost provider response", async () => {
  assert.equal(typeof createSender, "function");
  const bodies: string[] = [], keys: string[] = [];
  const send = createSender!({ ...config, fetch: async (request: Request) => { bodies.push(await request.text()); keys.push(request.headers.get("idempotency-key")!); if (bodies.length === 1) throw Error("connection_lost"); return Response.json({ id: "provider-2" }); }, timeoutMs: 500 });
  const key = `review-request/v1/${ID}`;
  assert.deepEqual(await send(message, key), { kind: "retryable", code: "provider_unavailable" });
  assert.deepEqual(await send(message, key), { kind: "accepted", providerMessageId: "provider-2" });
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(keys, [key, key]);
});

test("transport classifies throttling, concurrent sends, configuration and payload conflicts", async () => {
  assert.equal(typeof createSender, "function");
  const cases = [
    [429, {}, { kind: "retryable", code: "provider_rate_limited" }],
    [503, {}, { kind: "retryable", code: "provider_unavailable" }],
    [409, { name: "concurrent_idempotent_requests" }, { kind: "retryable", code: "provider_request_concurrent" }],
    [409, { name: "invalid_idempotent_request" }, { kind: "permanent", code: "idempotency_payload_conflict" }],
    [403, {}, { kind: "permanent", code: "provider_configuration_invalid" }],
    [422, {}, { kind: "permanent", code: "request_invalid" }],
  ] as const;
  for (const [status, body, expected] of cases) {
    const send = createSender!({ ...config, fetch: async () => Response.json(body, { status }), timeoutMs: 500 });
    assert.deepEqual(await send(message, `review-request/v1/${ID}`), expected);
  }
});

test("transport rejects header injection and unrelated idempotency namespaces before sending", async () => {
  assert.equal(typeof createSender, "function");
  let calls = 0;
  const send = createSender!({ ...config, fetch: async () => { calls++; return Response.json({ id: "unexpected" }); }, timeoutMs: 500 });
  const bad = [{ ...message, to: "a@example.com\r\nBcc: b@example.com" }, { ...message, fromLabel: "x\nBcc: y" }, { ...message, subject: "x\r\ny" }, { ...message, replyTo: "not-an-email" }];
  for (const selected of bad) await assert.rejects(() => send(selected, `review-request/v1/${ID}`), /engagement_email_invalid/);
  await assert.rejects(() => send(message, `order-email/v1/${ID}`), /engagement_email_invalid/);
  assert.equal(calls, 0);
});

test("unsafe sender labels fall back to platform sender without changing destination", async () => {
  assert.equal(typeof createSender, "function");
  let body: Record<string, unknown> | undefined;
  const send = createSender!({ ...config, fetch: async (request: Request) => { body = await request.json(); return Response.json({ id: "provider-3" }); }, timeoutMs: 500 });
  await send({ ...message, fromLabel: "Mağaza <spoof@example.com>" }, `restock-stock/v1/${ID}`);
  assert.equal(body!.from, config.from);
  assert.equal(body!.to, message.to);
});

test("oversized or malformed provider responses are bounded and never marked sent", async () => {
  assert.equal(typeof createSender, "function");
  for (const response of [new Response("x".repeat(20_000)), Response.json({}), new Response("not json")]) {
    const send = createSender!({ ...config, fetch: async () => response, timeoutMs: 500 });
    assert.deepEqual(await send(message, `restock-stock/v1/${ID}`), { kind: "retryable", code: "provider_response_invalid" });
  }
});

test("unconfigured transport is disabled and malformed partial credentials fail closed", () => {
  assert.equal(typeof parseConfig, "function");
  assert.equal(parseConfig!({}), null);
  assert.deepEqual(parseConfig!({ CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE: "platform_resend", CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM: config.from, CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY: config.apiKey }), config);
  assert.throws(() => parseConfig!({ CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE: "platform_resend" }), /engagement_email_config_invalid/);
  assert.throws(() => parseConfig!({ CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE: "platform_resend", CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM: "spoof@unverified.example", CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY: config.apiKey }), /engagement_email_config_invalid/);
});
