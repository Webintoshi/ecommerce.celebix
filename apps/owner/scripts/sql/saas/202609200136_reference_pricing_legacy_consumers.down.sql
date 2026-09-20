-- Only a clean, pre-activation rehearsal may restore cached barcode prices.
-- Once any dynamic policy exists, use a forward fix rather than this rollback.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
        AND policy.version=state.current_version
    WHERE policy.method<>'fixed_try')
    OR EXISTS (SELECT 1 FROM saas.barcode_print_job_items item
      WHERE item.snapshot ? 'priceContext') THEN
    RAISE EXCEPTION 'REFERENCE_LABEL_ROLLBACK_UNSAFE';
  END IF;
END $guard$;

REVOKE ALL ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,
  integer,uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,integer,uuid);
ALTER FUNCTION saas.barcode_label_list_unpriced_v1(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,
  integer,uuid) RENAME TO barcode_label_list;
GRANT EXECUTE ON FUNCTION saas.barcode_label_list(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,text,text,text,uuid,uuid,uuid,boolean,text,integer,integer,text,
  integer,uuid) TO celebix_saas_app;

CREATE OR REPLACE FUNCTION saas.barcode_label_variant_projection(p_store_id uuid,p_variant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'productId',product.id,'productVersion',product.version,'variantId',variant.id,'variantVersion',variant.version,
    'productTitle',product.title,'variantTitle',variant.title,'sku',variant.sku,'barcode',variant.barcode,
    'priceCents',variant.price_cents,'compareAtCents',variant.compare_at_cents,'currency',product.currency,
    'stock',variant.stock_quantity,'trackInventory',variant.stock_tracking,
    'category',(SELECT jsonb_build_object('id',category.id,'name',category.name)
      FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category
        ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,category.id LIMIT 1),
    'brand',(SELECT jsonb_build_object('id',resource.id,'name',resource.name)
      FROM saas.catalog_admin_resource_products relation JOIN saas.catalog_admin_resources resource
        ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,resource.id LIMIT 1),
    'attributes',variant.attributes,'status',product.status,'updatedAt',saas.barcode_label_timestamp(GREATEST(product.updated_at,variant.updated_at))
  ))
  FROM saas.product_variants variant JOIN saas.products product
    ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id AND variant.status='active' AND product.status IN('active','draft')
$fn$;
COMMIT;
