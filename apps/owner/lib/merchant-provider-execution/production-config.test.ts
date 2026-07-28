import assert from "node:assert/strict";
import test from "node:test";

import {
  createMerchantProviderProductionConfigParser,
  parseMerchantProviderProductionConfig,
  resolveMerchantProviderProductionMode,
} from "./production-config.ts";
import { createProductionMerchantProviderRegistries } from "./registry.ts";

const KEY = Buffer.alloc(32, 0x41).toString("base64url");
const EVIDENCE = `sha256:${"a".repeat(64)}`;
const NO_AUTHORITIES = Object.freeze({
  iyzico_iframe: null,
  paytr_iframe: null,
});
const IYZICO_IDENTITIES = Object.freeze({
  iyzico_iframe: Object.freeze([
    Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
    Object.freeze({ environment: "live" as const, adapterVersion: 1 }),
  ]),
  paytr_iframe: Object.freeze([]),
});

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

test("compiled provider-keyed identities enable Iyzico verification while both execution authorities stay null", () => {
  assert.equal(resolveMerchantProviderProductionMode(environment()), "approved_test_validation");
  const config = parseMerchantProviderProductionConfig(environment());

  assert.deepEqual(config.executionAuthorities, NO_AUTHORITIES);
  assert.deepEqual(config.verificationIdentities, IYZICO_IDENTITIES);
  assert.equal(config.paytrValidation, null);
  assert.equal(Object.isFrozen(config.executionAuthorities), true);
  assert.equal(Object.isFrozen(config.verificationIdentities), true);
  assert.equal(Object.isFrozen(config.verificationIdentities.iyzico_iframe), true);
});

test("provider-keyed compiled authority seam parses only the selected PayTR config and ignores environment evidence", () => {
  const paytrAuthority = Object.freeze({
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  });
  const parser = createMerchantProviderProductionConfigParser(Object.freeze({
    iyzico_iframe: null,
    paytr_iframe: paytrAuthority,
  }), Object.freeze({
    iyzico_iframe: Object.freeze([]),
    paytr_iframe: Object.freeze([]),
  }));
  const config = parser.parse(environment({
    CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST: `sha256:${"b".repeat(64)}`,
  }));

  assert.equal(parser.resolveMode(environment()), "approved_test_validation");
  assert.equal(config.database.name, "celebix_saas_production");
  assert.equal(config.keyring.activeKeyId, "provider.current");
  assert.equal(config.keyring.keys[0]?.key.byteLength, 32);
  assert.deepEqual(config.paytrValidation, {
    userIp: "8.8.8.8",
    successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
    failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
  });
  assert.deepEqual(config.executionAuthorities, {
    iyzico_iframe: null,
    paytr_iframe: paytrAuthority,
  });
  assert.equal(Object.isFrozen(config), true);
});

test("compiled provider maps reject unknown accessor-backed and duplicate identity records without reading accessors", () => {
  let accessorReads = 0;
  const accessorMap = {
    iyzico_iframe: null,
    paytr_iframe: null,
  };
  Object.defineProperty(accessorMap, "iyzico_iframe", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return null;
    },
  });
  const invalidSelections = [
    [Object.freeze({ ...NO_AUTHORITIES, extra: null }), IYZICO_IDENTITIES],
    [Object.freeze(accessorMap), IYZICO_IDENTITIES],
    [NO_AUTHORITIES, Object.freeze({
      ...IYZICO_IDENTITIES,
      iyzico_iframe: Object.freeze([
        Object.freeze({ environment: "test", adapterVersion: 1 }),
        Object.freeze({ environment: "test", adapterVersion: 1 }),
      ]),
    })],
  ] as const;
  for (const [authorities, identities] of invalidSelections) {
    const parser = createMerchantProviderProductionConfigParser(authorities as never, identities as never);
    assert.equal(parser.resolveMode(environment()), "disabled");
    assert.throws(() => parser.parse(environment()), /production_config_invalid/);
  }
  assert.equal(accessorReads, 0);
});

test("parsed key bytes are wiped on later config failure and retained only after ownership transfer", () => {
  const captured: Uint8Array[] = [];
  const parser = createMerchantProviderProductionConfigParser(NO_AUTHORITIES, IYZICO_IDENTITIES, {
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

test("is disabled without compiled lanes and fails closed for missing base configuration", () => {
  const disabled = createMerchantProviderProductionConfigParser(NO_AUTHORITIES, Object.freeze({
    iyzico_iframe: Object.freeze([]),
    paytr_iframe: Object.freeze([]),
  }));
  assert.equal(disabled.resolveMode(environment()), "disabled");
  assert.equal(resolveMerchantProviderProductionMode({}), "disabled");
  assert.throws(
    () => parseMerchantProviderProductionConfig(environment({
      CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: undefined,
    })),
    /config_invalid/,
  );
  for (const overrides of [
    { CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS: undefined },
    { CELEBIX_SAAS_DATABASE_NAME: "wrong_database" },
  ]) assert.throws(() => parseMerchantProviderProductionConfig(environment(overrides)), /config_invalid/);
});

test("PayTR network settings remain bounded only when a compiled PayTR authority exists", () => {
  const parser = createMerchantProviderProductionConfigParser(Object.freeze({
    iyzico_iframe: null,
    paytr_iframe: Object.freeze({
      environment: "test",
      adapterVersion: 1,
      evidenceDigest: EVIDENCE,
    }),
  }), Object.freeze({
    iyzico_iframe: Object.freeze([]),
    paytr_iframe: Object.freeze([]),
  }));
  for (const overrides of [
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
  ]) assert.throws(() => parser.parse(environment(overrides)), /config_invalid/);
});

test("production registries keep verification identities separate and omit both null execution authorities", () => {
  const selected = createProductionMerchantProviderRegistries(Object.freeze({
    executionAuthorities: NO_AUTHORITIES,
    verificationIdentities: IYZICO_IDENTITIES,
    transport: Object.freeze({ async request() { throw new Error("must_not_request"); } }),
    paytrValidation: null,
    validationReference: () => "11111111-1111-4111-8111-111111111111",
    validationRandomKey: () => "1234567890abcdef",
    validationTimeoutMs: 5_000,
  }));

  assert.equal(selected.execution.size, 0);
  assert.equal(selected.verification.size, 2);
  assert.equal(selected.verification.get("iyzico_iframe", "payment_processing", {
    environment: "test",
    adapterVersion: 1,
  })?.validationIdentity.environment, "test");
  assert.equal(selected.verification.get("iyzico_iframe", "payment_processing", {
    environment: "live",
    adapterVersion: 1,
  })?.validationIdentity.environment, "live");
  assert.equal(selected.verification.get("paytr_iframe", "payment_processing", {
    environment: "test",
    adapterVersion: 1,
  }), null);
  assert.deepEqual(Reflect.ownKeys(selected.verification.list()[0]!).sort(), [
    "capability", "providerCode", "validateCredential", "validationIdentity",
  ]);
  assert.equal(Object.isFrozen(selected), true);
});

test("production execution registry adds PayTR only when its exact authority and settings are both present", () => {
  const authority = Object.freeze({
    environment: "test" as const,
    adapterVersion: 1,
    evidenceDigest: EVIDENCE,
  });
  const selected = createProductionMerchantProviderRegistries(Object.freeze({
    executionAuthorities: Object.freeze({ iyzico_iframe: null, paytr_iframe: authority }),
    verificationIdentities: Object.freeze({
      iyzico_iframe: Object.freeze([]),
      paytr_iframe: Object.freeze([]),
    }),
    transport: Object.freeze({ async request() { throw new Error("must_not_request"); } }),
    paytrValidation: Object.freeze({
      userIp: "8.8.8.8",
      successUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarili",
      failureUrl: "https://payments.celebix.co/odeme/hizli/sonuc?durum=basarisiz",
    }),
    validationReference: () => "11111111-1111-4111-8111-111111111111",
    validationRandomKey: () => "1234567890abcdef",
    validationTimeoutMs: 5_000,
  }));

  assert.equal(selected.execution.size, 1);
  assert.deepEqual(selected.execution.get("paytr_iframe", "payment_processing")?.executionAuthority, authority);
  assert.equal(selected.execution.get("iyzico_iframe", "payment_processing"), null);
  assert.equal(selected.verification.size, 0);
});

test("production registry rejects accessor-backed provider maps without invoking accessors", () => {
  let reads = 0;
  const authorities = { paytr_iframe: null } as Record<string, unknown>;
  Object.defineProperty(authorities, "iyzico_iframe", {
    enumerable: true,
    get() { reads += 1; return null; },
  });
  Object.freeze(authorities);
  assert.throws(() => createProductionMerchantProviderRegistries(Object.freeze({
    executionAuthorities: authorities as never,
    verificationIdentities: IYZICO_IDENTITIES,
    transport: Object.freeze({ async request() { throw new Error("must_not_request"); } }),
    paytrValidation: null,
    validationReference: () => "11111111-1111-4111-8111-111111111111",
    validationRandomKey: () => "1234567890abcdef",
    validationTimeoutMs: 5_000,
  })), /registry_invalid/);
  assert.equal(reads, 0);
});
