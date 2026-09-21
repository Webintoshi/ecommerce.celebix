BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.record_deletion_operations) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ROLLBACK_BLOCKED';
  END IF;
END
$guard$;

DROP TRIGGER record_deletion_operations_immutable ON saas.record_deletion_operations;
DROP FUNCTION saas.record_deletion_operation_replay(uuid, uuid, text, uuid, text);
DROP FUNCTION saas.record_deletion_operation_lock(uuid, uuid);
DROP FUNCTION saas.guard_record_deletion_operation_immutable();
DROP TABLE saas.record_deletion_operations;

COMMIT;
