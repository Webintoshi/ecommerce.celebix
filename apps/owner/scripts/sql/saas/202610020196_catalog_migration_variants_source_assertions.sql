BEGIN;
DO $assert$
DECLARE protected record; definition text;
BEGIN
 SELECT relrowsecurity,relforcerowsecurity INTO STRICT protected FROM pg_class WHERE oid='saas.catalog_product_import_sources'::regclass;
 IF NOT protected.relrowsecurity OR NOT protected.relforcerowsecurity THEN RAISE EXCEPTION 'MIGRATION196_SOURCE_RLS_REQUIRED'; END IF;
 IF has_table_privilege('celebix_saas_app','saas.catalog_product_import_sources','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'MIGRATION196_DIRECT_SOURCE_ACCESS'; END IF;
 IF NOT has_function_privilege('celebix_saas_app','saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'MIGRATION196_BATCH_EXECUTE_REQUIRED'; END IF;
 IF has_function_privilege('celebix_saas_app','saas.catalog_migration_extended_variant_valid(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'MIGRATION196_HELPER_PRIVATE_REQUIRED'; END IF;
 definition:=pg_get_functiondef('saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,text,text,uuid,text)'::regprocedure);
 IF strpos(definition,'-- migration196-order-start')=0 OR strpos(definition,'p_now:=greatest(p_now,job.updated_at)')=0 THEN RAISE EXCEPTION 'MIGRATION196_ORDER_CLOCK_PATCH_REQUIRED'; END IF;
 IF saas.catalog_migration_extended_variant_valid('{"variantId":"31000000-0000-4000-8000-000000000001","title":"A","priceCents":100,"stockQuantity":-1,"attributes":{}}'::jsonb) THEN RAISE EXCEPTION 'MIGRATION196_NEGATIVE_STOCK'; END IF;
 IF saas.catalog_migration_extended_variant_valid('{"variantId":"31000000-0000-4000-8000-000000000001","title":"A","priceCents":100,"stockQuantity":1,"attributes":{"KDV oranı":"0.18"}}'::jsonb) THEN RAISE EXCEPTION 'MIGRATION196_NATIVE_ATTRIBUTE_KEYS'; END IF;
 IF NOT saas.catalog_migration_extended_variant_valid('{"variantId":"31000000-0000-4000-8000-000000000001","title":"A","priceCents":100,"stockQuantity":1,"attributes":{"maden":"14 Ayar Altın"},"measurements":{"weight":{"valueMilli":14890,"unit":"g"}}}'::jsonb) THEN RAISE EXCEPTION 'MIGRATION196_GRAM_PRECISION'; END IF;
END $assert$;
ROLLBACK;
