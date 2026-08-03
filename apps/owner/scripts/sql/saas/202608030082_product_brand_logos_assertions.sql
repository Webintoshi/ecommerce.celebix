BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $product_brand_logos_assertions$
DECLARE invalid boolean;
BEGIN
  SELECT
    pg_catalog.to_regprocedure('saas.public_product_brand_logo(uuid,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_campaign_product_projection(uuid,uuid,timestamp with time zone)') IS NULL
    OR pg_catalog.has_function_privilege('public','saas.public_product_brand_logo(uuid,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.public_product_brand_logo(uuid,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_product_brand_logo(uuid,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('public','saas.public_campaign_product_projection(uuid,uuid,timestamptz)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_campaign_product_projection(uuid,uuid,timestamptz)','EXECUTE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_assets','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.catalog_admin_resources','SELECT')
    OR saas.public_product_brand_logo('00000000-0000-4000-8000-000000000001','{}'::jsonb) IS NOT NULL
    OR saas.public_product_brand_logo('00000000-0000-4000-8000-000000000001','{"logoAssetId":"not-a-uuid"}'::jsonb) IS NOT NULL
  INTO invalid;
  IF invalid THEN RAISE EXCEPTION 'product_brand_logos_contract_invalid'; END IF;
END
$product_brand_logos_assertions$;

COMMIT;

