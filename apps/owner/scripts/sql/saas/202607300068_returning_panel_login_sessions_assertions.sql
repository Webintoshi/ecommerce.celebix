BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $returning_panel_login_assertions$
DECLARE
  issue_oid regprocedure := pg_catalog.to_regprocedure('saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)');
  recover_oid regprocedure := pg_catalog.to_regprocedure('saas.recover_returning_panel_session(text,text,uuid,text,text)');
  issue_definition text;
  recover_definition text;
BEGIN
  IF issue_oid IS NULL OR recover_oid IS NULL THEN
    RAISE EXCEPTION 'RETURNING_PANEL_LOGIN_FUNCTION_MISSING';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(issue_oid) INTO issue_definition;
  SELECT pg_catalog.pg_get_functiondef(recover_oid) INTO recover_definition;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid IN (issue_oid, recover_oid)
      AND (
        pg_catalog.pg_get_userbyid(procedure.proowner) <> 'celebix_saas_owner'
        OR NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'RETURNING_PANEL_LOGIN_FUNCTION_AUTHORITY_DRIFT';
  END IF;

  IF (SELECT procedure.provolatile FROM pg_catalog.pg_proc procedure WHERE procedure.oid = issue_oid) <> 'v'
     OR (SELECT procedure.provolatile FROM pg_catalog.pg_proc procedure WHERE procedure.oid = recover_oid) <> 's' THEN
    RAISE EXCEPTION 'RETURNING_PANEL_LOGIN_FUNCTION_VOLATILITY_DRIFT';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc procedure
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
       ) AS acl
       WHERE procedure.oid IN (issue_oid, recover_oid)
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege('celebix_saas_app', issue_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app', recover_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', issue_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', recover_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'RETURNING_PANEL_LOGIN_FUNCTION_ACL_DRIFT';
  END IF;

  IF pg_catalog.strpos(issue_definition, 'principal.email_verified') = 0
     OR pg_catalog.strpos(issue_definition, 'membership.role = ''store_owner''') = 0
     OR pg_catalog.strpos(issue_definition, 'membership.status = ''active''') = 0
     OR pg_catalog.strpos(issue_definition, 'store.status = ''active''') = 0
     OR pg_catalog.strpos(issue_definition, 'subscription.status = ''active''') = 0
     OR pg_catalog.strpos(issue_definition, 'plan.plan_code = subscription.plan_code') = 0
     OR pg_catalog.strpos(issue_definition, 'plan.version = subscription.plan_version') = 0
     OR pg_catalog.strpos(issue_definition, 'plan.status = ''active''') = 0
     OR pg_catalog.strpos(issue_definition, 'FOR SHARE OF principal, membership, store, subscription, plan') = 0
     OR pg_catalog.strpos(issue_definition, 'saas.issue_panel_session') = 0
     OR pg_catalog.strpos(recover_definition, 'saas.recover_panel_session_operation') = 0 THEN
    RAISE EXCEPTION 'RETURNING_PANEL_LOGIN_DURABLE_AUTHORITY_DRIFT';
  END IF;
END
$returning_panel_login_assertions$;

COMMIT;
