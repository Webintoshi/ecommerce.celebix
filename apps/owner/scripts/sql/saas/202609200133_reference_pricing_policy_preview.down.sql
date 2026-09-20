-- No automatic rollback may remove candidate-confirmation guards from a store
-- with reference policy history. A history-free rollback restores the V1 calculator.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $fn$ BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_definitions)
    OR EXISTS (SELECT 1 FROM saas.pricing_reference_sets)
    OR EXISTS (SELECT 1 FROM saas.pricing_variant_policy_versions)
    OR EXISTS (SELECT 1 FROM saas.pricing_reference_operations) THEN
    RAISE EXCEPTION 'REFERENCE_POLICY_PREVIEW_ROLLBACK_REQUIRES_EMPTY_HISTORY';
  END IF;
END $fn$;
DROP FUNCTION saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb,text);
DROP FUNCTION saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text);
-- The V1 dynamic calculator still needs this helper until migration 130 rolls back.
-- Reinstalling its original function body must precede dropping the helper.
CREATE OR REPLACE FUNCTION saas.pricing_calculate_variant_price(
  p_store_id uuid,p_variant_id uuid,p_set_id uuid
) RETURNS TABLE(outcome text,price_cents bigint,policy_version bigint,trace jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_variant saas.product_variants%ROWTYPE;
  selected_policy saas.pricing_variant_policy_versions%ROWTYPE;
  selected_reference saas.pricing_reference_definitions%ROWTYPE;
  selected_value saas.pricing_reference_set_values%ROWTYPE;
  selected_set uuid; metal_component numeric; labor_component numeric; unit_try numeric; rounded numeric;
BEGIN
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::bigint,NULL::jsonb; RETURN; END IF;
  SELECT policy.* INTO selected_policy FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  IF NOT FOUND OR selected_policy.method='fixed_try' THEN
    RETURN QUERY SELECT 'found',selected_variant.price_cents,
      CASE WHEN selected_policy.method='fixed_try' THEN selected_policy.version ELSE NULL::bigint END,
      pg_catalog.jsonb_build_object('method','fixed_try'); RETURN;
  END IF;
  selected_set:=p_set_id;
  IF selected_set IS NULL THEN SELECT state.active_set_id INTO selected_set FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id; END IF;
  SELECT definition.* INTO selected_reference FROM saas.pricing_reference_definitions definition
    WHERE definition.store_id=p_store_id AND definition.id=selected_policy.reference_id;
  IF NOT FOUND OR selected_reference.kind<>selected_policy.method THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  SELECT value.* INTO selected_value FROM saas.pricing_reference_set_values value
    WHERE value.store_id=p_store_id AND value.set_id=selected_set AND value.reference_id=selected_policy.reference_id;
  IF NOT FOUND OR selected_value.active IS DISTINCT FROM true OR selected_value.rate_try IS NULL
    OR (selected_policy.method='gold_gram' AND selected_policy.purity_mode='ratio' AND selected_reference.reference_purity IS NULL) THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN;
  END IF;
  IF selected_policy.method='gold_gram' THEN
    metal_component:=selected_policy.metal_grams*selected_value.rate_try;
    IF selected_policy.purity_mode='ratio' THEN
      metal_component:=metal_component*selected_policy.product_purity/selected_reference.reference_purity;
    END IF;
  ELSE metal_component:=selected_policy.source_amount*selected_value.rate_try; END IF;
  labor_component:=CASE selected_policy.labor_mode WHEN 'per_item_try' THEN selected_policy.labor_amount
    WHEN 'per_gram_try' THEN selected_policy.metal_grams*selected_policy.labor_amount ELSE 0::numeric END;
  unit_try:=metal_component*(1+selected_policy.uplift_percent/100)+labor_component;
  IF unit_try<0 OR unit_try>80000000 THEN RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN; END IF;
  rounded:=pg_catalog.round(unit_try*100,0);
  IF rounded NOT BETWEEN 0 AND 8000000000 THEN RETURN QUERY SELECT 'unavailable',NULL::bigint,selected_policy.version,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',rounded::bigint,selected_policy.version,
    pg_catalog.jsonb_build_object('method',selected_policy.method,'referenceId',selected_policy.reference_id,
      'setId',selected_set,'policyVersion',selected_policy.version,
      'componentTry',metal_component::text,'laborTry',labor_component::text);
END $fn$;
DROP FUNCTION saas.pricing_calculate_policy_candidate(uuid,uuid,jsonb,uuid);
GRANT EXECUTE ON FUNCTION saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb)
TO celebix_saas_app;
COMMIT;
