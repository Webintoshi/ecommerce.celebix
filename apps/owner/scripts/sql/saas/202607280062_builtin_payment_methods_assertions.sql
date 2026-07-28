BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  preflight_oid oid:=pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()');
BEGIN
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=preflight_oid AND procedure.proowner=owner_oid
      AND procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='ecbfd1c3db5505a12e9a1368c133163f'
  ) THEN RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHODS_PREFLIGHT_BODY_INVALID'; END IF;

  IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHODS_PREFLIGHT_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,preflight_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=preflight_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid OR privilege.grantee NOT IN(owner_oid,app_oid,workflow_oid)
      )
    )
  THEN RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHODS_PREFLIGHT_ACL_INVALID'; END IF;
END
$f$;

ROLLBACK;
