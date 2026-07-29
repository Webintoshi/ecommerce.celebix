BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_get_dashboard_summary(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  total_products bigint;
  active_products bigint;
  draft_products bigint;
  active_variants bigint;
  out_of_stock_variants bigint;
  products_without_media bigint;
  active_media bigint;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id,
    p_principal_id,
    p_membership_id,
    p_plan_id,
    p_plan_code,
    p_plan_version,
    p_products_limit,
    p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  SELECT
    product_counts.total_products,
    product_counts.active_products,
    product_counts.draft_products,
    variant_counts.active_variants,
    variant_counts.out_of_stock_variants,
    media_counts.products_without_media,
    media_counts.active_media
  INTO
    total_products,
    active_products,
    draft_products,
    active_variants,
    out_of_stock_variants,
    products_without_media,
    active_media
  FROM (
    SELECT
      pg_catalog.count(*) FILTER (WHERE product.status <> 'archived') AS total_products,
      pg_catalog.count(*) FILTER (WHERE product.status = 'active') AS active_products,
      pg_catalog.count(*) FILTER (WHERE product.status = 'draft') AS draft_products
    FROM saas.products AS product
    WHERE product.store_id = p_store_id
  ) AS product_counts
  CROSS JOIN (
    SELECT
      pg_catalog.count(*) AS active_variants,
      pg_catalog.count(*) FILTER (
        WHERE variant.stock_tracking AND variant.stock_quantity <= 0
      ) AS out_of_stock_variants
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id = variant.store_id
     AND product.id = variant.product_id
    WHERE variant.store_id = p_store_id
      AND variant.status = 'active'
      AND product.status <> 'archived'
  ) AS variant_counts
  CROSS JOIN (
    SELECT
      (
        SELECT pg_catalog.count(*)
        FROM saas.products AS product
        WHERE product.store_id = p_store_id
          AND product.status <> 'archived'
          AND NOT EXISTS (
            SELECT 1
            FROM saas.product_media AS media
            WHERE media.store_id = p_store_id
              AND media.product_id = product.id
              AND media.status = 'active'
          )
      ) AS products_without_media,
      (
        SELECT pg_catalog.count(*)
        FROM saas.product_media AS media
        JOIN saas.products AS product
          ON product.store_id = media.store_id
         AND product.id = media.product_id
        WHERE media.store_id = p_store_id
          AND media.status = 'active'
          AND product.status <> 'archived'
      ) AS active_media
  ) AS media_counts;

  RETURN QUERY SELECT 'summarized'::text, pg_catalog.jsonb_build_object(
    'totalProducts', total_products,
    'activeProducts', active_products,
    'draftProducts', draft_products,
    'productLimit', p_products_limit,
    'activeVariants', active_variants,
    'outOfStockVariants', out_of_stock_variants,
    'productsWithoutMedia', products_without_media,
    'activeMedia', active_media
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;

COMMIT;
