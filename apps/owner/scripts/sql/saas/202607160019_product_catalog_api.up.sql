BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_get_product_details(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_product_id uuid,
  p_include_archived_variants boolean
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  product_projection jsonb;
  variant_projections jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  IF p_product_id IS NULL OR p_include_archived_variants IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT saas.catalog_product_projection(product.id)
    INTO product_projection
  FROM saas.products AS product
  WHERE product.id = p_product_id
    AND product.store_id = p_store_id
    AND product.status <> 'archived';

  IF product_projection IS NULL THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      saas.catalog_variant_projection(variant.id)
      ORDER BY variant.created_at ASC, variant.id ASC
    ),
    '[]'::jsonb
  )
  INTO variant_projections
  FROM saas.product_variants AS variant
  WHERE variant.product_id = p_product_id
    AND variant.store_id = p_store_id
    AND (p_include_archived_variants OR variant.status = 'active');

  RETURN QUERY SELECT 'found'::text, pg_catalog.jsonb_build_object(
    'product', product_projection,
    'variants', variant_projections
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;

COMMIT;
