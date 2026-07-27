import assert from "node:assert/strict";
import test from "node:test";

import {
  createBoundedProviderTransport,
  parsePaymentAdapterPacket,
  type PaymentAdapterPacket,
} from "./index.ts";

function packetFixture(): Record<string, unknown> {
  return {
    providerCode: "paytr_iframe",
    familyCode: "paytr",
    modeCode: "iframe",
    adapterVersion: 1,
    implementation: "hosted",
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

function request(
  transport: ReturnType<typeof createBoundedProviderTransport>,
  overrides: Partial<{
    packet: PaymentAdapterPacket;
    environment: "test" | "live";
    url: string;
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
    signal: AbortSignal;
  }> = {},
) {
  return transport.request({
    packet: PACKET,
    environment: "test",
    url: ENDPOINT,
    method: "POST",
    headers: { "content-type": FORM_CONTENT_TYPE },
    body: new TextEncoder().encode("merchant_id=123456"),
    ...overrides,
  });
}

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
    headers: { "content-type": FORM_CONTENT_TYPE },
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
