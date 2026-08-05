import assert from "node:assert/strict";
import test from "node:test";

import type { OrderEmailProviderRequest } from "./seal.ts";
import { retryDelayMs, sendOrderEmail } from "./resend.ts";

const DELIVERY = "11111111-1111-4111-8111-111111111111";
const request: OrderEmailProviderRequest = Object.freeze({
  from: "Güzide Kuyumcu <siparis@notify.celebix.co>", to: "ada@example.test",
  replyTo: "destek@example.test", subject: "Siparişinizi aldık · GK-1042",
  html: "<p>Siparişinizi aldık.</p>", text: "Siparişinizi aldık.",
});

function options(fetchImpl: typeof fetch) {
  return { apiKey: "re_order_email_test_authority", idempotencyKey: `order-email/v1/${DELIVERY}`, timeoutMs: 1_000, fetch: fetchImpl } as const;
}

test("Resend adapter sends one exact idempotent request and accepts only a bounded id", async () => {
  let captured: { input?: URL | RequestInfo; init?: RequestInit } = {};
  const result = await sendOrderEmail(request, options(async (input, init) => {
    captured = { input, init };
    return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  assert.deepEqual(result, { kind: "accepted", providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  assert.equal(captured.input, "https://api.resend.com/emails");
  assert.equal(new Headers(captured.init?.headers).get("authorization"), "Bearer re_order_email_test_authority");
  assert.equal(new Headers(captured.init?.headers).get("idempotency-key"), `order-email/v1/${DELIVERY}`);
  assert.deepEqual(JSON.parse(String(captured.init?.body)), {
    from: request.from, to: [request.to], reply_to: request.replyTo,
    subject: request.subject, html: request.html, text: request.text,
  });
});

test("Resend errors use a finite retry classification without exposing provider text", async () => {
  const cases = [
    [429, "rate_limit_exceeded", { kind: "retryable", code: "provider_rate_limited" }],
    [500, "application_error", { kind: "retryable", code: "provider_unavailable" }],
    [409, "concurrent_idempotent_requests", { kind: "retryable", code: "provider_request_concurrent" }],
    [409, "invalid_idempotent_request", { kind: "permanent", code: "idempotency_payload_conflict" }],
    [403, "validation_error", { kind: "permanent", code: "provider_configuration_invalid" }],
    [422, "invalid_parameter", { kind: "permanent", code: "request_invalid" }],
  ] as const;
  for (const [status, name, expected] of cases) {
    const selected = await sendOrderEmail(request, options(async () => new Response(
      JSON.stringify({ name, message: "SECRET provider diagnostic must never escape" }),
      { status, headers: { "content-type": "application/json" } },
    )));
    assert.deepEqual(selected, expected);
    assert.doesNotMatch(JSON.stringify(selected), /SECRET|diagnostic/u);
  }
});

test("network timeout, transport failure, and malformed or oversized success stay safely retryable", async () => {
  const timeout = await sendOrderEmail(request, { ...options(async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })), timeoutMs: 5 });
  assert.deepEqual(timeout, { kind: "retryable", code: "provider_timeout" });

  const network = await sendOrderEmail(request, options(async () => { throw new Error("private transport text"); }));
  assert.deepEqual(network, { kind: "retryable", code: "provider_network_error" });

  const malformed = await sendOrderEmail(request, options(async () => new Response("{}", { status: 200 })));
  assert.deepEqual(malformed, { kind: "retryable", code: "provider_response_invalid" });
  const oversized = await sendOrderEmail(request, options(async () => new Response("x".repeat(17_000), { status: 200 })));
  assert.deepEqual(oversized, { kind: "retryable", code: "provider_response_invalid" });
});

test("retry schedule is exact and rejects attempts outside one through seven", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((attempt) => retryDelayMs(attempt as 1 | 2 | 3 | 4 | 5 | 6 | 7)), [30_000, 120_000, 600_000, 3_600_000, 10_800_000, 21_600_000, 43_200_000]);
  assert.throws(() => retryDelayMs(8 as 7), /order_email_resend_invalid/u);
});

