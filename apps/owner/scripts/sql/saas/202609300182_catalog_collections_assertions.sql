BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$
DECLARE signature text;role_name text;private_name text;row record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.catalog_collections_182_backup'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'COLLECTION_BACKUP_RLS_MISSING';END IF;
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup WHERE identity NOT LIKE 'constraint:%' LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'COLLECTION_AUTHORITY_CHANGED:%',row.identity;END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
 'saas.catalog_admin_list_collections(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb)',
 'saas.catalog_admin_get_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)',
 'saas.catalog_admin_collection_members(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,jsonb)',
 'saas.catalog_admin_restore_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)'] LOOP
  IF NOT has_function_privilege('celebix_saas_app',signature,'EXECUTE') THEN RAISE EXCEPTION 'COLLECTION_APP_GRANT_MISSING';END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_host_resolver','celebix_saas_workflow','celebix_saas_identity','celebix_saas_migrator','celebix_saas_bootstrap','celebix_saas_observability'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'COLLECTION_AMBIENT_GRANT_INVALID:%',role_name;END IF;
  END LOOP;
 END LOOP;
 signature:='saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer)';
 IF NOT has_function_privilege('celebix_saas_host_resolver',signature,'EXECUTE') THEN RAISE EXCEPTION 'COLLECTION_PUBLIC_GRANT_MISSING';END IF;
 IF has_function_privilege('celebix_saas_app',signature,'EXECUTE') OR has_function_privilege('public',signature,'EXECUTE') THEN RAISE EXCEPTION 'COLLECTION_PUBLIC_GRANT_INVALID';END IF;
 FOREACH signature IN ARRAY ARRAY['saas.catalog_collection_config_normalized(jsonb)','saas.catalog_collection_config_valid(uuid,jsonb)','saas.catalog_collection_rule_matches_product(uuid,jsonb,uuid)','saas.catalog_collection_config_matches_product(uuid,jsonb,uuid)','saas.catalog_collection_matches_product(uuid,uuid,uuid)','saas.catalog_collection_matching_product_ids(uuid,jsonb,uuid)','saas.catalog_collection_projection(uuid,uuid,boolean)'] LOOP
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow','celebix_saas_identity','celebix_saas_migrator','celebix_saas_bootstrap','celebix_saas_observability'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'COLLECTION_PRIVATE_GRANT_INVALID:%:%',signature,role_name;END IF;
  END LOOP;
 END LOOP;
 IF position('saas.catalog_collection_matches_product' IN pg_get_functiondef('saas.promotion_catalog_reference_matches_variant_v1(uuid,jsonb,uuid,uuid)'::regprocedure))=0 THEN RAISE EXCEPTION 'COLLECTION_PROMOTION_HELPER_MISSING';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='saas.catalog_collection_matches_product(uuid,uuid,uuid)'::regprocedure AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, saas'] AND proowner=(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner')) THEN RAISE EXCEPTION 'COLLECTION_MEMBERSHIP_AUTHORITY_INVALID';END IF;
END $assert$;
COMMIT;
