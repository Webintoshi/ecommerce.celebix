-- Refuse to discard retained financial references after the fix has been used.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $restore$
DECLARE r record;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE deleted_order_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM saas.accounting_events WHERE deleted_order_id IS NOT NULL)
 THEN RAISE EXCEPTION 'PERMANENT_ORDER_ACCOUNTING_RETENTION_IN_USE';END IF;
 FOR r IN SELECT definition FROM saas.permanent_order_accounting_restore ORDER BY signature
 LOOP EXECUTE r.definition;END LOOP;
END $restore$;
DROP FUNCTION saas.accounting_detach_deleted_order(uuid,uuid);
ALTER TABLE saas.accounting_events DROP COLUMN IF EXISTS deleted_order_id,DROP COLUMN IF EXISTS deleted_order_number;
ALTER TABLE saas.accounting_receivables DROP COLUMN deleted_order_id,DROP COLUMN deleted_order_number;
DROP TABLE saas.permanent_order_accounting_restore;
COMMIT;
