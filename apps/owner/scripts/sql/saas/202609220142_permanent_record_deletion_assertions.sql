DO $assertions$
DECLARE
  ledger_oid oid := 'saas.record_deletion_operations'::regclass;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid = ledger_oid
      AND relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
  ) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_OWNER_ASSERTION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = ledger_oid
      AND tgname = 'record_deletion_operations_immutable'
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_TRIGGER_ASSERTION_FAILED';
  END IF;

  IF pg_catalog.has_table_privilege(
    'celebix_saas_app',
    'saas.record_deletion_operations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) OR pg_catalog.has_table_privilege(
    'celebix_saas_workflow',
    'saas.record_deletion_operations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) OR pg_catalog.has_table_privilege(
    'public',
    'saas.record_deletion_operations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ACL_ASSERTION_FAILED';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = ledger_oid
      AND pg_catalog.pg_get_constraintdef(oid) ~* 'resource_kind.*order.*product.*category'
  ) <> 1 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = ledger_oid
      AND pg_catalog.pg_get_constraintdef(oid) ~* 'outcome.*deleted'
  ) <> 1 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = ledger_oid
      AND pg_catalog.pg_get_constraintdef(oid) ~* 'replay_count.*0'
  ) <> 1 THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_CONSTRAINT_ASSERTION_FAILED';
  END IF;
END
$assertions$;
