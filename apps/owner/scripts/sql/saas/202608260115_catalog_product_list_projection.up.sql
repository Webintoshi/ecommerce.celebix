BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_list_products_v2(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_status text,
  p_page_size integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  listed_items jsonb;
  listed_count integer;
  featured_images jsonb;
  variant_summaries jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
     OR (p_status IS NOT NULL AND p_status NOT IN ('draft', 'active', 'archived'))
     OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  WITH selected AS MATERIALIZED (
    SELECT product.id, product.created_at
    FROM saas.products AS product
    WHERE product.store_id = p_store_id
      AND (
        (p_status IS NULL AND product.status <> 'archived')
        OR product.status = p_status
      )
      AND (
        p_cursor_created_at IS NULL
        OR (product.created_at, product.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY product.created_at DESC, product.id DESC
    LIMIT p_page_size + 1
  ), page AS MATERIALIZED (
    SELECT selected.id, selected.created_at
    FROM selected
    ORDER BY selected.created_at DESC, selected.id DESC
    LIMIT p_page_size
  ), projected AS (
    SELECT
      page.id,
      page.created_at,
      saas.catalog_product_projection(page.id) AS product,
      (
        SELECT pg_catalog.jsonb_build_object(
          'publicUrl', media.public_url,
          'altText', media.alt_text
        )
        FROM saas.product_media AS media
        WHERE media.store_id = p_store_id
          AND media.product_id = page.id
          AND media.status = 'active'
        ORDER BY media.sort_order, media.id
        LIMIT 1
      ) AS featured_image,
      CASE WHEN selected_variant.id IS NULL THEN NULL ELSE pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'productId', page.id,
          'storeId', selected_variant.store_id,
          'variantId', selected_variant.id,
          'sku', selected_variant.sku,
          'priceCents', selected_variant.price_cents,
          'compareAtCents', selected_variant.compare_at_cents,
          'stockTracking', selected_variant.stock_tracking,
          'stockQuantity', selected_variant.stock_quantity
        )
      ) END AS variant_summary
    FROM page
    LEFT JOIN LATERAL (
      SELECT
        variant.id,
        variant.store_id,
        variant.sku,
        variant.price_cents,
        variant.compare_at_cents,
        variant.stock_tracking,
        variant.stock_quantity
      FROM saas.product_variants AS variant
      WHERE variant.product_id = page.id
        AND variant.store_id = p_store_id
      ORDER BY
        CASE WHEN variant.status = 'active' THEN 0 ELSE 1 END,
        variant.created_at ASC, variant.id ASC
      LIMIT 1
    ) AS selected_variant ON true
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(projected.product ORDER BY projected.created_at DESC, projected.id DESC),
      '[]'::jsonb
    ),
    (SELECT pg_catalog.count(*)::integer FROM selected),
    COALESCE(
      pg_catalog.jsonb_object_agg(
        projected.id::text,
        projected.featured_image
        ORDER BY projected.created_at DESC, projected.id DESC
      ) FILTER (WHERE projected.featured_image IS NOT NULL),
      '{}'::jsonb
    ),
    COALESCE(
      pg_catalog.jsonb_object_agg(
        projected.id::text,
        projected.variant_summary
        ORDER BY projected.created_at DESC, projected.id DESC
      ) FILTER (WHERE projected.variant_summary IS NOT NULL),
      '{}'::jsonb
    )
  INTO listed_items, listed_count, featured_images, variant_summaries
  FROM projected;

  RETURN QUERY SELECT 'listed'::text, pg_catalog.jsonb_build_object(
    'items', listed_items,
    'hasMore', listed_count > p_page_size,
    'featuredImages', featured_images,
    'variantSummaries', variant_summaries
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) TO celebix_saas_app;

COMMIT;
