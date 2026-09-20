-- Preserve the legacy preview contract for older app instances; the new
-- preview uses the same anonymous storefront resolver as public catalog.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

ALTER FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,uuid) RENAME TO catalog_get_product_preview_unpriced_v1;
REVOKE ALL ON FUNCTION saas.catalog_get_product_preview_unpriced_v1(uuid,uuid,
  uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.catalog_get_product_preview_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_product_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb; v_variants jsonb;
BEGIN
  SELECT preview.outcome,preview.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_get_product_preview_unpriced_v1(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id) preview;
  IF v_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'title',variant.title,
      'compareAtCents',CASE WHEN display.price_cents IS NOT NULL
        AND variant.compare_at_cents>display.price_cents
        THEN variant.compare_at_cents ELSE NULL::bigint END,
      'stockTracking',variant.stock_tracking,'stockQuantity',variant.stock_quantity,
      'attributes',variant.attributes))||pg_catalog.jsonb_build_object(
        'priceCents',display.price_cents)
    ORDER BY variant.created_at,variant.id),'[]'::jsonb)
  INTO v_variants
  FROM saas.product_variants variant
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    p_store_id,variant.id,'storefront',p_now,NULL::text) effective
  LEFT JOIN saas.pricing_variant_policy_state state
    ON state.store_id=p_store_id AND state.variant_id=variant.id
  LEFT JOIN saas.pricing_variant_policy_versions policy
    ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
  CROSS JOIN LATERAL (SELECT CASE WHEN effective.outcome='found'
    THEN effective.price_cents
    WHEN v_payload->'product'->>'status'='draft'
      AND COALESCE(policy.method,'fixed_try')='fixed_try'
      THEN variant.price_cents
    ELSE NULL::bigint END AS price_cents) display
  WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id
    AND variant.status='active';
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_set(v_payload,'{variants}',v_variants);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.catalog_get_product_preview_v2(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_preview_v2(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;

CREATE FUNCTION saas.catalog_get_product_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_product_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb;
BEGIN
  SELECT preview.outcome,preview.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_get_product_preview_v2(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,
    p_now,p_product_id) preview;
  IF v_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'variants') item(value)
    WHERE item.value->>'priceCents' IS NULL) THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',v_payload;
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;
REVOKE ALL ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
