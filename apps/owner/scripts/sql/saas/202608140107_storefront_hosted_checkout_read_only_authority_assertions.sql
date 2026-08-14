BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  projection_oid oid:=pg_catalog.to_regprocedure(
    'saas.storefront_hosted_checkout_authority_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)'
  );
  visible_oid oid:=pg_catalog.to_regprocedure(
    'saas.merchant_provider_execution_authority_visible(text,text,text,integer,text)'
  );
  matches_oid oid:=pg_catalog.to_regprocedure(
    'saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)'
  );
  owner_oid oid:='celebix_saas_owner'::regrole;
  definition text;
BEGIN
  IF projection_oid IS NULL OR visible_oid IS NULL OR matches_oid IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_FUNCTION_MISSING'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=matches_oid
      AND pg_catalog.md5(procedure.prosrc)='c89a8ab0d23d470a1603e6ceebf11b68'
  ) THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_EXECUTION_GUARD_CHANGED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(projection_oid) INTO definition;
  IF pg_catalog.strpos(definition,'transaction_read_only')=0
    OR pg_catalog.strpos(definition,'merchant_provider_execution_authority_visible')=0
    OR pg_catalog.strpos(definition,'merchant_provider_execution_authority_matches')=0
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_PROJECTION_INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=projection_oid
      AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_SECURITY_INVALID'; END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=projection_oid
      AND (privilege.grantee<>owner_oid OR privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable)
  ) OR NOT pg_catalog.has_function_privilege(owner_oid,projection_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_ACL_INVALID'; END IF;
END
$f$;

COMMIT;
