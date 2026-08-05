import assert from "node:assert/strict";
import test from "node:test";

import { parseStoreDomainWorkerConfig, resolveStoreDomainWorkerMode } from "./config.ts";

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    CELEBIX_STORE_DOMAIN_WORKER_ENABLED: "true",
    CLOUDFLARE_SAAS_API_TOKEN: "cloudflare-secret-token",
    CLOUDFLARE_SAAS_ZONE_ID: "zone_123",
    CLOUDFLARE_SAAS_API_BASE_URL: "https://api.cloudflare.com/client/v4",
    CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET: "shops.celebix.site",
    CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES: "celebix.site,saas-staging.celebix.site",
    CELEBIX_STORE_DOMAIN_WORKER_ID: "owner.domains.1",
    CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@postgres:5432/celebix_saas_production?sslmode=verify-full",
    ...overrides,
  };
}

test("parses one server-only Cloudflare worker configuration", () => {
  const config = parseStoreDomainWorkerConfig(environment());
  assert.equal(resolveStoreDomainWorkerMode(environment()), "enabled");
  assert.deepEqual(config.cloudflare, {
    zoneId: "zone_123", apiToken: "cloudflare-secret-token", apiBaseUrl: "https://api.cloudflare.com/client/v4",
    minimumTlsVersion: "1.2", timeoutMs: 5_000,
  });
  assert.deepEqual(config.hostnamePolicy, { reservedSuffixes: ["celebix.site", "saas-staging.celebix.site"], cnameTarget: "shops.celebix.site" });
  assert.deepEqual(config.database, { url: "postgresql://worker:secret@postgres:5432/celebix_saas_production?sslmode=verify-full", name: "celebix_saas_production" });
  assert.equal(Object.isFrozen(config), true);
});

test("disabled mode requires no secrets and enabled mode rejects public or ambiguous authority", () => {
  assert.equal(resolveStoreDomainWorkerMode({ CELEBIX_STORE_DOMAIN_WORKER_ENABLED: "false" }), "disabled");
  assert.throws(() => parseStoreDomainWorkerConfig({ CELEBIX_STORE_DOMAIN_WORKER_ENABLED: "false" }), /store_domain_worker_config_invalid/u);
  for (const overrides of [
    { CLOUDFLARE_SAAS_API_TOKEN: undefined },
    { CLOUDFLARE_SAAS_API_BASE_URL: "http://api.cloudflare.com/client/v4" },
    { CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET: "shops.other.test" },
    { CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES: "celebix.site,celebix.site" },
    { CELEBIX_STORE_DOMAIN_WORKER_ID: "worker with spaces" },
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@db.example.com:5432/celebix_saas_production" },
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@8.8.8.8:5432/celebix_saas_production" },
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@postgres:5432/celebix_saas_production?sslmode=require" },
    { CELEBIX_SAAS_DATABASE_URL: "postgresql://worker:secret@postgres:5432/celebix_saas_production?sslmode=verify-full&application_name=worker" },
  ]) assert.throws(() => parseStoreDomainWorkerConfig(environment(overrides)), /store_domain_worker_config_invalid/u);
});
