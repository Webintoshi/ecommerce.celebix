BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  signature text;
  expected_hash text;
  allowed_role text;
  expected_security boolean;
  function_oid oid;
  owner_oid oid:='celebix_saas_owner'::regrole;
  allowed_oid oid;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='iyzico_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_execution_authorities
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_methods
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_attempts
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_attempt_events
    WHERE provider_code='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.checkout_provider_configs
    WHERE provider_key='iyzico_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.quick_order_links
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_SEED_INVALID'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute
      WHERE attrelid='saas.merchant_provider_profiles'::regclass
        AND attname IN('validation_environment','validation_adapter_version')
        AND attnum>0 AND NOT attisdropped)<>2
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.merchant_provider_profiles'::regclass
        AND conname='merchant_provider_profiles_execution_authority_check'
        AND contype='c' AND convalidated
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%validation_environment%'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_evidence_digest%'
    )
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PROFILE_SCHEMA_INVALID'; END IF;

  IF pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_capability_idx') IS NOT NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_nonpayment_capability_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_payment_environment_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_verification_claim_idx') IS NULL
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_INDEX_INVALID'; END IF;

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
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_TRIGGER_INVALID'; END IF;

  FOR signature,expected_hash,allowed_role,expected_security IN SELECT * FROM (VALUES
    ('saas.merchant_provider_profiles_validation_identity_compat()','e58ed91405efafc57842d258c2915370',NULL::text,false),
    ('saas.merchant_provider_profiles_disable_bound_methods()','d47dda73304fdd5f1cadd116a65c7560',NULL::text,true),
    ('saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)','16390c6b605f3d1e0697238c4eefbce9','celebix_saas_app',true),
    ('saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamp with time zone,timestamp with time zone,uuid)','bdb8179dd889c57d5223654e3135db10','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)','3491e6f91f43a04d57d7e66c87aa1e0e','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamp with time zone,bigint)','343e0912c1cb144d4a4eb29dfebf73be',NULL::text,true),
    ('saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','95759feb45130750226426a364a9d94d',NULL::text,true),
    ('saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','d28dfa0740950aa197950675b4d6737b','celebix_saas_app',true)
  ) AS expected(signature,expected_hash,allowed_role,expected_security) LOOP
    function_oid:=pg_catalog.to_regprocedure(signature);
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF function_oid IS NULL OR NOT EXISTS(
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
    THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_FUNCTION_INVALID: %',signature; END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure(
    'saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)'
  ) IS NULL OR pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_WRAPPER_INVALID'; END IF;

  function_oid:='saas.payment_provider_keyed_lifecycle_preflight()'::regprocedure;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='121bfe5478bfffaf3709dbb68ceaed8c'
  ) OR EXISTS(
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
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_METADATA_INVALID'; END IF;

  IF saas.payment_provider_keyed_lifecycle_preflight() IS NOT TRUE
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS relation
      WHERE relation.oid IN(
        'saas.merchant_provider_definitions'::regclass,
        'saas.merchant_provider_profiles'::regclass,
        'saas.merchant_provider_execution_authorities'::regclass,
        'saas.payment_methods'::regclass
      ) AND relation.relrowsecurity AND relation.relforcerowsecurity)<>4
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_RLS_INVALID'; END IF;
END
$f$;

COMMIT;
