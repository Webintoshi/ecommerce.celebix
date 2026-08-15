import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  readExactHostedPaymentCallback,
  readExactHostedPaymentCallbackByDigest,
} from "./callback-authority.ts";

const HOSTNAME = "pilot.saas-staging.celebix.site";
const PROVIDER = "fixture_provider";
const BINDING_BYTES = Buffer.alloc(32, 0x07);
const BINDING = BINDING_BYTES.toString("base64url");
const DIGEST = createHash("sha256").update(BINDING_BYTES).digest("hex");
const CALLBACK_URL = `https://${HOSTNAME}/api/payments/${PROVIDER}/callback/${BINDING}`;

function request(
  target = CALLBACK_URL,
  overrides: Readonly<{
    method?: string;
    body?: string;
    headers?: Readonly<Record<string, string>>;
  }> = {},
): Request {
  const body = overrides.body ?? "event_id=evt_1&status=success";
  return new Request(target, {
    method: overrides.method ?? "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(body)),
      "x-provider-signature": "signature_fixture",
      ...overrides.headers,
    },
    body: overrides.method === "GET" ? undefined : body,
  });
}

test("reads an exact bounded callback and returns only digest authority plus copied bytes", async () => {
  const selected = await readExactHostedPaymentCallback({
    request: request(CALLBACK_URL, { headers: {
      host: "storefront.internal:3450",
      forwarded: "host=forged.example;proto=http",
      "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x41).toString("base64url")}`,
      "x-forwarded-for": "203.0.113.7",
      "x-forwarded-host": HOSTNAME,
      "x-forwarded-proto": "https",
      "x-original-host": "forged.example",
    } }),
    providerCode: PROVIDER,
    binding: BINDING,
    trustedHostname: HOSTNAME,
  });

  assert.ok(selected);
  assert.deepEqual(Object.keys(selected), [
    "providerCode",
    "callbackBindingDigest",
    "method",
    "headers",
    "body",
  ]);
  assert.equal(selected.providerCode, PROVIDER);
  assert.equal(selected.callbackBindingDigest, DIGEST);
  assert.equal(selected.method, "POST");
  assert.deepEqual(selected.headers, {
    "content-length": "29",
    "content-type": "application/x-www-form-urlencoded",
    "x-provider-signature": "signature_fixture",
  });
  assert.equal(JSON.stringify(selected.headers).includes("storefront-proxy"), false);
  assert.equal(JSON.stringify(selected.headers).includes("forged.example"), false);
  assert.equal(new TextDecoder().decode(selected.body), "event_id=evt_1&status=success");
  assert.equal(JSON.stringify(selected).includes(BINDING), false);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.headers), true);
  selected.body.fill(0);
});

test("rejects noncanonical provider codes, bindings, origins, and callback paths before body authority", async () => {
  const candidates = [
    { providerCode: "Fixture_provider", binding: BINDING, target: CALLBACK_URL },
    { providerCode: PROVIDER, binding: `${BINDING}=`, target: CALLBACK_URL },
    { providerCode: PROVIDER, binding: Buffer.alloc(31, 7).toString("base64url"), target: CALLBACK_URL },
    { providerCode: PROVIDER, binding: BINDING, target: `${CALLBACK_URL}/` },
    { providerCode: PROVIDER, binding: BINDING, target: `${CALLBACK_URL}?return=1` },
    { providerCode: PROVIDER, binding: BINDING, target: CALLBACK_URL.replace(HOSTNAME, "other.example") },
    { providerCode: "other_provider", binding: BINDING, target: CALLBACK_URL },
  ];

  for (const candidate of candidates) {
    assert.equal(await readExactHostedPaymentCallback({
      request: request(candidate.target),
      providerCode: candidate.providerCode,
      binding: candidate.binding,
      trustedHostname: HOSTNAME,
    }), null);
  }
});

test("rejects forbidden headers, invalid content types, duplicate fields, and announced or streamed overflow", async () => {
  const invalidRequests = [
    request(CALLBACK_URL, { method: "GET" }),
    request(CALLBACK_URL, { headers: { authorization: "Bearer secret" } }),
    request(CALLBACK_URL, { headers: { cookie: "__Host-session=secret" } }),
    request(CALLBACK_URL, { headers: { origin: `https://${HOSTNAME}` } }),
    request(CALLBACK_URL, { headers: { "transfer-encoding": "chunked" } }),
    request(CALLBACK_URL, { headers: { "content-encoding": "gzip" } }),
    request(CALLBACK_URL, { headers: { "content-type": "application/json;charset=utf-8" } }),
    request(CALLBACK_URL, { body: "event_id=evt_1&event_id=evt_1&status=success" }),
    request(CALLBACK_URL, { body: "{\"event_id\":\"evt_1\",\"event_id\":\"evt_2\"}", headers: {
      "content-type": "application/json",
    } }),
    request(CALLBACK_URL, { headers: { "content-length": "65537" } }),
  ];
  for (const selected of invalidRequests) {
    assert.equal(await readExactHostedPaymentCallback({
      request: selected,
      providerCode: PROVIDER,
      binding: BINDING,
      trustedHostname: HOSTNAME,
    }), null);
  }

  const streamed = new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65_536).fill(0x61));
        controller.enqueue(new Uint8Array([0x61]));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  assert.equal(await readExactHostedPaymentCallback({
    request: streamed,
    providerCode: PROVIDER,
    binding: BINDING,
    trustedHostname: HOSTNAME,
  }), null);
});

test("accepts only an exact iyzico customer-return Origin and drops it from provider data", async () => {
  const providerCode = "iyzico_iframe";
  const target = `https://${HOSTNAME}/api/payments/${providerCode}/callback/${BINDING}`;
  for (const origin of ["https://sandbox-cpp.iyzipay.com", "https://cpp.iyzipay.com"]) {
    const selected = await readExactHostedPaymentCallback({
      request: request(target, { headers: {
        origin,
        "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x41).toString("base64url")}`,
        "x-forwarded-host": HOSTNAME,
        "x-forwarded-proto": "https",
      } }),
      providerCode,
      binding: BINDING,
      trustedHostname: HOSTNAME,
    });
    assert.ok(selected);
    assert.equal(selected.headers.origin, undefined);
    assert.equal(JSON.stringify(selected.headers).includes("storefront-proxy"), false);
    selected.body.fill(0);
  }

  const invalidHeaders: readonly Readonly<Record<string, string>>[] = [
    { origin: "https://sandbox-cpp.iyzipay.com.evil.example" },
    { origin: "https://sandbox-cpp.iyzipay.com/" },
    { origin: "https://SANDBOX-CPP.iyzipay.com" },
    { origin: "https://sandbox-cpp.iyzipay.com", cookie: "session=secret" },
    { origin: "https://sandbox-cpp.iyzipay.com", authorization: "Bearer secret" },
  ];
  for (const headers of invalidHeaders) {
    assert.equal(await readExactHostedPaymentCallback({
      request: request(target, { headers }),
      providerCode,
      binding: BINDING,
      trustedHostname: HOSTNAME,
    }), null);
  }

  assert.equal(await readExactHostedPaymentCallback({
    request: request(CALLBACK_URL, { headers: { origin: "https://sandbox-cpp.iyzipay.com" } }),
    providerCode: PROVIDER,
    binding: BINDING,
    trustedHostname: HOSTNAME,
  }), null);
});

test("accepts canonical JSON but rejects malformed UTF-8 and nested duplicate JSON keys", async () => {
  const json = "{\"event\":{\"id\":\"evt_1\"},\"status\":\"success\"}";
  const selected = await readExactHostedPaymentCallback({
    request: request(CALLBACK_URL, {
      body: json,
      headers: { "content-type": "application/json" },
    }),
    providerCode: PROVIDER,
    binding: BINDING,
    trustedHostname: HOSTNAME,
  });
  assert.ok(selected);
  selected.body.fill(0);

  for (const body of [
    "{\"event\":{\"id\":\"evt_1\",\"id\":\"evt_2\"},\"status\":\"success\"}",
    "{\"event\":true} ",
  ]) {
    assert.equal(await readExactHostedPaymentCallback({
      request: request(CALLBACK_URL, {
        body,
        headers: { "content-type": "application/json" },
      }),
      providerCode: PROVIDER,
      binding: BINDING,
      trustedHostname: HOSTNAME,
    }), null);
  }

  const malformed = new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array([0xc3, 0x28]),
  });
  assert.equal(await readExactHostedPaymentCallback({
    request: malformed,
    providerCode: PROVIDER,
    binding: BINDING,
    trustedHostname: HOSTNAME,
  }), null);
});

test("reads the same bounded callback authority from the fixed PayTR path and exact digest", async () => {
  const fixed = `https://${HOSTNAME}/api/payments/paytr/callback`;
  const selected = await readExactHostedPaymentCallbackByDigest({
    request: request(fixed),
    providerCode: "paytr_iframe",
    callbackBindingDigest: DIGEST,
    trustedHostname: HOSTNAME,
  });
  assert.ok(selected);
  assert.equal(selected.providerCode, "paytr_iframe");
  assert.equal(selected.callbackBindingDigest, DIGEST);
  assert.equal(new TextDecoder().decode(selected.body), "event_id=evt_1&status=success");
  selected.body.fill(0);

  const charset = await readExactHostedPaymentCallbackByDigest({
    request: request(fixed, { headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } }),
    providerCode: "paytr_iframe",
    callbackBindingDigest: DIGEST,
    trustedHostname: HOSTNAME,
  });
  assert.ok(charset);
  assert.equal(charset.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(new TextDecoder().decode(charset.body), "event_id=evt_1&status=success");
  charset.body.fill(0);

  for (const [target, digest] of [
    [CALLBACK_URL, DIGEST],
    [`${fixed}/`, DIGEST],
    [`${fixed}?binding=${BINDING}`, DIGEST],
    [fixed, DIGEST.toUpperCase()],
    [fixed, "a".repeat(63)],
  ]) {
    assert.equal(await readExactHostedPaymentCallbackByDigest({
      request: request(target),
      providerCode: "paytr_iframe",
      callbackBindingDigest: digest,
      trustedHostname: HOSTNAME,
    }), null);
  }
});
