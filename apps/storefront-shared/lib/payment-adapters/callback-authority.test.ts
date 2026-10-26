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

test("accepts Next's internal callback URL after the runtime has authenticated the storefront host", async () => {
  const providerCode = "akbank_json";
  const pathname = `/api/payments/${providerCode}/callback/${BINDING}`;
  for (const origin of ["http://localhost:3450", "https://localhost:3450", "http://0.0.0.0:3450"]) {
    const selected = await readExactHostedPaymentCallback({
      request: request(`${origin}${pathname}`, { headers: {
        origin: "https://virtualpospaymentgateway.akbank.com",
      } }),
      providerCode,
      binding: BINDING,
      trustedHostname: HOSTNAME,
    });
    assert.ok(selected, origin);
    assert.equal(selected.callbackBindingDigest, DIGEST);
    selected.body.fill(0);
  }
});

test("internal transport compatibility preserves the exact callback target and header checks", async () => {
  const providerCode = "akbank_json";
  const target = `http://localhost:3450/api/payments/${providerCode}/callback/${BINDING}`;
  for (const value of [
    `${target}/`, `${target}?x=1`, `${target}#x`,
    target.replace("localhost", "other.example"),
    target.replace("localhost", "localhost.evil.example"),
    target.replace("http:", "ftp:"),
    target.replace("/callback/", "/callback/%2F"),
  ]) {
    assert.equal(await readExactHostedPaymentCallback({
      request: request(value), providerCode, binding: BINDING, trustedHostname: HOSTNAME,
    }), null, value);
  }
  assert.throws(() => request(target.replace("localhost", "user:pass@localhost")), TypeError);
  for (const headers of [
    { cookie: `unrelated=${"x".repeat(4_096)}` }, { authorization: "Bearer fixture" },
    { origin: "https://virtualpospaymentgateway.akbank.com.evil.example" },
  ] as Readonly<Record<string, string>>[]) {
    assert.equal(await readExactHostedPaymentCallback({
      request: request(target, { headers }), providerCode, binding: BINDING, trustedHostname: HOSTNAME,
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
    { origin: "https://sandbox-cpp.iyzipay.com", cookie: `session=${"x".repeat(4_096)}` },
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

test("Akbank alone accepts exact bank Origin and valid raw percent encodings without changing signed bytes", async () => {
  const providerCode = "akbank_json";
  const target = `https://${HOSTNAME}/api/payments/${providerCode}/callback/${BINDING}`;
  const body = "hashParams=orderId%2bamount&orderId=ORDER%2d100&amount=1.00&responseMessage=Good%20day";
  for (const origin of ["https://virtualpospaymentgatewaypre.akbank.com", "https://virtualpospaymentgateway.akbank.com"]) {
    const selected = await readExactHostedPaymentCallback({ request: request(target, { body, headers: { origin } }), providerCode, binding: BINDING, trustedHostname: HOSTNAME });
    assert.ok(selected);
    assert.equal(Buffer.from(selected.body).toString("utf8"), body);
    assert.equal(selected.headers.origin, undefined);
    selected.body.fill(0);
  }
  for (const origin of ["https://virtualpospaymentgatewaypre.akbank.com/", "https://virtualpospaymentgatewaypre.akbank.com.evil.example", "https://api.akbank.com", "null"]) {
    assert.equal(await readExactHostedPaymentCallback({ request: request(target, { body, headers: { origin } }), providerCode, binding: BINDING, trustedHostname: HOSTNAME }), null);
  }
  for (const invalid of ["amount=1&%61mount=2", "amount=%", "amount=%GG", "amount=%ff", "amount=1&&status=ok", "amount=1&missing", "=value", "amount=1&amount=1"]) {
    assert.equal(await readExactHostedPaymentCallback({ request: request(target, { body: invalid }), providerCode, binding: BINDING, trustedHostname: HOSTNAME }), null, invalid);
  }
  assert.equal(await readExactHostedPaymentCallback({ request: request(CALLBACK_URL, { body }), providerCode: PROVIDER, binding: BINDING, trustedHostname: HOSTNAME }), null);
});

const CUSTOMER_RETURN_PROVIDERS = ["akbank_json", "iyzico_iframe"] as const;

function customerReturnRequest(providerCode: string, headers: HeadersInit = {}, body: BodyInit = "token=fixture"): Request {
  return new Request(`https://${HOSTNAME}/api/payments/${providerCode}/callback/${BINDING}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...Object.fromEntries(new Headers(headers)) },
    body,
    duplex: "half",
  } as RequestInit);
}

function readCallback(candidate: Request, providerCode: string) {
  return readExactHostedPaymentCallback({ request: candidate, providerCode, binding: BINDING, trustedHostname: HOSTNAME });
}

test("only fixed customer returns discard bounded ambient Cookies without projecting or changing body bytes", async () => {
  for (const providerCode of CUSTOMER_RETURN_PROVIDERS) {
    const body = "token=fixture%2Bvalue";
    const selected = await readCallback(customerReturnRequest(providerCode, {
      cookie: "analytics=incidental_private_fixture; __Host-session=untrusted_fixture",
      "content-length": String(Buffer.byteLength(body)),
    }, body), providerCode);
    assert.ok(selected, providerCode);
    assert.equal(selected.callbackBindingDigest, DIGEST);
    assert.deepEqual(selected.headers, { "content-length": String(Buffer.byteLength(body)), "content-type": "application/x-www-form-urlencoded" });
    assert.equal(new TextDecoder().decode(selected.body), body);
    assert.equal(JSON.stringify(selected).includes("incidental_private_fixture"), false);
    selected.body.fill(0);
    assert.equal(await readCallback(customerReturnRequest(providerCode, { cookie: "x=" + "a".repeat(4_096) }), providerCode), null);
  }
  for (const providerCode of [PROVIDER, "paytr_iframe", "akbank_json_other", "iyzico_iframe_other"]) {
    assert.equal(await readCallback(customerReturnRequest(providerCode, { cookie: "analytics=fixture" }), providerCode), null, providerCode);
  }
});

test("customer returns allow at most64 bounded headers while provider acknowledgements retain32", async () => {
  for (const providerCode of [...CUSTOMER_RETURN_PROVIDERS, PROVIDER, "paytr_iframe"]) {
    for (const count of [32, 33, 64, 65]) {
      const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
      for (let index = 1; index < count; index += 1) headers.set(`x-browser-fixture-${index}`, "safe");
      const selected = await readCallback(customerReturnRequest(providerCode, headers), providerCode);
      const allowed = count <= (CUSTOMER_RETURN_PROVIDERS.includes(providerCode as typeof CUSTOMER_RETURN_PROVIDERS[number]) ? 64 : 32);
      assert.equal(selected !== null, allowed, `${providerCode}:${count}`);
      selected?.body.fill(0);
    }
  }
  for (const providerCode of CUSTOMER_RETURN_PROVIDERS) {
    for (const headers of [{ ["x".repeat(129)]: "safe" }, { "x-browser-fixture": "x".repeat(4_097) }]) {
      assert.equal(await readCallback(customerReturnRequest(providerCode, headers), providerCode), null);
    }
  }
});

test("only customer returns accept plain case-insensitive chunked framing with no declared length", async () => {
  for (const providerCode of CUSTOMER_RETURN_PROVIDERS) {
    for (const encoding of ["chunked", "CHUNKED", "Chunked"]) {
      const selected = await readCallback(customerReturnRequest(providerCode, {
        "transfer-encoding": encoding,
        cookie: "analytics=fixture",
      }), providerCode);
      assert.ok(selected, `${providerCode}:${encoding}`);
      assert.deepEqual(selected.headers, { "content-type": "application/x-www-form-urlencoded" });
      assert.equal(new TextDecoder().decode(selected.body), "token=fixture");
      selected.body.fill(0);
    }
  }
  for (const providerCode of [PROVIDER, "paytr_iframe"]) {
    assert.equal(await readCallback(customerReturnRequest(providerCode, { "transfer-encoding": "chunked" }), providerCode), null);
  }
});

test("customer-return compatibility retains auth, framing, compression, Origin and target rejection", async () => {
  for (const providerCode of CUSTOMER_RETURN_PROVIDERS) {
    for (const headers of [
      { authorization: "Bearer fixture" }, { "proxy-authorization": "Basic fixture" },
      { "content-encoding": "identity" }, { "content-encoding": "gzip" },
      { "transfer-encoding": "chunked", "content-length": "13" },
      { "transfer-encoding": "gzip" }, { "transfer-encoding": "gzip, chunked" },
      { "transfer-encoding": "chunked, chunked" }, { "transfer-encoding": "chunked", "content-encoding": "gzip" },
      { origin: "https://foreign.example" }, { origin: "null" },
    ] as ReadonlyArray<Readonly<Record<string, string>>>) {
      assert.equal(await readCallback(customerReturnRequest(providerCode, headers), providerCode), null, `${providerCode}:${JSON.stringify(headers)}`);
    }
    const wrongPath = customerReturnRequest(providerCode, { cookie: "analytics=fixture" });
    assert.equal(await readCallback(new Request(`${wrongPath.url}?next=1`, wrongPath), providerCode), null);
    const wrongProvider = providerCode === "akbank_json" ? "iyzico_iframe" : "akbank_json";
    assert.equal(await readCallback(customerReturnRequest(providerCode), wrongProvider), null);
  }
});

test("overflow rejection never waits for an uncooperative stream cancellation", { timeout: 2_000 }, async () => {
  let cancelled = false;
  const overflow = new Uint8Array(65_537).fill(0x61);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(overflow); },
    cancel() { cancelled = true; return new Promise<void>(() => {}); },
  });
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      readCallback(customerReturnRequest("akbank_json", {}, stream), "akbank_json"),
      new Promise<"rejection_stalled">((resolve) => { guard = setTimeout(() => resolve("rejection_stalled"), 500); }),
    ]);
    assert.equal(result, null);
    assert.equal(cancelled, true);
    assert.equal(overflow.every((value) => value === 0), true);
  } finally { clearTimeout(guard); }
});

test("customer-return body deadline covers a stalled partial body and never waits for cancel", { timeout: 9_000 }, async () => {
  let cancelled = false;
  const partial = new TextEncoder().encode("token=private_fixture");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(partial); },
    cancel() { cancelled = true; return new Promise<void>(() => {}); },
  });
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      readCallback(customerReturnRequest("iyzico_iframe", {}, stream), "iyzico_iframe"),
      new Promise<"body_deadline_missing">((resolve) => { guard = setTimeout(() => resolve("body_deadline_missing"), 7_000); }),
    ]);
    assert.equal(result, null);
    assert.equal(cancelled, true);
    assert.equal(partial.every((value) => value === 0), true);
  } finally { clearTimeout(guard); }
});
