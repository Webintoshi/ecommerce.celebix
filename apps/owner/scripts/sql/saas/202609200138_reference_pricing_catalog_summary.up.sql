-- A new catalog read version preserves the V3 contract for older panel
-- instances during rollout. V4 adds a separately named selling price; the
-- persisted base price remains available only for editing fixed TRY values.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.catalog_list_products_v4(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_search text,p_status text,p_stock text,p_category_id uuid,p_brand_id uuid,
  p_collection_id uuid,p_sort text,p_page_size integer,
  p_cursor_timestamp timestamptz,p_cursor_title text,p_cursor_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb; v_summaries jsonb;
BEGIN
  SELECT listed.outcome,listed.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_list_products_v3(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_search,
    p_status,p_stock,p_category_id,p_brand_id,p_collection_id,p_sort,
    p_page_size,p_cursor_timestamp,p_cursor_title,p_cursor_id) listed;
  IF v_outcome IS DISTINCT FROM 'listed' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  WITH selected AS MATERIALIZED (
    SELECT item.key AS product_id,item.value AS summary,
      (item.value->>'variantId')::uuid AS variant_id
    FROM pg_catalog.jsonb_each(COALESCE(v_payload->'variantSummaries','{}'::jsonb)) item
  ), priced AS MATERIALIZED (
    SELECT selected.*,effective.outcome AS price_outcome,
      effective.price_cents,COALESCE(policy.method,'fixed_try') AS pricing_method,
      product.status AS product_status
    FROM selected
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,selected.variant_id,'storefront',p_now,NULL::text) effective
    LEFT JOIN saas.pricing_variant_policy_state state
      ON state.store_id=p_store_id AND state.variant_id=selected.variant_id
    LEFT JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
        AND policy.version=state.current_version
    LEFT JOIN saas.products product ON product.store_id=p_store_id
      AND product.id=selected.product_id::uuid
  )
  SELECT COALESCE(pg_catalog.jsonb_object_agg(priced.product_id,
    priced.summary||pg_catalog.jsonb_build_object(
      'effectivePriceCents',CASE WHEN priced.price_outcome='found'
        THEN priced.price_cents
        WHEN priced.product_status='draft' AND priced.pricing_method='fixed_try'
          THEN (priced.summary->>'priceCents')::bigint
        ELSE NULL::bigint END,
      'pricingMethod',priced.pricing_method)),'{}'::jsonb)
  INTO v_summaries FROM priced;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_set(v_payload,'{variantSummaries}',v_summaries);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,
  uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,
  bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,
  timestamptz,text,uuid) TO celebix_saas_app;
COMMIT;
