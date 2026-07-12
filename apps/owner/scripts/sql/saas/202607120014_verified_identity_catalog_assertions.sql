-- Phase 2B1B1 verified-identity catalog and least-privilege assertions.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b1b1_catalog_assertions$
DECLARE
  forbidden_column_name text;
BEGIN
  IF NOT pg_catalog.has_table_privilege(
       'celebix_saas_identity',
       'saas.registration_verified_identities',
       'SELECT,INSERT'
     )
     OR pg_catalog.has_table_privilege(
       'celebix_saas_identity',
       'saas.registration_verified_identities',
       'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: exact identity grants missing';
  END IF;

  IF pg_catalog.has_table_privilege(
       'public',
       'saas.registration_verified_identities',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: PUBLIC table privilege';
  END IF;

  IF pg_catalog.has_table_privilege(
       'celebix_saas_bootstrap',
       'saas.registration_verified_identities',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: bootstrap gained identity authority';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'saas'
      AND table_name = 'registration_verified_identities'
      AND pg_catalog.has_column_privilege(
        'celebix_saas_identity',
        'saas.registration_verified_identities',
        column_name,
        'UPDATE'
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: column UPDATE privilege';
  END IF;

  FOREACH forbidden_column_name IN ARRAY ARRAY[
    'issuer', 'subject', 'email', 'display_name', 'nonce', 'code_verifier',
    'audience', 'access_token', 'refresh_token', 'id_token', 'password',
    'provider_secret', 'client_secret', 'encryption_key', 'database_url'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'saas'
        AND table_name = 'registration_verified_identities'
        AND lower(column_name) = forbidden_column_name
    ) THEN
      RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: plaintext identity column';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.registration_verified_identities'::regclass
      AND contype = 'p'
  ) <> 1 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: primary key drift';
  END IF;

  IF (
    SELECT count(*) FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.registration_verified_identities'::regclass
      AND contype = 'f'
      AND confrelid = 'saas.registration_workflows'::regclass
      AND confdeltype = 'c'
  ) <> 1 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: cleanup cascade drift';
  END IF;

  IF (
    SELECT count(*) FROM pg_catalog.pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid IN (
        'saas.registration_verified_identities'::regclass,
        'saas.registration_workflows'::regclass
      )
      AND tgname LIKE 'registration_verified_identit%'
  ) <> 4 THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: trigger drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.registration_verified_identities'::regclass
      AND tgname = 'registration_verified_identities_pair_guard'
      AND tgdeferrable
      AND tginitdeferred
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: deferred pair guard drift';
  END IF;

  IF pg_catalog.pg_get_functiondef(
       'saas.guard_registration_verified_identity_transition()'::regprocedure
     ) !~* 'OLD\.status = ''awaiting_identity'' AND NEW\.status = ''identity_verified'''
     OR pg_catalog.pg_get_functiondef(
       'saas.guard_registration_verified_identity_transition()'::regprocedure
     ) !~* 'snapshot_fingerprint IS DISTINCT FROM NEW\.canonical_fingerprint'
     OR pg_catalog.pg_get_functiondef(
       'saas.assert_registration_verified_identity_pair()'::regprocedure
     ) !~* 'workflow_status <> ''identity_verified'''
     OR pg_catalog.pg_get_functiondef(
       'saas.guard_registration_verified_identity_mutation()'::regprocedure
     ) !~* 'PHASE2B1B1_IMMUTABLE_VERIFIED_IDENTITY' THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: guard authority drift';
  END IF;

  IF pg_catalog.has_function_privilege(
       'public',
       'saas.guard_registration_verified_identity_insert()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'public',
       'saas.guard_registration_verified_identity_mutation()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'public',
       'saas.guard_registration_verified_identity_transition()',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'public',
       'saas.assert_registration_verified_identity_pair()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_CATALOG_ASSERTION_FAILED: PUBLIC function privilege';
  END IF;
END
$phase2b1b1_catalog_assertions$;

COMMIT;
