BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_list_variant_choices(
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
  choice_count bigint;
  choice_items jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)
    INTO choice_count
  FROM saas.products AS product
  JOIN saas.product_variants AS variant
    ON variant.store_id = product.store_id
   AND variant.product_id = product.id
  WHERE product.store_id = p_store_id
    AND product.status = 'active'
    AND variant.status = 'active';

  IF choice_count > 5000 THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'productId', product.id,
        'productTitle', product.title,
        'variantId', variant.id,
        'variantTitle', variant.title,
        'sku', variant.sku
      ))
      ORDER BY pg_catalog.lower(product.title), product.id, variant.created_at, variant.id
    ),
    '[]'::jsonb
  )
    INTO choice_items
  FROM saas.products AS product
  JOIN saas.product_variants AS variant
    ON variant.store_id = product.store_id
   AND variant.product_id = product.id
  WHERE product.store_id = p_store_id
    AND product.status = 'active'
    AND variant.status = 'active';

  RETURN QUERY SELECT 'listed'::text, pg_catalog.jsonb_build_object('items', choice_items);
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;

COMMIT;
