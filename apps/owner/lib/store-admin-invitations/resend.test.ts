import assert from "node:assert/strict";
import test from "node:test";

import type { InvitationEmailRequest } from "./email.ts";
import { sendInvitationEmail } from "./resend.ts";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = `store-admin-invitation/v1/${INVITATION_ID}/2`;
const request: InvitationEmailRequest = Object.freeze({
  from: "davet@notify.celebix.co",
  to: "pilot+admin@example.com",
  subject: "Mağaza yönetim daveti",
  html: "<p>Davet metni</p>\n<p>Satır iki</p>",
  text: "Davet metni\nSatır iki",
});

function options(fetchImpl: typeof fetch, timeoutMs = 1_000) {
  return {
    apiKey: "re_invitation_test_authority",
    idempotencyKey: IDEMPOTENCY_KEY,
    timeoutMs,
    fetch: fetchImpl,
  } as const;
}

test("posts one exact fixed Resend request and reports provider acceptance only", async () => {
  let captured: { input?: URL | RequestInfo; init?: RequestInit } = {};
  const result = await sendInvitationEmail(request, options(async (input, init) => {
    captured = { input, init };
    return new Response('{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}', { status: 202 });
  }));

  assert.deepEqual(result, { kind: "accepted", providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  assert.deepEqual(Object.keys(result).sort(), ["kind", "providerMessageId"]);
  assert.equal(captured.input, "https://api.resend.com/emails");
  assert.equal(captured.init?.method, "POST");
  assert.equal(captured.init?.redirect, "error");
  assert.ok(captured.init?.signal instanceof AbortSignal);
  const headers = new Headers(captured.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer re_invitation_test_authority");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.deepEqual(JSON.parse(String(captured.init?.body)), {
    from: "davet@notify.celebix.co",
    to: ["pilot+admin@example.com"],
    subject: "Mağaza yönetim daveti",
    html: "<p>Davet metni</p>\n<p>Satır iki</p>",
    text: "Davet metni\nSatır iki",
  });
});

test("repeated calls preserve the exact generation-bound key and rendered body without internal retries", async () => {
  const calls: Array<{ input: URL | RequestInfo; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response('{"id":"provider-id"}', { status: 200 });
  };

  await sendInvitationEmail(request, options(fetchImpl));
  await sendInvitationEmail(request, options(fetchImpl));

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.init?.body, calls[1]?.init?.body);
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), IDEMPOTENCY_KEY);
  assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), IDEMPOTENCY_KEY);
});

test("malformed request and options make zero provider requests and expose only a constant error", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response('{"id":"must-not-send"}', { status: 200 });
  };
  const invalidRequests: unknown[] = [
    { ...request, extra: "attachment" },
    { ...request, from: "Celebix <davet@notify.celebix.co>" },
    { ...request, to: "Pilot+Admin@example.com" },
    { ...request, subject: "x".repeat(251) },
    { ...request, html: "<p>bad\rbody</p>" },
    { ...request, text: "bad\tbody" },
    Object.assign(Object.create({}), request),
  ];
  const symbolic = { ...request } as InvitationEmailRequest & { [key: symbol]: string };
  symbolic[Symbol("attachment")] = "private";
  invalidRequests.push(symbolic);

  for (const candidate of invalidRequests) {
    await assert.rejects(
      sendInvitationEmail(candidate as InvitationEmailRequest, options(fetchImpl)),
      (error: unknown) => error instanceof Error && error.message === "store_admin_invitation_resend_invalid",
    );
  }

  let getterCalled = false;
  const accessorRequest = Object.create(null, Object.fromEntries(Object.entries(request).map(([key, value]) => [
    key,
    key === "to"
      ? { enumerable: true, get: () => { getterCalled = true; return value; } }
      : { enumerable: true, value },
  ])));
  await assert.rejects(sendInvitationEmail(accessorRequest, options(fetchImpl)), /store_admin_invitation_resend_invalid/u);
  assert.equal(getterCalled, false);

  const invalidOptions: unknown[] = [
    { ...options(fetchImpl), apiKey: "re_short" },
    { ...options(fetchImpl), idempotencyKey: `store-admin-invitation/v1/${INVITATION_ID}/0` },
    { ...options(fetchImpl), idempotencyKey: `store-admin-invitation/v1/${INVITATION_ID}/02` },
    { ...options(fetchImpl), idempotencyKey: "store-admin-invitation/v1/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/2" },
    { ...options(fetchImpl), idempotencyKey: `store-admin-invitation/v1/${INVITATION_ID}/${Number.MAX_SAFE_INTEGER + 1}` },
    { ...options(fetchImpl), timeoutMs: 0 },
    { ...options(fetchImpl), timeoutMs: 30_001 },
    { ...options(fetchImpl), endpoint: "https://evil.example/emails" },
  ];
  for (const candidate of invalidOptions) {
    await assert.rejects(
      sendInvitationEmail(request, candidate as ReturnType<typeof options>),
      (error: unknown) => error instanceof Error && error.message === "store_admin_invitation_resend_invalid",
    );
  }
  assert.equal(calls, 0);
});

test("provider statuses use finite constant classifications without leaking bodies or thrown errors", async () => {
  const cases = [
    [401, { name: "validation_error", message: "SECRET api key detail" }, { kind: "permanent", code: "provider_configuration_invalid" }],
    [403, { message: "SECRET permission detail" }, { kind: "permanent", code: "provider_configuration_invalid" }],
    [429, { name: "rate_limit_exceeded" }, { kind: "retryable", code: "provider_rate_limited" }],
    [500, { name: "application_error" }, { kind: "retryable", code: "provider_unavailable" }],
    [503, { name: "application_error" }, { kind: "retryable", code: "provider_unavailable" }],
    [409, { name: "concurrent_idempotent_requests" }, { kind: "retryable", code: "provider_request_concurrent" }],
    [409, { code: "invalid_idempotent_request" }, { kind: "permanent", code: "idempotency_payload_conflict" }],
    [409, { name: "conflict" }, { kind: "permanent", code: "provider_conflict" }],
    [422, { name: "invalid_parameter" }, { kind: "permanent", code: "request_invalid" }],
  ] as const;

  for (const [status, body, expected] of cases) {
    const result = await sendInvitationEmail(request, options(async () => new Response(JSON.stringify(body), { status })));
    assert.deepEqual(result, expected);
    assert.doesNotMatch(JSON.stringify(result), /SECRET|permission|api key/u);
  }

  const network = await sendInvitationEmail(request, options(async () => {
    throw new Error("SECRET private network diagnostic");
  }));
  assert.deepEqual(network, { kind: "retryable", code: "provider_network_error" });
  assert.doesNotMatch(JSON.stringify(network), /SECRET|diagnostic/u);
});

test("malformed UTF-8, JSON, ids, and oversized responses are retryable and never accepted", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => new Response(new Uint8Array([0xc3, 0x28]), { status: 200 }),
    async () => new Response("not-json", { status: 200 }),
    async () => new Response("{}", { status: 200 }),
    async () => new Response('{"id":"","extra":true}', { status: 200 }),
    async () => new Response('{"id":"provider-id","extra":true}', { status: 200 }),
    async () => new Response(`{"id":"${"x".repeat(257)}"}`, { status: 200 }),
    async () => new Response("x".repeat(16_385), { status: 200 }),
    async () => new Response("not-json", { status: 403 }),
  ];

  for (const fetchImpl of cases) {
    assert.deepEqual(
      await sendInvitationEmail(request, options(fetchImpl)),
      { kind: "retryable", code: "provider_response_invalid" },
    );
  }
});

test("timeout spans response headers and an indefinitely stalled body", async () => {
  const headersTimeout = await sendInvitationEmail(request, options(async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("SECRET aborted detail", "AbortError")), { once: true });
  }), 5));
  assert.deepEqual(headersTimeout, { kind: "retryable", code: "provider_timeout" });

  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const bodyTimeout = await Promise.race([
    sendInvitationEmail(request, options(async () => new Response(stalled, { status: 200 }), 5)),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("adapter body timeout hung")), 200)),
  ]);
  assert.deepEqual(bodyTimeout, { kind: "retryable", code: "provider_timeout" });
  assert.equal(cancelled, true);
});

test("response overflow cancels without awaiting an untrusted cancellation promise", async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(16_385));
    },
    cancel() {
      cancelled = true;
      return new Promise<void>(() => undefined);
    },
  });

  const result = await Promise.race([
    sendInvitationEmail(request, options(async () => new Response(oversized, { status: 200 }))),
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("adapter awaited cancellation")), 200)),
  ]);
  assert.deepEqual(result, { kind: "retryable", code: "provider_response_invalid" });
  assert.equal(cancelled, true);
});
