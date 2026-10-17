import assert from "node:assert/strict";
import test from "node:test";
import { parseNativeMarketingConfig, resolveNativeMarketingWorkerMode, parseNativeMarketingPublicConfig } from "./config.ts";

const STORE = "11111111-1111-4111-8111-111111111111";
function env(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_MARKETING_EMAIL_WORKER_ENABLED: "true", CELEBIX_MARKETING_EMAIL_DELIVERY_MODE: "test",
    CELEBIX_MARKETING_EMAIL_PUBLIC_ENABLED: "true", CELEBIX_MARKETING_EMAIL_WEBHOOK_ENABLED: "true",
    CELEBIX_MARKETING_EMAIL_WORKER_ID: "marketing-1", CELEBIX_MARKETING_EMAIL_STORE_IDS: STORE,
    CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=verify-full",
    CELEBIX_MARKETING_EMAIL_RESEND_API_KEY: "re_private_marketing_authority",
    CELEBIX_MARKETING_EMAIL_FROM: "noreply@marketing.celebix.co",
    CELEBIX_MARKETING_EMAIL_RESEND_WEBHOOK_SECRET: "whsec_private_marketing_authority",
    CELEBIX_MARKETING_EMAIL_PAYLOAD_KEYRING: JSON.stringify({ marketing_01: Buffer.alloc(32, 7).toString("base64") }),
    CELEBIX_MARKETING_EMAIL_ACTIVE_KEY_ID: "marketing_01", CELEBIX_MARKETING_EMAIL_TEST_RECIPIENT: "qa@celebix.co",
    CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN: "https://owner.saas-staging.celebix.net",
    CELEBIX_MARKETING_EMAIL_POSTAL_ADDRESS: "Celebix, İstanbul, Türkiye", ...overrides,
  };
}
test("marketing is disabled without loading any sending authority", () => {
  assert.equal(resolveNativeMarketingWorkerMode({}), "disabled");
  assert.equal(resolveNativeMarketingWorkerMode({ CELEBIX_MARKETING_EMAIL_WORKER_ENABLED: "false" }), "disabled");
});
test("dedicated authority parses a pilot or all-future-stores rollout", () => {
  const config = parseNativeMarketingConfig(env());
  assert.deepEqual(config.storeIds, [STORE]);
  assert.equal(config.testRecipient, "qa@celebix.co");
  assert.equal(config.senderEmail, "noreply@marketing.celebix.co");
  assert.equal(config.publicOrigin, "https://owner.saas-staging.celebix.net");
  assert.equal(parseNativeMarketingConfig(env({ CELEBIX_MARKETING_EMAIL_STORE_IDS: "*" })).storeIds, "*");
});
test("marketing fails closed on reused order authority, hostile origin, sender or missing live address", () => {
  for (const overrides of [
    { CELEBIX_ORDER_EMAIL_RESEND_API_KEY: "re_private_marketing_authority" },
    { CELEBIX_ORDER_EMAIL_RESEND_WEBHOOK_SECRET: "whsec_private_marketing_authority" },
    { CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN: "https://owner.saas-staging.celebix.net.evil.test" },
    { CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN: "https://owner.saas-staging.celebix.net/path" },
    { CELEBIX_MARKETING_EMAIL_FROM: "Store <noreply@marketing.celebix.co>" },
    { CELEBIX_MARKETING_EMAIL_PUBLIC_ENABLED: "false" },
    { CELEBIX_MARKETING_EMAIL_WEBHOOK_ENABLED: "false" },
    { CELEBIX_MARKETING_EMAIL_STORE_IDS: "*," + STORE },
    { CELEBIX_MARKETING_EMAIL_DELIVERY_MODE: "live", CELEBIX_MARKETING_EMAIL_POSTAL_ADDRESS: undefined },
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=require" },
  ]) assert.throws(() => parseNativeMarketingConfig(env(overrides)), /native_marketing_config_invalid/u);
});
test("public unsubscribe authority does not require provider or encryption credentials", () => {
  const config = parseNativeMarketingPublicConfig({ CELEBIX_SAAS_DATABASE_URL: env().CELEBIX_SAAS_DATABASE_URL, CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN: env().CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN });
  assert.equal(config.publicOrigin, env().CELEBIX_MARKETING_EMAIL_PUBLIC_ORIGIN);
});
