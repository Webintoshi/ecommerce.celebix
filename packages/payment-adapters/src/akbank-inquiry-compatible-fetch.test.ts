import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createAkbankInquiryCompatibleFetch } from "./akbank-inquiry-compatible-fetch.ts";
import { validateAkbankCredentialWithTransport } from "./providers/akbank/adapter.ts";
import { AKBANK_JSON_PACKET } from "./providers/akbank/packet.ts";
import { createBoundedProviderTransport } from "./transport.ts";

const encoder = new TextEncoder();
const credential = Object.freeze({
  merchantSafeId: "1".repeat(32),
  terminalSafeId: "2".repeat(32),
  secretKey: "synthetic-akbank-compat-fixture-only",
});
const reference = "11111111-1111-4111-8111-111111111111";
const options = Object.freeze({
  now: () => new Date("2026-10-26T09:30:00.000Z"),
  randomBytes: (size: number) => new Uint8Array(size).fill(0xaa),
});
const body = encoder.encode(JSON.stringify({
  txnCode: "1010",
  responseCode: "VPS-1123",
  terminal: { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId },
  txnDetailList: [],
}));
const signature = createHmac("sha512", credential.secretKey).update(body).digest("base64");

function signedResponse(): Response {
  return new Response(body.slice(), { headers: {
    "content-type": "application/json",
    "auth-hash": signature,
    "set-cookie": "bank-session=synthetic; Secure; HttpOnly",
  } });
}

function validationInput() {
  return { environment: "live" as const, credential, validationReference: reference, signal: AbortSignal.timeout(1_000) };
}

test("unmodified bounded transport rejects even a genuinely signed 1123 with Set-Cookie", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => { calls += 1; return signedResponse(); },
    timeoutMs: 1_000,
    maximumResponseBytes: 16_384,
  });
  assert.deepEqual(await validateAkbankCredentialWithTransport(transport, validationInput(), options), {
    kind: "rejected", outcomeCode: "validation_unavailable",
  });
  assert.equal(calls, 1);
});

test("stateless compatibility lets the existing adapter authenticate the same signed 1123", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: createAkbankInquiryCompatibleFetch(async () => { calls += 1; return signedResponse(); }),
    timeoutMs: 1_000,
    maximumResponseBytes: 16_384,
  });
  const result = await validateAkbankCredentialWithTransport(transport, validationInput(), options);
  assert.equal(result.kind, "validated");
  assert.equal(calls, 1);
  assert.equal(AKBANK_JSON_PACKET.endpoints.live.length, 1);
});

function inquiryRequest(overrides: { url?: string; method?: string; credentials?: RequestCredentials; headers?: Record<string, string>; source?: string } = {}): Request {
  const method = overrides.method ?? "POST";
  return new Request(overrides.url ?? AKBANK_JSON_PACKET.endpoints.live[0]!, {
    method, redirect: "manual", credentials: overrides.credentials ?? "omit",
    headers: { "content-type": "application/json", "auth-hash": signature, ...overrides.headers },
    ...(method === "GET" ? {} : { body: overrides.source ?? JSON.stringify({
      version: "1.00", txnCode: "1010", requestDateTime: "2026-10-26T09:30:00.000",
      randomNumber: "a".repeat(32), terminal: { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId }, order: { orderId: reference },
    }) }),
  });
}

test("only the cookie is discarded; raw bytes, authentication, length and unrelated headers survive", async () => {
  const original = signedResponse();
  original.headers.set("content-length", String(body.byteLength));
  original.headers.set("x-request-id", "synthetic-request");
  let calls = 0;
  const response = await createAkbankInquiryCompatibleFetch(async (request) => {
    calls += 1;
    assert.equal(request.headers.has("cookie"), false);
    return original;
  })(inquiryRequest());
  assert.equal(calls, 1);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.get("auth-hash"), signature);
  assert.equal(response.headers.get("content-length"), String(body.byteLength));
  assert.equal(response.headers.get("x-request-id"), "synthetic-request");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body);
});

test("unrelated requests and non-inquiry bodies retain the original response and cookie", async () => {
  const overrides: NonNullable<Parameters<typeof inquiryRequest>[0]>[] = [
    { url: "https://www.paytr.com/odeme/api/get-token" }, { method: "GET" },
    { credentials: "include" as const }, { headers: { cookie: "synthetic=1" } },
    { headers: { "auth-hash": "invalid" } }, { source: "x".repeat(4097) },
    { source: '{"version":"1.00","txnCode":"1000"}' },
    { source: '{"version":"1.00","txnCode":"1010","txnCode":"1000"}' },
  ];
  for (const override of overrides) {
    const original = signedResponse(); let calls = 0;
    const response = await createAkbankInquiryCompatibleFetch(async () => { calls += 1; return original; })(inquiryRequest(override));
    assert.equal(response, original); assert.equal(calls, 1);
    assert.equal(response.headers.has("set-cookie"), true);
  }
});

test("redirects, unrecognized response headers and Set-Cookie2 keep the strict rejection", async () => {
  for (const mutate of [
    (r: Response) => r.headers.set("location", "https://example.invalid/"),
    (r: Response) => r.headers.set("set-cookie2", "synthetic=1"),
    (r: Response) => r.headers.set("auth-hash", "invalid"),
    (r: Response) => r.headers.set("content-type", "text/html"),
    (r: Response) => Object.defineProperty(r, "redirected", { value: true }),
    (r: Response) => Object.defineProperty(r, "type", { value: "opaqueredirect" }),
  ]) {
    const original = signedResponse(); mutate(original);
    assert.equal(await createAkbankInquiryCompatibleFetch(async () => original)(inquiryRequest()), original);
  }
});

test("cookie compatibility cannot turn an invalid HMAC or a different terminal into validation", async () => {
  for (const terminal of [credential.terminalSafeId, "3".repeat(32)]) {
    const bytes = encoder.encode(JSON.stringify({ txnCode: "1010", responseCode: "VPS-1123", terminal: { merchantSafeId: credential.merchantSafeId, terminalSafeId: terminal } }));
    const mac = createHmac("sha512", terminal === credential.terminalSafeId ? "wrong-synthetic-secret" : credential.secretKey).update(bytes).digest("base64");
    const transport = createBoundedProviderTransport({
      fetch: createAkbankInquiryCompatibleFetch(async () => new Response(bytes, { headers: { "content-type": "application/json", "auth-hash": mac, "set-cookie": "synthetic=1" } })),
      timeoutMs: 1000, maximumResponseBytes: 16384,
    });
    assert.equal((await validateAkbankCredentialWithTransport(transport, validationInput(), options)).kind, "rejected");
  }
});
