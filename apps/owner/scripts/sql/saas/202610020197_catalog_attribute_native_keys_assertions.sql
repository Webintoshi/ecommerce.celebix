BEGIN;
DO $assert$
DECLARE signature regprocedure; definition text; helper regprocedure;
BEGIN
 FOREACH helper IN ARRAY ARRAY['saas.catalog_attribute_native_key(jsonb,text)'::regprocedure,'saas.catalog_migration_link_native_attributes(uuid,uuid,jsonb,timestamptz)'::regprocedure] LOOP
  IF has_function_privilege('celebix_saas_app',helper,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=helper AND (proowner<>'celebix_saas_owner'::regrole OR prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas'])) THEN RAISE EXCEPTION 'MIGRATION197_HELPER_AUTHORITY'; END IF;
 END LOOP;
 IF saas.catalog_attribute_native_key('{"key":"yuzuk_olcusu","values":["12"]}'::jsonb,'yuzuk-olcusu') IS DISTINCT FROM 'yuzuk_olcusu'
  OR saas.catalog_attribute_native_key('{"values":["S"]}'::jsonb,'beden') IS DISTINCT FROM 'beden'
  OR saas.catalog_attribute_native_key('{"key":null}'::jsonb,'beden') IS NOT NULL
  OR saas.catalog_attribute_native_key('{"key":"Yüzük Ölçüsü"}'::jsonb,'yuzuk-olcusu') IS NOT NULL
 THEN RAISE EXCEPTION 'MIGRATION197_NATIVE_KEY_SEMANTICS'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure,
  'saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure,
  'saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb)'::regprocedure
 ] LOOP
  IF NOT has_function_privilege('celebix_saas_app',signature,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND (proowner<>'celebix_saas_owner'::regrole OR NOT prosecdef)) THEN RAISE EXCEPTION 'MIGRATION197_API_AUTHORITY'; END IF;
 END LOOP;
 definition:=pg_get_functiondef('saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure);
 IF strpos(definition,'saas.catalog_attribute_native_key(resource.config,resource.slug)=selected.key')=0 OR strpos(definition,'saas.catalog_attribute_native_key(resource.config,resource.slug)=attribute_record.key')=0 THEN RAISE EXCEPTION 'MIGRATION197_VARIANT_KEY_REQUIRED'; END IF;
 definition:=pg_get_functiondef('saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])'::regprocedure);
 IF strpos(definition,'p_kind IN(''brand'',''collection'',''attribute'')')=0 OR strpos(definition,'WHEN p_kind=''collection'' AND p_config->>''mode''=''automatic'' THEN 100000')=0 THEN RAISE EXCEPTION 'MIGRATION197_RESOURCE_BOUND_REQUIRED'; END IF;
 definition:=pg_get_functiondef('saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb)'::regprocedure);
 IF strpos(definition,'-- migration197-native-attributes-start')=0 OR strpos(definition,'IF prior_outcome IS DISTINCT FROM ''batch_imported'' THEN')=0 THEN RAISE EXCEPTION 'MIGRATION197_IMPORT_REPLAY_REQUIRED'; END IF;
END $assert$;
ROLLBACK;
