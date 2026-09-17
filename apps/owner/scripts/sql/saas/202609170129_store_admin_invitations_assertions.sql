BEGIN;
DO $f$ DECLARE n text; fn record; role_name text; BEGIN
 IF to_regprocedure('saas.store_admin_invitation_delivery_claim(text,uuid,timestamptz,timestamptz,integer,uuid,text)') IS NULL OR to_regprocedure('saas.store_admin_invitation_delivery_claim(text,uuid,timestamptz,timestamptz,integer)') IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_CLAIM_SCOPE_REQUIRED'; END IF;
 FOREACH n IN ARRAY ARRAY['store_admin_invitations','store_admin_invitation_deliveries','store_admin_invitation_operations','store_admin_invitation_acceptance_grants','store_admin_invitation_events','store_admin_invitation_provider_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE ns.nspname='saas' AND c.relname=n AND c.relrowsecurity AND c.relforcerowsecurity AND r.rolname='celebix_saas_owner') THEN RAISE EXCEPTION 'INVITATION_RLS_OWNER_INVALID'; END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver'] LOOP
   IF has_table_privilege(role_name,'saas.'||n,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'INVITATION_TABLE_GRANT_INVALID'; END IF;
  END LOOP;
 END LOOP;
 FOR fn IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'store_admin_invitation\_%' ESCAPE '\' LOOP
  IF NOT ('search_path=pg_catalog, saas'=ANY(fn.proconfig) OR 'search_path=pg_catalog,saas'=ANY(fn.proconfig)) THEN RAISE EXCEPTION 'INVITATION_SEARCH_PATH_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(COALESCE(fn.proacl,acldefault('f',fn.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') THEN RAISE EXCEPTION 'INVITATION_PUBLIC_EXECUTE_INVALID'; END IF;
  IF has_function_privilege('celebix_saas_app',fn.oid,'EXECUTE') IS DISTINCT FROM (fn.proname='store_admin_invitation_list') THEN RAISE EXCEPTION 'INVITATION_APP_EXECUTE_INVALID'; END IF;
  IF has_function_privilege('celebix_saas_workflow',fn.oid,'EXECUTE') IS DISTINCT FROM (fn.proname IN('store_admin_invitation_delivery_claim','store_admin_invitation_delivery_authorize','store_admin_invitation_delivery_settle')) THEN RAISE EXCEPTION 'INVITATION_WORKFLOW_EXECUTE_INVALID'; END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_identity','saas.store_admin_invitation_accept(text,text,text,uuid,text,uuid,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'INVITATION_IDENTITY_EXECUTE_MISSING'; END IF;
END $f$;
ROLLBACK;
