-- Candidate policy previews use the same exact calculator as published catalog prices.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.pricing_calculate_policy_candidate(
  p_store_id uuid,p_variant_id uuid,p_policy jsonb,p_set_id uuid
) RETURNS TABLE(outcome text,price_cents bigint,trace jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_variant saas.product_variants%ROWTYPE;
  selected_reference saas.pricing_reference_definitions%ROWTYPE;
  selected_value saas.pricing_reference_set_values%ROWTYPE;
  selected_set uuid; component numeric; labor numeric; unit_try numeric; rounded numeric;
  method text; labor_mode text;
BEGIN
  IF NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::jsonb; RETURN;
  END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::jsonb; RETURN; END IF;
  method:=p_policy->>'method';
  IF method='fixed_try' THEN
    RETURN QUERY SELECT 'found',(p_policy->>'fixedPriceCents')::bigint,
      pg_catalog.jsonb_build_object('method','fixed_try'); RETURN;
  END IF;
  selected_set:=p_set_id;
  IF selected_set IS NULL THEN
    SELECT state.active_set_id INTO selected_set FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  END IF;
  SELECT definition.* INTO selected_reference FROM saas.pricing_reference_definitions definition
  WHERE definition.store_id=p_store_id AND definition.id=(p_policy->>'referenceId')::uuid;
  IF NOT FOUND OR selected_reference.kind<>method OR (method='gold_gram' AND
    p_policy->>'purityMode'='ratio' AND selected_reference.reference_purity IS NULL) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::jsonb; RETURN;
  END IF;
  SELECT value.* INTO selected_value FROM saas.pricing_reference_set_values value
  WHERE value.store_id=p_store_id AND value.set_id=selected_set AND value.reference_id=selected_reference.id;
  IF NOT FOUND OR selected_value.active IS DISTINCT FROM true OR selected_value.rate_try IS NULL THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,NULL::jsonb; RETURN;
  END IF;
  IF method='gold_gram' THEN
    component:=(p_policy->>'metalGrams')::numeric*selected_value.rate_try;
    IF p_policy->>'purityMode'='ratio' THEN
      component:=component*(p_policy->>'productPurity')::numeric/selected_reference.reference_purity;
    END IF;
  ELSE
    component:=(p_policy->>'sourceAmount')::numeric*selected_value.rate_try;
  END IF;
  labor_mode:=COALESCE(p_policy->>'laborMode','none');
  labor:=CASE labor_mode
    WHEN 'per_item_try' THEN (p_policy->>'laborAmount')::numeric
    WHEN 'per_gram_try' THEN (p_policy->>'metalGrams')::numeric*(p_policy->>'laborAmount')::numeric
    ELSE 0::numeric END;
  unit_try:=component*(1+COALESCE(p_policy->>'upliftPercent','0')::numeric/100)+labor;
  IF unit_try<0 OR unit_try>80000000 THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,NULL::jsonb; RETURN;
  END IF;
  rounded:=pg_catalog.round(unit_try*100,0);
  IF rounded NOT BETWEEN 0 AND 8000000000 THEN
    RETURN QUERY SELECT 'unavailable',NULL::bigint,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',rounded::bigint,
    pg_catalog.jsonb_build_object('method',method,'referenceId',selected_reference.id,
      'setId',selected_set,'referenceRateTry',selected_value.rate_try::text,
      'componentTry',component::numeric(28,8)::text,'laborTry',labor::numeric(28,8)::text);
END $fn$;

CREATE OR REPLACE FUNCTION saas.pricing_calculate_variant_price(
  p_store_id uuid,p_variant_id uuid,p_set_id uuid
) RETURNS TABLE(outcome text,price_cents bigint,policy_version bigint,trace jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_variant saas.product_variants%ROWTYPE;
  selected_policy saas.pricing_variant_policy_versions%ROWTYPE; candidate record;
BEGIN
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::bigint,NULL::jsonb; RETURN; END IF;
  SELECT policy.* INTO selected_policy FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id
    AND policy.variant_id=state.variant_id AND policy.version=state.current_version
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  IF NOT FOUND OR selected_policy.method='fixed_try' THEN
    RETURN QUERY SELECT 'found',selected_variant.price_cents,
      CASE WHEN selected_policy.method='fixed_try' THEN selected_policy.version ELSE NULL::bigint END,
      pg_catalog.jsonb_build_object('method','fixed_try'); RETURN;
  END IF;
  SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(
    p_store_id,p_variant_id,selected_policy.policy_payload,p_set_id);
  RETURN QUERY SELECT candidate.outcome::text,candidate.price_cents::bigint,
    selected_policy.version,CASE WHEN candidate.trace IS NULL THEN NULL::jsonb
      ELSE candidate.trace||pg_catalog.jsonb_build_object('policyVersion',selected_policy.version) END;
END $fn$;

CREATE FUNCTION saas.pricing_variant_policy_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_variant_id uuid,p_policy jsonb,p_channel text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_variant saas.product_variants%ROWTYPE;
  old_price record; candidate record; selected_state saas.pricing_reference_state%ROWTYPE;
  active_set_version bigint; selected_policy_version bigint; selected_list_version bigint;
  selected_source text; selected_list uuid; projected jsonb; signature jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_variant_id IS NULL OR p_channel IS DISTINCT FROM 'storefront'
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(state.current_version,0) INTO selected_policy_version
    FROM saas.pricing_variant_policy_state state WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  selected_policy_version:=COALESCE(selected_policy_version,0);
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  IF selected_state.active_set_id IS NOT NULL THEN
    SELECT sets.version INTO active_set_version FROM saas.pricing_reference_sets sets
      WHERE sets.store_id=p_store_id AND sets.id=selected_state.active_set_id;
  END IF;
  SELECT * INTO old_price FROM saas.resolve_effective_variant_price(p_store_id,p_variant_id,p_channel,p_now,NULL::text);
  SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,p_variant_id,p_policy,NULL::uuid);
  IF candidate.outcome='invalid_input' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF old_price.outcome NOT IN ('found','unavailable') OR candidate.outcome NOT IN ('found','unavailable') THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  selected_source:=CASE WHEN old_price.outcome<>'found' THEN NULL::text
    WHEN old_price.source_kind='price_list' THEN 'price_list' ELSE 'base' END;
  selected_list:=CASE WHEN selected_source='price_list' THEN old_price.price_list_id ELSE NULL::uuid END;
  IF selected_list IS NOT NULL THEN
    SELECT list.version INTO selected_list_version FROM saas.price_lists list
      WHERE list.store_id=p_store_id AND list.id=selected_list;
  END IF;
  projected:=pg_catalog.jsonb_build_object(
    'variantId',p_variant_id,'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
    'newPriceCents',CASE WHEN candidate.outcome='found' THEN
      CASE WHEN selected_list IS NOT NULL THEN old_price.price_cents ELSE candidate.price_cents END ELSE NULL END,
    'sourceKind',selected_source,'priceListId',selected_list,
    'activeSetId',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE selected_state.active_set_id END,
    'activeSetVersion',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE active_set_version END,
    'referenceId',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE (p_policy->>'referenceId')::uuid END,
    'referenceRateTry',candidate.trace->>'referenceRateTry','method',p_policy->>'method',
    'metalComponentTry',candidate.trace->>'componentTry','laborTry',candidate.trace->>'laborTry',
    'policyVersion',selected_policy_version,'variantVersion',selected_variant.version);
  signature:=pg_catalog.jsonb_build_object('storeId',p_store_id,'channel',p_channel,'policy',p_policy,
    'projection',projected,'activeStateVersion',COALESCE(selected_state.version,0),
    'priceListVersion',selected_list_version);
  RETURN QUERY SELECT 'previewed',projected||pg_catalog.jsonb_build_object('scopeDigest',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signature::text,'UTF8')),'hex'));
END $fn$;

CREATE FUNCTION saas.pricing_variant_policy_save_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_variant_id uuid,p_expected_variant_version bigint,p_expected_policy_version bigint,p_policy jsonb,
  p_expected_scope_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; candidate record; saved record;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_variant_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_variant_version IS NULL OR p_expected_variant_version<1
    OR p_expected_policy_version IS NULL OR p_expected_policy_version<0
    OR p_expected_scope_digest IS NULL OR p_expected_scope_digest!~'^[a-f0-9]{64}$'
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants variant WHERE variant.store_id=p_store_id AND variant.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO candidate FROM saas.pricing_variant_policy_preview(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_variant_id,p_policy,'storefront');
  IF candidate.outcome<>'previewed' THEN RETURN QUERY SELECT candidate.outcome::text,NULL::jsonb; RETURN; END IF;
  IF (candidate.result_payload->>'variantVersion')::bigint<>p_expected_variant_version
    OR (candidate.result_payload->>'policyVersion')::bigint<>p_expected_policy_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF candidate.result_payload->>'scopeDigest' IS DISTINCT FROM p_expected_scope_digest THEN
    RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
  END IF;
  IF candidate.result_payload->'newPriceCents'='null'::jsonb THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO saved FROM saas.pricing_variant_policy_save(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,
    p_variant_id,p_expected_variant_version,p_expected_policy_version,p_policy);
  RETURN QUERY SELECT saved.outcome::text,saved.result_payload::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.pricing_calculate_policy_candidate(uuid,uuid,jsonb,uuid),
  saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text),
  saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb)
FROM celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text),
  saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb,text)
TO celebix_saas_app;
COMMIT;
