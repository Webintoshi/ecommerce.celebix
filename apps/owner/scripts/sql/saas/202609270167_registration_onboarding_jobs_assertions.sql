DO $assertions$
DECLARE table_name text; function_name text; found_count integer;
BEGIN
 SELECT count(*) INTO found_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE n.nspname='saas'
 AND c.relname IN('registration_authority_scopes','registration_onboarding_jobs','registration_onboarding_access','registration_onboarding_heartbeats')
 AND r.rolname='celebix_saas_owner' AND c.relrowsecurity AND c.relforcerowsecurity;
 IF found_count<>4 THEN RAISE EXCEPTION 'ONBOARDING_TABLE_AUTHORITY_ASSERTION_FAILED'; END IF;
 FOREACH table_name IN ARRAY ARRAY['registration_authority_scopes','registration_onboarding_jobs','registration_onboarding_access','registration_onboarding_heartbeats'] LOOP
  IF pg_catalog.has_table_privilege('celebix_saas_identity','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege('public','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'ONBOARDING_TABLE_GRANT_ASSERTION_FAILED'; END IF;
 END LOOP;
 SELECT count(*) INTO found_count FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE n.nspname='saas'
 AND p.proname IN('bind_registration_onboarding_scope','enqueue_registration_onboarding_job','claim_registration_onboarding_jobs','finish_registration_onboarding_job','read_registration_onboarding_access','touch_registration_onboarding_heartbeat','read_registration_onboarding_health','verify_registration_onboarding_access_proof','backfill_registration_onboarding_jobs','read_registration_onboarding_tenant','list_registration_onboarding_operations','retry_registration_onboarding_job')
 AND r.rolname='celebix_saas_owner' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
 AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')
 AND NOT pg_catalog.has_function_privilege('celebix_saas_app',p.oid,'EXECUTE')
 AND (p.proname='enqueue_registration_onboarding_job' OR pg_catalog.has_function_privilege('celebix_saas_identity',p.oid,'EXECUTE'));
 IF found_count<>12 THEN RAISE EXCEPTION 'ONBOARDING_FUNCTION_AUTHORITY_ASSERTION_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.registration_onboarding_jobs'::regclass
 AND attname='version' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped) THEN RAISE EXCEPTION 'ONBOARDING_VERSION_ASSERTION_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.registration_verified_identities'::regclass
 AND tgname='registration_identity_onboarding_job' AND tgenabled='O' AND NOT tgisinternal) THEN RAISE EXCEPTION 'ONBOARDING_ATOMIC_ENQUEUE_ASSERTION_FAILED'; END IF;
END $assertions$;
