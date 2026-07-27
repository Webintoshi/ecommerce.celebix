BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$
DECLARE signature text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname='catalog_import_previews' AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_RLS_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.catalog_import_previews'::regclass AND tgname='catalog_import_previews_immutable' AND tgenabled='O') THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_IMMUTABILITY_MISSING'; END IF;
 IF pg_catalog.has_table_privilege('celebix_saas_app','saas.catalog_import_previews','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_DIRECT_ACCESS'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'saas.catalog_admin_prepare_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,text,text,jsonb)',
  'saas.catalog_admin_get_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
  'saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)',
  'saas.catalog_admin_recover_import_preview_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',
  'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'
 ] LOOP
  IF pg_catalog.to_regprocedure(signature) IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
     OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE p.oid=signature::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_API_ACL:%',signature; END IF;
 END LOOP;
 IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'::regprocedure),'saas.catalog.store:')=0 THEN RAISE EXCEPTION 'CATALOG_IMPORT_LEGACY_STORE_LOCK_MISSING'; END IF;
END $f$;
ROLLBACK;
