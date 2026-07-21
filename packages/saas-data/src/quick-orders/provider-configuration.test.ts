import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCanonicalPaytrConfiguration,
  parseCanonicalPaytrConfiguration,
  serializeCanonicalPaytrConfiguration,
  type CanonicalPaytrConfiguration,
} from "./index.ts";

function configuration(overrides: Record<string, unknown> = {}): CanonicalPaytrConfiguration {
  return {
    version: 1,
    merchantId: "merchant-123",
    merchantKey: "merchant-key-secret",
    merchantSalt: "merchant-salt-secret",
    callbackUrl: "https://pay.example.test/api/payments/paytr/callback",
    testMode: 1,
    ...overrides,
  } as CanonicalPaytrConfiguration;
}

const SERIALIZED = JSON.stringify([
  "celebix-paytr",
  1,
  "merchant-123",
  "merchant-key-secret",
  "merchant-salt-secret",
  "https://pay.example.test/api/payments/paytr/callback",
  1,
]);

test("PayTR configuration serializes exact canonical UTF-8 bytes in stable field order", () => {
  const first = configuration();
  const reordered = {
    callbackUrl: first.callbackUrl,
    merchantSalt: first.merchantSalt,
    testMode: first.testMode,
    merchantId: first.merchantId,
    version: first.version,
    merchantKey: first.merchantKey,
  };
  assert.equal(serializeCanonicalPaytrConfiguration(first), SERIALIZED);
  assert.equal(serializeCanonicalPaytrConfiguration(reordered), SERIALIZED);
  assert.equal(Buffer.from(serializeCanonicalPaytrConfiguration(first), "utf8").toString("utf8"), SERIALIZED);
});

test("PayTR configuration parse returns a deep-frozen copy with byte-equal reserialization", () => {
  const parsed = parseCanonicalPaytrConfiguration(SERIALIZED);
  assert.deepEqual(parsed, configuration());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(serializeCanonicalPaytrConfiguration(parsed), SERIALIZED);
});

test("PayTR configuration digest is lowercase SHA-256 of the exact canonical bytes", () => {
  assert.equal(digestCanonicalPaytrConfiguration(SERIALIZED), "122a39b16ec4d87a004e50c21a3d7bd94201320c5b8066ddb0c1227261008f77");
  assert.equal(digestCanonicalPaytrConfiguration(serializeCanonicalPaytrConfiguration(configuration())), digestCanonicalPaytrConfiguration(SERIALIZED));
  assert.throws(() => digestCanonicalPaytrConfiguration(`${SERIALIZED}\n`), /paytr_configuration_invalid/);
});

test("PayTR configuration requires exact own data keys without hostile property access", () => {
  const missing = { ...configuration() } as Record<string, unknown>;
  delete missing.merchantSalt;
  const inherited = Object.create(configuration()) as CanonicalPaytrConfiguration;
  let getterCalled = false;
  const getter = configuration();
  Object.defineProperty(getter, "merchantKey", { enumerable: true, get() { getterCalled = true; throw new Error("hostile"); } });
  for (const value of [
    missing,
    inherited,
    [],
    configuration({ unexpected: true }),
    getter,
    new Proxy(configuration(), { ownKeys() { throw new Error("hostile"); } }),
  ]) {
    assert.throws(() => serializeCanonicalPaytrConfiguration(value as CanonicalPaytrConfiguration), /paytr_configuration_invalid/);
  }
  assert.equal(getterCalled, false);
});

test("PayTR configuration enforces bounded non-whitespace merchant values and test mode one", () => {
  for (const overrides of [
    { version: 2 },
    { merchantId: "" },
    { merchantId: " merchant-123" },
    { merchantId: "merchant\n123" },
    { merchantId: "m".repeat(129) },
    { merchantKey: "k".repeat(257) },
    { merchantSalt: "salt " },
    { testMode: 0 },
    { testMode: true },
  ]) {
    assert.throws(() => serializeCanonicalPaytrConfiguration(configuration(overrides)), /paytr_configuration_invalid/);
  }
});

test("PayTR configuration accepts only the exact canonical HTTPS callback route", () => {
  for (const callbackUrl of [
    "http://pay.example.test/api/payments/paytr/callback",
    "https://PAY.example.test/api/payments/paytr/callback",
    "https://user@pay.example.test/api/payments/paytr/callback",
    "https://pay.example.test:443/api/payments/paytr/callback",
    "https://pay.example.test/api/payments/paytr/callback/",
    "https://pay.example.test/api/payments/paytr/callback?x=1",
    "https://pay.example.test/api/payments/paytr/callback#x",
    "https://pay.example.test/api/payments/paytr/%63allback",
    "https://pay.example.test/other",
  ]) {
    assert.throws(() => serializeCanonicalPaytrConfiguration(configuration({ callbackUrl })), /paytr_configuration_invalid/);
  }
  for (const serialized of [
    JSON.stringify(["celebix-paytr", 1, "merchant-123", "merchant-key-secret", "merchant-salt-secret", "https://pay.example.test/api/payments/paytr/callback", 1, "extra"]),
    JSON.stringify(["celebix-paytr", 1, "merchant-123", "merchant-key-secret", "merchant-salt-secret", "https://pay.example.test/api/payments/paytr/callback", 0]),
    ` ${SERIALIZED}`,
    JSON.stringify({ merchantId: "merchant-123" }),
  ]) {
    assert.throws(() => parseCanonicalPaytrConfiguration(serialized), /paytr_configuration_invalid/);
  }
});
