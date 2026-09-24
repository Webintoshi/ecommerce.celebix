BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
BEGIN
  IF NOT saas.merchant_admin_config_valid('general_setting','{"storeDisplayName":"Mağaza","skuPrefix":"RSA"}'::jsonb)
    OR saas.merchant_admin_config_valid('general_setting','{"skuPrefix":"rsa"}'::jsonb)
    OR saas.merchant_admin_config_valid('general_setting','{"skuPrefix":"RSA-"}'::jsonb)
    OR NOT saas.merchant_admin_config_valid('general_setting','{"storeDisplayName":"Mağaza"}'::jsonb)
  THEN RAISE EXCEPTION 'SKU_PREFIX_VALIDATION_FAILED'; END IF;
  IF pg_catalog.to_regprocedure('saas.catalog_get_onboarding_options_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)') IS NULL
    OR pg_catalog.to_regprocedure('saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)') IS NULL
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_get_onboarding_options_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'SKU_OPTIONS_AUTHORITY_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='saas' AND indexname='product_variants_store_sku_key')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.product_variants'::regclass AND tgname='product_variants_sku_owner_guard')
  THEN RAISE EXCEPTION 'SKU_OWNER_GUARD_MISSING'; END IF;
END
$assertions$;

COMMIT;
