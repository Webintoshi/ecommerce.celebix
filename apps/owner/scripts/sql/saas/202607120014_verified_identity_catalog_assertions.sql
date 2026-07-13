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
  IF pg_catalog.has_column_privilege(
       'celebix_saas_identity', 'saas.registration_workflows', 'tenant_idempotency_digest', 'UPDATE'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: tenant idempotency authority mutable';
  END IF;

  FOREACH checked_name IN ARRAY ARRAY['state', 'version', 'started_at', 'updated_at', 'commit_unknown_at', 'recovery_absent_at'] LOOP
    IF NOT pg_catalog.has_column_privilege('celebix_saas_identity', 'saas.registration_tenant_completions', checked_name, 'UPDATE') THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: required completion column UPDATE missing';
    END IF;
  END LOOP;
  FOREACH checked_name IN ARRAY ARRAY['attempt_id', 'canonical_fingerprint', 'completed_at', 'tenant_operation_id'] LOOP
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
     OR pg_catalog.has_table_privilege('public', 'saas.registration_tenant_completions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.registration_tenant_operation_proofs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.registration_tenant_operation_proofs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
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
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'saas.registration_tenant_completions'::regclass
      AND attname = 'tenant_operation_id'
      AND atttypid = 'uuid'::regtype
      AND NOT attnotnull
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: tenant operation UUID column drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'saas.registration_workflows'::regclass
      AND attname = 'tenant_idempotency_digest'
      AND atttypid = 'bpchar'::regtype
      AND atttypmod = 68
      AND attnotnull
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.registration_workflows'::regclass
      AND conname = 'registration_workflows_tenant_idempotency_digest_format'
      AND pg_catalog.pg_get_constraintdef(oid) ~* '\^\[a-f0-9\]\{64\}\$'
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: tenant idempotency digest drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = 'saas.registration_tenant_completions'::regclass
        AND contype = 'f'
        AND confrelid = 'saas.tenant_operations'::regclass
        AND confdeltype = 'r') <> 1
     OR (SELECT count(*) FROM pg_catalog.pg_constraint
         WHERE conrelid = 'saas.registration_tenant_completions'::regclass
           AND contype = 'u'
           AND pg_catalog.pg_get_constraintdef(oid) ~* 'tenant_operation_id') <> 1 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: tenant operation binding drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.registration_tenant_completions'::regclass
      AND conname = 'registration_tenant_completions_state_shape'
      AND pg_catalog.pg_get_constraintdef(oid) ~* 'commit_unknown.*tenant_operation_id IS NULL.*completed.*tenant_operation_id IS NOT NULL'
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
  IF NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'saas.assert_registration_tenant_completion_pair()'::regprocedure) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: proof pair function security drift';
  END IF;

  IF pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_REQUIRED'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'PHASE2B1B1_ACTIVE_TENANT_COMPLETION_FENCED'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_tenant_completion_mutation()'::regprocedure) !~* 'PHASE2B1B1_INVALID_TENANT_COMPLETION_TRANSITION'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_tenant_completion_mutation()'::regprocedure) !~* 'registration_tenant_operation_proofs'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_tenant_completion_mutation()'::regprocedure) !~* 'tenant_idempotency_digest'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'registration_tenant_operation_proofs'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_transition()'::regprocedure) !~* 'IMMUTABLE_TENANT_IDEMPOTENCY_AUTHORITY'
     OR pg_catalog.pg_get_functiondef('saas.assert_registration_tenant_completion_pair()'::regprocedure) !~* 'PHASE2B1B1_UNPAIRED_TENANT_COMPLETION'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_verified_identity_mutation()'::regprocedure) !~* 'PHASE2B1B1_IMMUTABLE_VERIFIED_IDENTITY' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: guard authority drift';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'celebix_saas_identity',
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'public',
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'celebix_saas_app',
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'celebix_saas_bootstrap',
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: finalizer EXECUTE grant drift';
  END IF;
  IF (SELECT owner.rolname
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
      WHERE procedure.oid = 'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure) <> 'celebix_saas_owner'
     OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc
             WHERE oid = 'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure)
     OR (SELECT proconfig FROM pg_catalog.pg_proc
         WHERE oid = 'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure)
        IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: finalizer ownership or search_path drift';
  END IF;
  IF pg_catalog.pg_get_functiondef(
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure
     ) ~* '\m(EXECUTE|format)\M'
     OR pg_catalog.pg_get_functiondef(
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure
     ) !~* 'pg_advisory_xact_lock.*registration_tenant_operation_proofs.*tenant_operation_id'
     OR pg_catalog.pg_get_functiondef(
       'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'::regprocedure
     ) !~* 'tenant_idempotency_digest' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: finalizer authority drift';
  END IF;
  IF pg_catalog.pg_get_viewdef('saas.registration_tenant_operation_proofs'::regclass, true) !~* 'tenant_operations.*stores.*domains.*memberships.*principals.*subscriptions.*plans'
     OR pg_catalog.pg_get_viewdef('saas.registration_tenant_operation_proofs'::regclass, true) !~* 'plan_features'
     OR pg_catalog.pg_get_viewdef('saas.registration_tenant_operation_proofs'::regclass, true) !~* 'plan_limits'
     OR pg_catalog.pg_get_viewdef('saas.registration_tenant_operation_proofs'::regclass, true) !~* 'sha256.*idempotency_key' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: committed graph proof drift';
  END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'saas.guard_registration_verified_identity_insert()',
    'saas.guard_registration_verified_identity_mutation()',
    'saas.guard_registration_verified_identity_transition()',
    'saas.assert_registration_verified_identity_pair()',
    'saas.guard_registration_tenant_completion_insert()',
    'saas.guard_registration_tenant_completion_mutation()',
    'saas.assert_registration_tenant_completion_pair()',
    'saas.finalize_registration_tenant_completion(text,bigint,bigint,text,uuid,timestamp with time zone)'
  ] LOOP
    IF pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: PUBLIC function privilege';
    END IF;
  END LOOP;
END
$phase2b1b1_catalog_assertions$;

COMMIT;
