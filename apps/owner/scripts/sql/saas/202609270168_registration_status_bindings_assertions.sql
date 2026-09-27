DO $assertions$
DECLARE found_count integer; denied_role text;
BEGIN
 SELECT count(*) INTO found_count FROM pg_catalog.pg_class relation
 JOIN pg_catalog.pg_roles owner ON owner.oid=relation.relowner
 WHERE relation.oid=pg_catalog.to_regclass('saas.registration_status_bindings')
 AND owner.rolname='celebix_saas_owner' AND relation.relrowsecurity AND relation.relforcerowsecurity;
 IF found_count<>1 THEN RAISE EXCEPTION 'REGISTRATION_STATUS_TABLE_AUTHORITY_ASSERTION_FAILED';END IF;
 FOREACH denied_role IN ARRAY ARRAY['public','celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap'] LOOP
  IF pg_catalog.has_table_privilege(denied_role,'saas.registration_status_bindings','SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'REGISTRATION_STATUS_DIRECT_ACCESS_ASSERTION_FAILED';
  END IF;
 END LOOP;
 SELECT count(*) INTO found_count FROM pg_catalog.pg_proc function
 JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner
 WHERE function.oid IN(
  pg_catalog.to_regprocedure('saas.issue_panel_bootstrap_with_registration_status(text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,text,text,timestamptz)'),
  pg_catalog.to_regprocedure('saas.registration_onboarding_status_projection(text,timestamptz)'),
  pg_catalog.to_regprocedure('saas.read_registration_status(text,text,text,text,timestamptz)'),
  pg_catalog.to_regprocedure('saas.read_registration_callback_access_ready(text,text,text,text,timestamptz)'),
  pg_catalog.to_regprocedure('saas.cleanup_registration_status_bindings(timestamptz,integer)'))
 AND owner.rolname='celebix_saas_owner' AND function.prosecdef AND function.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
 AND NOT pg_catalog.has_function_privilege('public',function.oid,'EXECUTE')
 AND NOT pg_catalog.has_function_privilege('celebix_saas_app',function.oid,'EXECUTE')
 AND NOT pg_catalog.has_function_privilege('celebix_saas_workflow',function.oid,'EXECUTE')
 AND NOT pg_catalog.has_function_privilege('celebix_saas_bootstrap',function.oid,'EXECUTE')
 AND pg_catalog.has_function_privilege('celebix_saas_identity',function.oid,'EXECUTE')=(function.proname<>'registration_onboarding_status_projection');
 IF found_count<>5 THEN RAISE EXCEPTION 'REGISTRATION_STATUS_FUNCTION_AUTHORITY_ASSERTION_FAILED';END IF;
END $assertions$;
