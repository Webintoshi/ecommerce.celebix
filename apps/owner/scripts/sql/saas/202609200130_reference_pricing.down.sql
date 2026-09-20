-- Rollback is deliberately refused once any merchant reference-pricing history exists.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $fn$ BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_definitions)
    OR EXISTS (SELECT 1 FROM saas.pricing_reference_sets)
    OR EXISTS (SELECT 1 FROM saas.pricing_variant_policy_versions)
    OR EXISTS (SELECT 1 FROM saas.pricing_reference_operations)
  THEN RAISE EXCEPTION 'REFERENCE_PRICING_ROLLBACK_REQUIRES_EMPTY_HISTORY'; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.resolve_effective_variant_price(
  p_store_id uuid,p_variant_id uuid,p_channel text,p_now timestamptz,p_customer_email text DEFAULT NULL
) RETURNS TABLE(outcome text,price_cents bigint,source_kind text,price_list_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_customer uuid; selected_price bigint; selected_list uuid; base_price bigint;
BEGIN
  IF p_store_id IS NULL OR p_variant_id IS NULL OR p_channel IS NULL
    OR p_channel NOT IN ('storefront','quick_order') OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_channel='storefront' AND p_customer_email IS NOT NULL)
    OR (p_customer_email IS NOT NULL AND (
      p_customer_email<>pg_catalog.btrim(p_customer_email)
      OR pg_catalog.char_length(p_customer_email) NOT BETWEEN 3 AND 320
      OR p_customer_email~'[[:cntrl:][:space:]]'
      OR p_customer_email!~'^[^@]+@[^@]+\.[^@]+$'
    )) THEN RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::text,NULL::uuid; RETURN; END IF;
  IF p_channel='quick_order' AND p_customer_email IS NOT NULL THEN
    SELECT customer.id INTO selected_customer FROM saas.customers customer
    WHERE customer.store_id=p_store_id AND customer.email=pg_catalog.lower(p_customer_email) AND customer.status='active';
  END IF;
  SELECT item.price_cents,list.id INTO selected_price,selected_list
  FROM saas.price_lists list JOIN saas.price_list_items item
    ON item.store_id=list.store_id AND item.price_list_id=list.id
  JOIN saas.price_list_rules rule ON rule.store_id=list.store_id AND rule.price_list_id=list.id
  WHERE list.store_id=p_store_id AND list.status='active' AND item.variant_id=p_variant_id
    AND rule.channel=p_channel AND rule.starts_at<=p_now AND (rule.ends_at IS NULL OR p_now<rule.ends_at)
    AND (rule.customer_tag_id IS NULL OR (
      p_channel='quick_order' AND selected_customer IS NOT NULL AND EXISTS (
        SELECT 1 FROM saas.customer_tag_assignments assignment
        JOIN saas.customer_tags tag ON tag.store_id=assignment.store_id AND tag.id=assignment.tag_id AND tag.archived_at IS NULL
        WHERE assignment.store_id=p_store_id AND assignment.customer_id=selected_customer AND assignment.tag_id=rule.customer_tag_id)))
    AND EXISTS (SELECT 1 FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
      WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active')
  ORDER BY rule.priority DESC,rule.starts_at DESC,list.id LIMIT 1;
  IF selected_list IS NOT NULL THEN
    RETURN QUERY SELECT 'found',selected_price,'price_list',selected_list; RETURN;
  END IF;
  SELECT variant.price_cents INTO base_price FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::bigint,NULL::text,NULL::uuid;
  ELSIF base_price NOT BETWEEN 0 AND 8000000000 THEN RETURN QUERY SELECT 'invalid_input',NULL::bigint,NULL::text,NULL::uuid;
  ELSE RETURN QUERY SELECT 'found',base_price,'base',NULL::uuid; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.pricing_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_channel text,p_variant_ids uuid[]
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; expected_count integer; active_count integer;
  resolved_count integer; entries jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_channel IS NULL OR p_channel NOT IN ('storefront','quick_order')
    OR p_variant_ids IS NULL OR pg_catalog.array_ndims(p_variant_ids) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_variant_ids,1) IS DISTINCT FROM 1
    OR pg_catalog.cardinality(p_variant_ids) NOT BETWEEN 1 AND 100
    OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  expected_count:=pg_catalog.cardinality(p_variant_ids);
  IF (SELECT pg_catalog.count(DISTINCT variant_id)
      FROM pg_catalog.unnest(p_variant_ids) selected(variant_id))<>expected_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*) INTO active_count FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    AND product.status='active'
  WHERE variant.store_id=p_store_id AND variant.id=ANY(p_variant_ids) AND variant.status='active';
  IF active_count<>expected_count THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*),pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'variantId',selected.variant_id,'channel',p_channel,
      'basePriceCents',variant.price_cents,'effectivePriceCents',resolved.price_cents,
      'sourceKind',resolved.source_kind,'priceListId',resolved.price_list_id
    )) ORDER BY selected.variant_id::text)
  INTO resolved_count,entries
  FROM pg_catalog.unnest(p_variant_ids) selected(variant_id)
  JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=selected.variant_id
    AND variant.status='active'
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    AND product.status='active'
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,selected.variant_id,p_channel,p_now,NULL::text) resolved
  WHERE resolved.outcome='found' AND resolved.price_cents BETWEEN 0 AND 8000000000
    AND resolved.source_kind IN ('base','price_list')
    AND ((resolved.source_kind='base' AND resolved.price_list_id IS NULL
      AND resolved.price_cents=variant.price_cents)
      OR (resolved.source_kind='price_list' AND resolved.price_list_id IS NOT NULL));
  IF resolved_count<>expected_count OR entries IS NULL THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object(
    'entries',entries,'asOf',saas.pricing_json_timestamp(p_now));
END $fn$;

DROP FUNCTION saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text),
  saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
  saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid),
  saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb),
  saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,bigint),
  saas.pricing_variant_policy_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.pricing_reference_definition_projection(uuid,uuid),
  saas.pricing_reference_set_projection(uuid,uuid),
  saas.pricing_variant_policy_projection(uuid,uuid),
  saas.pricing_reference_scope_digest(uuid,uuid,timestamptz),
  saas.pricing_calculate_variant_price(uuid,uuid,uuid),
  saas.pricing_decimal_valid(text,integer,boolean,numeric),
  saas.pricing_variant_policy_valid(jsonb);
DROP TRIGGER product_variants_pricing_policy_guard ON saas.product_variants;
DROP TRIGGER products_pricing_dynamic_visibility ON saas.products;
DROP TRIGGER product_variants_pricing_dynamic_visibility ON saas.product_variants;
DROP TABLE saas.pricing_dynamic_activation;
DROP FUNCTION saas.pricing_dynamic_activation_lock(),
  saas.pricing_dynamic_visibility_guard();
DROP TABLE saas.pricing_reference_operations,saas.pricing_variant_policy_state,
  saas.pricing_variant_policy_versions,saas.pricing_reference_state,
  saas.pricing_reference_set_values,saas.pricing_reference_sets,
  saas.pricing_reference_definitions;
DROP FUNCTION saas.pricing_variant_price_write_guard(),saas.pricing_reference_immutable_guard();
COMMIT;
