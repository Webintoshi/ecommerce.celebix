\set ON_ERROR_STOP on
-- Run with psql against the restored rehearsal clone after applying migration 155.
-- This script never creates authority rows, alters functions, or disables guards.
-- Every barcode operation and variant fixture is rolled back, then all original
-- product-variant and barcode-operation rows are compared with their snapshots.

DO $clone_guard$
BEGIN
  IF pg_catalog.current_database() <> 'celebix_ean13_rehearsal_20260926_052710' THEN
    RAISE EXCEPTION 'integration_refuses_non_rehearsal_database';
  END IF;
  IF pg_catalog.current_setting('server_version_num')::integer NOT BETWEEN 160000 AND 169999 THEN
    RAISE EXCEPTION 'integration_requires_postgresql_16';
  END IF;
  IF pg_catalog.to_regprocedure('saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'integration_requires_migration_155';
  END IF;
END
$clone_guard$;

SET ROLE celebix_saas_owner;
CREATE TEMP TABLE ean13_integration_product_baseline ON COMMIT PRESERVE ROWS AS
  SELECT variant.id,pg_catalog.to_jsonb(variant) AS original_row
  FROM saas.product_variants AS variant;
CREATE TEMP TABLE ean13_integration_operation_baseline ON COMMIT PRESERVE ROWS AS
  SELECT operation.operation_id,pg_catalog.to_jsonb(operation) AS original_row
  FROM saas.barcode_label_operations AS operation;

BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='90s';

DO $integration$
DECLARE
  test_now timestamptz:=pg_catalog.clock_timestamp();
  actor record;
  source_variant saas.product_variants%ROWTYPE;
  selected_variant saas.product_variants%ROWTYPE;
  coded_variant saas.product_variants%ROWTYPE;
  blank_ids uuid[]:='{}'::uuid[];
  blank_versions bigint[]:='{}'::bigint[];
  slot integer;
  fixture_count integer:=0;
  operation_one uuid:=pg_catalog.gen_random_uuid();
  operation_two uuid:=pg_catalog.gen_random_uuid();
  operation_three uuid:=pg_catalog.gen_random_uuid();
  generate_operation uuid:=pg_catalog.gen_random_uuid();
  denied_operation uuid:=pg_catalog.gen_random_uuid();
  result_one record;
  result_two record;
  generated record;
  replayed record;
  rejected record;
  targets jsonb;
  changed_targets jsonb;
  generated_code_one text;
  generated_code_two text;
  violation_constraint text;
  constraint_rejected boolean;
  has_current_session boolean;
BEGIN
  -- The real authority function must accept a currently persisted context.
  -- Prefer a context with a currently usable session, but do not manufacture or
  -- extend sessions: direct database API authority is membership/plan based.
  SELECT membership.store_id,membership.principal_id,membership.id AS membership_id,
         subscription.plan_id,subscription.plan_code,subscription.plan_version,
         EXISTS(SELECT 1 FROM saas.panel_sessions AS session
                WHERE session.principal_id=membership.principal_id
                  AND session.active_store_id=membership.store_id
                  AND session.revoked_at IS NULL AND session.replaced_by_session_id IS NULL
                  AND session.issued_at<=test_now AND session.expires_at>test_now) AS current_session
  INTO actor
  FROM saas.memberships AS membership
  JOIN saas.subscriptions AS subscription ON subscription.store_id=membership.store_id
  WHERE saas.merchant_action_authority_error(
          membership.store_id,membership.principal_id,membership.id,
          subscription.plan_id,subscription.plan_code,subscription.plan_version,
          test_now,'catalog','catalog_admin.manage') IS NULL
    AND EXISTS(SELECT 1 FROM saas.product_variants AS variant
               WHERE variant.store_id=membership.store_id AND variant.status='active')
  ORDER BY current_session DESC,
           (SELECT count(*) FROM saas.product_variants AS variant
            WHERE variant.store_id=membership.store_id AND variant.status='active' AND variant.barcode IS NULL) DESC,
           (membership.role='store_owner') DESC,membership.store_id,membership.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'integration_needs_current_catalog_authority_and_active_variant';
  END IF;
  has_current_session:=actor.current_session;

  IF pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_next_ean13_internal(uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'integration_function_privileges_invalid';
  END IF;

  SELECT * INTO source_variant FROM saas.product_variants
    WHERE store_id=actor.store_id AND status='active'
    ORDER BY id LIMIT 1 FOR UPDATE;

  -- Use existing blank variants where available. Missing fixture rows are
  -- copies within the existing product/store, with no SKU and no new authority.
  FOR slot IN 1..3 LOOP
    SELECT * INTO selected_variant FROM saas.product_variants
      WHERE store_id=actor.store_id AND status='active' AND barcode IS NULL
        AND NOT(id=ANY(blank_ids))
      ORDER BY id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO saas.product_variants(
        id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
        stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at,archived_by_product
      ) VALUES(
        pg_catalog.gen_random_uuid(),source_variant.product_id,actor.store_id,'EAN-13 rollback fixture',NULL,NULL,
        source_variant.price_cents,source_variant.compare_at_cents,source_variant.cost_cents,
        source_variant.stock_tracking,source_variant.stock_quantity,'active',source_variant.attributes,
        1,NULL,test_now,test_now,false
      ) RETURNING * INTO selected_variant;
      fixture_count:=fixture_count+1;
    END IF;
    blank_ids:=pg_catalog.array_append(blank_ids,selected_variant.id);
    blank_versions:=pg_catalog.array_append(blank_versions,selected_variant.version);
  END LOOP;

  SELECT * INTO coded_variant FROM saas.product_variants
    WHERE store_id=actor.store_id AND status='active' AND barcode IS NOT NULL
    ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO saas.product_variants(
      id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
      stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at,archived_by_product
    ) VALUES(
      pg_catalog.gen_random_uuid(),source_variant.product_id,actor.store_id,'EAN-13 preserved-code fixture',NULL,
      'EAN13-REHEARSAL-EXISTING-'||pg_catalog.gen_random_uuid()::text,
      source_variant.price_cents,source_variant.compare_at_cents,source_variant.cost_cents,
      source_variant.stock_tracking,source_variant.stock_quantity,'active',source_variant.attributes,
      1,NULL,test_now,test_now,false
    ) RETURNING * INTO coded_variant;
    fixture_count:=fixture_count+1;
  END IF;

  -- Seed repetition deliberately presents the allocator with a reserved
  -- candidate again. This uses PostgreSQL's real generator, not a mock.
  PERFORM pg_catalog.setseed(0.271828);
  SELECT * INTO result_one FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,operation_one);
  IF result_one.outcome IS DISTINCT FROM 'reserved'
     OR result_one.result_payload->>'barcode' !~ '^(98|99)[0-9]{11}$'
     OR saas.barcode_label_ean13_valid(result_one.result_payload->>'barcode') IS DISTINCT FROM true
     OR result_one.result_payload->'replayed' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'integration_reservation_invalid';
  END IF;
  SELECT * INTO replayed FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,operation_one);
  IF replayed.outcome IS DISTINCT FROM 'reserved'
     OR replayed.result_payload->>'barcode' IS DISTINCT FROM result_one.result_payload->>'barcode'
     OR replayed.result_payload->'replayed' IS DISTINCT FROM 'true'::jsonb
     OR (SELECT count(*) FROM saas.barcode_label_operations WHERE operation_id=operation_one)<>1 THEN
    RAISE EXCEPTION 'integration_reservation_replay_invalid';
  END IF;

  PERFORM pg_catalog.setseed(0.271828);
  SELECT * INTO result_two FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,operation_two);
  IF result_two.outcome IS DISTINCT FROM 'reserved'
     OR result_two.result_payload->>'barcode' IS NOT DISTINCT FROM result_one.result_payload->>'barcode'
     OR result_two.result_payload->>'barcode' !~ '^(98|99)[0-9]{11}$'
     OR saas.barcode_label_ean13_valid(result_two.result_payload->>'barcode') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'integration_reservation_collision_not_avoided';
  END IF;
  RAISE NOTICE 'PASS reserve: valid 13-digit prefix/checksum, replay, repeated-candidate collision';

  targets:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('variantId',blank_ids[1],'expectedVersion',blank_versions[1]),
    pg_catalog.jsonb_build_object('variantId',blank_ids[2],'expectedVersion',blank_versions[2]),
    pg_catalog.jsonb_build_object('variantId',coded_variant.id,'expectedVersion',coded_variant.version),
    pg_catalog.jsonb_build_object('variantId',blank_ids[3],'expectedVersion',blank_versions[3]+1));
  PERFORM pg_catalog.setseed(0.271828);
  SELECT * INTO generated FROM saas.barcode_label_generate_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,generate_operation,targets);
  IF generated.outcome IS DISTINCT FROM 'generated'
     OR pg_catalog.jsonb_array_length(generated.result_payload->'succeeded')<>2
     OR pg_catalog.jsonb_array_length(generated.result_payload->'failed')<>2
     OR generated.result_payload->'replayed' IS DISTINCT FROM 'false'::jsonb
     OR NOT(generated.result_payload->'failed' @> pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object('variantId',coded_variant.id,'code','existing_barcode'),
         pg_catalog.jsonb_build_object('variantId',blank_ids[3],'code','version_conflict'))) THEN
    RAISE EXCEPTION 'integration_bulk_outcomes_invalid';
  END IF;
  SELECT barcode INTO generated_code_one FROM saas.product_variants WHERE id=blank_ids[1];
  SELECT barcode INTO generated_code_two FROM saas.product_variants WHERE id=blank_ids[2];
  IF generated_code_one !~ '^(98|99)[0-9]{11}$' OR generated_code_two !~ '^(98|99)[0-9]{11}$'
     OR saas.barcode_label_ean13_valid(generated_code_one) IS DISTINCT FROM true
     OR saas.barcode_label_ean13_valid(generated_code_two) IS DISTINCT FROM true
     OR generated_code_one=generated_code_two
     OR generated_code_one IN(result_one.result_payload->>'barcode',result_two.result_payload->>'barcode')
     OR generated_code_two IN(result_one.result_payload->>'barcode',result_two.result_payload->>'barcode')
     OR NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE id=blank_ids[1] AND version=blank_versions[1]+1 AND updated_at=test_now)
     OR NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE id=blank_ids[2] AND version=blank_versions[2]+1 AND updated_at=test_now)
     OR NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE id=blank_ids[3] AND barcode IS NULL AND version=blank_versions[3])
     OR NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE id=coded_variant.id AND pg_catalog.to_jsonb(product_variants)=pg_catalog.to_jsonb(coded_variant)) THEN
    RAISE EXCEPTION 'integration_bulk_saved_data_invalid';
  END IF;
  SELECT * INTO replayed FROM saas.barcode_label_generate_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,generate_operation,targets);
  IF replayed.outcome IS DISTINCT FROM 'operation_replayed'
     OR replayed.result_payload->'replayed' IS DISTINCT FROM 'true'::jsonb
     OR replayed.result_payload-'replayed' IS DISTINCT FROM generated.result_payload-'replayed'
     OR (SELECT version FROM saas.product_variants WHERE id=blank_ids[1])<>blank_versions[1]+1
     OR (SELECT version FROM saas.product_variants WHERE id=blank_ids[2])<>blank_versions[2]+1 THEN
    RAISE EXCEPTION 'integration_bulk_replay_invalid';
  END IF;
  changed_targets:=pg_catalog.jsonb_set(targets,'{0,expectedVersion}',pg_catalog.to_jsonb(blank_versions[1]+1));
  SELECT * INTO rejected FROM saas.barcode_label_generate_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,generate_operation,changed_targets);
  IF rejected.outcome IS DISTINCT FROM 'operation_mismatch' OR rejected.result_payload IS NOT NULL THEN
    RAISE EXCEPTION 'integration_bulk_idempotency_mismatch_not_rejected';
  END IF;
  RAISE NOTICE 'PASS bulk: two distinct valid saved codes, existing-code preservation, stale-version rejection, replay, mismatch';

  -- Repeating the original seed again must skip the reservation candidates
  -- and both codes now present on product rows.
  PERFORM pg_catalog.setseed(0.271828);
  SELECT * INTO replayed FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,operation_three);
  IF replayed.outcome IS DISTINCT FROM 'reserved'
     OR replayed.result_payload->>'barcode' IN(result_one.result_payload->>'barcode',result_two.result_payload->>'barcode',generated_code_one,generated_code_two)
     OR saas.barcode_label_ean13_valid(replayed.result_payload->>'barcode') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'integration_existing_product_collision_not_avoided';
  END IF;

  constraint_rejected:=false;
  BEGIN
    UPDATE saas.product_variants SET barcode=generated_code_one WHERE id=blank_ids[3];
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'product_variants_store_ean13_internal_barcode_key' THEN RAISE; END IF;
    constraint_rejected:=true;
  END;
  IF NOT constraint_rejected THEN RAISE EXCEPTION 'integration_product_unique_index_failed'; END IF;
  constraint_rejected:=false;
  BEGIN
    INSERT INTO saas.barcode_label_operations(operation_id,store_id,operation_kind,operation_fingerprint,result_payload,committed_at)
      VALUES(pg_catalog.gen_random_uuid(),actor.store_id,'reserve_internal',pg_catalog.md5('reserve_internal_ean13'),result_one.result_payload,test_now);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'barcode_label_operations_store_ean13_reservation_key' THEN RAISE; END IF;
    constraint_rejected:=true;
  END;
  IF NOT constraint_rejected THEN RAISE EXCEPTION 'integration_reservation_unique_index_failed'; END IF;
  RAISE NOTICE 'PASS collisions: saved product candidates avoided and both per-store unique indexes reject duplicates';

  SELECT * INTO rejected FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,pg_catalog.gen_random_uuid(),actor.plan_id,
    actor.plan_code,actor.plan_version,test_now,denied_operation);
  IF rejected.outcome IS DISTINCT FROM 'membership_denied' OR rejected.result_payload IS NOT NULL
     OR EXISTS(SELECT 1 FROM saas.barcode_label_operations WHERE operation_id=denied_operation) THEN
    RAISE EXCEPTION 'integration_invalid_membership_not_rejected';
  END IF;
  SELECT * INTO rejected FROM saas.barcode_label_reserve_ean13_internal(
    actor.store_id,actor.principal_id,actor.membership_id,actor.plan_id,
    actor.plan_code,actor.plan_version+1,test_now,denied_operation);
  IF rejected.outcome IS DISTINCT FROM 'durable_authority_invalid' OR rejected.result_payload IS NOT NULL
     OR EXISTS(SELECT 1 FROM saas.barcode_label_operations WHERE operation_id=denied_operation) THEN
    RAISE EXCEPTION 'integration_invalid_plan_not_rejected';
  END IF;
  RAISE NOTICE 'PASS authority: real current context accepted; invalid membership and plan rejected without operations';

  IF EXISTS(SELECT 1 FROM ean13_integration_product_baseline AS baseline
            JOIN saas.product_variants AS variant ON variant.id=baseline.id
            WHERE NOT(variant.id=ANY(blank_ids))
              AND baseline.original_row IS DISTINCT FROM pg_catalog.to_jsonb(variant))
     OR EXISTS(SELECT 1 FROM ean13_integration_product_baseline AS baseline
               JOIN saas.product_variants AS variant ON variant.id=baseline.id
               WHERE variant.id=ANY(blank_ids)
                 AND baseline.original_row-ARRAY['barcode','version','updated_at']::text[] IS DISTINCT FROM
                     pg_catalog.to_jsonb(variant)-ARRAY['barcode','version','updated_at']::text[]) THEN
    RAISE EXCEPTION 'integration_unrelated_existing_product_data_changed';
  END IF;
  RAISE NOTICE 'PASS preservation: original coded and unrelated product rows unchanged; rollback fixtures=%, current_session_available=%',fixture_count,has_current_session;
END
$integration$;

ROLLBACK;

DO $rollback_verification$
BEGIN
  IF EXISTS(SELECT 1 FROM ean13_integration_product_baseline AS baseline
            FULL JOIN saas.product_variants AS variant ON variant.id=baseline.id
            WHERE baseline.original_row IS DISTINCT FROM pg_catalog.to_jsonb(variant)) THEN
    RAISE EXCEPTION 'integration_rollback_product_data_changed';
  END IF;
  IF EXISTS(SELECT 1 FROM ean13_integration_operation_baseline AS baseline
            FULL JOIN saas.barcode_label_operations AS operation ON operation.operation_id=baseline.operation_id
            WHERE baseline.original_row IS DISTINCT FROM pg_catalog.to_jsonb(operation)) THEN
    RAISE EXCEPTION 'integration_rollback_barcode_operations_changed';
  END IF;
  RAISE NOTICE 'PASS rollback: all original product variants and barcode operations identical, no fixtures or allocations retained';
END
$rollback_verification$;

DROP TABLE ean13_integration_product_baseline;
DROP TABLE ean13_integration_operation_baseline;
RESET ROLE;
SELECT 'ean13_integration_passed_and_product_data_unchanged' AS integration_result;
