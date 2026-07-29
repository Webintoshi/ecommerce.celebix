import assert from "node:assert/strict";
import test from "node:test";

import {
  QUICK_LINK_SERVER_ENVIRONMENT_FIELDS,
  parseQuickLinkServerConfig,
  resolveQuickLinkServerMode,
} from "./config.ts";

const KEY_A = Buffer.alloc(32, 0x11).toString("base64url");
const KEY_B = Buffer.alloc(32, 0x22).toString("base64url");

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID: "quick.current",
    CELEBIX_QUICK_ORDER_KEYS: `quick.current:${KEY_A},quick.retired:${KEY_B}`,
    CELEBIX_PAYTR_STAGING_MERCHANT_ID: "merchant-id",
    CELEBIX_PAYTR_STAGING_MERCHANT_KEY: "merchant-key",
    CELEBIX_PAYTR_STAGING_MERCHANT_SALT: "merchant-salt",
    CELEBIX_PAYTR_STAGING_CALLBACK_URL: "https://shop.saas-staging.celebix.site/api/payments/paytr/callback",
    CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
    ...overrides,
  };
}

test("quick-link server mode is enabled only for approved staging", () => {
  assert.equal(resolveQuickLinkServerMode(environment()), "approved_staging");
  for (const source of [
    environment({ CELEBIX_SAAS_AUTH_MODE: "disabled" }),
    environment({ CELEBIX_DEPLOYMENT_TIER: "production" }),
    {},
  ]) assert.equal(resolveQuickLinkServerMode(source), "disabled");
});

test("parses the exact server-only keyring and canonical PayTR staging configuration", () => {
  const config = parseQuickLinkServerConfig(environment());
  assert.equal(config.keyring.activeKeyId, "quick.current");
  assert.deepEqual(config.keyring.keys.map(({ keyId }) => keyId), ["quick.current", "quick.retired"]);
  assert.deepEqual(config.paytrConfiguration, {
    version: 1,
    merchantId: "merchant-id",
    merchantKey: "merchant-key",
    merchantSalt: "merchant-salt",
    callbackUrl: "https://shop.saas-staging.celebix.site/api/payments/paytr/callback",
    testMode: 1,
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.keyring.keys), true);
});

test("rejects missing extra and non-staging provider fields", () => {
  const missing = environment();
  delete (missing as Record<string, string | undefined>).CELEBIX_PAYTR_STAGING_MERCHANT_KEY;
  assert.throws(() => parseQuickLinkServerConfig(missing), /quick_link_server_config_invalid/);
  assert.throws(() => parseQuickLinkServerConfig({ ...environment(), EXTRA: "unsafe" }), /quick_link_server_config_invalid/);
  assert.throws(
    () => parseQuickLinkServerConfig(environment({ CELEBIX_PAYTR_STAGING_TEST_MODE: "0" })),
    /quick_link_server_config_invalid/,
  );
});

test("rejects noncanonical callback URLs and provider secret text", () => {
  for (const overrides of [
    { CELEBIX_PAYTR_STAGING_CALLBACK_URL: "http://shop.example/api/payments/paytr/callback" },
    { CELEBIX_PAYTR_STAGING_CALLBACK_URL: "https://shop.example/api/payments/paytr/callback?x=1" },
    { CELEBIX_PAYTR_STAGING_CALLBACK_URL: "https://shop.example/other" },
    { CELEBIX_PAYTR_STAGING_MERCHANT_SALT: " salt" },
  ]) assert.throws(() => parseQuickLinkServerConfig(environment(overrides)), /quick_link_server_config_invalid/);
});

test("rejects malformed duplicate and noncanonical quick-order keys", () => {
  for (const value of [
    `quick.current:${KEY_A},quick.current:${KEY_B}`,
    `quick.current:${KEY_A},quick.retired:${KEY_A}`,
    `quick.current:${KEY_A}, quick.retired:${KEY_B}`,
    `quick.current:${KEY_A},`,
    `quick.current:${KEY_A}=`,
  ]) {
    assert.throws(
      () => parseQuickLinkServerConfig(environment({ CELEBIX_QUICK_ORDER_KEYS: value })),
      /quick_link_server_config_invalid/,
    );
  }
});

test("exports the exact environment snapshot allowlist", () => {
  assert.deepEqual([...QUICK_LINK_SERVER_ENVIRONMENT_FIELDS], [
    "CELEBIX_SAAS_AUTH_MODE",
    "CELEBIX_DEPLOYMENT_TIER",
    "CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID",
    "CELEBIX_QUICK_ORDER_KEYS",
    "CELEBIX_PAYTR_STAGING_MERCHANT_ID",
    "CELEBIX_PAYTR_STAGING_MERCHANT_KEY",
    "CELEBIX_PAYTR_STAGING_MERCHANT_SALT",
    "CELEBIX_PAYTR_STAGING_CALLBACK_URL",
    "CELEBIX_PAYTR_STAGING_TEST_MODE",
  ]);
});
