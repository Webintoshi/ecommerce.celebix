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
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]promotion_evaluate_v1/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*promotion_codes_csv_v1[\s\S]*TO celebix_saas_app/);
  assert.doesNotMatch(up, /GRANT EXECUTE[\s\S]*TO celebix_saas_identity/);
  assert.match(up, /promotion_version bigint NOT NULL/);
  assert.match(up, /normalized_code text NULL/);
  assert.match(up, /currency text NOT NULL/);
  assert.match(up, /discount_minor bigint NOT NULL/);
  assert.match(up, /evaluator_snapshot jsonb NOT NULL/);
  assert.match(up, /evaluator_fingerprint text NOT NULL/);
  assert.match(up, /promotion_usage_reservations_version_store_fk/);
  assert.match(up, /promotion_usage_reservations_code_store_fk/);
  assert.match(up, /promotion_redemptions_reservation_store_fk/);
  assert.match(up, /promotion_operation_authority_lock_v1/);
  assert.match(up, /FROM saas[.]stores[\s\S]*FOR SHARE[\s\S]*FROM saas[.]memberships[\s\S]*FOR SHARE[\s\S]*FROM saas[.]subscriptions[\s\S]*FOR SHARE[\s\S]*FROM saas[.]plans[\s\S]*FOR SHARE[\s\S]*FROM saas[.]plan_features[\s\S]*FOR SHARE/);
  assert.match(up, /promotion_operation_result_valid/);
  assert.equal([...up.matchAll(/jsonb_typeof\(p_result->'evaluatorFingerprint'\)='string'/g)].length, 2);
  assert.match(up, /result_entity_kind text NOT NULL/);
  assert.match(up, /result_entity_id uuid NOT NULL/);
  assert.match(up, /result_entity_kind IN \('promotion','code_batch','reservation_group','redemption_group'\)/);
  assert.match(up, /reservation_group_id uuid NOT NULL/);
  assert.match(up, /redemption_group_id uuid NOT NULL/);
  assert.match(up, /source_kind text NOT NULL CHECK \(source_kind IN \('hosted_checkout','offline_checkout'\)\)/);
  assert.match(up, /promotion_operations_kind_entity_check/);
  assert.match(up, /promotion_operation_result_valid\(p_kind,p_result\) IS NOT TRUE/);
  assert.match(up, /pg_column_size\(result_payload\).*327680/);
  assert.match(up, /pg_column_size\(p_document\)>262144/);
  assert.match(up, /pg_column_size\(p_payload\)>327680/);
  assert.match(up, /pg_column_size\(payload\).*32768/);
  assert.match(up, /promotion_recover_operation_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text\)/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*promotion_recover_operation_v1[\s\S]*TO celebix_saas_app/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]promotion_expire_due_reservations_v1\(timestamptz,integer\) TO celebix_saas_workflow/);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION[\s\S]*promotion_(?:reserve|release_reservation|commit_reservation)_v1[\s\S]*TO celebix_saas_app/);
  assert.doesNotMatch(up, /promotion_operation_fingerprint\('create',pg_catalog[.]jsonb_build_object\('id',p_promotion_id/);
  assert.doesNotMatch(up, /promotion_operation_fingerprint\('code_batch',pg_catalog[.]jsonb_build_object\('id',p_batch_id/);
  assert.doesNotMatch(up, /EXCEPTION WHEN unique_violation THEN RETURN QUERY/);
  assert.match(up, /promotion_fingerprint_canonical_json\(p_value jsonb,p_parent_key text DEFAULT NULL\)/);
  assert.match(up, /promotion_operation_fingerprint_v2\(p_kind text,p_store_id uuid,p_payload jsonb\)/);
  assert.match(up, /jsonb_build_object\('kind',p_kind,'storeId',p_store_id,'payload',p_payload\)/);
  assert.match(up, /p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991/);
  assert.match(up, /p_next_status IS NULL OR p_next_status NOT IN \('scheduled','active','paused','archived'\)/);
  assert.match(up, /promotion_operations_result_entity_check CHECK \(result_entity_id IS NOT DISTINCT FROM saas[.]promotion_operation_entity_id/);
  assert.match(up, /promotion_operations_reservation_group_owner_key/);
  assert.match(up, /promotion_operations_redemption_group_owner_key/);
  assert.match(up, /promotion_redemptions_customer_usage_idx/);
  assert.match(up, /promotion_redemptions_code_usage_idx/);
  assert.match(up, /promotion_reservation_matches_operation/);
  assert.match(up, /promotion_redemption_matches_reservation/);
  assert.match(up, /CREATE CONSTRAINT TRIGGER promotion_operations_group_complete AFTER INSERT ON saas[.]promotion_operations DEFERRABLE INITIALLY DEFERRED/);
  assert.match(up, /promotion reservation group is incomplete/);
  assert.match(up, /promotion redemption group is incomplete/);
  assert.match(up, /v_reservation[.]status IS DISTINCT FROM 'committed'/);
  assert.match(up, /NEW[.]promotion_version IS DISTINCT FROM v_reservation[.]promotion_version/);
  assert.match(up, /NEW[.]discount_minor IS DISTINCT FROM v_reservation[.]discount_minor/);
  assert.match(up, /NEW[.]evaluator_fingerprint IS DISTINCT FROM v_reservation[.]evaluator_fingerprint/);
  assert.match(up, /promotion_codes_store_code_key UNIQUE \(store_id,code\), UNIQUE \(store_id,promotion_id,id\), UNIQUE \(store_id,promotion_id,id,code\)/);
  assert.match(down, /promotions_studio_emergency_drop/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_expire_due_reservations_v1\(timestamptz,integer\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_recover_operation_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_operation_authority_lock_v1/);
  for (const helper of [
    "promotion_evaluator_candidate_facts", "promotion_evaluator_catalog_line_matches",
    "promotion_evaluator_audience_matches", "promotion_evaluator_gift_variant_valid",
    "promotion_evaluator_abandoned_cart_valid", "promotion_combination_compatible",
    "promotion_operation_fingerprint_v2", "promotion_fingerprint_canonical_json",
    "promotion_reservation_matches_operation", "promotion_redemption_matches_reservation",
    "promotion_operation_group_complete",
  ]) assert.match(down, new RegExp(`DROP FUNCTION saas[.]${helper}\\b`));
  assert.doesNotMatch(down, /CASCADE/i);
  assert.ok(down.indexOf("DROP FUNCTION") < down.indexOf("DROP TABLE"), "down drops dependent functions before relations");
  assert.match(assertions, /PROMOTIONS_STUDIO/);
  assert.match(assertions, /PROMOTIONS_STUDIO_DIRECT_TABLE_PRIVILEGE_INVALID/);
  assert.match(assertions, /PROMOTIONS_STUDIO_COMPOSITE_FOREIGN_KEYS_INVALID/);
});

test("promotion rehearsal is registered and admin remains outside the task", () => {
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /promotions-studio\/postgres-harness[.]mjs/);
  assert.match(runner, /PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 77\\\/77/);
  assert.equal(existsSync(path.join(ROOT, "tests/saas-phase3/promotions-studio/postgres-harness.mjs")), true);
  assert.equal(existsSync(path.join(ROOT, "apps/admin")), true);
});
