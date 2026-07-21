-- Disposable-only rollback for migration 026.
-- Restores the exact migration-025 cancellation and migration-018 catalog archive bodies.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP TRIGGER product_variants_checkout_hold ON saas.product_variants;
DROP TRIGGER quick_order_links_live_attempt ON saas.quick_order_links;
DROP TRIGGER quick_order_links_paid_immutable ON saas.quick_order_links;
DROP TRIGGER checkout_operations_immutable ON saas.checkout_operations;
DROP TRIGGER checkout_reconciliation_jobs_transition ON saas.checkout_reconciliation_jobs;
DROP TRIGGER checkout_reconciliation_receipts_immutable ON saas.checkout_reconciliation_receipts;
DROP TRIGGER checkout_callback_receipts_immutable ON saas.checkout_callback_receipts;
DROP TRIGGER checkout_inventory_reservations_transition ON saas.checkout_inventory_reservations;
DROP TRIGGER checkout_payment_attempts_transition ON saas.checkout_payment_attempts;
DROP TRIGGER quick_order_redemption_sessions_transition ON saas.quick_order_redemption_sessions;
DROP TRIGGER checkout_provider_configs_terminal ON saas.checkout_provider_configs;

DROP FUNCTION saas.guard_checkout_variant_held_reservation();
DROP FUNCTION saas.guard_checkout_quick_link_live_attempt();
DROP FUNCTION saas.guard_checkout_paid_link_mutation();
DROP FUNCTION saas.guard_checkout_reservation_transition();
DROP FUNCTION saas.guard_checkout_attempt_transition();
DROP FUNCTION saas.guard_checkout_redemption_transition();
DROP FUNCTION saas.guard_checkout_reconciliation_job_transition();
DROP FUNCTION saas.guard_checkout_provider_config_terminal();
DROP FUNCTION saas.guard_checkout_immutable_row();

DROP TABLE saas.checkout_operations;
DROP TABLE saas.checkout_reconciliation_receipts;
DROP TABLE saas.checkout_reconciliation_run;
DROP TABLE saas.checkout_reconciliation_jobs;
DROP TABLE saas.checkout_callback_receipts;
DROP TABLE saas.checkout_inventory_reservations;
DROP TABLE saas.checkout_payment_attempts;
DROP TABLE saas.quick_order_redemption_sessions;

DROP INDEX saas.orders_store_quick_order_link_key;
ALTER TABLE saas.orders
  DROP CONSTRAINT orders_store_id_quick_link_id_runtime_key,
  DROP CONSTRAINT orders_quick_link_currency_store_fk,
  DROP CONSTRAINT orders_quick_link_store_fk,
  DROP CONSTRAINT orders_quick_link_source_check,
  DROP COLUMN billing_address,
  DROP COLUMN quick_order_link_id;

ALTER TABLE saas.quick_order_links
  DROP CONSTRAINT quick_order_links_store_id_provider_currency_runtime_key,
  DROP CONSTRAINT quick_order_links_store_id_currency_runtime_key;

DROP INDEX saas.checkout_provider_configs_store_provider_active_key;
ALTER TABLE saas.checkout_provider_configs
  DROP CONSTRAINT checkout_provider_configs_configuration_digest_check,
  DROP COLUMN configuration_digest,
  ADD CONSTRAINT checkout_provider_configs_store_provider_key UNIQUE (store_id, provider_key);

CREATE OR REPLACE FUNCTION saas.quick_links_cancel(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_link_id uuid, p_expected_version bigint, p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  current_link saas.quick_order_links%ROWTYPE;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_id::text !~ uuid_pattern
     OR p_link_id IS NULL OR p_link_id::text !~ uuid_pattern
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  authority_error := saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0)
  );
  SELECT operation.* INTO existing_operation FROM saas.quick_order_link_operations AS operation
  WHERE operation.store_id=p_store_id
    AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='cancel'
       AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=p_store_id AND link.id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_link.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version=9007199254740991 THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.status NOT IN ('active','opened') OR current_link.expires_at<=p_now THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    UPDATE saas.quick_order_links SET status='cancelled',cancelled_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_link_id;
    result_payload := saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(
      operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES (p_operation_id,p_store_id,p_link_id,'cancel',p_fingerprint,result_payload,p_now);
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation
      OR numeric_value_out_of_range OR datetime_field_overflow THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,result_payload;
END
$function$;

CREATE OR REPLACE FUNCTION saas.catalog_archive_product(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  current_product saas.products%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'archive_product'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT product.* INTO current_product FROM saas.products AS product
  WHERE product.id = p_product_id AND product.store_id = p_store_id
  FOR UPDATE;
  IF NOT FOUND OR current_product.status = 'archived' THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  IF current_product.version <> p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict'::text, NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.product_variants
  SET status = 'archived', archived_at = p_now, version = version + 1, updated_at = p_now
  WHERE store_id = p_store_id AND product_id = p_product_id AND status = 'active';

  UPDATE saas.products
  SET status = 'archived', archived_at = p_now, version = version + 1, updated_at = p_now
  WHERE id = p_product_id AND store_id = p_store_id;

  projection := pg_catalog.jsonb_build_object('product', saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'archive_product', p_fingerprint,
    p_product_id, NULL, projection, p_now
  );
  RETURN QUERY SELECT 'archived'::text, projection;
END
$function$;

COMMIT;
