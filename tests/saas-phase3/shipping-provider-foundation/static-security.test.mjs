import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202608060093_shipping_provider_foundation.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202608060093_shipping_provider_foundation.down.sql"), "utf8");
const assertions = readFileSync(path.join(SQL, "202608060093_shipping_provider_foundation_assertions.sql"), "utf8");

test("shipping provider authority has no direct runtime table privileges", () => {
  assert.match(up, /REVOKE ALL ON TABLE saas[.]shipping_provider_definitions[\s\S]+FROM PUBLIC/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*shipping_/iu);
  assert.match(assertions, /has_table_privilege[(]'celebix_saas_app','saas[.]shipping_provider_profiles','SELECT,INSERT,UPDATE,DELETE'[)]/u);
});

test("shipping profile resources and operations remain store scoped", () => {
  assert.match(up, /UNIQUE[(]store_id,id[)]/u);
  assert.match(up, /FOREIGN KEY[(]store_id,profile_id[)]/u);
  assert.match(up, /FOREIGN KEY[(]store_id,selected_brand_resource_id[)]/u);
  assert.match(up, /FOREIGN KEY[(]store_id,selected_address_resource_id[)]/u);
  assert.match(up, /shipping_operations_store_operation_key/u);
  assert.match(up, /shipping_provider_profiles_one_current/u);
});

test("shipping validation never performs network work or logs private provider material", () => {
  const all = `${up}\n${down}\n${assertions}`;
  assert.doesNotMatch(all, /\b(?:fetch|axios|curl|http_request|dblink|postgres_fdw)\b/iu);
  assert.doesNotMatch(up, /RAISE\s+(?:NOTICE|LOG|INFO|WARNING)[\s\S]*(?:credential|envelope|ciphertext)/iu);
  assert.match(up, /provider_resource_id text NOT NULL/u);
  const projection = up.match(/CREATE FUNCTION saas[.]shipping_connection_projection[\s\S]+?\$function\$;/u)?.[0] ?? "";
  assert.doesNotMatch(projection, /credential_envelope|credential_digest|provider_resource_id|storeId|profileId/iu);
});

test("shipping rollback is isolated and refuses non-empty authority", () => {
  assert.match(down, /SHIPPING_PROVIDER_FOUNDATION_DOWN_BLOCKED/u);
  for (const table of [
    "shipping_operations", "shipping_validation_jobs", "shipping_provider_resources",
    "shipping_provider_profiles", "shipping_provider_definitions",
  ]) assert.match(down, new RegExp(`DROP TABLE saas[.]${table}`, "u"), table);
  assert.doesNotMatch(down, /DROP TABLE saas[.](?:stores|memberships|subscriptions|orders)/u);
});
