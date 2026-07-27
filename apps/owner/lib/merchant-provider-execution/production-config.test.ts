import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMerchantProviderProductionConfig,
  resolveMerchantProviderProductionMode,
} from "./production-config.ts";

const KEY = Buffer.alloc(32, 0x41).toString("base64url");
const EVIDENCE = `sha256:${"a".repeat(64)}`;

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: "approved_test_validation",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@db.celebix.internal:5432/celebix_saas_production",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID: "provider.current",
    CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: `provider.current:${KEY}`,
    CELEBIX_MERCHANT_PROVIDER_WORKER_ID: "owner.payments.1",
    CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "8.8.8.8",
    CELEBIX_PAYTR_VALIDATION_ORIGIN: "https://payments.celebix.co",
    CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST: EVIDENCE,
    ...overrides,
  };
}

test("parses the exact production worker database keyring and controlled PayTR validation authority", () => {
  const config = parseMerchantProviderProductionConfig(environment());
  assert.equal(config.database.name, "celebix_saas_production");
  assert.equal(config.keyring.activeKeyId, "provider.current");
  assert.equal(config.keyring.keys[0]?.key.byteLength, 32);
  assert.deepEqual(config.validation, {
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
  });
  assert.deepEqual(config.executionAuthority, { environment: "test", adapterVersion: 1, evidenceDigest: EVIDENCE });
  assert.equal(Object.isFrozen(config), true);
});

test("is disabled by default and fails closed for missing secrets reserved IPs or uncontrolled return origins", () => {
  assert.equal(resolveMerchantProviderProductionMode({}), "disabled");
  assert.throws(() => parseMerchantProviderProductionConfig(environment({ CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: undefined })), /config_invalid/);
  for (const overrides of [
    { CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: undefined },
    { CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST: "sha256:test-only-fixture" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "198.51.100.1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "10.0.0.1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "::ffff:127.0.0.1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "ff02::1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "0:0:0:0:0:0:0:1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "0000:0000:0000:0000:0000:ffff:7f00:1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "::ffff:7f00:1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "fe80::1" },
    { CELEBIX_PAYTR_VALIDATION_EGRESS_IP: "2001:db8::1" },
    { CELEBIX_PAYTR_VALIDATION_ORIGIN: "https://validation.celebix.invalid" },
    { CELEBIX_PAYTR_VALIDATION_ORIGIN: "https://127.0.0.1" },
    { CELEBIX_PAYTR_VALIDATION_ORIGIN: "https://[::1]" },
    { CELEBIX_PAYTR_VALIDATION_ORIGIN: "http://payments.celebix.co" },
    { CELEBIX_SAAS_DATABASE_NAME: "wrong_database" },
  ]) assert.throws(() => parseMerchantProviderProductionConfig(environment(overrides)), /config_invalid/);
});
