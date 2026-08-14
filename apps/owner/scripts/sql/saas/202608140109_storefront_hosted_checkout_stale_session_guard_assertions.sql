BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  routine_oid oid:=pg_catalog.to_regprocedure(
    'saas.public_storefront_hosted_checkout_begin(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)'
  );
  owner_oid oid:='celebix_saas_owner'::regrole;
  host_oid oid:='celebix_saas_host_resolver'::regrole;
  definition text;
BEGIN
  IF routine_oid IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_FUNCTION_MISSING';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(routine_oid) INTO definition;
  IF pg_catalog.regexp_count(
      definition,E'session\\.status IN\\(''active'',''provider_ready'',''processing''\\)'
    )<>2
    OR pg_catalog.strpos(definition,'session.hold_expires_at>p_now')>0
  THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_DEFINITION_INVALID';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=routine_oid
      AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='2af1f7f7cad92f0ead6dc4cbf18b547d'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_SECURITY_INVALID';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=routine_oid
      AND (
        privilege.grantee NOT IN(owner_oid,host_oid)
        OR privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
      )
  )
    OR NOT pg_catalog.has_function_privilege(owner_oid,routine_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(host_oid,routine_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_ACL_INVALID';
  END IF;
END
$f$;

COMMIT;
