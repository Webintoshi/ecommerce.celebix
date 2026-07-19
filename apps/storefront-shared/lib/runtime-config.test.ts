import assert from "node:assert/strict";
import test from "node:test";

import { parseStorefrontDataConfig } from "./runtime-config.ts";

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
  ];
  for (const selected of invalid) assert.throws(() => parseStorefrontDataConfig(selected), /storefront_data_config_invalid/);
});
