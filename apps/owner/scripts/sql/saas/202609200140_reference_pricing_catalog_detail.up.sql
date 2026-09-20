-- V2 detail projection preserves the legacy edit amount while exposing the
-- anonymous storefront amount independently. Older app versions keep V1.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

ALTER FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,uuid,boolean) RENAME TO catalog_get_product_details_unpriced_v1;
REVOKE ALL ON FUNCTION saas.catalog_get_product_details_unpriced_v1(uuid,uuid,
  uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean)
  FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.catalog_get_product_details_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_product_id uuid,p_include_archived_variants boolean
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb; v_variants jsonb;
BEGIN
  SELECT detail.outcome,detail.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_get_product_details_unpriced_v1(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id,
    p_include_archived_variants) detail;
  IF v_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  WITH selected AS MATERIALIZED (
    SELECT item.value AS variant,item.ordinality,
      (item.value->>'id')::uuid AS variant_id
    FROM pg_catalog.jsonb_array_elements(v_payload->'variants')
      WITH ORDINALITY item(value,ordinality)
  ), priced AS MATERIALIZED (
    SELECT selected.*,effective.outcome AS price_outcome,effective.price_cents,
      COALESCE(policy.method,'fixed_try') AS pricing_method
    FROM selected CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,selected.variant_id,'storefront',p_now,NULL::text) effective
    LEFT JOIN saas.pricing_variant_policy_state state
      ON state.store_id=p_store_id AND state.variant_id=selected.variant_id
    LEFT JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
        AND policy.version=state.current_version
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(priced.variant||pg_catalog.jsonb_build_object(
    'effectivePriceCents',CASE WHEN priced.variant->>'status'='active'
      AND priced.price_outcome='found' THEN priced.price_cents
      WHEN priced.variant->>'status'='active'
        AND v_payload->'product'->>'status'='draft'
        AND priced.pricing_method='fixed_try'
        THEN (priced.variant->>'priceCents')::bigint
      ELSE NULL::bigint END)
    ORDER BY priced.ordinality),'[]'::jsonb) INTO v_variants FROM priced;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_set(v_payload,'{variants}',v_variants);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;

CREATE FUNCTION saas.catalog_get_product_details(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_product_id uuid,p_include_archived_variants boolean
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb; v_variants jsonb;
BEGIN
  SELECT detail.outcome,detail.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_get_product_details_v2(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,
    p_now,p_product_id,p_include_archived_variants) detail;
  IF v_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  IF v_payload->'product'->>'status'='active' AND EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_payload->'variants') item(value)
    WHERE item.value->>'status'='active' AND item.value->>'effectivePriceCents' IS NULL) THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    (item.value-'effectivePriceCents'
      - CASE WHEN item.value ? 'compareAtCents' AND item.value->>'status'='active'
          AND v_payload->'product'->>'status'='active'
          AND (item.value->>'compareAtCents')::bigint <= (item.value->>'effectivePriceCents')::bigint
          THEN 'compareAtCents' ELSE '' END)||pg_catalog.jsonb_build_object('priceCents',
      CASE WHEN item.value->>'status'='active' AND v_payload->'product'->>'status'='active'
        THEN (item.value->>'effectivePriceCents')::bigint
        ELSE (item.value->>'priceCents')::bigint END)
    ORDER BY item.ordinality),'[]'::jsonb) INTO v_variants
  FROM pg_catalog.jsonb_array_elements(v_payload->'variants')
    WITH ORDINALITY item(value,ordinality);
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_set(v_payload,'{variants}',v_variants);
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;
REVOKE ALL ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;
COMMIT;
