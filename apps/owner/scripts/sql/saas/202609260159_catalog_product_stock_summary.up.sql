-- Add product-wide active-variant stock summaries without changing legacy reads.
-- Representative variant identity, SKU, barcode, pricing and raw quantity are preserved.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.catalog_checked_product_stock_summary(
  p_tracked_count bigint,p_untracked_count bigint,p_quantity numeric
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER
SET search_path=pg_catalog,saas AS $fn$
BEGIN
  IF p_tracked_count NOT BETWEEN 0 AND 9007199254740991
    OR p_untracked_count NOT BETWEEN 0 AND 9007199254740991
    OR p_quantity NOT BETWEEN 0 AND 9007199254740991
    OR p_quantity<>trunc(p_quantity)
  THEN RAISE numeric_value_out_of_range USING MESSAGE='CATALOG_PRODUCT_STOCK_SUMMARY_OUT_OF_RANGE';END IF;
  RETURN jsonb_build_object('trackedVariantCount',p_tracked_count,
    'untrackedVariantCount',p_untracked_count,'trackedQuantity',p_quantity::bigint);
END $fn$;

CREATE FUNCTION saas.catalog_product_stock_summary(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.catalog_checked_product_stock_summary(
    count(*) FILTER(WHERE variant.stock_tracking),
    count(*) FILTER(WHERE NOT variant.stock_tracking),
    coalesce(sum(variant.stock_quantity::numeric) FILTER(WHERE variant.stock_tracking),0))
  FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id
    AND variant.status='active'
$fn$;

-- Copy the existing authenticated/paginated read under a new private version.
-- Exact anchors fail closed instead of silently changing unknown predecessors.
DO $unpriced_v5$
DECLARE definition text; anchor text;
BEGIN
  definition:=pg_get_functiondef(to_regprocedure('saas.catalog_list_products_unpriced_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid)'));
  IF definition IS NULL THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_V3_PREDECESSOR_MISSING';END IF;
  definition:=replace(definition,'CREATE OR REPLACE FUNCTION saas.catalog_list_products_unpriced_v3(',
    'CREATE OR REPLACE FUNCTION saas.catalog_list_products_unpriced_v5(');
  anchor:=$anchor$      variant.stock_quantity AS variant_stock_quantity$anchor$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_VARIANT_ANCHOR_MISSING';END IF;
  definition:=replace(definition,anchor,anchor||E',\n      stock.product_stock');
  anchor:=$anchor$    ) AS variant ON true$anchor$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_JOIN_ANCHOR_MISSING';END IF;
  definition:=replace(definition,anchor,anchor||$replacement$
    CROSS JOIN LATERAL (
      SELECT saas.catalog_product_stock_summary(p_store_id,product.id) AS product_stock
    ) AS stock$replacement$);
  anchor:=$anchor$        OR (p_stock = 'in-stock' AND variant.stock_tracking AND variant.stock_quantity > 0)
        OR (p_stock = 'out-of-stock' AND variant.stock_tracking AND variant.stock_quantity = 0)
        OR (p_stock = 'untracked' AND NOT variant.stock_tracking)$anchor$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_FILTER_ANCHOR_MISSING';END IF;
  definition:=replace(definition,anchor,$replacement$        OR (p_stock = 'in-stock' AND ((stock.product_stock->>'trackedQuantity')::bigint>0 OR (stock.product_stock->>'untrackedVariantCount')::bigint>0))
        OR (p_stock = 'out-of-stock' AND (stock.product_stock->>'trackedVariantCount')::bigint>0 AND (stock.product_stock->>'untrackedVariantCount')::bigint=0 AND (stock.product_stock->>'trackedQuantity')::bigint=0)
        OR (p_stock = 'untracked' AND (stock.product_stock->>'untrackedVariantCount')::bigint>0)$replacement$);
  anchor:=$anchor$          'stockQuantity', page.variant_stock_quantity$anchor$;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_PROJECTION_ANCHOR_MISSING';END IF;
  definition:=replace(definition,anchor,anchor||E',\n          ''productStock'', page.product_stock');
  IF definition NOT LIKE 'CREATE OR REPLACE FUNCTION saas.catalog_list_products_unpriced_v5(%' THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_NEW_VERSION_MISSING';END IF;
  EXECUTE definition;
END $unpriced_v5$;

CREATE FUNCTION saas.catalog_list_products_v5(
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
  FROM saas.catalog_list_products_unpriced_v5(p_store_id,p_principal_id,p_membership_id,
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


CREATE FUNCTION saas.catalog_get_dashboard_summary_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text;v_payload jsonb;v_out_of_stock bigint;
BEGIN
  SELECT summary.outcome,summary.result_payload INTO v_outcome,v_payload
  FROM saas.catalog_get_dashboard_summary(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now) AS summary;
  IF v_outcome IS DISTINCT FROM 'summarized' THEN
    RETURN QUERY SELECT coalesce(v_outcome,'unavailable'),v_payload;RETURN;
  END IF;
  SELECT count(*) INTO v_out_of_stock
  FROM saas.products AS product
  CROSS JOIN LATERAL (
    SELECT saas.catalog_product_stock_summary(p_store_id,product.id) AS product_stock
  ) AS stock
  WHERE product.store_id=p_store_id AND product.status<>'archived'
    AND (stock.product_stock->>'trackedVariantCount')::bigint>0
    AND (stock.product_stock->>'untrackedVariantCount')::bigint=0
    AND (stock.product_stock->>'trackedQuantity')::bigint=0;
  IF v_out_of_stock>9007199254740991 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'summarized',v_payload||jsonb_build_object('outOfStockProducts',v_out_of_stock);
EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.catalog_checked_product_stock_summary(bigint,bigint,numeric),
  saas.catalog_product_stock_summary(uuid,uuid),
  saas.catalog_list_products_unpriced_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid),
  saas.catalog_list_products_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid),
  saas.catalog_get_dashboard_summary_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)
  FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
    celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.catalog_list_products_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid),
  saas.catalog_get_dashboard_summary_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)
  TO celebix_saas_app;
COMMIT;
