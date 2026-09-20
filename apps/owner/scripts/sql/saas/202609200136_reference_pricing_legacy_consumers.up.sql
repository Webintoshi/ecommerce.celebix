-- Keep existing barcode job snapshots immutable while new jobs use the
-- anonymous storefront selling context, never a cached variant base amount.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION saas.barcode_label_variant_projection(p_store_id uuid,p_variant_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_price record;
  v_projection jsonb;
  v_now timestamptz:=pg_catalog.transaction_timestamp();
  v_policy_version bigint;
  v_policy_method text;
  v_active_set_id uuid;
  v_active_set_version bigint;
  v_draft_fixed_price bigint;
BEGIN
  -- The first row of a print job takes this transaction lock and keeps it
  -- through all following row snapshots. Reference activation uses the same
  -- lock, so one print batch cannot contain mixed reference-set versions.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO v_price FROM saas.resolve_effective_variant_price(
    p_store_id,p_variant_id,'storefront',v_now,NULL::text);
  SELECT state.current_version,definition.method
    INTO v_policy_version,v_policy_method
  FROM saas.pricing_variant_policy_state state
  JOIN saas.pricing_variant_policy_versions definition
    ON definition.store_id=state.store_id
      AND definition.variant_id=state.variant_id
      AND definition.version=state.current_version
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  IF NOT FOUND OR v_price.outcome IS DISTINCT FROM 'found'
    OR v_price.price_cents IS NULL THEN
    SELECT variant.price_cents INTO v_draft_fixed_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
      AND variant.status='active' AND product.status='draft'
      AND COALESCE(v_policy_method,'fixed_try')='fixed_try';
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_price.outcome:='found';
    v_price.price_cents:=v_draft_fixed_price;
    v_price.source_kind:='base';
  END IF;
  IF v_price.source_kind='base' AND v_policy_method IN ('usd','eur','gold_gram') THEN
    SELECT active_set_id,version INTO v_active_set_id,v_active_set_version
    FROM saas.pricing_reference_state WHERE store_id=p_store_id;
  END IF;
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'productId',product.id,'productVersion',product.version,
    'variantId',variant.id,'variantVersion',variant.version,
    'productTitle',product.title,'variantTitle',variant.title,
    'sku',variant.sku,'barcode',variant.barcode,
    'priceCents',v_price.price_cents,
    'priceContext',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'channel','storefront','pricedAt',saas.barcode_label_timestamp(v_now),
      'sourceKind',v_price.source_kind,'priceListId',v_price.price_list_id,
      'policyVersion',v_policy_version,
      'activeSetId',v_active_set_id,'activeSetVersion',v_active_set_version)),
    'compareAtCents',CASE WHEN variant.compare_at_cents>v_price.price_cents
      THEN variant.compare_at_cents ELSE NULL END,
    'currency',product.currency,
    'stock',variant.stock_quantity,'trackInventory',variant.stock_tracking,
    'category',(SELECT pg_catalog.jsonb_build_object('id',category.id,'name',category.name)
      FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category
        ON category.store_id=relation.store_id AND category.id=relation.category_id
          AND category.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id
      ORDER BY relation.position,category.id LIMIT 1),
    'brand',(SELECT pg_catalog.jsonb_build_object('id',resource.id,'name',resource.name)
      FROM saas.catalog_admin_resource_products relation
      JOIN saas.catalog_admin_resources resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id
          AND resource.resource_kind='brand' AND resource.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id
      ORDER BY relation.position,resource.id LIMIT 1),
    'attributes',variant.attributes,'status',product.status,
    'updatedAt',saas.barcode_label_timestamp(
      GREATEST(product.updated_at,variant.updated_at))
  )) INTO v_projection
  FROM saas.product_variants variant JOIN saas.products product
    ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status IN('active','draft');
  RETURN v_projection;
END $fn$;

-- Preserve the proven filter/keyset machinery but replace only its legacy
-- price projection. One set-based statement prices the entire page against
-- one MVCC snapshot; unavailable rows remain visible without a fake 0 TRY.
ALTER FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid)
RENAME TO barcode_label_list_unpriced_v1;
REVOKE ALL ON FUNCTION saas.barcode_label_list_unpriced_v1(uuid,uuid,uuid,uuid,
  text,bigint,timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,
  integer,text,integer,uuid) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.barcode_label_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_query text,p_status text,p_stock_state text,p_category_id uuid,p_brand_id uuid,
  p_product_id uuid,p_has_barcode boolean,p_sort text,p_page_size integer,
  p_anchor_null_rank integer,p_anchor_sort_text text,p_anchor_sort_number integer,
  p_anchor_variant_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_outcome text;
  v_payload jsonb;
  v_items jsonb;
BEGIN
  SELECT listed.outcome,listed.result_payload INTO v_outcome,v_payload
  FROM saas.barcode_label_list_unpriced_v1(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,p_query,p_status,p_stock_state,
    p_category_id,p_brand_id,p_product_id,p_has_barcode,p_sort,p_page_size,
    p_anchor_null_rank,p_anchor_sort_text,p_anchor_sort_number,p_anchor_variant_id) listed;
  IF v_outcome IS DISTINCT FROM 'listed' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  WITH selected AS MATERIALIZED (
    SELECT item.ordinality,item.value,(item.value->>'variantId')::uuid AS variant_id
    FROM pg_catalog.jsonb_array_elements(v_payload->'items')
      WITH ORDINALITY item(value,ordinality)
  ), priced AS MATERIALIZED (
    SELECT selected.*,
      CASE WHEN effective.outcome='found' THEN effective.outcome
        WHEN selected.value->>'status'='draft'
          AND COALESCE(definition.method,'fixed_try')='fixed_try' THEN 'found'
        ELSE effective.outcome END AS outcome,
      CASE WHEN effective.outcome='found' THEN effective.price_cents
        WHEN selected.value->>'status'='draft'
          AND COALESCE(definition.method,'fixed_try')='fixed_try'
          THEN (selected.value->>'priceCents')::bigint
        ELSE effective.price_cents END AS price_cents,
      CASE WHEN effective.outcome='found' THEN effective.source_kind
        WHEN selected.value->>'status'='draft'
          AND COALESCE(definition.method,'fixed_try')='fixed_try' THEN 'base'
        ELSE effective.source_kind END AS source_kind,
      effective.price_list_id,
      policy.current_version AS policy_version,
      definition.method AS policy_method,
      CASE WHEN effective.source_kind='base' AND definition.method IN
        ('usd','eur','gold_gram') THEN state.active_set_id ELSE NULL END AS active_set_id,
      CASE WHEN effective.source_kind='base' AND definition.method IN
        ('usd','eur','gold_gram') THEN state.version ELSE NULL END AS active_set_version
    FROM selected
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,selected.variant_id,'storefront',p_now,NULL::text) effective
    LEFT JOIN saas.pricing_variant_policy_state policy
      ON policy.store_id=p_store_id AND policy.variant_id=selected.variant_id
    LEFT JOIN saas.pricing_variant_policy_versions definition
      ON definition.store_id=policy.store_id
        AND definition.variant_id=policy.variant_id
        AND definition.version=policy.current_version
    LEFT JOIN saas.pricing_reference_state state ON state.store_id=p_store_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(
    (priced.value-'priceCents'-'compareAtCents')||
      CASE WHEN priced.outcome='found' AND priced.price_cents IS NOT NULL
        THEN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'priceCents',priced.price_cents,
          'compareAtCents',CASE WHEN (priced.value->>'compareAtCents')::bigint>
            priced.price_cents THEN (priced.value->>'compareAtCents')::bigint END,
          'priceContext',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'channel','storefront','pricedAt',saas.barcode_label_timestamp(p_now),
            'sourceKind',priced.source_kind,'priceListId',priced.price_list_id,
            'policyVersion',priced.policy_version,
            'activeSetId',priced.active_set_id,
            'activeSetVersion',priced.active_set_version))))
        ELSE pg_catalog.jsonb_build_object('priceCents',NULL,'priceUnavailable',true) END
    ORDER BY priced.ordinality),'[]'::jsonb) INTO v_items FROM priced;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_set(v_payload,'{items}',v_items);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,
  integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,
  integer,uuid) TO celebix_saas_app;

COMMIT;
