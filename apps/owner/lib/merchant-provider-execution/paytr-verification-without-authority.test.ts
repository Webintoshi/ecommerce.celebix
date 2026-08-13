import assert from "node:assert/strict";
import test from "node:test";

import {
  createMerchantProviderProductionConfigParser,
} from "./production-config.ts";
import { createProductionMerchantProviderRegistries } from "./registry.ts";

const KEY = Buffer.alloc(32, 0x41).toString("base64url");

test("PayTR credentials can be verified without opening payment execution", () => {
  const parser = createMerchantProviderProductionConfigParser(Object.freeze({
    iyzico_iframe: null,
    paytr_iframe: null,
  }), Object.freeze({
    iyzico_iframe: Object.freeze([]),
    paytr_iframe: Object.freeze([
      Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
    ]),
  }));
  const config = parser.parse({
    CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: "approved_test_validation",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@db.celebix.internal:5432/celebix_saas_production",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: "provider.current",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: `provider.current:${KEY}`,
    CELEBIX_MERCHANT_PROVIDER_WORKER_ID: "owner.payments.1",
    CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "8.8.8.8",
    CELEBIX_PAYTR_VALIDATION_ORIGIN: "https://payments.celebix.co",
  });

  assert.deepEqual(config.paytrValidation, {
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
  });

  const registries = createProductionMerchantProviderRegistries(Object.freeze({
    executionAuthorities: config.executionAuthorities,
    verificationIdentities: config.verificationIdentities,
    transport: Object.freeze({ async request() { throw new Error("must_not_request"); } }),
    paytrValidation: config.paytrValidation,
    validationReference: () => "11111111-1111-4111-8111-111111111111",
    validationRandomKey: () => "1234567890abcdef",
    validationTimeoutMs: 5_000,
  }));

  assert.equal(registries.execution.size, 0);
  assert.ok(registries.verification.get("paytr_iframe", "payment_processing", {
    environment: "test",
    adapterVersion: 1,
  }));
});
