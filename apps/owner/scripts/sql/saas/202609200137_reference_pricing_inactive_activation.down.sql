-- Restore the previous activation guard in an isolated rollback rehearsal only.
-- Do not use this rollback after merchants have activated inactive references.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_set_id uuid,p_expected_state_version bigint,p_expected_scope_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_state saas.pricing_reference_state%ROWTYPE; selected_set saas.pricing_reference_sets%ROWTYPE;
  selected_variant record; candidate record; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_state_version IS NULL OR p_expected_state_version<0
    OR p_expected_scope_digest IS NULL OR p_expected_scope_digest!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state WHERE store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR selected_state.version<>p_expected_state_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF selected_state.version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_set FROM saas.pricing_reference_sets selected
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  IF saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now) IS DISTINCT FROM p_expected_scope_digest THEN
    RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
  END IF;
  FOR selected_variant IN
    SELECT variant.id FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id
      AND policy.variant_id=state.variant_id AND policy.version=state.current_version
    JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id AND variant.status='active'
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
    WHERE state.store_id=p_store_id AND policy.method<>'fixed_try'
  LOOP
    SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected_variant.id,p_set_id);
    IF candidate.outcome<>'found' THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  END LOOP;
  UPDATE saas.pricing_reference_state SET active_set_id=p_set_id,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id;
  projected:=pg_catalog.jsonb_build_object('setId',p_set_id,'version',selected_set.version,
    'stateVersion',selected_state.version+1,'activatedAt',saas.pricing_json_timestamp(p_now));
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'activate',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'activated',projected;
END $fn$;
COMMIT;
