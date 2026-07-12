-- Phase 2B1B1 verified-identity and durable tenant-completion catalog assertions.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b1b1_catalog_assertions$
DECLARE
  checked_name text;
  function_name text;
BEGIN
  IF NOT pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.registration_verified_identities', 'SELECT,INSERT')
     OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.registration_verified_identities', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: exact identity grants missing';
  END IF;
  IF NOT pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'SELECT,INSERT')
     OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: completion table grants drift';
  END IF;

  FOREACH checked_name IN ARRAY ARRAY['state', 'version', 'started_at', 'updated_at', 'commit_unknown_at', 'completed_at', 'recovery_absent_at'] LOOP
    IF NOT pg_catalog.has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', checked_name, 'UPDATE') THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: required completion column UPDATE missing';
    END IF;
  END LOOP;
  FOREACH checked_name IN ARRAY ARRAY['attempt_id', 'canonical_fingerprint'] LOOP
    IF pg_catalog.has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', checked_name, 'UPDATE') THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: immutable completion column UPDATE granted';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS catalog_column
    WHERE catalog_column.table_schema = 'saas' AND catalog_column.table_name = 'registration_verified_identities'
      AND pg_catalog.has_column_privilege('celebix_saas_identity', 'saas.registration_verified_identities', catalog_column.column_name, 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: snapshot column UPDATE privilege';
  END IF;

  IF pg_catalog.has_table_privilege('public', 'saas.registration_verified_identities', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.registration_tenant_completions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: PUBLIC table privilege';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_bootstrap', 'saas.registration_verified_identities', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('celebix_saas_bootstrap', 'saas.registration_tenant_completions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: bootstrap gained identity authority';
  END IF;

  FOREACH checked_name IN ARRAY ARRAY[
    'issuer', 'subject', 'email', 'display_name', 'nonce', 'code_verifier', 'audience',
    'access_token', 'refresh_token', 'id_token', 'password', 'provider_secret',
    'client_secret', 'encryption_key', 'database_url'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns AS catalog_column
      WHERE catalog_column.table_schema = 'saas' AND catalog_column.table_name IN ('registration_verified_identities', 'registration_tenant_completions')
        AND lower(catalog_column.column_name) = checked_name
    ) THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: plaintext identity column';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = 'saas.registration_verified_identities'::regclass AND contype = 'p') <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = 'saas.registration_tenant_completions'::regclass AND contype = 'p') <> 1 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: primary key drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = 'saas.registration_verified_identities'::regclass AND contype = 'f' AND confrelid = 'saas.registration_workflows'::regclass AND confdeltype = 'c') <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid = 'saas.registration_tenant_completions'::regclass AND contype = 'f' AND confrelid = 'saas.registration_workflows'::regclass AND confdeltype = 'c') <> 1 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: cleanup cascade drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.registration_tenant_completions'::regclass
      AND conname = 'registration_tenant_completions_state_shape'
      AND pg_catalog.pg_get_constraintdef(oid) ~* 'commit_unknown.*completed'
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: completion state shape drift';
  END IF;
  IF pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'recovery_absent_at' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: recovered-absent expiry fence drift';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgrelid = 'saas.registration_verified_identities'::regclass) <> 3
     OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgrelid = 'saas.registration_tenant_completions'::regclass) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'saas.registration_workflows'::regclass AND tgname = 'registration_verified_identity_transition_guard'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: trigger drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.registration_verified_identities'::regclass
      AND tgname = 'registration_verified_identities_pair_guard' AND tgdeferrable AND tginitdeferred
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.registration_tenant_completions'::regclass
      AND tgname = 'registration_tenant_completions_pair_guard' AND tgdeferrable AND tginitdeferred
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: deferred pair guard drift';
  END IF;

  IF pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_REQUIRED'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'PHASE2B1B1_ACTIVE_TENANT_COMPLETION_FENCED'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_tenant_completion_mutation()'::regprocedure) !~* 'PHASE2B1B1_INVALID_TENANT_COMPLETION_TRANSITION'
     OR pg_catalog.pg_get_functiondef('saas.assert_registration_tenant_completion_pair()'::regprocedure) !~* 'PHASE2B1B1_UNPAIRED_TENANT_COMPLETION'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_mutation()'::regprocedure) !~* 'PHASE2B1B1_IMMUTABLE_VERIFIED_IDENTITY' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: guard authority drift';
  END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'saas.guard_registration_verified_identity_insert()',
    'saas.guard_registration_verified_identity_mutation()',
    'saas.guard_registration_verified_identity_transition()',
    'saas.assert_registration_verified_identity_pair()',
    'saas.guard_registration_tenant_completion_insert()',
    'saas.guard_registration_tenant_completion_mutation()',
    'saas.assert_registration_tenant_completion_pair()'
  ] LOOP
    IF pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: PUBLIC function privilege';
    END IF;
  END LOOP;
END
$phase2b1b1_catalog_assertions$;

COMMIT;
