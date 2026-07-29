import assert from "node:assert/strict";
import test from "node:test";

import { CHECKOUT_ENVIRONMENT_FIELDS, parseCheckoutRuntimeConfig } from "./config.ts";

const valid = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_DATA_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging",
  CELEBIX_SAAS_DATABASE_URL: "postgresql://workflow:secret@postgres.internal:5432/celebix_saas_staging?sslmode=require",
  CELEBIX_R2_MEDIA_ENVIRONMENT: "staging",
  CELEBIX_R2_PUBLIC_ORIGIN: "https://media.saas-staging.celebix.site",
});

test("parses only the approved staging checkout database authority", () => {
  assert.deepEqual(parseCheckoutRuntimeConfig(valid), {
    database: { name: "celebix_saas_staging", url: valid.CELEBIX_SAAS_DATABASE_URL },
  });
});

test("defaults, production-like mode, and partial staging fail closed", () => {
  for (const source of [{}, { CELEBIX_DEPLOYMENT_TIER: "staging" }, { ...valid, CELEBIX_DEPLOYMENT_TIER: "production" }]) {
    assert.throws(() => parseCheckoutRuntimeConfig(source), /checkout_config_invalid/);
  }
});

test("database credentials and exact staging database binding are mandatory", () => {
  for (const url of [
    "postgresql://postgres.internal/celebix_saas_staging?sslmode=require",
    "postgresql://workflow:secret@postgres.internal/production?sslmode=require",
    "postgresql://workflow:secret@postgres.internal/celebix_saas_staging",
  ]) assert.throws(() => parseCheckoutRuntimeConfig({ ...valid, CELEBIX_SAAS_DATABASE_URL: url }), /checkout_config_invalid/);
});

test("exports only the existing reviewed environment field names", () => {
  assert.deepEqual(CHECKOUT_ENVIRONMENT_FIELDS, Object.keys(valid));
});
