import assert from "node:assert/strict";
import test from "node:test";

import {
  createMerchantProviderProductionConfigParser,
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

test("environment evidence cannot create owner validation authority while compiled authority is absent", () => {
  assert.equal(resolveMerchantProviderProductionMode(environment()), "disabled");
  assert.throws(
    () => parseMerchantProviderProductionConfig(environment()),
    /merchant_provider_production_config_invalid/,
  );
});

test("injected compiled authority parses the bounded worker config and ignores environment evidence", () => {
  const authority = Object.freeze({
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  });
  const parser = createMerchantProviderProductionConfigParser(authority);
  const config = parser.parse(environment({
    CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST: `sha256:${"b".repeat(64)}`,
  }));

  assert.equal(parser.resolveMode(environment()), "approved_test_validation");
  assert.equal(config.database.name, "celebix_saas_production");
  assert.equal(config.keyring.activeKeyId, "provider.current");
  assert.equal(config.keyring.keys[0]?.key.byteLength, 32);
  assert.deepEqual(config.validation, {
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
  });
  assert.deepEqual(config.executionAuthority, authority);
  assert.equal(Object.isFrozen(config), true);
});

test("compiled authority seam rejects unknown and accessor-backed records without reading accessors", () => {
  let accessorReads = 0;
  const accessorAuthority = {
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  };
  Object.defineProperty(accessorAuthority, "evidenceDigest", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return EVIDENCE;
    },
  });
  for (const authority of [
    { environment: "test", adapterVersion: 1, evidenceDigest: EVIDENCE, extra: true },
    accessorAuthority,
  ]) {
    const parser = createMerchantProviderProductionConfigParser(authority as never);
    assert.equal(parser.resolveMode(environment()), "disabled");
    assert.throws(() => parser.parse(environment()), /production_config_invalid/);
  }
  assert.equal(accessorReads, 0);
});

test("parsed key bytes are wiped on later config failure and retained only after ownership transfer", () => {
  const authority = Object.freeze({
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  });
  const captured: Uint8Array[] = [];
  const parser = createMerchantProviderProductionConfigParser(authority, {
    parseKeyring() {
      const key = new Uint8Array(32).fill(0x41);
      captured.push(key);
      return Object.freeze({
        activeKeyId: "provider.current",
        keys: Object.freeze([
          Object.freeze({ keyId: "provider.current", key }),
        ]),
      });
    },
  });

  assert.throws(
    () => parser.parse(environment({ CELEBIX_SAAS_DATABASE_NAME: "wrong_database" })),
    /production_config_invalid/,
  );
  assert.deepEqual([...captured[0]!], new Array(32).fill(0));

  const config = parser.parse(environment());
  assert.equal(config.keyring.keys[0]?.key, captured[1]);
  assert.deepEqual([...captured[1]!], new Array(32).fill(0x41));
});

test("is disabled by default and fails closed for missing secrets reserved IPs or uncontrolled return origins", () => {
  const parser = createMerchantProviderProductionConfigParser(Object.freeze({
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  }));
  assert.equal(resolveMerchantProviderProductionMode({}), "disabled");
  assert.throws(
    () => parser.parse(environment({
      CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: undefined,
    })),
    /config_invalid/,
  );
  for (const overrides of [
    { CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: undefined },
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
  ]) assert.throws(() => parser.parse(environment(overrides)), /config_invalid/);
});
