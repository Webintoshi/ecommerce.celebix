DO $assert$
DECLARE r text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.merchant_signup_profiles'::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'PROFILE238_TABLE_AUTHORITY';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text)'::regprocedure AND proowner='celebix_saas_owner'::regrole AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[]) THEN RAISE EXCEPTION 'PROFILE238_FUNCTION_AUTHORITY';END IF;
 IF to_regprocedure('saas.merchant_whatsapp_bootstrap_principal(uuid,text,text,text,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'PROFILE238_LEGACY_AUTHORITY';END IF;
 FOREACH r IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_platform_operator','celebix_saas_observability'] LOOP
  IF has_table_privilege(r,'saas.merchant_signup_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'PROFILE238_TABLE_GRANT %',r;END IF;
  IF has_function_privilege(r,'saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text)','EXECUTE') IS DISTINCT FROM (r='celebix_saas_bootstrap') THEN RAISE EXCEPTION 'PROFILE238_FUNCTION_GRANT %',r;END IF;
 END LOOP;
END $assert$;
