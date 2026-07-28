import assert from "node:assert/strict";
import test from "node:test";
import { parseStagingProductMediaConfig } from "./config.ts";

const valid = { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_PRODUCT_MEDIA_MODE: "approved_staging", CELEBIX_R2_MEDIA_ENVIRONMENT: "staging", CELEBIX_R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", CELEBIX_R2_ACCESS_KEY_ID: "access-key-id", CELEBIX_R2_SECRET_ACCESS_KEY: "secret-access-key-with-sufficient-entropy-123456", CELEBIX_R2_BUCKET_NAME: "celebix-product-media-staging", CELEBIX_R2_PUBLIC_ORIGIN: "https://media.saas-staging.celebix.site" };

test("product media config activates only exact isolated staging authority", () => {
  const parsed = parseStagingProductMediaConfig(valid);
  assert.equal(parsed.bucket, "celebix-product-media-staging");
  assert.equal(Object.isFrozen(parsed), true);
  for (const patch of [{ CELEBIX_DEPLOYMENT_TIER: "production" }, { CELEBIX_PRODUCT_MEDIA_MODE: "enabled" }, { CELEBIX_R2_MEDIA_ENVIRONMENT: "production" }, { CELEBIX_R2_BUCKET_NAME: "celebix-product-media-production" }, { CELEBIX_R2_PUBLIC_ORIGIN: "http://media.example.test" }, { CELEBIX_R2_PUBLIC_ORIGIN: "https://bucket.r2.dev" }, { CELEBIX_R2_PUBLIC_ORIGIN: "https://account.r2.cloudflarestorage.com" }]) assert.throws(() => parseStagingProductMediaConfig({ ...valid, ...patch }));
});
