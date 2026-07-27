import assert from "node:assert/strict";
import test from "node:test";

import type { ProviderTransportRequest } from "@celebix/payment-adapters";

import { createProductionMerchantProviderRegistry } from "./registry.ts";

const REFERENCE = "11111111-1111-4111-8111-111111111111";
const TOKEN = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
const EVIDENCE = `sha256:${"a".repeat(64)}`;

function registry(providerBody: string | null, observed: ProviderTransportRequest[]) {
  return createProductionMerchantProviderRegistry(Object.freeze({
    executionAuthority: Object.freeze({ environment: "test", adapterVersion: 1, evidenceDigest: EVIDENCE }),
    transport: Object.freeze({
      async request(request: ProviderTransportRequest) {
        observed.push(Object.freeze({ ...request, body: request.body.slice() }));
        return providerBody === null
          ? Object.freeze({ kind: "unknown" as const, code: "transport_outcome_unknown" as const })
          : Object.freeze({ kind: "response" as const, status: 200, contentType: "application/json" as const, body: new TextEncoder().encode(providerBody) });
      },
    }),
    validationReference: () => REFERENCE,
    validationTimeoutMs: 5_000,
    validationUserIp: "8.8.8.8",
    validationSuccessUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    validationFailureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
  }));
}

test("production registry validates one exact PayTR TEST credential without a card callback or payment execution", async () => {
  const observed: ProviderTransportRequest[] = [];
  const selected = registry(`{"status":"success","token":"${TOKEN}"}`, observed);
  const adapter = selected.get("paytr_iframe", "payment_processing");
  assert.ok(adapter);
  const credential = new TextEncoder().encode(JSON.stringify({ merchantKey: "merchant-key", merchantSalt: "merchant-salt" }));
  assert.deepEqual(await adapter.validateCredential(Object.freeze({
    credential,
    publicConfig: Object.freeze({ environment: "test", merchantId: "123456" }),
  })), { kind: "validated" });
  credential.fill(0);
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.url, "https://www.paytr.com/odeme/api/get-token");
  const form = new URLSearchParams(new TextDecoder().decode(observed[0]?.body));
  assert.equal(form.get("test_mode"), "1");
  assert.equal(form.get("payment_amount"), "1");
  assert.equal(form.get("user_ip"), "8.8.8.8");
  assert.equal(form.get("merchant_ok_url"), "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili");
  assert.equal(form.has("cc_owner"), false);
  assert.equal(form.has("card_number"), false);
  assert.deepEqual(await adapter.execute({} as never), { kind: "permanently_failed", outcomeCode: "payment_capability_not_queued" });
  assert.deepEqual(await adapter.reconcile({} as never), { kind: "permanently_failed", outcomeCode: "payment_capability_not_queued" });
  assert.equal(observed.length, 1);
});

test("production PayTR validator rejects provider rejection ambiguity live mode and malformed sealed plaintext", async () => {
  for (const [providerBody, expectedCode] of [
    ['{"status":"failed","reason":"private"}', "provider_rejected"],
    [null, "validation_unavailable"],
  ] as const) {
    const observed: ProviderTransportRequest[] = [];
    const adapter = registry(providerBody, observed).get("paytr_iframe", "payment_processing");
    assert.ok(adapter);
    assert.deepEqual(await adapter.validateCredential({
      credential: new TextEncoder().encode(JSON.stringify({ merchantKey: "merchant-key", merchantSalt: "merchant-salt" })),
      publicConfig: Object.freeze({ environment: "test", merchantId: "123456" }),
    }), { kind: "rejected", outcomeCode: expectedCode });
    assert.equal(observed.length, 1);
  }

  for (const input of [
    { credential: new TextEncoder().encode("{}"), publicConfig: Object.freeze({ environment: "test", merchantId: "123456" }) },
    { credential: new TextEncoder().encode(JSON.stringify({ merchantKey: "key", merchantSalt: "salt" })), publicConfig: Object.freeze({ environment: "live", merchantId: "123456" }) },
    { credential: new TextEncoder().encode(JSON.stringify({ merchantKey: "key", merchantSalt: "salt", token: "x" })), publicConfig: Object.freeze({ environment: "test", merchantId: "123456" }) },
  ]) {
    const observed: ProviderTransportRequest[] = [];
    const adapter = registry(`{"status":"success","token":"${TOKEN}"}`, observed).get("paytr_iframe", "payment_processing");
    assert.ok(adapter);
    assert.deepEqual(await adapter.validateCredential(input), { kind: "rejected", outcomeCode: "invalid_validation_request" });
    assert.equal(observed.length, 0);
  }
});
