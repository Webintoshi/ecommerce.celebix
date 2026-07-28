BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  built_in_oid oid:=pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()');
  built_in_donor_oid oid:=pg_catalog.to_regprocedure(
    'saas.built_in_payment_methods_preflight_without_provider_compatibility()'
  );
  keyed_oid oid:=pg_catalog.to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()');
  keyed_donor_oid oid:=pg_catalog.to_regprocedure(
    'saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()'
  );
BEGIN
  IF built_in_oid IS NULL OR built_in_donor_oid IS NULL
    OR keyed_oid IS NULL OR keyed_donor_oid IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=built_in_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='s'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='54c393baa4a396d0526908e8fad359a5'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=built_in_donor_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='s'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='aaf7c11ecf08eaa950ccdebe1d3b839b'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=keyed_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='v'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='8983b28d075eda62453decb82b1b5880'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=keyed_donor_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u' AND procedure.provolatile='v'
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='4d9adaee2d5967d515a8c41cd1b97f48'
    )
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_BODY_INVALID'; END IF;

  IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
    OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
    OR NOT pg_catalog.has_function_privilege(owner_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,built_in_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,built_in_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,built_in_donor_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,keyed_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,keyed_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,keyed_donor_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(built_in_oid,built_in_donor_oid,keyed_oid,keyed_donor_oid) AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid OR privilege.grantee NOT IN(
        owner_oid,
        CASE WHEN procedure.oid IN(built_in_oid,keyed_oid) THEN app_oid ELSE owner_oid END,
        CASE WHEN procedure.oid IN(built_in_oid,keyed_oid) THEN workflow_oid ELSE owner_oid END
      )
    )
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_ACL_INVALID'; END IF;
END
$f$;

ROLLBACK;
