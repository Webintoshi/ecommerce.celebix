-- EMERGENCY, PRE-RESTORE ONLY. Normal rollback is code-only and leaves this additive schema in place.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $fn$
BEGIN
  IF pg_catalog.current_setting('saas.promotions_studio_emergency_drop',true) IS DISTINCT FROM 'approved-pre-restore' THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_EMERGENCY_SETTING_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM saas.promotions) OR EXISTS (SELECT 1 FROM saas.promotion_operations) OR EXISTS (SELECT 1 FROM saas.promotion_audit_events) OR EXISTS (SELECT 1 FROM saas.promotion_usage_reservations) OR EXISTS (SELECT 1 FROM saas.promotion_redemptions) OR EXISTS (SELECT 1 FROM saas.order_promotion_snapshots) OR EXISTS (SELECT 1 FROM saas.order_discount_allocations) OR EXISTS (
    SELECT 1
    FROM saas.storefront_hosted_checkout_sessions
    WHERE evaluator_authority_digest IS NOT NULL
      OR promotion_evaluator_context IS NOT NULL
      OR promotion_evaluation IS NOT NULL
      OR promotion_normalized_codes IS NOT NULL
      OR promotion_reservation_group_id IS NOT NULL
      OR promotion_reservation_expires_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM saas.storefront_checkout_operations
    WHERE (result_payload->'receipt' ? 'promotionStatus') IS TRUE
  ) THEN RAISE EXCEPTION 'PROMOTIONS_STUDIO_DATA_BEARING_DOWN_REFUSED'; END IF;
END $fn$;
DROP TRIGGER IF EXISTS aa_storefront_hosted_checkout_promotion_terminal_v2 ON saas.payment_attempts;
DROP TRIGGER IF EXISTS zz_storefront_hosted_checkout_promotion_terminal_v2 ON saas.payment_attempts;
DROP FUNCTION IF EXISTS saas.storefront_hosted_checkout_promotion_terminal_v2();
DROP FUNCTION IF EXISTS saas.storefront_hosted_checkout_promotion_release_v2(uuid,uuid,uuid,timestamptz);
DROP FUNCTION IF EXISTS saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text);
DROP FUNCTION IF EXISTS saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS saas.storefront_hosted_checkout_authority_v2_projection(text,timestamptz,text,jsonb,bigint,jsonb,uuid,uuid,jsonb,uuid);
DROP FUNCTION IF EXISTS saas.storefront_hosted_checkout_customer_prepare_v2(uuid,timestamptz,jsonb,jsonb,uuid,boolean);
DROP FUNCTION IF EXISTS saas.storefront_hosted_checkout_promotion_codes_valid_v2(jsonb);
ALTER TABLE saas.storefront_hosted_checkout_sessions
  DROP CONSTRAINT IF EXISTS storefront_hosted_checkout_sessions_v2_facts_check,
  DROP COLUMN IF EXISTS promotion_reservation_expires_at,
  DROP COLUMN IF EXISTS promotion_reservation_group_id,
  DROP COLUMN IF EXISTS promotion_normalized_codes,
  DROP COLUMN IF EXISTS promotion_evaluation,
  DROP COLUMN IF EXISTS promotion_evaluator_context,
  DROP COLUMN IF EXISTS evaluator_authority_digest;
ALTER TABLE saas.storefront_hosted_checkout_operations
  DROP CONSTRAINT storefront_hosted_checkout_operations_result_payload_check,
  ADD CONSTRAINT storefront_hosted_checkout_operations_result_payload_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768
  );
DROP FUNCTION IF EXISTS saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[]);
DROP FUNCTION IF EXISTS saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb);
DROP FUNCTION IF EXISTS saas.public_checkout_recover_v2(text,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS saas.public_receipt_get_v2(text,timestamptz,jsonb,jsonb);
DROP FUNCTION IF EXISTS saas.public_account_orders_v2(text,timestamptz,jsonb,integer);

CREATE OR REPLACE FUNCTION saas.public_checkout_recover(
  p_hostname text,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_operation saas.storefront_checkout_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id AND store_id=selected_store;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSIF selected_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload; END IF;
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_receipt_get(
  p_hostname text,p_now timestamptz,p_receipt_credentials jsonb,p_customer_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_receipt saas.storefront_order_receipts%ROWTYPE; result jsonb;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_receipt_credentials,false)
    OR NOT saas.storefront_credential_candidates_valid(p_customer_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT receipt.* INTO selected_receipt FROM saas.storefront_order_receipts receipt
  JOIN pg_catalog.jsonb_array_elements(p_receipt_credentials) receipt_candidate
    ON receipt_candidate->>'keyId'=receipt.key_id AND receipt_candidate->>'digest'=receipt.credential_digest
  JOIN saas.storefront_customer_credentials customer_credential
    ON customer_credential.store_id=receipt.store_id AND customer_credential.id=receipt.customer_credential_id
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) customer_candidate
    ON customer_candidate->>'keyId'=customer_credential.key_id AND customer_candidate->>'digest'=customer_credential.credential_digest
  WHERE receipt.store_id=selected_store AND receipt.expires_at>p_now AND customer_credential.expires_at>p_now
  ORDER BY receipt.created_at DESC,receipt.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT operation.result_payload->'receipt' INTO result FROM saas.storefront_checkout_operations operation
  WHERE operation.store_id=selected_store AND operation.order_id=selected_receipt.order_id;
  RETURN QUERY SELECT CASE WHEN result IS NULL THEN 'not_found' ELSE 'found' END,result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_account_orders(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_credential saas.storefront_customer_credentials%ROWTYPE; items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT credential.* INTO selected_credential FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=selected_store AND credential.expires_at>p_now ORDER BY credential.created_at DESC,credential.id LIMIT 1 FOR UPDATE OF credential;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_customer_credentials SET last_seen_at=GREATEST(last_seen_at,p_now)
    WHERE store_id=selected_store AND id=selected_credential.id;
  SELECT COALESCE(pg_catalog.jsonb_agg(entry.receipt ORDER BY entry.created_at DESC,entry.order_id DESC),'[]'::jsonb) INTO items FROM (
    SELECT operation.result_payload->'receipt' receipt,orders.created_at,orders.id order_id
    FROM saas.storefront_order_receipts receipt
    JOIN saas.orders orders ON orders.store_id=receipt.store_id AND orders.id=receipt.order_id
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    WHERE receipt.store_id=selected_store AND receipt.customer_credential_id=selected_credential.id
    ORDER BY receipt.created_at DESC,receipt.order_id DESC LIMIT p_limit
  ) entry;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',items);
END
$f$;
DROP FUNCTION IF EXISTS saas.promotion_checkout_codes_valid_v1(text[]);
DROP TRIGGER promotion_audit_events_immutable ON saas.promotion_audit_events;
DROP TRIGGER promotions_created_at_immutable ON saas.promotions;
DROP TRIGGER promotion_versions_immutable ON saas.promotion_versions;
DROP TRIGGER promotion_operations_immutable ON saas.promotion_operations;
DROP TRIGGER promotion_operations_group_complete ON saas.promotion_operations;
DROP TRIGGER promotion_redemptions_immutable ON saas.promotion_redemptions;
DROP TRIGGER order_promotion_snapshots_immutable ON saas.order_promotion_snapshots;
DROP TRIGGER order_discount_allocations_immutable ON saas.order_discount_allocations;
DROP TRIGGER promotion_usage_reservations_transition_only ON saas.promotion_usage_reservations;
DROP TRIGGER promotion_usage_reservations_group_transition_complete ON saas.promotion_usage_reservations;
DROP TRIGGER promotion_usage_reservations_insert_binding ON saas.promotion_usage_reservations;
DROP TRIGGER promotion_redemptions_insert_binding ON saas.promotion_redemptions;
DROP TRIGGER order_promotion_snapshots_insert_binding ON saas.order_promotion_snapshots;
DROP TRIGGER order_discount_allocations_insert_binding ON saas.order_discount_allocations;
ALTER TABLE saas.promotions DROP CONSTRAINT promotions_rule_document_check;
ALTER TABLE saas.promotion_operations DROP CONSTRAINT promotion_operations_result_entity_check;
ALTER TABLE saas.promotion_operations DROP CONSTRAINT promotion_operations_result_contract_check;
DROP FUNCTION saas.promotion_adopt_legacy_discounts_v1(uuid,timestamptz);
DROP FUNCTION saas.promotion_expire_due_reservations_v1(timestamptz,integer);
DROP FUNCTION saas.promotion_release_expired_v1(uuid,timestamptz);
DROP FUNCTION saas.promotion_reserve_v1(uuid,uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz);
DROP FUNCTION saas.promotion_release_reservation_v1(uuid,uuid,uuid,timestamptz);
DROP FUNCTION saas.promotion_commit_reservation_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz);
DROP FUNCTION saas.promotion_recover_settlement_operation_v1(uuid,timestamptz,uuid,text,text);
DROP FUNCTION saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamptz);
DROP FUNCTION saas.promotion_captured_unit_refund_minor_v1(uuid,uuid,uuid,jsonb,jsonb,bigint,bigint);
DROP FUNCTION saas.promotion_commit_integrity_valid_v1(uuid,uuid);
DROP FUNCTION saas.promotion_auto_gift_order_lines_valid_v1(uuid,uuid,uuid);
DROP FUNCTION saas.promotion_order_allocation_insert_binding_v1();
DROP FUNCTION saas.promotion_order_snapshot_insert_binding_v1();
DROP FUNCTION saas.promotion_reservation_source_order_valid_v1(uuid,text,text,uuid);
DROP FUNCTION saas.promotion_commit_result_v1(uuid,uuid);
DROP FUNCTION saas.promotion_release_reservation_group_v1(uuid,uuid,text,uuid,timestamptz);
DROP FUNCTION saas.promotion_reserve_group_v1(uuid,uuid,text,text,text,jsonb,timestamptz);
DROP FUNCTION saas.promotion_settlement_operation_result_matches_v1(uuid,uuid,text,jsonb);
DROP FUNCTION saas.promotion_reservation_result_v1(uuid,uuid,text);
DROP FUNCTION saas.promotion_reservation_group_integrity_valid_v1(uuid,uuid);
DROP FUNCTION saas.promotion_reservation_source_valid_v1(uuid,text,text);
DROP FUNCTION saas.promotion_order_snapshot_build_v1(uuid,jsonb,jsonb,uuid,timestamptz);
DROP FUNCTION saas.promotion_buy_x_get_y_line_take_v1(uuid,text,jsonb,jsonb,uuid);
DROP FUNCTION saas.promotion_captured_ranges_v1(bigint,bigint,bigint,text,bigint);
DROP FUNCTION saas.promotion_order_snapshot_valid_v1(jsonb);
DROP FUNCTION saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text);
DROP FUNCTION saas.promotion_picker_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]);
DROP FUNCTION saas.promotion_picker_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,integer,text,uuid);
DROP FUNCTION saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb);
DROP FUNCTION saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,timestamptz,uuid);
DROP FUNCTION saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.promotion_legacy_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.promotion_store_timezone_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.promotion_storefront_origin_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.public_promotion_compiled_read_v1(text,timestamptz,text,text);
DROP FUNCTION saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,integer,timestamptz,timestamptz,uuid);
DROP FUNCTION saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.promotion_analytics_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,integer);
DROP FUNCTION saas.promotion_overview_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer);
DROP FUNCTION saas.promotion_analytics_orders_v2(uuid,uuid,timestamptz,integer);
DROP FUNCTION saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text,integer,integer,timestamptz);
DROP FUNCTION saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text);
DROP FUNCTION saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb);
DROP FUNCTION saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb,jsonb);
DROP FUNCTION saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],text[],text[],text[],timestamptz,timestamptz,integer,timestamptz,timestamptz,uuid);
DROP FUNCTION saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer);
DROP FUNCTION saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text[]);
DROP FUNCTION saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb);
DROP FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb);
DROP FUNCTION saas.promotion_picker_source_v1(uuid,text);
DROP FUNCTION saas.promotion_margin_projection_v1(uuid,timestamptz,jsonb);
DROP FUNCTION saas.promotion_conflict_projection_v1(uuid,timestamptz,jsonb,uuid);
DROP FUNCTION saas.promotion_definition_dimensions_overlap_v1(uuid,jsonb,jsonb);
DROP FUNCTION saas.promotion_definition_windows_overlap_v1(jsonb,jsonb);
DROP FUNCTION saas.promotion_definition_variant_facts_v1(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_variant_matches_targets_v1(uuid,jsonb,uuid,uuid);
DROP FUNCTION saas.promotion_catalog_reference_matches_variant_v1(uuid,jsonb,uuid,uuid);
DROP FUNCTION saas.promotion_record_operation(uuid,uuid,text,text,jsonb,timestamptz);
DROP FUNCTION saas.promotion_projection(uuid,uuid);
DROP FUNCTION saas.promotion_operation_authority_lock_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.promotion_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluate_internal_v1(uuid,jsonb,timestamptz,jsonb);
DROP FUNCTION saas.promotion_evaluate_internal_v1(uuid,jsonb,timestamptz,jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_candidate_facts(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluator_candidate_facts(uuid,jsonb,timestamptz,jsonb);
DROP FUNCTION saas.promotion_bundle_facts_v1(jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_catalog_line_matches(uuid,text,jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_audience_matches(uuid,jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_gift_variant_valid(uuid,uuid);
DROP FUNCTION saas.promotion_combination_compatible(jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_abandoned_cart_valid(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluator_code_facts(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluator_audience_facts(uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluator_materialize_lines(uuid,text,jsonb,timestamptz);
DROP FUNCTION saas.promotion_evaluator_consumed_line_capacity(jsonb,jsonb,bigint,bigint);
DROP FUNCTION saas.promotion_evaluator_line_capacity(jsonb,jsonb,bigint);
DROP FUNCTION saas.promotion_evaluator_line_matches(jsonb,jsonb);
DROP FUNCTION saas.promotion_evaluator_context_valid(uuid,jsonb);
DROP FUNCTION saas.promotion_evaluator_empty_result(text,text);
DROP FUNCTION saas.promotion_created_at_immutable();
DROP FUNCTION saas.promotion_history_append_only();
DROP FUNCTION saas.promotion_reservation_transition_only();
DROP FUNCTION saas.promotion_reservation_group_transition_complete();
DROP FUNCTION saas.promotion_reservation_matches_operation();
DROP FUNCTION saas.promotion_redemption_matches_reservation();
DROP FUNCTION saas.promotion_operation_group_complete();
DROP FUNCTION saas.promotion_audit_append_only();
DROP FUNCTION saas.promotion_operation_recovery_action(text);
DROP FUNCTION saas.promotion_operation_entity_id(text,jsonb);
DROP FUNCTION saas.promotion_operation_entity_kind(text);
DROP FUNCTION saas.promotion_operation_result_valid(text,jsonb);
DROP FUNCTION saas.promotion_code_batch_result_matches_v1(uuid,uuid,text,jsonb);
DROP FUNCTION saas.promotion_code_batch_integrity_valid_v1(uuid,uuid);
DROP FUNCTION saas.promotion_code_batch_projection_v1(uuid,uuid);
DROP FUNCTION saas.promotion_legacy_review_reason_v1(uuid,uuid,text,jsonb);
DROP FUNCTION saas.promotion_sync_direct_codes(uuid,uuid,jsonb,timestamptz);
DROP FUNCTION saas.promotion_materialize_targets(uuid,uuid,jsonb);
DROP FUNCTION saas.promotion_lock_definition_references(uuid,jsonb);
DROP FUNCTION saas.promotion_definition_references_valid(uuid,jsonb);
DROP FUNCTION saas.promotion_shipping_method_current(uuid,uuid);
DROP FUNCTION saas.promotion_effective_status_v1(text,jsonb,bigint,bigint,timestamptz);
DROP FUNCTION saas.promotion_lifecycle_transition_valid(text,text);
DROP FUNCTION saas.promotion_human_mechanic_v1(text,jsonb);
DROP FUNCTION saas.promotion_money_tr_v1(bigint,text);
DROP FUNCTION saas.promotion_safe_timestamptz(text);
DROP FUNCTION saas.promotion_json_utc_timestamp(jsonb);
DROP FUNCTION saas.promotion_operation_fingerprint_v2(text,uuid,jsonb);
DROP FUNCTION saas.promotion_fingerprint_canonical_json(jsonb,text);
DROP FUNCTION saas.promotion_operation_fingerprint(text,jsonb);
DROP FUNCTION saas.promotion_normalize_code(text);
DROP FUNCTION saas.promotion_rule_document_valid(jsonb);
DROP FUNCTION saas.promotion_json_array_unique(jsonb);
DROP FUNCTION saas.promotion_json_uuid(jsonb);
DROP FUNCTION saas.promotion_json_integer(jsonb,bigint,bigint);
DROP FUNCTION saas.promotion_json_keys(jsonb,text[],text[]);
DROP TABLE saas.order_discount_allocations;
DROP TABLE saas.order_promotion_snapshots;
DROP TABLE saas.promotion_audit_events;
DROP TABLE saas.promotion_redemptions;
DROP TABLE saas.promotion_usage_reservations;
DROP TABLE saas.promotion_codes;
DROP TABLE saas.promotion_code_batches;
DROP TABLE saas.promotion_operations;
DROP TABLE saas.promotion_targets;
DROP TABLE saas.promotion_versions;
DROP TABLE saas.promotions;
COMMIT;
