BEGIN;
DO $assert$
DECLARE row record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.catalog_size_guides_203_backup'::regclass AND relrowsecurity AND relforcerowsecurity)
  OR has_table_privilege('celebix_saas_app','saas.catalog_size_guides_203_backup','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('celebix_saas_app','saas.catalog_admin_resources','INSERT,UPDATE,DELETE')
  OR has_function_privilege('celebix_saas_app','saas.catalog_size_guide_config_valid(jsonb)','EXECUTE')
  OR NOT has_function_privilege('celebix_saas_app','saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])','EXECUTE')
 THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_PRIVILEGE_INVALID';END IF;
 FOR row IN SELECT * FROM saas.catalog_size_guides_203_backup WHERE identity NOT LIKE 'constraint:%' LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_AUTHORITY_INVALID';END IF;
 END LOOP;
 IF position('category_guide_conflict' IN pg_get_functiondef('saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure))=0
  OR position('category_paths AS' IN pg_get_functiondef('saas.public_starter_product_merchandising(uuid,uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_IMPLEMENTATION_INVALID';END IF;
END $assert$;
ROLLBACK;
