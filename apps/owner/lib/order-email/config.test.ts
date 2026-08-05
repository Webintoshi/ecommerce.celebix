import assert from "node:assert/strict";
import test from "node:test";

import { parseOrderEmailConfig, resolveOrderEmailWorkerMode } from "./config.ts";

const KEY = Buffer.alloc(32, 9).toString("base64");
function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_ORDER_EMAIL_WORKER_ENABLED: "true",
    CELEBIX_ORDER_EMAIL_DELIVERY_MODE: "test",
    CELEBIX_ORDER_EMAIL_WORKER_ID: "order-email-1",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=verify-full",
    CELEBIX_ORDER_EMAIL_RESEND_API_KEY: "re_private_order_email_authority",
    CELEBIX_ORDER_EMAIL_FROM: "siparis@notify.celebix.co",
    CELEBIX_ORDER_EMAIL_RESEND_WEBHOOK_SECRET: "whsec_private_order_email_authority",
    CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING: JSON.stringify({ order_email_01: KEY }),
    CELEBIX_ORDER_EMAIL_ACTIVE_KEY_ID: "order_email_01",
    CELEBIX_ORDER_EMAIL_TEST_RECIPIENT: "qa@celebix.co",
    ...overrides,
  };
}

test("disabled order email mode requires no secret authority", () => {
  assert.equal(resolveOrderEmailWorkerMode({}), "disabled");
  assert.equal(resolveOrderEmailWorkerMode({ CELEBIX_ORDER_EMAIL_WORKER_ENABLED: "false" }), "disabled");
});

test("test and live modes parse exact verified-TLS server authority", () => {
  const testConfig = parseOrderEmailConfig(environment());
  assert.equal(testConfig.deliveryMode, "test");
  assert.equal(testConfig.testRecipient, "qa@celebix.co");
  assert.equal(testConfig.keyring.keys.order_email_01?.length, 32);
  assert.deepEqual(testConfig.database, {
    url: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=verify-full",
    name: "celebix_saas_production",
  });
  const live = parseOrderEmailConfig(environment({ CELEBIX_ORDER_EMAIL_DELIVERY_MODE: "live", CELEBIX_ORDER_EMAIL_TEST_RECIPIENT: undefined }));
  assert.equal(live.deliveryMode, "live");
  assert.equal(live.testRecipient, undefined);
});

test("configuration fails closed on transport, mode, sender, key, and test-recipient drift", () => {
  const cases = [
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=require" },
    { CELEBIX_ORDER_EMAIL_DELIVERY_MODE: "disabled" },
    { CELEBIX_ORDER_EMAIL_FROM: "Display <siparis@notify.celebix.co>" },
    { CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING: JSON.stringify({ order_email_01: Buffer.alloc(16).toString("base64") }) },
    { CELEBIX_ORDER_EMAIL_ACTIVE_KEY_ID: "missing" },
    { CELEBIX_ORDER_EMAIL_TEST_RECIPIENT: undefined },
  ];
  for (const selected of cases) assert.throws(() => parseOrderEmailConfig(environment(selected)), /order_email_config_invalid/u);
});

