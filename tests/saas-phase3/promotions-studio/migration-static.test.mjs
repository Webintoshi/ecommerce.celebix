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
  assert.match(up, /promotion_storefront_origin_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz\) TO celebix_saas_app/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]public_promotion_compiled_read_v1\(p_hostname text,p_now timestamptz,p_currency text,p_sales_channel text\)/);
  assert.match(up, /public_promotion_compiled_read_v1\(text,timestamptz,text,text\) TO celebix_saas_host_resolver/);
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
  assert.match(up, /pg_column_size\(p_payload\)>786432/);
  assert.match(up, /pg_column_size\(payload\).*32768/);
  for (const name of ["public_checkout_recover_v2", "public_receipt_get_v2", "public_account_orders_v2"]) {
    assert.match(up, new RegExp(`CREATE OR REPLACE FUNCTION saas[.]${name}\\b`));
    assert.match(down, new RegExp(`DROP FUNCTION IF EXISTS saas[.]${name}\\b`));
  }
  for (const name of ["public_checkout_recover", "public_receipt_get", "public_account_orders"]) {
    assert.match(up, new RegExp(`CREATE OR REPLACE FUNCTION saas[.]${name}\\b[\\s\\S]*promotionStatus`));
    assert.match(down, new RegExp(`CREATE OR REPLACE FUNCTION saas[.]${name}\\b`));
  }
  assert.match(down, /storefront_checkout_operations[\s\S]*result_payload->'receipt' \? 'promotionStatus'[\s\S]*PROMOTIONS_STUDIO_DATA_BEARING_DOWN_REFUSED/);
  assert.match(assertions, /PROMOTIONS_STUDIO_RECEIPT_VERSION_RPC_INVALID/);
  assert.match(assertions, /PROMOTIONS_STUDIO_LEGACY_RECEIPT_FENCE_INVALID/);
  assert.match(up, /promotion_recover_operation_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text\)/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*promotion_recover_operation_v1[\s\S]*TO celebix_saas_app/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]promotion_expire_due_reservations_v1\(timestamptz,integer\) TO celebix_saas_workflow/);
  const directInternalSettlementAppGrant=/GRANT EXECUTE ON FUNCTION[^;]*promotion_(?:reserve|release_reservation|commit_reservation)_v1[^;]*TO celebix_saas_app\s*;/;
  assert.doesNotMatch(up,directInternalSettlementAppGrant);
  assert.match(`${up}\nGRANT EXECUTE ON FUNCTION saas.promotion_reserve_v1(uuid) TO celebix_saas_app;`,directInternalSettlementAppGrant);
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
  assert.match(up, /promotion_definition_references_valid/);
  assert.match(up, /promotion_materialize_targets/);
  assert.match(up, /promotion_sync_direct_codes/);
  assert.match(up, /promotion_lifecycle_transition_valid/);
  assert.match(up, /promotion_effective_status_v1/);
  assert.match(up, /CREATE INDEX IF NOT EXISTS promotions_list_keyset_idx ON saas[.]promotions\(store_id,created_at DESC,id DESC\)/);
  assert.match(up, /CREATE INDEX IF NOT EXISTS promotions_published_cap_idx ON saas[.]promotions\(store_id,status,id\) WHERE status IN \('active','scheduled'\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_evaluator_materialize_lines\(p_store_id uuid,p_currency text,p_context jsonb,p_now timestamptz\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_evaluator_line_capacity\(p_rule jsonb,p_line jsonb,p_prior_discount bigint\)/);
  const targetMatcher = up.match(/CREATE OR REPLACE FUNCTION saas[.]promotion_evaluator_line_matches\(p_targets jsonb,p_line jsonb\)[\s\S]*?\$fn\$;/)?.[0] ?? "";
  assert.match(targetMatcher, /LANGUAGE plpgsql IMMUTABLE STRICT/);
  assert.doesNotMatch(targetMatcher, /WITH refs AS/);
  const candidateFacts = up.match(/CREATE OR REPLACE FUNCTION saas[.]promotion_evaluator_candidate_facts\(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb\)[\s\S]*?\$fn\$;/)?.[0] ?? "";
  assert.match(candidateFacts, /candidate_lines AS MATERIALIZED/);
  assert.match(candidateFacts, /eligible_quantity/);
  assert.doesNotMatch(candidateFacts, /WHERE saas[.]promotion_rule_document_valid\(p[.]rule_document\)/);
  const evaluator = up.match(/CREATE OR REPLACE FUNCTION saas[.]promotion_evaluate_internal_v1\(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb,p_materialized_lines jsonb\)[\s\S]*?\$fn\$;/)?.[0] ?? "";
  assert.ok(evaluator.indexOf("promotion_combination_compatible") < evaluator.indexOf("IF v_kind='percentage'"), "combination rejection must precede redundant benefit math");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_duplicate_v1/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_definition_dimensions_overlap_v1\(p_store_id uuid,p_left jsonb,p_right jsonb\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_picker_list_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_search text,p_limit integer,p_after_sort_key text,p_after_id uuid\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_picker_resolve_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_ids uuid\[\]\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_storefront_origin_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz\)/);
  assert.match(up, /p_action='promotions[.]manage_draft'[\s\S]*'store_owner','admin','editor'/);
  assert.match(up, /p_action IN \('promotions[.]publish','promotions[.]export_codes'\)[\s\S]*'store_owner','admin'/);
  assert.match(up, /v_observed[.]status<>'draft'[\s\S]*'promotions[.]publish'/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_conflicts_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_expected_version bigint,p_rule_document jsonb\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_margin_check_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_expected_version bigint,p_rule_document jsonb\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_list_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_effective_statuses text\[\],p_trigger_kinds text\[\],p_benefit_kinds text\[\],p_audience_modes text\[\],p_schedule_from timestamptz,p_schedule_to timestamptz,p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid\)/);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]promotion_simulate_v1\(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_selected jsonb,p_context jsonb\)/);
  assert.match(up, /promotion_versions[\s\S]*v_current[.]version\+1/);
  assert.match(up, /p[.]status IN \('active','scheduled'\)/);
  assert.match(up, /p[.]created_at<=v_snapshot/);
  assert.match(up, /pg_catalog[.]strpos/);
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
  assert.match(down, /DROP FUNCTION saas[.]promotion_evaluator_materialize_lines\(uuid,text,jsonb,timestamptz\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_evaluator_line_capacity\(jsonb,jsonb,bigint\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_definition_dimensions_overlap_v1\(uuid,jsonb,jsonb\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_picker_list_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,integer,text,uuid\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_picker_resolve_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid\[\]\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_conflicts_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_margin_check_v1\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb\)/);
  assert.doesNotMatch(down, /promotion_evaluator_materialize_lines\(uuid,text,jsonb\)/);
  for (const helper of [
    "promotion_evaluator_candidate_facts", "promotion_evaluator_catalog_line_matches",
    "promotion_evaluator_audience_matches", "promotion_evaluator_gift_variant_valid",
    "promotion_evaluator_abandoned_cart_valid", "promotion_combination_compatible",
    "promotion_operation_fingerprint_v2", "promotion_fingerprint_canonical_json",
    "promotion_reservation_matches_operation", "promotion_redemption_matches_reservation",
    "promotion_auto_gift_order_lines_valid_v1",
    "promotion_operation_group_complete",
    "promotion_definition_references_valid", "promotion_materialize_targets",
    "promotion_sync_direct_codes", "promotion_lifecycle_transition_valid",
    "promotion_effective_status_v1", "promotion_duplicate_v1",
  ]) assert.match(down, new RegExp(`DROP FUNCTION saas[.]${helper}\\b`));
  assert.doesNotMatch(down, /CASCADE/i);
  assert.ok(down.indexOf("DROP FUNCTION") < down.indexOf("DROP TABLE"), "down drops dependent functions before relations");
  assert.match(assertions, /PROMOTIONS_STUDIO/);
  assert.match(assertions, /PROMOTIONS_STUDIO_DIRECT_TABLE_PRIVILEGE_INVALID/);
  assert.match(assertions, /PROMOTIONS_STUDIO_COMPOSITE_FOREIGN_KEYS_INVALID/);
  assert.match(assertions, /order_promotion_snapshots_redemption_store_fk/);
  assert.match(assertions, /PROMOTIONS_STUDIO_CRUD_LIST_SIMULATOR_RPC_INVALID/);
  assert.match(assertions, /PROMOTIONS_STUDIO_INTERNAL_HELPER_EXPOSURE_INVALID/);
  assert.match(assertions, /promotion_picker_list_v1/);
  assert.match(assertions, /promotion_picker_resolve_v1/);
});

test("promotion rehearsal is registered and admin remains outside the task", () => {
  const runner = readFileSync(path.join(ROOT, "tests/saas-phase3/run-current-suite.mjs"), "utf8");
  assert.match(runner, /promotions-studio\/postgres-harness[.]mjs/);
  assert.match(runner, /total: 157/);
  assert.match(runner, /line: \/\^PASS \\d\+\\\/157/);
  assert.match(runner, /PROMOTIONS_STUDIO_POSTGRESQL16_COMPLETE 157\\\/157/);
  assert.equal(existsSync(path.join(ROOT, "tests/saas-phase3/promotions-studio/postgres-harness.mjs")), true);
  assert.equal(existsSync(path.join(ROOT, "apps/admin")), true);
});

test("Slice C freezes code-batch, bundle, gift, archive and legacy contracts", () => {
  const up = readFileSync(files.up, "utf8");
  const down = readFileSync(files.down, "utf8");
  const assertions = readFileSync(files.assertions, "utf8");
  for (const column of ["version bigint", "prefix text", "code_length integer", "per_customer_usage integer", "expires_at timestamptz", "updated_at timestamptz"]) {
    assert.match(up, new RegExp(column));
  }
  assert.match(up, /code_length[\s\S]*BETWEEN 16 AND 64[\s\S]*code_length-pg_catalog[.]char_length\(prefix\)>=16/);
  assert.match(up, /promotion_create_code_batch_v1\(p_store_id uuid[\s\S]*p_code_length integer,p_per_customer_usage integer,p_expires_at timestamptz\)/);
  assert.match(up, /promotion_code_batch_status_v1\(p_store_id uuid[\s\S]*p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_expected_version bigint,p_next_status text\)/);
  assert.match(up, /promotion_code_batch_list_v1\(p_store_id uuid[\s\S]*p_promotion_id uuid,p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid\)/);
  assert.match(up, /batch[.]updated_at>=[(]p_result->>'updatedAt'[)]::timestamptz/);
  assert.match(up, /pg_catalog[.]sha256\(pg_catalog[.]convert_to\([\s\S]*pg_catalog[.]gen_random_uuid\(\)::text[\s\S]*pg_catalog[.]gen_random_uuid\(\)::text[\s\S]*pg_catalog[.]gen_random_uuid\(\)::text/);
  assert.match(up, /'codeLength',p_code_length[\s\S]*'perCustomerUsage',p_per_customer_usage[\s\S]*'expiresAt'/);
  assert.match(up, /'used'[\s\S]*'held'[\s\S]*'remaining'/);
  assert.match(up, /ORDER BY pg_catalog[.]convert_to\(c[.]code,'UTF8'\),c[.]id/);
  assert.match(up, /'items'[\s\S]*'bundle_price'[\s\S]*'autoAdd'/);
  assert.match(up, /UPDATE saas[.]promotion_code_batches[\s\S]*status='revoked'[\s\S]*UPDATE saas[.]promotion_codes[\s\S]*status='revoked'/);
  assert.match(up, /promotion_legacy_list_v1\(p_store_id uuid[\s\S]*p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid\)/);
  assert.match(up, /promotion_legacy_resolve_v1\(p_store_id uuid[\s\S]*p_legacy_record_id uuid\)[\s\S]*record[.]store_id=p_store_id AND record[.]id=p_legacy_record_id AND record[.]record_kind='discount'/);
  assert.match(up, /promotion_store_timezone_v1\(p_store_id uuid[\s\S]*'promotions[.]read'/);
  assert.match(up, /promotion_adopt_legacy_discounts_v1\(legacy_store[.]store_id/);
  assert.equal((up.match(/hashtextextended\('promotion-create:'/g) ?? []).length, 3);
  assert.match(up, /record[.]record_kind='discount' AND record[.]status='active'/);
  assert.match(up, /v_cross_version_match/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_code_batch_list_v1/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_storefront_origin_v1/);
  assert.match(down, /DROP FUNCTION saas[.]public_promotion_compiled_read_v1/);
  assert.match(assertions, /PROMOTIONS_STUDIO_CODE_BATCH_SLICE_C_INVALID/);
  assert.match(assertions, /PROMOTIONS_STUDIO_COMPILED_CACHE_RPC_INVALID/);
});

test("Slice D installs only additive internal group settlement authority", () => {
  const up = readFileSync(files.up, "utf8");
  const down = readFileSync(files.down, "utf8");
  const assertions = readFileSync(files.assertions, "utf8");
  assert.match(up, /promotion_reserve_group_v1\(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_source_kind text,p_source_reference text,p_evaluator_context jsonb,p_now timestamptz\)/);
  assert.match(up, /promotion_release_reservation_group_v1\(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_reservation_group_id uuid,p_now timestamptz\)/);
  assert.match(up, /promotion_commit_reservation_group_v1\(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_reservation_group_id uuid,p_order_id uuid,p_now timestamptz\)/);
  assert.match(up, /promotion_recover_settlement_operation_v1\(p_store_id uuid,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text\)/);
  assert.match(up, /promotion_expire_due_reservations_v1\(p_now timestamptz,p_limit integer\)/);
  assert.match(up, /'promotion-source:'\|\|p_store_id::text\|\|':'\|\|p_source_kind\|\|':'\|\|p_source_reference/);
  assert.match(up, /p_expires_at\s*:=\s*CASE WHEN p_source_kind='hosted_checkout' THEN v_hosted_expires_at ELSE p_now\+pg_catalog[.]interval '15 minutes' END/);
  assert.match(up, /FOR UPDATE(?: OF operation_row)? SKIP LOCKED/);
  assert.match(up, /promotion_usage_reservations_due_idx[\s\S]*WHERE status='reserved'/);
  assert.match(up, /promotion_operations_settlement_entity_kind_key/);
  assert.match(up, /promotion_usage_reservations_group_transition_complete AFTER UPDATE ON saas[.]promotion_usage_reservations DEFERRABLE INITIALLY DEFERRED/);
  assert.match(up, /order_promotion_snapshots_insert_binding BEFORE INSERT/);
  assert.match(up, /order_discount_allocations_insert_binding BEFORE INSERT/);
  assert.match(up, /p_previously_returned_ranges IS NULL[\s\S]*p_returned_ranges IS NULL/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_workflow',v_proc,'EXECUTE'\)/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_app',v_proc,'EXECUTE'\)/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_host_resolver',v_proc,'EXECUTE'\)/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_identity',v_proc,'EXECUTE'\)/);
  assert.match(assertions, /has_function_privilege\('public',v_proc,'EXECUTE'\)/);
  assert.match(up, /promotion_order_snapshot_valid_v1/);
  assert.match(up, /promotion_captured_unit_refund_minor_v1/);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION saas[.]promotion_(?:reserve_group|release_reservation_group|commit_reservation_group|recover_settlement_operation)_v1[\s\S]*TO celebix_saas_(?:app|host_resolver|identity)/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]promotion_expire_due_reservations_v1\(timestamptz,integer\) TO celebix_saas_workflow/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_commit_reservation_group_v1\(uuid,uuid,text,uuid,uuid,timestamptz\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_reserve_group_v1\(uuid,uuid,text,text,text,jsonb,timestamptz\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_release_reservation_group_v1\(uuid,uuid,text,uuid,timestamptz\)/);
  assert.match(down, /DROP FUNCTION saas[.]promotion_recover_settlement_operation_v1\(uuid,timestamptz,uuid,text,text\)/);
  assert.match(assertions, /PROMOTIONS_STUDIO_SETTLEMENT_SLICE_D_INVALID/);
});
