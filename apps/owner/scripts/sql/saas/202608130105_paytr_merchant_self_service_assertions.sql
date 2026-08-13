BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  function_oid oid:=pg_catalog.to_regprocedure(
    'saas.paytr_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)'
  );
  definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='paytr_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_DEFINITION_INVALID'; END IF;

  IF function_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
      AND procedure.prokind='f' AND procedure.prosecdef AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_FUNCTION_INVALID'; END IF;

  SELECT pg_catalog.pg_get_functiondef(function_oid) INTO definition;
  IF pg_catalog.strpos(definition,'merchant_provider_execution_authorities')=0
    OR pg_catalog.strpos(definition,'ORDER BY method.id')=0
    OR pg_catalog.strpos(definition,'execution_evidence_digest')=0
    OR pg_catalog.strpos(definition,'provider_managed')=0
    OR pg_catalog.strpos(definition,'emergency_disabled')=0
  THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_FUNCTION_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,function_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR privilege.grantee NOT IN(owner_oid,workflow_oid)
      )
    )
  THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_ACL_INVALID'; END IF;

  IF pg_catalog.md5((
    SELECT procedure.prosrc FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)'::pg_catalog.regprocedure
  ))<>'0f52a99dc71a7424a68cb0cdff64bdc0'
  THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_PREDECESSOR_DRIFT'; END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.payment_methods AS method
    JOIN saas.merchant_provider_profiles AS profile
      ON profile.store_id=method.store_id AND profile.id=method.profile_id
      AND profile.provider_code=method.provider_code
    WHERE method.kind='provider' AND method.provider_code='paytr_iframe'
      AND method.state='active'
      AND (
        profile.status<>'active'
        OR profile.execution_environment IS NULL
        OR profile.execution_adapter_version IS NULL
        OR profile.execution_evidence_digest IS NULL
        OR method.config->>'environment' IS DISTINCT FROM profile.execution_environment
        OR NOT saas.provider_payment_method_config_valid(method.provider_code,method.config)
        OR NOT saas.merchant_provider_execution_authority_matches(
          profile.provider_code,profile.capability,profile.execution_environment,
          profile.execution_adapter_version,profile.execution_evidence_digest
        )
      )
  ) THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_ACTIVE_METHOD_INVALID'; END IF;
END
$assertions$;

COMMIT;
