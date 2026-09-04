import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const files = Object.freeze({
  up: path.join(SQL, "202609050126_promotions_studio.up.sql"),
  down: path.join(SQL, "202609050126_promotions_studio.down.sql"),
  assertions: path.join(SQL, "202609050126_promotions_studio_assertions.sql"),
});
const relations = Object.freeze([
  "promotions", "promotion_versions", "promotion_targets", "promotion_codes",
  "promotion_code_batches", "promotion_usage_reservations", "promotion_redemptions",
  "promotion_audit_events", "promotion_operations", "order_promotion_snapshots",
  "order_discount_allocations",
]);

test("promotion migration triplet is additive, tenant-bound and guarded", () => {
  for (const file of Object.values(files)) assert.equal(existsSync(file), true, `missing ${file}`);
  const up = readFileSync(files.up, "utf8");
  const down = readFileSync(files.down, "utf8");
  const assertions = readFileSync(files.assertions, "utf8");
  assert.match(up, /SET LOCAL ROLE celebix_saas_owner/);
  assert.match(up, /lock_timeout\s*=\s*'5s'/);
  assert.match(up, /statement_timeout\s*=\s*'120s'/);
  for (const relation of relations) {
    assert.match(up, new RegExp(`CREATE TABLE IF NOT EXISTS saas[.]${relation}\\b`));
  }
  assert.match(up, /ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /promotion_evaluate_v1/);
  assert.match(up, /merchant_action_authority_error[\s\S]*'promotions'/);
  assert.match(up, /SECURITY DEFINER/);
  assert.match(up, /SET search_path\s*=\s*pg_catalog,\s*saas/);
  assert.match(up, /operation_mismatch/);
  assert.match(up, /pg_advisory_xact_lock/);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity/);
  assert.match(up, /TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT EXECUTE[\s\S]*TO celebix_saas_identity/);
  assert.match(down, /promotions_studio_emergency_drop/);
  assert.doesNotMatch(down, /CASCADE/i);
  assert.match(assertions, /PROMOTIONS_STUDIO/);
});

test("promotion rehearsal is registered and admin remains outside the task", () => {
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /promotions-studio\/postgres-harness[.]mjs/);
  assert.equal(existsSync(path.join(ROOT, "tests/saas-phase3/promotions-studio/postgres-harness.mjs")), true);
  assert.equal(existsSync(path.join(ROOT, "apps/admin")), true);
});
