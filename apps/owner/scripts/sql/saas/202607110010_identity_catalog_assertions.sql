-- Phase 2B1 catalog and least-privilege assertions. Safe to execute repeatedly.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b1_catalog_assertions$
DECLARE
  identity_role record;
  checked_table_name text;
  forbidden_column_name text;
  checked_column_name text;
  registration_update_columns constant text[] := ARRAY[
    'status', 'version', 'canonical_fingerprint', 'updated_at',
    'consumed_at', 'failure_code', 'terminal_at'
  ];
  oidc_update_columns constant text[] := ARRAY[
    'status', 'updated_at', 'consumed_at', 'discarded_at'
  ];
BEGIN
  SELECT * INTO identity_role FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity';
  IF identity_role IS NULL
     OR identity_role.rolcanlogin OR identity_role.rolinherit OR identity_role.rolsuper
     OR identity_role.rolcreatedb OR identity_role.rolcreaterole OR identity_role.rolreplication
     OR identity_role.rolbypassrls THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: unsafe identity role';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_class AS class JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace WHERE namespace.nspname = 'saas' AND class.relname IN ('registration_workflows', 'oidc_transactions') AND class.relkind = 'r') <> 2 THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: identity tables missing';
  END IF;

  FOREACH checked_table_name IN ARRAY ARRAY['registration_workflows', 'oidc_transactions'] LOOP
    IF NOT pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.' || checked_table_name, 'SELECT,INSERT,DELETE')
       OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.' || checked_table_name, 'UPDATE') THEN
      RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: exact identity table grants missing';
    END IF;
    IF pg_catalog.has_table_privilege('public', 'saas.' || checked_table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: PUBLIC identity table privilege';
    END IF;
  END LOOP;

  FOR checked_table_name, checked_column_name IN
    SELECT columns.table_name, columns.column_name
    FROM information_schema.columns AS columns
    WHERE columns.table_schema = 'saas'
      AND columns.table_name IN ('registration_workflows', 'oidc_transactions')
  LOOP
    IF pg_catalog.has_column_privilege(
         'celebix_saas_identity',
         'saas.' || checked_table_name,
         checked_column_name,
         'UPDATE'
       ) IS DISTINCT FROM (
         (checked_table_name = 'registration_workflows' AND checked_column_name = ANY (registration_update_columns))
         OR
         (checked_table_name = 'oidc_transactions' AND checked_column_name = ANY (oidc_update_columns))
       ) THEN
      RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: identity column UPDATE drift';
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_schema_privilege('celebix_saas_identity', 'saas', 'USAGE')
     OR pg_catalog.has_schema_privilege('celebix_saas_identity', 'saas', 'CREATE') THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: identity schema grant drift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'saas' AND class.relkind = 'r'
      AND class.relname NOT IN ('registration_workflows', 'oidc_transactions')
      AND pg_catalog.has_table_privilege('celebix_saas_identity', class.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: unrelated table access';
  END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_bootstrap', 'saas.registration_workflows', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('celebix_saas_bootstrap', 'saas.oidc_transactions', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: bootstrap gained identity authority';
  END IF;

  FOREACH forbidden_column_name IN ARRAY ARRAY['state', 'raw_state', 'nonce', 'code_verifier', 'password', 'access_token', 'refresh_token', 'id_token', 'client_secret', 'encryption_key', 'hmac_key', 'database_url'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'saas' AND table_name IN ('registration_workflows', 'oidc_transactions')
        AND lower(columns.column_name) = forbidden_column_name
    ) THEN
      RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: forbidden plaintext column';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid IN ('saas.registration_workflows'::regclass, 'saas.oidc_transactions'::regclass) AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: mutation guard drift';
  END IF;

  IF pg_catalog.pg_get_functiondef('saas.guard_registration_workflow_mutation()'::regprocedure) !~* 'NEW\.requested_at IS DISTINCT FROM OLD\.requested_at'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_workflow_mutation()'::regprocedure) !~* 'NEW\.expires_at IS DISTINCT FROM OLD\.expires_at'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_workflow_mutation()'::regprocedure) !~* 'NEW\.updated_at < OLD\.updated_at'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_workflow_mutation()'::regprocedure) !~* 'OLD\.terminal_at IS NOT NULL'
     OR pg_catalog.pg_get_functiondef('saas.guard_registration_workflow_mutation()'::regprocedure) !~* 'OLD\.status = ''failed'''
     OR pg_catalog.pg_get_functiondef('saas.guard_oidc_transaction_mutation()'::regprocedure) !~* 'NEW\.expires_at IS DISTINCT FROM OLD\.expires_at'
     OR pg_catalog.pg_get_functiondef('saas.guard_oidc_transaction_mutation()'::regprocedure) !~* 'NEW\.updated_at < OLD\.updated_at' THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: lifecycle guard authority drift';
  END IF;

  IF pg_catalog.pg_get_constraintdef(
       (SELECT constraint_record.oid FROM pg_catalog.pg_constraint AS constraint_record
        WHERE constraint_record.conname = 'registration_workflows_consumed_state'
          AND constraint_record.conrelid = 'saas.registration_workflows'::regclass)
     ) ~* 'expired' THEN
    RAISE EXCEPTION 'PHASE2B1_CATALOG_ASSERTION_FAILED: explicit expiry incorrectly requires consumption';
  END IF;
END
$phase2b1_catalog_assertions$;

COMMIT;
