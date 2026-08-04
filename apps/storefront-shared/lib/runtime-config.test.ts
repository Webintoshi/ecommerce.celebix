import assert from "node:assert/strict";
import test from "node:test";

import { parseStorefrontDataConfig, parseStorefrontIdentityConfig } from "./runtime-config.ts";

const valid = Object.freeze({ CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_DATA_MODE: "approved_staging", CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging", CELEBIX_SAAS_DATABASE_URL: "postgresql://runtime:secret@postgres.internal:5432/celebix_saas_staging?sslmode=require", CELEBIX_R2_MEDIA_ENVIRONMENT: "staging", CELEBIX_R2_PUBLIC_ORIGIN: "https://media.saas-staging.celebix.site" });

test("storefront data runtime accepts only a complete isolated staging profile", () => {
  const parsed = parseStorefrontDataConfig(valid);
  assert.equal(parsed.database.name, "celebix_saas_staging");
  assert.equal(parsed.mediaOrigin, "https://media.saas-staging.celebix.site");
});

test("missing, partial, malformed and production authority fail closed", () => {
  const invalid = [
    {},
    { ...valid, CELEBIX_STOREFRONT_DATA_MODE: undefined },
    { ...valid, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...valid, CELEBIX_SAAS_DATABASE_NAME: "production" },
    { ...valid, CELEBIX_R2_MEDIA_ENVIRONMENT: "production" },
    { ...valid, CELEBIX_R2_PUBLIC_ORIGIN: "https://media.production.example" },
    { ...valid, CELEBIX_R2_PUBLIC_ORIGIN: "https://bucket.r2.dev" },
    { ...valid, CELEBIX_R2_PUBLIC_ORIGIN: "https://account.r2.cloudflarestorage.com" },
  ];
  for (const selected of invalid) assert.throws(() => parseStorefrontDataConfig(selected), /storefront_data_config_invalid/);
});

const identity = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_ACCOUNTS_MODE: "approved_staging",
  CELEBIX_STOREFRONT_ACCOUNT_ALLOWED_ORIGIN_SUFFIX: ".saas-staging.celebix.site",
  CELEBIX_STOREFRONT_ACCOUNT_HMAC_ACTIVE_KEY_ID: "hmac_01",
  CELEBIX_STOREFRONT_ACCOUNT_HMAC_KEYS: JSON.stringify([{ keyId: "hmac_01", key: Buffer.alloc(32, 7).toString("base64url") }]),
  CELEBIX_STOREFRONT_ACCOUNT_SEAL_ACTIVE_KEY_ID: "seal_01",
  CELEBIX_STOREFRONT_ACCOUNT_SEAL_KEYS: JSON.stringify([{ keyId: "seal_01", key: Buffer.alloc(32, 9).toString("base64url") }]),
  CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE: "platform_resend",
  CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM: "accounts@celebix.test",
  CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY: "re_test_authority_0000000000000001",
});

test("storefront identity config activates only one isolated staging authority", () => {
  const parsed = parseStorefrontIdentityConfig(identity);
  assert.equal(parsed.mode, "approved_staging");
  assert.equal(parsed.allowedOriginSuffix, ".saas-staging.celebix.site");
  assert.equal(parsed.hmacKeyring.activeKeyId, "hmac_01");
  assert.equal(parsed.sealKeyring.activeKeyId, "seal_01");
  assert.deepEqual(parsed.email, { mode: "platform_resend", from: "accounts@celebix.test", apiKey: "re_test_authority_0000000000000001" });
});

test("storefront identity config accepts the verified Celebix Resend sender domain", () => {
  const parsed = parseStorefrontIdentityConfig({
    ...identity,
    CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM: "hesap@noreply.celebix.net",
  });

  assert.equal(parsed.email.from, "hesap@noreply.celebix.net");
});

test("storefront identity config fails closed on incomplete or production settings", () => {
  for (const candidate of [
    {},
    { ...identity, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...identity, CELEBIX_STOREFRONT_ACCOUNTS_MODE: undefined },
    { ...identity, CELEBIX_STOREFRONT_ACCOUNT_ALLOWED_ORIGIN_SUFFIX: ".celebix.site" },
    { ...identity, CELEBIX_STOREFRONT_ACCOUNT_SEAL_ACTIVE_KEY_ID: "missing_01" },
    { ...identity, CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE: "merchant_smtp" },
    { ...identity, CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY: undefined },
  ]) assert.throws(() => parseStorefrontIdentityConfig(candidate), /storefront_identity_config_invalid/u);
});
