-- Preserve archived products already linked to this brand during versioned edits.
-- New archived additions, other brands and other resource kinds remain denied.
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
 IF position('COALESCE(pg_catalog.array_length(p_product_ids,1),0)>(CASE WHEN p_kind=''brand'' THEN 10000 ELSE 100 END)' IN original)=0
 OR (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,'AND (p.status<>''archived'' OR (p_kind=''brand'' AND p_expected_version IS NOT NULL AND EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products retained WHERE retained.store_id=p_store_id AND retained.resource_id=p_resource_id AND retained.product_id=p.id)))','')))/pg_catalog.length('AND (p.status<>''archived'' OR (p_kind=''brand'' AND p_expected_version IS NOT NULL AND EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products retained WHERE retained.store_id=p_store_id AND retained.resource_id=p_resource_id AND retained.product_id=p.id)))')<>1 THEN
  RAISE EXCEPTION 'CATALOG_BRAND_RETAINED_ARCHIVED_PREDECESSOR_INVALID';
 END IF;
 changed:=pg_catalog.replace(original,'AND (p.status<>''archived'' OR (p_kind=''brand'' AND p_expected_version IS NOT NULL AND EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products retained WHERE retained.store_id=p_store_id AND retained.resource_id=p_resource_id AND retained.product_id=p.id)))','AND p.status<>''archived''');
 EXECUTE changed;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND (proowner<>original_owner OR proacl IS DISTINCT FROM original_acl OR NOT prosecdef)) THEN
  RAISE EXCEPTION 'CATALOG_BRAND_RETAINED_ARCHIVED_AUTHORITY_CHANGED';
 END IF;
END
$migration$;
COMMIT;
