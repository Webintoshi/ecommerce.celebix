-- Change only the durable brand relation bound; preserve all authority and mutation logic.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE
 signature regprocedure := 'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure;
 original text;
 changed text;
 original_owner oid;
 original_acl aclitem[];
BEGIN
 SELECT pg_catalog.pg_get_functiondef(oid),proowner,proacl
 INTO original,original_owner,original_acl FROM pg_catalog.pg_proc WHERE oid=signature;
 IF (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,'COALESCE(pg_catalog.array_length(p_product_ids,1),0)>(CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END)','')))/pg_catalog.length('COALESCE(pg_catalog.array_length(p_product_ids,1),0)>(CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END)')<>1 THEN
  RAISE EXCEPTION 'CATALOG_BRAND_PRODUCT_LIMIT_PREDECESSOR_INVALID';
 END IF;
 changed:=pg_catalog.replace(original,'COALESCE(pg_catalog.array_length(p_product_ids,1),0)>(CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END)','COALESCE(pg_catalog.array_length(p_product_ids,1),0)>100');
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN
  RAISE EXCEPTION 'CATALOG_BRAND_PRODUCT_LIMIT_AUTHORITY_CHANGED';
 END IF;
END
$migration$;
COMMIT;
