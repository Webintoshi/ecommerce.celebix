BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
DO $assertions$DECLARE r record;role_name text;BEGIN
 IF saas.loyalty504_hosted_proof_v1(NULL,NULL,NULL,NULL,NULL,false)IS DISTINCT FROM false THEN RAISE EXCEPTION 'LOYALTY504_NULL_PROOF_ACCEPTED';END IF;
 IF to_regclass('saas.loyalty504_functions')IS NULL OR(SELECT count(*)FROM saas.loyalty504_functions WHERE definition<>'')<>8 THEN RAISE EXCEPTION 'LOYALTY504_INCOMPLETE_PATCHES';END IF;
 FOR r IN SELECT *FROM saas.loyalty504_functions LOOP IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY504_ROUTINE_DRIFT:%',r.identity;END IF;END LOOP;
 FOR r IN SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'loyalty504_%'LOOP
  IF pg_get_userbyid(r.proowner)<>'celebix_saas_owner'OR NOT('search_path=pg_catalog, saas'=ANY(r.proconfig))THEN RAISE EXCEPTION 'LOYALTY504_UNSAFE_OWNER_OR_PATH';END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator']LOOP IF has_function_privilege(role_name,r.oid,'EXECUTE')THEN RAISE EXCEPTION 'LOYALTY504_RUNTIME_DIRECT_ACCESS:%:%',role_name,r.proname;END IF;END LOOP;
 END LOOP;
END $assertions$;
ROLLBACK;
