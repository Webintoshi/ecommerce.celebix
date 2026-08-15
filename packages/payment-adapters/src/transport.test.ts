import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoundedProviderTransport,
  parsePaymentAdapterPacket,
  type PaymentAdapterPacket,
  type ProviderTransportRequest,
} from "./index.ts";
import { IYZICO_IFRAME_PACKET } from "./providers/iyzico/packet.ts";

function packetFixture(): Record<string, unknown> {
  return {
    providerCode: "paytr_iframe",
    familyCode: "paytr",
    modeCode: "iframe",
    adapterVersion: 1,
    implementation: "hosted",
    callbackResponse: "provider_ack",
    readiness: { test: "verification", live: "planned" },
    endpoints: {
      test: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
      live: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
    },
    presentation: {
      test: {
        kind: "provider_token_url",
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: { alphabet: "base64url", minimum: 32, maximum: 256 },
      },
      live: {
        kind: "provider_token_url",
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: { alphabet: "base64url", minimum: 32, maximum: 256 },
      },
    },
    publicFields: [
      { key: "merchantId", label: "Mağaza numarası", minimum: 1, maximum: 128 },
    ],
    credentialFields: [
      { key: "merchantKey", label: "Mağaza parolası", minimum: 1, maximum: 256, secret: true },
      { key: "merchantSalt", label: "Mağaza gizli anahtarı", minimum: 1, maximum: 256, secret: true },
    ],
    capabilities: {
      initialize: true,
      callback: true,
      query: true,
      threeDSecure: true,
      installments: true,
      preAuth: false,
      capture: false,
      cancel: false,
      refund: false,
      partialRefund: false,
      tokenization: false,
    },
    documentation: [
      { url: "https://dev.paytr.com/iframe-api", verifiedAt: "2026-07-27", authority: "official" },
    ],
  };
}

const PACKET = parsePaymentAdapterPacket(packetFixture());
const ENDPOINT = "https://www.paytr.com/odeme/api/get-token";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const PAYTR_LEGACY_JSON_CONTENT_TYPE = "text/html; charset=UTF-8";
const IYZICO_JSON_CONTENT_TYPE = "application/json";
const IYZICO_RANDOM_KEY = "abcdefghijklmnop";
const IYZICO_AUTHORIZATION = "IYZWSv2 YXBpS2V5OnNhbmRib3gtYXBpLWtleSZyYW5kb21LZXk6YWJjZGVmZ2hpamtsbW5vcCZzaWduYXR1cmU6MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZg==";

function encodedIyzicoAuthorization(payload: string): string {
  return `IYZWSv2 ${Buffer.from(payload, "utf8").toString("base64")}`;
}

function request(
  transport: ReturnType<typeof createBoundedProviderTransport>,
  overrides: Partial<{
    packet: PaymentAdapterPacket;
    environment: "test" | "live";
    url: string;
    method: "POST";
    headers: ProviderTransportRequest["headers"];
    body: Uint8Array;
    signal: AbortSignal;
  }> = {},
) {
  return transport.request({
    packet: PACKET,
    environment: "test",
    url: ENDPOINT,
    method: "POST",
    headers: { "content-type": FORM_CONTENT_TYPE } as const,
    body: new TextEncoder().encode("merchant_id=123456"),
    ...overrides,
  });
}

function iyzicoRequest(
  transport: ReturnType<typeof createBoundedProviderTransport>,
  overrides: Partial<{
    headers: ProviderTransportRequest["headers"];
    body: Uint8Array;
  }> = {},
) {
  return transport.request({
    packet: IYZICO_IFRAME_PACKET,
    environment: "test",
    url: "https://sandbox-api.iyzipay.com/payment/bin/check",
    method: "POST",
    headers: {
      "content-type": IYZICO_JSON_CONTENT_TYPE,
      authorization: IYZICO_AUTHORIZATION,
      "x-iyzi-rnd": IYZICO_RANDOM_KEY,
    },
    body: new TextEncoder().encode('{"binNumber":"589004","price":"1.0"}'),
    ...overrides,
  });
}

test("preserves the exact iyzico signing headers and signed body bytes", async () => {
  const rawBody = '{"binNumber":"589004","price":"1.0"}';
  const body = new TextEncoder().encode(rawBody);
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async (observed) => {
      calls += 1;
      assert.equal(observed.headers.get("content-type"), IYZICO_JSON_CONTENT_TYPE);
      assert.equal(observed.headers.get("authorization"), IYZICO_AUTHORIZATION);
      assert.equal(observed.headers.get("x-iyzi-rnd"), IYZICO_RANDOM_KEY);
      assert.equal(await observed.text(), rawBody);
      return new Response('{"status":"success"}', {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  const result = await iyzicoRequest(transport, {
    headers: {
      "content-type": IYZICO_JSON_CONTENT_TYPE,
      authorization: IYZICO_AUTHORIZATION,
      "x-iyzi-rnd": IYZICO_RANDOM_KEY,
    },
    body,
  });

  assert.equal(result.kind, "response");
  assert.equal(calls, 1);
  assert.deepEqual([...body], Array(body.length).fill(0));
});

test("binds the complete iyzico header set and exact decoded authorization payload", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response('{"status":"success"}', {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  const signature = "0123456789abcdef".repeat(4);
  const malformedPayloads = [
    `randomKey:${IYZICO_RANDOM_KEY}&apiKey:sandbox-api-key&signature:${signature}`,
    `apiKey:sandbox-api-key&signature:${signature}&randomKey:${IYZICO_RANDOM_KEY}`,
    `apiKey:sandbox-api-key&randomKey:${IYZICO_RANDOM_KEY}&signature:${signature}&extra:x`,
    `apiKey:&randomKey:${IYZICO_RANDOM_KEY}&signature:${signature}`,
    `apiKey:${"a".repeat(257)}&randomKey:${IYZICO_RANDOM_KEY}&signature:${signature}`,
    `apiKey:sandbox-api-key&randomKey:${IYZICO_RANDOM_KEY}&signature:${signature.toUpperCase()}`,
    `apiKey:sandbox-api-key&randomKey:${IYZICO_RANDOM_KEY}&signature:${signature.slice(1)}`,
  ];
  const iyzicoCases: readonly Readonly<Record<string, string>>[] = [
    { "content-type": IYZICO_JSON_CONTENT_TYPE, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION },
    { "content-type": FORM_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    {
      "content-type": IYZICO_JSON_CONTENT_TYPE,
      authorization: encodedIyzicoAuthorization(`apiKey:sandbox-api-key&randomKey:wrongrandomkey123&signature:${signature}`),
      "x-iyzi-rnd": IYZICO_RANDOM_KEY,
    },
    ...malformedPayloads.map((payload) => ({
      "content-type": IYZICO_JSON_CONTENT_TYPE,
      authorization: encodedIyzicoAuthorization(payload),
      "x-iyzi-rnd": IYZICO_RANDOM_KEY,
    })),
  ];

  for (const headers of iyzicoCases) {
    assert.deepEqual(await iyzicoRequest(transport, { headers: headers as never }), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
  }
  assert.equal(calls, 0);
});

test("rejects iyzico authorization headers for every non-iyzico provider", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response('{"status":"success"}', {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  const cases: readonly Readonly<Record<string, string>>[] = [
    { "content-type": FORM_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION },
    { "content-type": FORM_CONTENT_TYPE, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    {
      "content-type": FORM_CONTENT_TYPE,
      authorization: IYZICO_AUTHORIZATION,
      "x-iyzi-rnd": IYZICO_RANDOM_KEY,
    },
  ];

  for (const headers of cases) {
    assert.deepEqual(await request(transport, { headers: headers as never }), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
  }
  assert.equal(calls, 0);
});

test("rejects non-canonical iyzico signing headers before fetch", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response('{"status":"success"}', {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  const cases: readonly Readonly<Record<string, string>>[] = [
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": IYZICO_RANDOM_KEY, cookie: "private=x" },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, Authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, Authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: `${IYZICO_AUTHORIZATION}\nunsafe`, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": `${IYZICO_RANDOM_KEY}\runsafe` },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: `IYZWSv2 ${"A".repeat(4_097)}`, "x-iyzi-rnd": IYZICO_RANDOM_KEY },
    { "content-type": IYZICO_JSON_CONTENT_TYPE, authorization: IYZICO_AUTHORIZATION, "x-iyzi-rnd": "a".repeat(257) },
  ];

  for (const headers of cases) {
    assert.deepEqual(await iyzicoRequest(transport, { headers: headers as never }), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
  }

  const accessorHeaders = {
    "content-type": IYZICO_JSON_CONTENT_TYPE,
    authorization: IYZICO_AUTHORIZATION,
    "x-iyzi-rnd": IYZICO_RANDOM_KEY,
  };
  Object.defineProperty(accessorHeaders, "authorization", {
    enumerable: true,
    get: () => IYZICO_AUTHORIZATION,
  });
  assert.deepEqual(await iyzicoRequest(transport, { headers: accessorHeaders as never }), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });

  const proxyHeaders = new Proxy({
    "content-type": IYZICO_JSON_CONTENT_TYPE,
    authorization: IYZICO_AUTHORIZATION,
    "x-iyzi-rnd": IYZICO_RANDOM_KEY,
  }, {});
  assert.deepEqual(await iyzicoRequest(transport, { headers: proxyHeaders as never }), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(calls, 0);
});

test("sends one contained POST to the exact packet/environment endpoint", async () => {
  let calls = 0;
  const body = new TextEncoder().encode("merchant_id=123456");
  const transport = createBoundedProviderTransport({
    fetch: async (observed) => {
      calls += 1;
      assert.equal(observed.url, ENDPOINT);
      assert.equal(observed.method, "POST");
      assert.equal(observed.redirect, "manual");
      assert.equal(observed.cache, "no-store");
      assert.equal(observed.credentials, "omit");
      assert.equal(observed.headers.get("content-type"), FORM_CONTENT_TYPE);
      assert.equal(await observed.text(), "merchant_id=123456");
      return new Response('{"status":"success"}', {
        status: 200,
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  const response = await request(transport, { body });

  assert.equal(calls, 1);
  assert.equal(response.kind, "response");
  if (response.kind === "response") {
    assert.equal(response.status, 200);
    assert.equal(response.contentType, JSON_CONTENT_TYPE);
    assert.equal(new TextDecoder().decode(response.body), '{"status":"success"}');
  }
  assert.deepEqual([...body], Array(body.length).fill(0));
});

test("accepts PayTR get-token JSON with its legacy response content type", async () => {
  for (const contentType of [PAYTR_LEGACY_JSON_CONTENT_TYPE, "text/html; charset=utf-8"]) {
    const transport = createBoundedProviderTransport({
      fetch: async () => new Response('{"status":"success"}', {
        status: 200,
        headers: { "content-type": contentType },
      }),
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });

    const response = await request(transport);

    assert.equal(response.kind, "response");
    if (response.kind === "response") {
      assert.equal(response.contentType, contentType);
      assert.equal(new TextDecoder().decode(response.body), '{"status":"success"}');
    }
  }
});

test("rejects malformed PayTR legacy content-type parameters", async () => {
  for (const contentType of [
    "text/html",
    "text/html; charset=iso-8859-9",
    "text/html; charset=utf-8; boundary=x",
    "text/html, application/json",
  ]) {
    const transport = createBoundedProviderTransport({
      fetch: async () => new Response('{"status":"success"}', {
        status: 200,
        headers: { "content-type": contentType },
      }),
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });

    assert.deepEqual(await request(transport), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    }, contentType);
  }
});

test("keeps PayTR legacy content-type compatibility endpoint- and provider-scoped", async () => {
  const transport = createBoundedProviderTransport({
    fetch: async () => new Response('{"status":"success"}', {
      status: 200,
      headers: { "content-type": PAYTR_LEGACY_JSON_CONTENT_TYPE },
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  assert.deepEqual(await request(transport, {
    url: "https://www.paytr.com/odeme/durum-sorgu",
  }), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.deepEqual(await iyzicoRequest(transport), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
});

test("rejects malformed PayTR get-token JSON despite its legacy response content type", async () => {
  const transport = createBoundedProviderTransport({
    fetch: async () => new Response('{"status":', {
      status: 200,
      headers: { "content-type": PAYTR_LEGACY_JSON_CONTENT_TYPE },
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  assert.deepEqual(await request(transport), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
});

test("rejects every non-byte-equal origin, path, query, and environment endpoint before fetch", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response("{}");
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  const cases = [
    "https://evil.example.test/odeme/api/get-token",
    "https://www.paytr.com/odeme/api/not-allowed",
    "https://www.paytr.com/odeme/api/get-token?next=1",
    "https://www.paytr.com:443/odeme/api/get-token",
    "https://WWW.paytr.com/odeme/api/get-token",
  ];

  for (const url of cases) {
    assert.deepEqual(await request(transport, { url }), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    }, url);
  }
  assert.deepEqual(await request(transport, {
    environment: "live",
    url: "https://www.paytr.com/odeme/not-live",
  }), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(calls, 0);
});

test("rejects accessor-backed request authority before fetch", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response("{}", {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  const input = {
    packet: PACKET,
    environment: "test" as const,
    url: ENDPOINT,
    method: "POST" as const,
    headers: { "content-type": FORM_CONTENT_TYPE } as const,
    body: new TextEncoder().encode("merchant_id=123456"),
  };
  Object.defineProperty(input, "url", {
    enumerable: true,
    get: () => ENDPOINT,
  });

  assert.deepEqual(await transport.request(input), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(calls, 0);
});

test("wipes a safely discoverable body when request validation fails before body parsing", async () => {
  let calls = 0;
  const body = new TextEncoder().encode("merchant_id=123456");
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response("{}", {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  const result = await transport.request({
    packet: PACKET,
    environment: "test",
    url: ENDPOINT,
    method: "POST",
    headers: { "content-type": FORM_CONTENT_TYPE },
    body,
    unexpectedAuthority: "rejected",
  } as never);

  assert.deepEqual(result, {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.deepEqual([...body], Array(body.length).fill(0));
  assert.equal(calls, 0);
});

test("uses typed-array intrinsics when caller fill is replaced after the provider call", async () => {
  for (const replacement of [
    () => undefined,
    () => { throw new Error("raw cleanup failure"); },
  ]) {
    const body = new TextEncoder().encode("merchant_id=123456");
    const transport = createBoundedProviderTransport({
      fetch: async () => {
        Object.defineProperty(body, "fill", {
          configurable: true,
          value: replacement,
        });
        return new Response('{"status":"success"}', {
          headers: { "content-type": JSON_CONTENT_TYPE },
        });
      },
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });

    const result = await request(transport, { body });

    assert.equal(result.kind, "response");
    assert.deepEqual([...body], Array(body.length).fill(0));
  }
});

test("uses typed-array intrinsics for provider-controlled response chunks", async () => {
  for (const replacement of [
    () => undefined,
    () => { throw new Error("raw provider chunk cleanup failure"); },
  ]) {
    const chunk = new TextEncoder().encode('{"status":"success"}');
    Object.defineProperty(chunk, "fill", {
      configurable: true,
      value: replacement,
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const transport = createBoundedProviderTransport({
      fetch: async () => new Response(stream, {
        headers: { "content-type": JSON_CONTENT_TYPE },
      }),
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });

    const result = await request(transport);

    assert.equal(result.kind, "response");
    assert.deepEqual([...chunk], Array(chunk.length).fill(0));
  }
});

test("rejects routing, rewrite, and method-override request headers before fetch", async () => {
  let calls = 0;
  const transport = createBoundedProviderTransport({
    fetch: async () => {
      calls += 1;
      return new Response("{}", {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  for (const name of [
    "forwarded",
    "x-forwarded-host",
    "x-original-url",
    "x-rewrite-url",
    "x-http-method-override",
  ]) {
    const result = await request(transport, {
      headers: {
        "content-type": FORM_CONTENT_TYPE,
        [name]: "https://evil.example.test/override",
      },
    });
    assert.deepEqual(result, {
      kind: "unknown",
      code: "transport_outcome_unknown",
    }, name);
  }
  assert.equal(calls, 0);
});

test("rejects redirects, cookies, locations, and non-exact response content types", async () => {
  const responses = [
    new Response(null, {
      status: 302,
      headers: { location: "https://evil.example.test/" },
    }),
    new Response("{}", {
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        "set-cookie": "provider_session=private",
      },
    }),
    new Response("{}", {
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        location: "https://www.paytr.com/next",
      },
    }),
    new Response("{}", { headers: { "content-type": "application/json;charset=utf-8" } }),
    new Response("{}", { headers: { "content-type": "text/html" } }),
  ];

  for (const response of responses) {
    const transport = createBoundedProviderTransport({
      fetch: async () => response,
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });
    assert.deepEqual(await request(transport), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
  }
});

test("aborts and non-blockingly cancels every response rejected before bounded reading", async () => {
  const cases: readonly Readonly<{
    status: number;
    headers: Readonly<Record<string, string>>;
  }>[] = [
    { status: 302, headers: { location: "https://evil.example.test/" } },
    { status: 200, headers: { "content-type": JSON_CONTENT_TYPE, "set-cookie": "private=x" } },
    { status: 200, headers: { "content-type": "text/html" } },
    { status: 199, headers: { "content-type": JSON_CONTENT_TYPE } },
  ];

  for (const selected of cases) {
    let cancelled = false;
    let requestSignal: AbortSignal | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("provider-private-body"));
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const transport = createBoundedProviderTransport({
      fetch: async (observed) => {
        requestSignal = observed.signal;
        const response = new Response(stream, {
          status: selected.status === 199 ? 200 : selected.status,
          headers: selected.headers,
        });
        if (selected.status === 199) {
          Object.defineProperty(response, "status", { value: 199 });
        }
        return response;
      },
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });

    const result = await request(transport);

    assert.deepEqual(result, {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
    assert.equal(cancelled, true, String(selected.status));
    assert.equal(requestSignal?.aborted, true, String(selected.status));
  }
});

test("rejects announced and streamed response overflow without returning provider bytes", async () => {
  const announced = createBoundedProviderTransport({
    fetch: async () => new Response("{}", {
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        "content-length": "8193",
      },
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  assert.deepEqual(await request(announced), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(8_192));
      controller.enqueue(new Uint8Array([123]));
    },
    cancel() {
      cancelled = true;
    },
  });
  const streamed = createBoundedProviderTransport({
    fetch: async () => new Response(stream, {
      headers: { "content-type": JSON_CONTENT_TYPE },
    }),
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  assert.deepEqual(await request(streamed), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(cancelled, true);
});

test("rejects malformed JSON, duplicate keys at any depth, and fatal UTF-8", async () => {
  const bodies: BodyInit[] = [
    '{"status":',
    '{"status":"success","status":"failed"}',
    '{"outer":{"token":"first","token":"second"}}',
    new Uint8Array([0xc3, 0x28]),
  ];

  for (const body of bodies) {
    const transport = createBoundedProviderTransport({
      fetch: async () => new Response(body, {
        headers: { "content-type": JSON_CONTENT_TYPE },
      }),
      timeoutMs: 20_000,
      maximumResponseBytes: 8_192,
    });
    assert.deepEqual(await request(transport), {
      kind: "unknown",
      code: "transport_outcome_unknown",
    });
  }
});

test("times out and catches fetch failures without retrying or exposing errors", async () => {
  let timeoutCalls = 0;
  const timeout = createBoundedProviderTransport({
    fetch: async () => {
      timeoutCalls += 1;
      return new Promise<Response>(() => undefined);
    },
    timeoutMs: 5,
    maximumResponseBytes: 8_192,
  });
  assert.deepEqual(await request(timeout), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(timeoutCalls, 1);

  let rejectedCalls = 0;
  const rejected = createBoundedProviderTransport({
    fetch: async () => {
      rejectedCalls += 1;
      throw new Error("raw private provider error");
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });
  assert.deepEqual(await request(rejected), {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
  assert.equal(rejectedCalls, 1);
});

test("does not wait for an uncooperative response stream cancellation after timeout", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      return new Promise<void>(() => undefined);
    },
    cancel() {
      return new Promise<void>(() => undefined);
    },
  });
  const transport = createBoundedProviderTransport({
    fetch: async () => new Response(stream, {
      headers: { "content-type": JSON_CONTENT_TYPE },
    }),
    timeoutMs: 5,
    maximumResponseBytes: 8_192,
  });

  const selected = await Promise.race([
    request(transport),
    new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), 100)),
  ]);

  assert.notEqual(selected, "stalled");
  assert.deepEqual(selected, {
    kind: "unknown",
    code: "transport_outcome_unknown",
  });
});

test("zeroes owned request and response chunk buffers after use", async () => {
  const requestBody = new TextEncoder().encode("merchant_id=123456");
  const responseChunk = new TextEncoder().encode('{"status":"success"}');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(responseChunk);
      controller.close();
    },
  });
  const transport = createBoundedProviderTransport({
    fetch: async (observed) => {
      await observed.arrayBuffer();
      return new Response(stream, {
        headers: { "content-type": JSON_CONTENT_TYPE },
      });
    },
    timeoutMs: 20_000,
    maximumResponseBytes: 8_192,
  });

  const response = await request(transport, { body: requestBody });

  assert.equal(response.kind, "response");
  assert.deepEqual([...requestBody], Array(requestBody.length).fill(0));
  assert.deepEqual([...responseChunk], Array(responseChunk.length).fill(0));
});
