BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$
DECLARE app_oid oid:='celebix_saas_app'::regrole; host_oid oid:='celebix_saas_host_resolver'::regrole;
BEGIN
 IF pg_catalog.to_regprocedure('saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)') IS NULL THEN RAISE EXCEPTION 'CATEGORY_PUBLIC_LIST_MISSING'; END IF;
 IF NOT saas.merchant_admin_config_valid('category_showcase','{"heading":"Kategoriler","enabled":true,"items":[{"categoryId":"10000000-0000-4000-8000-000000000001","assetId":"20000000-0000-4000-8000-000000000001"}]}'::jsonb) THEN RAISE EXCEPTION 'CATEGORY_CONFIG_REJECTED'; END IF;
 IF saas.merchant_admin_config_valid('category_showcase','{"heading":"Kategoriler","enabled":true,"items":[]}'::jsonb) OR saas.merchant_admin_config_valid('category_showcase','{"heading":"Kategoriler","enabled":true,"items":[{"categoryId":"10000000-0000-4000-8000-000000000001","assetId":"20000000-0000-4000-8000-000000000001"},{"categoryId":"10000000-0000-4000-8000-000000000001","assetId":"20000000-0000-4000-8000-000000000002"}]}'::jsonb) THEN RAISE EXCEPTION 'CATEGORY_CONFIG_TOO_WEAK'; END IF;
 IF NOT saas.merchant_admin_config_valid('theme_setting','{"logoAssetId":"20000000-0000-4000-8000-000000000001"}'::jsonb) THEN RAISE EXCEPTION 'LOGO_CONFIG_REJECTED'; END IF;
 IF NOT pg_catalog.has_function_privilege(app_oid,'saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','EXECUTE') OR NOT pg_catalog.has_function_privilege(app_oid,'saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint)','EXECUTE') THEN RAISE EXCEPTION 'APP_GRANT_MISSING'; END IF;
 IF NOT pg_catalog.has_function_privilege(host_oid,'saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'HOST_GRANT_MISSING'; END IF;
 IF pg_catalog.has_table_privilege(app_oid,'saas.storefront_assets','SELECT') OR pg_catalog.has_table_privilege(host_oid,'saas.catalog_categories','SELECT') THEN RAISE EXCEPTION 'DIRECT_TABLE_GRANT_PRESENT'; END IF;
END
$f$;
COMMIT;
