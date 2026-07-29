BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE target regprocedure;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname IN('merchant_provider_definitions','merchant_provider_profiles','merchant_provider_profile_operations')
        AND relation.relkind='r' AND relation.relrowsecurity AND relation.relforcerowsecurity)<>3
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_provider_definitions','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_provider_profiles','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_provider_profile_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.merchant_provider_profiles','SELECT,INSERT,UPDATE,DELETE')
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
    OR pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)',
      'EXECUTE'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.merchant_provider_definitions'::regclass AND contype='p'
        AND pg_catalog.pg_get_constraintdef(oid)='PRIMARY KEY (provider_code, capability)'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.merchant_provider_profiles'::regclass AND contype='f'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (provider_code, capability) REFERENCES saas.merchant_provider_definitions(provider_code, capability)%'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname='saas' AND indexname='merchant_provider_profiles_validation_lease_idx'
        AND indexdef LIKE '%UNIQUE INDEX%validation_lease_id%WHERE (validation_lease_id IS NOT NULL)%'
    )
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
        WHERE tgrelid IN('saas.merchant_provider_definitions'::regclass,'saas.merchant_provider_profile_operations'::regclass)
          AND NOT tgisinternal AND tgenabled='O')<>2
  THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_PROFILES_ASSERTION_FAILED'; END IF;

  FOREACH target IN ARRAY ARRAY[
    'saas.merchant_provider_profile_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)'::regprocedure,
    'saas.merchant_provider_profile_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure,
    'saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)'::regprocedure,
    'saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
    'saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
    'saas.merchant_provider_profile_claim_validation(text,timestamp with time zone,timestamp with time zone,uuid)'::regprocedure,
    'saas.merchant_provider_profile_mark_validation(uuid,text,timestamp with time zone,uuid,bigint,bigint,text,text)'::regprocedure,
    'saas.merchant_provider_profile_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc
      WHERE oid=target AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_PROFILES_FUNCTION_ASSERTION_FAILED'; END IF;
  END LOOP;
END
$assertions$;

COMMIT;
