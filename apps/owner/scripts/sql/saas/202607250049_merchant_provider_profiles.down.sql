BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname IN('merchant_provider_definitions','merchant_provider_profiles','merchant_provider_profile_operations')
        AND relation.relkind='r' AND relation.relrowsecurity AND relation.relforcerowsecurity)<>3
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.merchant_provider_profile_mark_validation(uuid,text,timestamp with time zone,uuid,bigint,bigint,text,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.merchant_provider_profile_mark_validation(uuid,text,timestamp with time zone,uuid,bigint,bigint,text,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_PROFILES_ROLLBACK_DRIFT'; END IF;
END
$guard$;

REVOKE ALL ON FUNCTION
  saas.merchant_provider_profile_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint),
  saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_provider_profile_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM celebix_saas_app;
REVOKE ALL ON FUNCTION
  saas.merchant_provider_profile_claim_validation(text,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text)
FROM celebix_saas_workflow;

DROP FUNCTION saas.merchant_provider_profile_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text);
DROP FUNCTION saas.merchant_provider_profile_claim_validation(text,timestamptz,timestamptz,uuid);
DROP FUNCTION saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint);
DROP FUNCTION saas.merchant_provider_profile_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.merchant_provider_profile_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean);
DROP FUNCTION saas.merchant_provider_profile_projection(uuid,uuid);

DROP TABLE saas.merchant_provider_profile_operations;
DROP TABLE saas.merchant_provider_profiles;
DROP TABLE saas.merchant_provider_definitions;

DROP FUNCTION saas.merchant_provider_sealed_envelope_valid(jsonb,text);
DROP FUNCTION saas.merchant_provider_public_config_valid(jsonb);
DROP FUNCTION saas.merchant_provider_profile_json_safe(jsonb,integer);

COMMIT;

