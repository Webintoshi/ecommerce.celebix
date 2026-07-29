import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP_FILE = "202607290064_pilot_plan_authority.up.sql";
const DOWN_FILE = "202607290064_pilot_plan_authority.down.sql";
const ASSERTIONS_FILE = "202607290064_pilot_plan_authority_assertions.sql";
const MANIFEST_FILE = "phase3w-pilot-plan-authority-manifest.json";
const up = readFileSync(path.join(SQL, UP_FILE), "utf8");
const down = readFileSync(path.join(SQL, DOWN_FILE), "utf8");
const assertions = readFileSync(path.join(SQL, ASSERTIONS_FILE), "utf8");

test("pilot v1 is deterministic without mutating free_starter v1", () => {
  assert.match(up, /00000000-0000-4000-8000-000000000002/);
  assert.match(up, /'pilot', 1, 'active', pilot_time/);
  assert.match(up, /'products', 2000, 1/);
  assert.match(up, /'storageBytes', 10000000000, 3/);
  assert.match(up, /PILOT_PLAN_SEED_DRIFT/);
  assert.doesNotMatch(up, /UPDATE\s+saas\.plans/i);
  assert.doesNotMatch(up, /UPDATE\s+saas\.plan_(?:features|limits)/i);
  assert.doesNotMatch(up, /SET\s+limit_value\s*=\s*2000/i);
  assert.match(assertions, /free_starter v1 changed/);
});

test("all thirteen features and five exact limits are sealed", () => {
  for (const feature of [
    "catalog", "orders", "customers", "content", "media", "analytics", "checkout",
    "custom_domains", "staff_management", "promotions", "integrations", "accounting", "marketplaces",
  ]) assert.match(up, new RegExp(`'${feature}'`), feature);
  for (const limit of ["products", "staff", "storageBytes", "monthlyOrders", "customDomains"]) {
    assert.match(up, new RegExp(`'${limit}'`), limit);
  }
  assert.match(up, /DISABLE TRIGGER plan_features_immutable/);
  assert.match(up, /ENABLE TRIGGER plan_features_immutable/);
  assert.match(up, /DISABLE TRIGGER plan_limits_immutable/);
  assert.match(up, /ENABLE TRIGGER plan_limits_immutable/);
  assert.match(assertions, /immutable plan triggers are not enabled/);
});

test("plan assignment is bootstrap-only, row locked, and replay safe", () => {
  const body = up.slice(up.indexOf("CREATE OR REPLACE FUNCTION saas.assign_store_plan"));
  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /SET search_path = pg_catalog, saas/);
  assert.match(body, /FROM saas\.stores AS store[\s\S]*FOR UPDATE/);
  assert.match(body, /FROM saas\.subscriptions AS subscription[\s\S]*FOR UPDATE/);
  assert.match(body, /operation_replayed/);
  assert.match(body, /operation_mismatch/);
  assert.match(body, /subscription_not_found/);
  assert.match(body, /UPDATE saas\.subscriptions[\s\S]*INSERT INTO saas\.subscriptions/);
  assert.match(body, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_bootstrap/);
  assert.doesNotMatch(body, /GRANT EXECUTE ON FUNCTION[\s\S]*TO celebix_saas_app/);
  assert.match(body, /FROM celebix_saas_identity/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_app', function_oid, 'EXECUTE'\)/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_identity', function_oid, 'EXECUTE'\)/);
});

test("inputs are canonical and assignment cannot cross tenant identity", () => {
  assert.match(up, /p_expected_subscription_id = p_target_subscription_id/);
  assert.match(up, /p_target_plan_code <> pg_catalog\.lower\(pg_catalog\.btrim\(p_target_plan_code\)\)/);
  assert.match(up, /p_target_plan_code !~ '\^\[a-z0-9\]\+\(_\[a-z0-9\]\+\)\*\$'/);
  assert.match(up, /existing_target\.store_id <> p_store_id/);
  assert.match(up, /replay_previous\.store_id <> p_store_id/);
  assert.match(up, /current_subscription\.id <> p_expected_subscription_id/);
  assert.match(up, /subscriptions_one_active_per_store_idx|status = 'active'/);
});

test("rollback is reference guarded and removes only pilot authority", () => {
  assert.match(down, /PILOT_PLAN_ROLLBACK_BLOCKED/);
  assert.match(down, /DROP FUNCTION IF EXISTS saas\.assign_store_plan/);
  assert.match(down, /DELETE FROM saas\.plan_features/);
  assert.match(down, /DELETE FROM saas\.plan_limits/);
  assert.match(down, /DELETE FROM saas\.plans/);
  assert.doesNotMatch(down, /(?:DELETE|UPDATE)[^;]+free_starter/is);
  assert.doesNotMatch(down, /DELETE FROM saas\.(?:stores|memberships|principals)/);
});

test("manifest pins exact bytes and forbids external or production mutation", () => {
  const manifest = JSON.parse(readFileSync(path.join(SQL, MANIFEST_FILE), "utf8"));
  assert.equal(manifest.phase, "phase3w-pilot-plan-authority");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.artifacts.slice(-2).map(({ file }) => file), [UP_FILE, ASSERTIONS_FILE]);
  assert.deepEqual(manifest.rollbackArtifacts.map(({ file }) => file), [DOWN_FILE]);
  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    assert.equal(
      createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"),
      artifact.sha256,
      artifact.file,
    );
  }
});

test("authority artifacts contain no customer, network, or credential payload", () => {
  const source = `${up}\n${down}`;
  assert.doesNotMatch(source, /guzide|hemenaku|@|https?:\/\//i);
  assert.doesNotMatch(source, /\b(?:fetch|curl|wget|oauth|access_token|refresh_token|client_secret|api_key|database_url|r2_secret)\b/i);
  assert.doesNotMatch(source, /\b(?:email|slug|hostname|raw_csv|csv_bytes|cookie|authorization_code)\b/i);
  assert.match(assertions, /forbidden data appears in function/);
});
