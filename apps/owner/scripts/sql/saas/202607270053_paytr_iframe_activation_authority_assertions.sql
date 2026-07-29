BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  signature text;
  expected_hash text;
  allowed_role text;
  function_oid oid;
  allowed_oid oid;
  owner_oid oid:='celebix_saas_owner'::regrole;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='paytr_iframe' AND capability='payment_processing' AND enabled
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_DEFINITION_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM saas.merchant_provider_execution_authorities
    WHERE provider_code='paytr_iframe'
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_MUST_NOT_BE_SEEDED'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND relation.relowner=owner_oid
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
    ) AS privilege
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND privilege.grantee<>owner_oid
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_RELATION_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_execution_authorities'::regclass
      AND contype='p'
      AND pg_catalog.pg_get_constraintdef(oid)='PRIMARY KEY (provider_code, environment)'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_execution_authorities'::regclass
      AND contype='u'
      AND pg_catalog.pg_get_constraintdef(oid)='UNIQUE (provider_code, capability, environment, adapter_version, evidence_digest)'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_profiles'::regclass
      AND conname='merchant_provider_profiles_execution_authority_check'
      AND contype='c'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_environment%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_adapter_version%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_evidence_digest%'
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_CONSTRAINT_INVALID'; END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.merchant_provider_profiles'::regclass
      AND attname IN('execution_environment','execution_adapter_version','execution_evidence_digest')
      AND NOT attisdropped
  )<>3 THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_COLUMNS_INVALID'; END IF;

  IF pg_catalog.to_regprocedure(
    'saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)'
  ) IS NOT NULL OR pg_catalog.to_regprocedure(
    'saas.merchant_provider_profile_claim_validation(text,timestamp with time zone,timestamp with time zone,uuid)'
  ) IS NOT NULL OR pg_catalog.to_regprocedure(
    'saas.merchant_provider_profile_mark_validation(uuid,text,timestamp with time zone,uuid,bigint,bigint,text,text)'
  ) IS NOT NULL THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_LEGACY_OVERLOAD_PRESENT'; END IF;

  FOR signature,expected_hash,allowed_role IN SELECT * FROM (VALUES
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)','c89a8ab0d23d470a1603e6ceebf11b68',NULL::text),
    ('saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamp with time zone)','63fff1fd8ae86ce49a93907c4691f0c4',NULL::text),
    ('saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamp with time zone)','ba897c60b87da7da38ba3bdba5fd70c4',NULL::text),
    ('saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamp with time zone)','ec0c71ee813e7e09c9cf099896f06ada',NULL::text),
    ('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)','842a1aca1b8a6e7fd21c3931fea8403f','celebix_saas_app'),
    ('saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','055fe95458610ea1b303a17378c4cdbb','celebix_saas_app'),
    ('saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','2ece1621c3c3e4f328be7ba8aff0b417','celebix_saas_app'),
    ('saas.merchant_provider_profile_claim_validation(text,text,text,text,integer,text,timestamp with time zone,timestamp with time zone,uuid)','91f745428286afb832d3d4dbdb958ceb','celebix_saas_workflow'),
    ('saas.merchant_provider_profile_mark_validation(uuid,text,text,text,integer,text,text,timestamp with time zone,uuid,bigint,bigint,text,text)','df7af69139c4d91d03827bfa540a52fb','celebix_saas_workflow'),
    ('saas.paytr_iframe_test_payment_method_activate(uuid,uuid,timestamp with time zone)','30e26c27e400a13a7bf342af5e524d82',NULL::text),
    ('saas.paytr_iframe_test_payment_method_stage(uuid,uuid,timestamp with time zone)','3fd4bd200149045eeb5c8bb8a0e85b10',NULL::text),
    ('saas.paytr_iframe_test_payment_method_disable(uuid,uuid,timestamp with time zone)','53b634d4f85a99fa63defe229e5865f8',NULL::text),
    ('saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','3cf9d59ea9baeed367aa63c9545650e6','celebix_saas_app'),
    ('saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','4e9eb9b14d0bb0bd12e40d520d38ce74',NULL::text),
    ('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','27bc9a3e5ad2996e4aff04140a9ddf3f','celebix_saas_workflow'),
    ('saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','e5439203d385e21cecf9a49826229d3c',NULL::text)
  ) AS expected(signature,expected_hash,allowed_role) LOOP
    function_oid:=signature::regprocedure;
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=function_oid
        AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_FUNCTION_INVALID: %',signature; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR (
          privilege.grantee<>owner_oid
          AND (allowed_oid IS NULL OR privilege.grantee<>allowed_oid)
        )
      )
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
      OR (allowed_oid IS NULL AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=function_oid AND privilege.grantee<>owner_oid
      ))
      OR (allowed_oid IS NOT NULL AND NOT pg_catalog.has_function_privilege(allowed_oid,function_oid,'EXECUTE'))
    THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_FUNCTION_ACL_INVALID: %',signature; END IF;
  END LOOP;

  function_oid:='saas.paytr_iframe_activation_preflight()'::regprocedure;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=function_oid
      AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='0302d768e4b58bc06c9a1947ca0bc6dd'
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=function_oid AND (
      privilege.privilege_type<>'EXECUTE'
      OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(
        owner_oid,'celebix_saas_app'::regrole,'celebix_saas_workflow'::regrole
      )
    )
  ) OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',function_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_PREFLIGHT_METADATA_INVALID'; END IF;

  IF saas.paytr_iframe_activation_preflight() IS NOT TRUE THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_PREFLIGHT_INVALID';
  END IF;
END
$f$;
COMMIT;
