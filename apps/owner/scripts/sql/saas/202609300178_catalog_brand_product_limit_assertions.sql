BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE signature regprocedure := 'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure; definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef(signature);
 IF position('COALESCE(pg_catalog.array_length(p_product_ids,1),0)>(CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END)' IN definition)=0 THEN RAISE EXCEPTION 'CATALOG_BRAND_PRODUCT_LIMIT_INVALID'; END IF;
 IF NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND prosecdef AND proowner='celebix_saas_owner'::regrole AND proconfig=ARRAY['search_path=pg_catalog, saas'])
 THEN RAISE EXCEPTION 'CATALOG_BRAND_PRODUCT_LIMIT_AUTHORITY_INVALID'; END IF;
END
$assertions$;
COMMIT;
