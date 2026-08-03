BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $product_brand_logos_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_assets') IS NULL
     OR pg_catalog.to_regclass('saas.catalog_admin_resources') IS NULL
     OR pg_catalog.to_regclass('saas.catalog_admin_resource_products') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_campaign_product_projection(uuid,uuid,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_BRAND_LOGOS_PRECONDITION_FAILED';
  END IF;
END
$product_brand_logos_precondition$;

CREATE FUNCTION saas.public_product_brand_logo(p_store_id uuid,p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(p_config)='object'
      AND p_config->>'logoAssetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (
      SELECT pg_catalog.jsonb_build_object(
        'url',asset.public_url,
        'mediaType',asset.media_type,
        'altText',asset.alt_text,
        'width',asset.width,
        'height',asset.height
      )
      FROM saas.storefront_assets asset
      WHERE asset.store_id=p_store_id
        AND asset.id=(p_config->>'logoAssetId')::uuid
        AND asset.asset_kind='logo'
        AND asset.status='active'
    )
  END
$f$;

CREATE OR REPLACE FUNCTION saas.public_campaign_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $f$
 SELECT (
   WITH RECURSIVE resolved_variants AS (
     SELECT variant.*,resolved.price_cents AS effective_price FROM saas.product_variants variant
     CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,variant.id,'storefront',p_now,NULL) resolved
     WHERE variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active' AND resolved.outcome='found'
   ), selected_price AS (SELECT * FROM resolved_variants ORDER BY effective_price,created_at,id LIMIT 1),
   variants AS (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',variant.id,'title',variant.title,'sku',variant.sku,'priceCents',variant.effective_price,'compareAtCents',variant.compare_at_cents,'stockTracking',variant.stock_tracking,'stockQuantity',variant.stock_quantity,'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),'attributes',variant.attributes)) ORDER BY variant.created_at,variant.id) payload FROM resolved_variants variant),
   media AS (SELECT COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb) payload FROM saas.product_media media WHERE media.store_id=p_store_id AND media.product_id=product.id AND media.status='active'),
   selected_category AS (SELECT category.id,category.parent_id,category.name,category.slug,category.depth FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active' WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,category.depth DESC,category.id LIMIT 1),
   category_ancestors(id,parent_id,name,slug,depth) AS (SELECT id,parent_id,name,slug,depth FROM selected_category UNION ALL SELECT parent.id,parent.parent_id,parent.name,parent.slug,parent.depth FROM saas.catalog_categories parent JOIN category_ancestors child ON child.parent_id=parent.id WHERE parent.store_id=p_store_id AND parent.status='active'),
   category_path AS (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',name,'slug',slug) ORDER BY depth),'[]'::jsonb) payload FROM category_ancestors),
   brand AS (SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('name',resource.name,'slug',resource.slug,'logo',saas.public_product_brand_logo(resource.store_id,resource.config))) payload FROM saas.catalog_admin_resource_products relation JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active' WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,resource.id LIMIT 1)
   SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',product.id,'slug',product.slug,'title',product.title,'description',product.description,'brand',(SELECT payload FROM brand),'categoryPath',category_path.payload,'currency',product.currency,'status','active','priceCents',selected_price.effective_price,'compareAtCents',selected_price.compare_at_cents,'available',EXISTS(SELECT 1 FROM resolved_variants available WHERE NOT available.stock_tracking OR available.stock_quantity>0),'variants',variants.payload,'media',media.payload))
   FROM selected_price CROSS JOIN variants CROSS JOIN media CROSS JOIN category_path
 ) FROM saas.products product WHERE product.store_id=p_store_id AND product.id=p_product_id AND product.status='active'
$f$;

ALTER FUNCTION saas.public_product_brand_logo(uuid,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_campaign_product_projection(uuid,uuid,timestamptz) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.public_product_brand_logo(uuid,jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.public_campaign_product_projection(uuid,uuid,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;

