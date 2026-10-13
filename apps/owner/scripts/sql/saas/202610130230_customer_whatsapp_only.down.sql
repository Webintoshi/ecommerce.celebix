-- Explicit rollback only before any customer phone operation. Never a release retry.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$ DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.customer_phone_login_operations) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_ROLLBACK_REQUIRES_UNUSED_AUTHORITY';END IF;
 FOR r IN SELECT * FROM saas.customer_phone_installed_functions LOOP
  IF to_regprocedure(r.signature) IS NULL OR pg_get_functiondef(r.signature::regprocedure) IS DISTINCT FROM r.definition THEN RAISE EXCEPTION 'CUSTOMER_PHONE_ROLLBACK_ORDER';END IF;
 END LOOP;
END $guard$;
DROP FUNCTION saas.public_account_phone_command(text,jsonb);
DROP FUNCTION saas.customer_phone_verify_isolated(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text);
DO $restore$ DECLARE r record;a jsonb;BEGIN
 FOR r IN SELECT * FROM saas.customer_phone_original_functions ORDER BY signature LOOP
  EXECUTE r.definition;EXECUTE format('ALTER FUNCTION %s OWNER TO %I',r.signature,r.owner_name);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_platform_operator',r.signature);
  FOR a IN SELECT value FROM jsonb_array_elements(r.acl) LOOP
   EXECUTE format('GRANT %s ON FUNCTION %s TO %s%s',a->>'privilege',r.signature,CASE WHEN a->>'grantee'='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(a->>'grantee') END,CASE WHEN (a->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
 END LOOP;
END $restore$;
DROP TABLE saas.customer_phone_login_operations;
DROP TABLE saas.customer_phone_original_functions;
DROP TABLE saas.customer_phone_installed_functions;
COMMIT;
