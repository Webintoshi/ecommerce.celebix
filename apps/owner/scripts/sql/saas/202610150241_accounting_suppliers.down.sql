-- Financial and debt evidence is permanent. Only an unused installation may be removed.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $unused$
BEGIN
 IF to_regclass('saas.accounting_supplier_debts') IS NULL THEN RETURN;END IF;
 LOCK TABLE saas.accounting_supplier_debts,saas.accounting_supplier_payments,saas.accounting_supplier_cancellations,saas.accounting_supplier_operations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_supplier_debts) OR EXISTS(SELECT 1 FROM saas.accounting_supplier_payments)
  OR EXISTS(SELECT 1 FROM saas.accounting_supplier_cancellations) OR EXISTS(SELECT 1 FROM saas.accounting_supplier_operations)
 THEN RAISE EXCEPTION 'SUPPLIERS241_DOWN_RETAIN_DEBT_HISTORY';END IF;
END $unused$;
DROP FUNCTION IF EXISTS saas.accounting_suppliers_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb,uuid);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_payment_projection(uuid,uuid);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_debt_projection(uuid,uuid);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_filters_valid(jsonb);
DROP FUNCTION IF EXISTS saas.accounting_suppliers_intent_valid(text,jsonb);
DROP TABLE IF EXISTS saas.accounting_supplier_operations;
DROP TABLE IF EXISTS saas.accounting_supplier_cancellations;
DROP TABLE IF EXISTS saas.accounting_supplier_payments;
DROP TABLE IF EXISTS saas.accounting_supplier_debts;
COMMIT;
