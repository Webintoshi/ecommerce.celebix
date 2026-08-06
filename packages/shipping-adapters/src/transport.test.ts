import assert from "node:assert/strict";
import test from "node:test";

import { createShippingProviderTransport } from "./index.ts";

const TOKEN = "bk_test_token_1234";

test("transport permits only the exact Basit Kargo HTTPS authority", async () => {
  let called = false;
  const transport = createShippingProviderTransport({
    fetch: async () => {
      called = true;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  await assert.rejects(() => transport.request({
    origin: "https://evil.example",
    path: "/handlers",
    method: "GET",
    token: TOKEN,
    signal: AbortSignal.timeout(100),
  } as never), /shipping_transport_invalid/u);
  assert.equal(called, false);
});

test("transport rejects unreviewed methods paths queries and accessor input before fetch", async () => {
  let calls = 0;
  const transport = createShippingProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const cases = [
    { origin: "https://basitkargo.com/api", path: "/handlers?token=x", method: "GET", token: TOKEN, signal: AbortSignal.timeout(100) },
    { origin: "https://basitkargo.com/api", path: "/../handlers", method: "GET", token: TOKEN, signal: AbortSignal.timeout(100) },
    { origin: "https://basitkargo.com/api", path: "/handlers", method: "POST", token: TOKEN, signal: AbortSignal.timeout(100) },
    { origin: "https://basitkargo.com/api", path: "/not-reviewed", method: "GET", token: TOKEN, signal: AbortSignal.timeout(100) },
  ];
  for (const value of cases) {
    await assert.rejects(() => transport.request(value as never), /shipping_transport_invalid/u);
  }
  const accessor = { origin: "https://basitkargo.com/api", path: "/handlers", method: "GET", token: TOKEN, signal: AbortSignal.timeout(100) };
  Object.defineProperty(accessor, "token", { enumerable: true, get: () => TOKEN });
  await assert.rejects(() => transport.request(accessor as never), /shipping_transport_invalid/u);
  assert.equal(calls, 0);
});

test("transport sends an exact bearer request without following redirects", async () => {
  let observed: Readonly<{ url: string; init?: RequestInit }> | undefined;
  const transport = createShippingProviderTransport({
    fetch: async (input, init) => {
      observed = { url: String(input), init };
      return new Response(JSON.stringify([{ handlerCode: "ARAS" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const result = await transport.request({
    origin: "https://basitkargo.com/api",
    path: "/handlers",
    method: "GET",
    token: TOKEN,
    signal: AbortSignal.timeout(1_000),
  });

  assert.equal(observed?.url, "https://basitkargo.com/api/handlers");
  assert.equal(observed?.init?.method, "GET");
  assert.equal(observed?.init?.redirect, "manual");
  assert.deepEqual(observed?.init?.headers, {
    accept: "application/json",
    authorization: `Bearer ${TOKEN}`,
  });
  assert.equal(result.kind, "response");
  if (result.kind === "response") {
    assert.equal(result.contentType, "application/json");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(result.body)), [{ handlerCode: "ARAS" }]);
  }
});

test("transport bounds response types sizes redirects and Retry-After", async () => {
  const responses = [
    new Response("wait", { status: 302, headers: { location: "https://basitkargo.com/api/handlers", "content-type": "application/json" } }),
    new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array(1_048_577), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{}", { status: 429, headers: { "content-type": "application/json", "retry-after": "42" } }),
    new Response("{}", { status: 429, headers: { "content-type": "application/json", "retry-after": "901" } }),
  ];
  const transport = createShippingProviderTransport({ fetch: async () => responses.shift()! });
  const request = () => transport.request({
    origin: "https://basitkargo.com/api",
    path: "/handlers",
    method: "GET",
    token: TOKEN,
    signal: AbortSignal.timeout(2_000),
  });

  assert.deepEqual(await request(), { kind: "failure", code: "redirect" });
  assert.deepEqual(await request(), { kind: "failure", code: "invalid_content_type" });
  assert.deepEqual(await request(), { kind: "failure", code: "response_too_large" });
  const throttled = await request();
  assert.equal(throttled.kind, "response");
  if (throttled.kind === "response") assert.equal(throttled.retryAfterSeconds, 42);
  const invalidRetry = await request();
  assert.equal(invalidRetry.kind, "response");
  if (invalidRetry.kind === "response") assert.equal(invalidRetry.retryAfterSeconds, null);
});

test("transport permits reviewed JSON writes and SVG label reads only", async () => {
  const seen: RequestInit[] = [];
  const transport = createShippingProviderTransport({
    fetch: async (_input, init) => {
      seen.push(init ?? {});
      return seen.length === 1
        ? new Response("{}", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })
        : new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"/>", { status: 200, headers: { "content-type": "image/svg+xml" } });
    },
  });
  const body = new TextEncoder().encode("[]");
  const written = await transport.request({
    origin: "https://basitkargo.com/api",
    path: "/handlers/fee/packages",
    method: "POST",
    token: TOKEN,
    body,
    signal: AbortSignal.timeout(1_000),
  });
  const label = await transport.request({
    origin: "https://basitkargo.com/api",
    path: "/label/svg/888-6AR-OUP",
    method: "GET",
    token: TOKEN,
    signal: AbortSignal.timeout(1_000),
  });

  assert.equal(written.kind, "response");
  assert.deepEqual(seen[0]?.headers, {
    accept: "application/json",
    authorization: `Bearer ${TOKEN}`,
    "content-type": "application/json",
  });
  assert.equal(label.kind === "response" ? label.contentType : null, "image/svg+xml");
});
