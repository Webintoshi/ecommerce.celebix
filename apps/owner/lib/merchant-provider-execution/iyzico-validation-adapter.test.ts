import assert from "node:assert/strict";
import test from "node:test";

import type {
  ProviderTransport,
  ProviderTransportRequest,
  ProviderTransportResult,
} from "@celebix/payment-adapters";

const REFERENCE = "11111111-1111-4111-8111-111111111111";
const RANDOM_KEY = "abcdefghijklmnop";

type AdapterModule = Readonly<{
  createIyzicoValidationAdapter(options: Readonly<{
    validationIdentity: Readonly<{ environment: "test" | "live"; adapterVersion: 1 }>;
    transport: ProviderTransport;
    validationReference(): string;
    validationRandomKey(): string;
    validationTimeoutMs: number;
  }>): Readonly<{
    providerCode: string;
    capability: string;
    validationIdentity: Readonly<{ environment: "test" | "live"; adapterVersion: number }>;
    validateCredential(input: Readonly<{
      credential: Uint8Array;
      publicConfig: Readonly<Record<string, unknown>>;
    }>): Promise<Readonly<{ kind: "validated" }> | Readonly<{ kind: "rejected"; outcomeCode: string }>>;
  }>;
}>;

async function implementation(): Promise<AdapterModule> {
  const selected = await import("./iyzico-validation-adapter.ts").catch(() => null);
  assert.ok(selected, "iyzico validation adapter module must exist");
  return selected as AdapterModule;
}

function response(value: unknown, status = 200): ProviderTransportResult {
  return Object.freeze({
    kind: "response" as const,
    status,
    contentType: "application/json" as const,
    body: new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)),
  });
}

function options(
  request: (value: ProviderTransportRequest) => ProviderTransportResult | Promise<ProviderTransportResult>,
  environment: "test" | "live" = "test",
  timeoutMs = 500,
) {
  return Object.freeze({
    validationIdentity: Object.freeze({ environment, adapterVersion: 1 as const }),
    transport: Object.freeze({
      request: Object.freeze(async (value: ProviderTransportRequest) => request(value)),
    }),
    validationReference: Object.freeze(() => REFERENCE),
    validationRandomKey: Object.freeze(() => RANDOM_KEY),
    validationTimeoutMs: timeoutMs,
  });
}

function credential(overrides: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    apiKey: "sandbox-api-key",
    secretKey: "sandbox-secret-key",
    ...overrides,
  }));
}

test("Iyzico verifier parses exact credential JSON and calls the fixed BIN-check through core transport", async () => {
  const { createIyzicoValidationAdapter } = await implementation();
  const observed: ProviderTransportRequest[] = [];
  const adapter = createIyzicoValidationAdapter(options((request) => {
    observed.push(Object.freeze({ ...request, body: request.body.slice() }));
    return response({
      status: "success",
      conversationId: REFERENCE,
      binNumber: "41579200",
    });
  }));
  const plaintext = credential();

  assert.deepEqual(await adapter.validateCredential(Object.freeze({
    credential: plaintext,
    publicConfig: Object.freeze({ environment: "test" }),
  })), { kind: "validated" });
  assert.equal(adapter.providerCode, "iyzico_iframe");
  assert.equal(adapter.capability, "payment_processing");
  assert.deepEqual(adapter.validationIdentity, { environment: "test", adapterVersion: 1 });
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.url, "https://sandbox-api.iyzipay.com/payment/bin/check");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(observed[0]?.body)), {
    locale: "tr",
    binNumber: "41579200",
    conversationId: REFERENCE,
  });
  assert.equal(plaintext.every((byte) => byte === 0), true);
});

test("Iyzico verifier rejects environment and exact credential mismatches before transport and wipes plaintext", async () => {
  const { createIyzicoValidationAdapter } = await implementation();
  for (const input of [
    { plaintext: credential(), publicConfig: Object.freeze({ environment: "live" }) },
    { plaintext: credential({ extra: "forbidden" }), publicConfig: Object.freeze({ environment: "test" }) },
    { plaintext: new TextEncoder().encode('{"apiKey":"only"}'), publicConfig: Object.freeze({ environment: "test" }) },
    { plaintext: new Uint8Array([0xff]), publicConfig: Object.freeze({ environment: "test" }) },
  ]) {
    let calls = 0;
    const adapter = createIyzicoValidationAdapter(options(() => {
      calls += 1;
      return response({});
    }));
    assert.deepEqual(await adapter.validateCredential(Object.freeze({
      credential: input.plaintext,
      publicConfig: input.publicConfig,
    })), { kind: "rejected", outcomeCode: "invalid_validation_request" });
    assert.equal(calls, 0);
    assert.equal(input.plaintext.every((byte) => byte === 0), true);
  }
});

test("Iyzico verifier rejects duplicate credential JSON keys including escaped equivalents before transport", async () => {
  const { createIyzicoValidationAdapter } = await implementation();
  const encoded = [
    '{"apiKey":"first-key","apiKey":"second-key","secretKey":"sandbox-secret-key"}',
    '{"apiKey":"sandbox-api-key","secretKey":"first-key","secretKey":"second-key"}',
    '{"apiKey":"first-key","\\u0061piKey":"second-key","secretKey":"sandbox-secret-key"}',
    '{"apiKey":"sandbox-api-key","secretKey":"first-key","secret\\u004bey":"second-key"}',
    '{"apiKey":"sandbox-api-key","secretKey":{"nested":"first","\\u006eested":"second"}}',
  ].map((value) => new TextEncoder().encode(value));
  let calls = 0;
  const adapter = createIyzicoValidationAdapter(options(() => {
    calls += 1;
    return response({
      status: "success",
      conversationId: REFERENCE,
      binNumber: "41579200",
    });
  }));

  for (const plaintext of encoded) {
    assert.deepEqual(await adapter.validateCredential(Object.freeze({
      credential: plaintext,
      publicConfig: Object.freeze({ environment: "test" }),
    })), { kind: "rejected", outcomeCode: "invalid_validation_request" });
    assert.equal(plaintext.every((byte) => byte === 0), true);
  }
  assert.equal(calls, 0);
});

test("Iyzico verifier rejects an own fill override before transport and wipes with the typed-array intrinsic", async () => {
  const { createIyzicoValidationAdapter } = await implementation();
  const plaintext = credential();
  Object.defineProperty(plaintext, "fill", {
    configurable: true,
    value: () => plaintext,
    writable: true,
  });
  let calls = 0;
  const adapter = createIyzicoValidationAdapter(options(() => {
    calls += 1;
    return response({
      status: "success",
      conversationId: REFERENCE,
      binNumber: "41579200",
    });
  }));

  assert.deepEqual(await adapter.validateCredential(Object.freeze({
    credential: plaintext,
    publicConfig: Object.freeze({ environment: "test" }),
  })), { kind: "rejected", outcomeCode: "invalid_validation_request" });
  assert.equal(calls, 0);
  assert.equal(plaintext.every((byte) => byte === 0), true);
});

test("Iyzico verifier maps only explicit auth rejection to provider_rejected and remote uncertainty to validation_unavailable", async () => {
  const { createIyzicoValidationAdapter } = await implementation();
  const cases = [
    { result: response({ status: "failure", errorCode: "1000", errorMessage: "private" }, 401), code: "provider_rejected" },
    { result: response({ status: "failure", errorCode: "12", errorMessage: "private" }, 401), code: "validation_unavailable" },
    { result: response({ status: "failure", errorCode: "1", errorGroup: "SYSTEM_ERROR" }, 400), code: "validation_unavailable" },
    { result: response({ status: "failure", errorCode: "2000", errorGroup: "BUSINESS_ERROR" }, 403), code: "validation_unavailable" },
    { result: Object.freeze({ kind: "unknown" as const, code: "transport_outcome_unknown" as const }), code: "validation_unavailable" },
    { result: response({ status: "failure" }, 429), code: "validation_unavailable" },
    { result: response({ status: "failure" }, 503), code: "validation_unavailable" },
    { result: response("{", 200), code: "validation_unavailable" },
  ] as const;
  for (const selected of cases) {
    const plaintext = credential();
    const adapter = createIyzicoValidationAdapter(options(() => selected.result));
    assert.deepEqual(await adapter.validateCredential({
      credential: plaintext,
      publicConfig: Object.freeze({ environment: "test" }),
    }), { kind: "rejected", outcomeCode: selected.code });
    assert.equal(plaintext.every((byte) => byte === 0), true);
  }

  const thrownPlaintext = credential();
  const throwingAdapter = createIyzicoValidationAdapter(options(() => {
    throw new Error("private_transport_failure");
  }));
  assert.deepEqual(await throwingAdapter.validateCredential({
    credential: thrownPlaintext,
    publicConfig: Object.freeze({ environment: "test" }),
  }), { kind: "rejected", outcomeCode: "validation_unavailable" });
  assert.equal(thrownPlaintext.every((byte) => byte === 0), true);

  const plaintext = credential();
  const timeoutAdapter = createIyzicoValidationAdapter(options((request) =>
    new Promise((resolve) => {
      assert.ok(request.signal);
      request.signal.addEventListener("abort", () => resolve(Object.freeze({
        kind: "unknown" as const,
        code: "transport_outcome_unknown" as const,
      })), { once: true });
    }), "test", 100));
  assert.deepEqual(await timeoutAdapter.validateCredential({
    credential: plaintext,
    publicConfig: Object.freeze({ environment: "test" }),
  }), { kind: "rejected", outcomeCode: "validation_unavailable" });
  assert.equal(plaintext.every((byte) => byte === 0), true);
});
