BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE signature regprocedure := 'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure; definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef(signature);
 IF position('AND (p.status<>''archived'' OR (p_kind=''brand'' AND p_expected_version IS NOT NULL AND EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products retained WHERE retained.store_id=p_store_id AND retained.resource_id=p_resource_id AND retained.product_id=p.id)))' IN definition)=0 THEN RAISE EXCEPTION 'CATALOG_BRAND_RETAINED_ARCHIVED_INVALID'; END IF;
 IF NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND prosecdef AND proowner='celebix_saas_owner'::regrole AND proconfig=ARRAY['search_path=pg_catalog, saas'])
 THEN RAISE EXCEPTION 'CATALOG_BRAND_RETAINED_ARCHIVED_AUTHORITY_INVALID'; END IF;
END
$assertions$;
COMMIT;
