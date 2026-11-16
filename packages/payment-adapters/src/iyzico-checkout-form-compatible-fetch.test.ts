import assert from "node:assert/strict";
import test from "node:test";

import { createIyzicoCheckoutFormCompatibleFetch } from "./index.ts";
import { createIyzicoAuthorization } from "./providers/iyzico/config.ts";
import { IYZICO_IFRAME_PACKET } from "./providers/iyzico/packet.ts";
import { createBoundedProviderTransport } from "./transport.ts";
import { validateIyzicoCredentialWithTransport } from "./providers/iyzico/adapter.ts";

const randomKey = "a".repeat(32);
const reference = "11111111-1111-4111-8111-111111111111";
const credential = Object.freeze({ apiKey: "synthetic-key", secretKey: "synthetic-secret" });
const binEndpoint = "https://api.iyzipay.com/payment/bin/check";

function request(url = binEndpoint, overrides: RequestInit = {}): Request {
  const body = new TextEncoder().encode("{}");
  const auth = createIyzicoAuthorization({ credential, randomKey, uriPath: new URL(binEndpoint).pathname, body });
  const headers = {
    "content-type": "application/json",
    authorization: auth.authorization,
    "x-iyzi-rnd": randomKey,
  };
  return new Request(url, { method: "POST", redirect: "manual", credentials: "omit", headers, body, ...overrides });
}

function response(extra: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify({ status: "success", binNumber: "41579200", conversationId: reference }), {
    status,
    headers: { "content-type": "application/json", "set-cookie": "edge=fixture; Secure", "x-request-id": "fixture", ...extra },
  });
}

test("only the unused Set-Cookie is removed for the exact three production iyzico requests", async () => {
  for (const endpoint of IYZICO_IFRAME_PACKET.endpoints.live) {
    const original = response();
    const body = original.body;
    const result = await createIyzicoCheckoutFormCompatibleFetch(async (selected) => {
      assert.equal(selected.url, endpoint);
      assert.equal(selected.headers.has("cookie"), false);
      return original;
    })(request(endpoint));
    assert.equal(result.status, 200);
    assert.equal(result.headers.has("set-cookie"), false);
    assert.equal(result.headers.get("x-request-id"), "fixture");
    assert.equal(result.body, body);
  }
});

test("other requests and unsafe responses retain the original cookie for strict transport rejection", async () => {
  const baseHeaders = Object.fromEntries(request().headers);
  for (const selected of [
    request("https://sandbox-api.iyzipay.com/payment/bin/check"),
    request(`${binEndpoint}?fixture=1`),
    request("https://api.iyzipay.com/payment/bin/check/"),
    request(binEndpoint, { method: "GET", body: null }),
    request(binEndpoint, { credentials: "include" }),
    request(binEndpoint, { redirect: "follow" }),
    request(binEndpoint, { headers: { ...baseHeaders, cookie: "edge=fixture" } }),
    request(binEndpoint, { headers: { ...baseHeaders, "x-iyzi-rnd": "b".repeat(32) } }),
    request(binEndpoint, { headers: { ...baseHeaders, authorization: "IYZWSv2 YQ==" } }),
  ]) {
    const original = response();
    assert.equal(await createIyzicoCheckoutFormCompatibleFetch(async () => original)(selected), original);
  }
  for (const original of [
    response({ location: "https://api.iyzipay.com/" }),
    response({ "set-cookie2": "edge=fixture" }),
    response({ "content-type": "text/html" }),
    response({}, 302),
    response({}, 429),
  ]) {
    assert.equal(await createIyzicoCheckoutFormCompatibleFetch(async () => original)(request()), original);
  }
});

test("read-only live BIN validation still requires matching provider response correlation", async () => {
  for (const matches of [true, false]) {
    const transport = createBoundedProviderTransport({
      fetch: createIyzicoCheckoutFormCompatibleFetch(async () => matches ? response() : new Response(
        JSON.stringify({ status: "success", binNumber: "41579200", conversationId: "other" }),
        { headers: { "content-type": "application/json", "set-cookie": "edge=fixture" } },
      )),
      timeoutMs: 1000,
      maximumResponseBytes: 16384,
    });
    assert.deepEqual(await validateIyzicoCredentialWithTransport(transport, {
      environment: "live", credential, validationReference: reference,
      randomKey: () => randomKey, signal: AbortSignal.timeout(1000),
    }), matches ? { kind: "validated" } : { kind: "rejected", outcomeCode: "validation_unavailable" });
  }
});
