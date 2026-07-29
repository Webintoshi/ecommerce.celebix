-- Phase 3V: forward repair for provider preflight compatibility after 062.
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
  keyed_oid oid:=pg_catalog.to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()');
BEGIN
  IF built_in_oid IS NULL OR keyed_oid IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.built_in_payment_methods_preflight_without_provider_compatibility()'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()'
    ) IS NOT NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=built_in_oid AND procedure.proowner=owner_oid
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
        AND pg_catalog.md5(procedure.prosrc)='4d9adaee2d5967d515a8c41cd1b97f48'
    )
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_SOURCE_INVALID'; END IF;

  IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
    OR NOT pg_catalog.has_function_privilege(owner_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,built_in_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,keyed_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid IN(built_in_oid,keyed_oid) AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR privilege.grantee NOT IN(owner_oid,app_oid,workflow_oid)
      )
    )
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_SOURCE_ACL_INVALID'; END IF;
END
$f$;

ALTER FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
  RENAME TO payment_provider_keyed_lifecycle_preflight_without_builtin_authority;
REVOKE ALL ON FUNCTION
  saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER FUNCTION saas.built_in_payment_methods_preflight()
  RENAME TO built_in_payment_methods_preflight_without_provider_compatibility;
REVOKE ALL ON FUNCTION
  saas.built_in_payment_methods_preflight_without_provider_compatibility()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  signature text;
  expected_hash text;
  allowed_role text;
  expected_security boolean;
  function_oid oid;
  allowed_oid oid;
  owner_oid oid:='celebix_saas_owner'::regrole;
BEGIN
  IF saas.paytr_iframe_activation_preflight() IS NOT TRUE THEN RETURN false; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='iyzico_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_profiles'::regclass
      AND conname='merchant_provider_profiles_execution_authority_check'
      AND convalidated
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%validation_environment%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_evidence_digest%'
  ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid='saas.merchant_provider_profiles'::regclass
          AND attname IN('validation_environment','validation_adapter_version')
          AND attnum>0 AND NOT attisdropped)<>2
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_capability_idx') IS NOT NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_payment_environment_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_nonpayment_capability_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_verification_claim_idx') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.merchant_provider_profiles'::regclass
      AND tgname='merchant_provider_profiles_validation_identity_compat'
      AND tgenabled='O' AND NOT tgisinternal
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.merchant_provider_profiles'::regclass
      AND tgname='merchant_provider_profiles_disable_bound_methods'
      AND tgenabled='O' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;

  FOR signature,expected_hash,allowed_role,expected_security IN SELECT * FROM (VALUES
    ('saas.merchant_provider_profiles_validation_identity_compat()','e58ed91405efafc57842d258c2915370',NULL::text,false),
    ('saas.merchant_provider_profiles_disable_bound_methods()','d47dda73304fdd5f1cadd116a65c7560',NULL::text,true),
    ('saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)','16390c6b605f3d1e0697238c4eefbce9','celebix_saas_app',true),
    ('saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamp with time zone,timestamp with time zone,uuid)','bdb8179dd889c57d5223654e3135db10','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)','0f52a99dc71a7424a68cb0cdff64bdc0','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamp with time zone,bigint)','343e0912c1cb144d4a4eb29dfebf73be',NULL::text,true),
    ('saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','95759feb45130750226426a364a9d94d',NULL::text,true),
    ('saas.payment_method_save_without_builtin_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','d28dfa0740950aa197950675b4d6737b',NULL::text,true),
    ('saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','94f1b7293b59d18b90063fb06c425b9b','celebix_saas_app',true),
    ('saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()','4d9adaee2d5967d515a8c41cd1b97f48',NULL::text,true)
  ) AS expected(signature,expected_hash,allowed_role,expected_security) LOOP
    function_oid:=signature::regprocedure;
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef=expected_security
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR (privilege.grantee<>owner_oid
          AND (allowed_oid IS NULL OR privilege.grantee<>allowed_oid))
      )
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
      OR (allowed_oid IS NOT NULL AND NOT pg_catalog.has_function_privilege(allowed_oid,function_oid,'EXECUTE'))
      OR (allowed_oid IS NULL AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=function_oid AND privilege.grantee<>owner_oid
      ))
    THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;
  END LOOP;

  function_oid:='saas.payment_provider_keyed_lifecycle_preflight()'::regprocedure;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=function_oid AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(
        owner_oid,'celebix_saas_app'::regrole,'celebix_saas_workflow'::regrole
      )
    )
  ) OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',function_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
TO celebix_saas_app,celebix_saas_workflow;

CREATE FUNCTION saas.built_in_payment_methods_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  current_oid oid:=pg_catalog.to_regprocedure('saas.built_in_payment_methods_preflight()');
  donor_oid oid:=pg_catalog.to_regprocedure(
    'saas.built_in_payment_methods_preflight_without_provider_compatibility()'
  );
  keyed_oid oid:=pg_catalog.to_regprocedure('saas.payment_provider_keyed_lifecycle_preflight()');
  keyed_donor_oid oid:=pg_catalog.to_regprocedure(
    'saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()'
  );
BEGIN
  IF current_oid IS NULL OR donor_oid IS NULL OR keyed_oid IS NULL OR keyed_donor_oid IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=donor_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND procedure.provolatile='s'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='aaf7c11ecf08eaa950ccdebe1d3b839b'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=keyed_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='8983b28d075eda62453decb82b1b5880'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=keyed_donor_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='4d9adaee2d5967d515a8c41cd1b97f48'
    )
  THEN RETURN false; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,donor_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,keyed_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,keyed_donor_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,keyed_donor_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,current_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,current_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,current_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,keyed_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,keyed_oid,'EXECUTE')
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(current_oid,donor_oid,keyed_oid,keyed_donor_oid) AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid OR privilege.grantee NOT IN(
        owner_oid,
        CASE WHEN procedure.oid IN(current_oid,keyed_oid) THEN app_oid ELSE owner_oid END,
        CASE WHEN procedure.oid IN(current_oid,keyed_oid) THEN workflow_oid ELSE owner_oid END
      )
    )
  ) THEN RETURN false; END IF;

  RETURN saas.built_in_payment_methods_preflight_without_provider_compatibility()
    AND saas.payment_provider_keyed_lifecycle_preflight();
END
$f$;

REVOKE ALL ON FUNCTION saas.built_in_payment_methods_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.built_in_payment_methods_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
