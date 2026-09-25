-- Keep manual product order local to the requested category or subcategory.
-- Unranked products retain the previous availability/newest fallback order.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid='saas.catalog_product_categories'::regclass
      AND attribute.attname='storefront_position' AND NOT attribute.attisdropped
  ) THEN RAISE EXCEPTION 'CATEGORY_PRODUCT_ORDER_SCHEMA_MISSING'; END IF;
END $check$;

CREATE OR REPLACE FUNCTION saas.public_list_products_by_category(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text,p_limit integer
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_category saas.catalog_categories%ROWTYPE; items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_slug IS NULL
    OR p_slug<>pg_catalog.lower(p_slug) OR pg_catalog.char_length(p_slug) NOT BETWEEN 1 AND 100
    OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT category.* INTO selected_category
  FROM saas.catalog_categories category
  WHERE category.store_id=p_store_id AND category.slug=p_slug AND category.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  WITH projected AS MATERIALIZED (
    SELECT product.id,product.created_at,relation.storefront_position,
      saas.public_category_product_projection(p_store_id,product.id,p_now) payload
    FROM saas.catalog_product_categories relation
    JOIN saas.products product ON product.store_id=relation.store_id
      AND product.id=relation.product_id AND product.status='active'
    WHERE relation.store_id=p_store_id AND relation.category_id=selected_category.id
  ), selected AS (
    SELECT projected.id,projected.created_at,projected.storefront_position,
      (projected.payload->>'available')::boolean available,projected.payload
    FROM projected WHERE projected.payload IS NOT NULL
    ORDER BY projected.storefront_position ASC NULLS LAST,
      (projected.payload->>'available')::boolean DESC,projected.created_at DESC,projected.id DESC
    LIMIT p_limit
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(selected.payload ORDER BY
    selected.storefront_position ASC NULLS LAST,selected.available DESC,
    selected.created_at DESC,selected.id DESC),'[]'::jsonb) INTO items
  FROM selected;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'category',pg_catalog.jsonb_build_object('id',selected_category.id,'name',selected_category.name,'slug',selected_category.slug),
    'items',items);
END $f$;

CREATE OR REPLACE FUNCTION saas.public_catalog_query_v2(
  p_hostname text,p_now timestamptz,p_category_slug text,p_query text,
  p_filter text,p_order text,p_limit integer,p_offset integer
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_category uuid; items jsonb; total_count bigint; page_count bigint;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR (p_category_slug IS NOT NULL AND (
      p_category_slug<>pg_catalog.lower(p_category_slug)
      OR pg_catalog.char_length(p_category_slug) NOT BETWEEN 1 AND 100
      OR p_category_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'))
    OR p_query IS NULL OR p_query<>pg_catalog.btrim(p_query)
    OR pg_catalog.octet_length(p_query)>100 OR p_query~'[[:cntrl:]]'
    OR p_filter IS NULL OR p_filter NOT IN ('all','available','discounted')
    OR p_order IS NULL OR p_order NOT IN ('featured','title-asc','price-asc','price-desc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF p_category_slug IS NOT NULL THEN
    SELECT category.id INTO selected_category FROM saas.catalog_categories category
    WHERE category.store_id=selected_store AND category.slug=p_category_slug AND category.status='active';
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT product.id,product.created_at,product.title,
      CASE WHEN selected_category IS NOT NULL THEN (SELECT assignment.storefront_position
       FROM saas.catalog_product_categories assignment
       WHERE assignment.store_id=selected_store AND assignment.category_id=selected_category
         AND assignment.product_id=product.id) END storefront_position,
      saas.public_effective_product_projection(selected_store,product.id,p_now) payload
    FROM saas.products product
    WHERE product.store_id=selected_store AND product.status='active'
      AND (selected_category IS NULL OR EXISTS (
        SELECT 1 FROM saas.catalog_product_categories assignment
        WHERE assignment.store_id=selected_store AND assignment.product_id=product.id
          AND assignment.category_id=selected_category))
      AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0)
  ), eligible AS MATERIALIZED (
    SELECT candidate.id,candidate.created_at,candidate.title,candidate.storefront_position,candidate.payload,
      (candidate.payload->>'available')::boolean available,
      (candidate.payload->>'priceCents')::bigint price_cents
    FROM candidates candidate WHERE candidate.payload IS NOT NULL
      AND (p_filter='all'
        OR (p_filter='available' AND (candidate.payload->>'available')::boolean)
        OR (p_filter='discounted' AND candidate.payload ? 'compareAtCents'
          AND (candidate.payload->>'compareAtCents')::bigint>(candidate.payload->>'priceCents')::bigint))
  ), page AS (
    SELECT eligible.* FROM eligible
    ORDER BY CASE WHEN p_order='featured' AND selected_category IS NOT NULL
        THEN eligible.storefront_position END ASC NULLS LAST,
      CASE WHEN p_order='featured' THEN eligible.available END DESC,
      CASE WHEN p_order='featured' THEN eligible.created_at END DESC,
      CASE WHEN p_order='title-asc' THEN pg_catalog.lower(eligible.title) END ASC,
      CASE WHEN p_order='price-asc' THEN eligible.price_cents END ASC,
      CASE WHEN p_order='price-desc' THEN eligible.price_cents END DESC,
      CASE WHEN p_order='featured' THEN eligible.id END DESC,
      eligible.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE((SELECT pg_catalog.jsonb_agg(page.payload ORDER BY
    CASE WHEN p_order='featured' AND selected_category IS NOT NULL
      THEN page.storefront_position END ASC NULLS LAST,
    CASE WHEN p_order='featured' THEN page.available END DESC,
    CASE WHEN p_order='featured' THEN page.created_at END DESC,
    CASE WHEN p_order='title-asc' THEN pg_catalog.lower(page.title) END ASC,
    CASE WHEN p_order='price-asc' THEN page.price_cents END ASC,
    CASE WHEN p_order='price-desc' THEN page.price_cents END DESC,
    CASE WHEN p_order='featured' THEN page.id END DESC,page.id ASC) FROM page),'[]'::jsonb),
    (SELECT pg_catalog.count(*) FROM eligible),(SELECT pg_catalog.count(*) FROM page)
  INTO items,total_count,page_count;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'items',items,'total',total_count,
    'nextOffset',CASE WHEN p_offset+page_count<total_count AND p_offset+page_count<=10000
      THEN p_offset+page_count ELSE NULL::bigint END);
END $fn$;

REVOKE ALL ON FUNCTION
  saas.public_list_products_by_category(uuid,text,timestamptz,text,integer),
  saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_list_products_by_category(uuid,text,timestamptz,text,integer),
  saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)
TO celebix_saas_host_resolver;

COMMIT;
