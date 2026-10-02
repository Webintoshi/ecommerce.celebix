BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
LOCK TABLE saas.accounting_events,saas.accounting_operations,saas.accounting_accounts,saas.accounting_receivables IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.accounting_events) OR EXISTS(SELECT 1 FROM saas.accounting_operations) OR EXISTS(SELECT 1 FROM saas.accounting_accounts) OR EXISTS(SELECT 1 FROM saas.accounting_receivables) OR EXISTS(SELECT 1 FROM saas.accounting_release_state WHERE credit_sales_enabled) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname='in_store_sales_mutate_v3') THEN RAISE EXCEPTION 'ACCOUNTING_DOWN_IMMUTABLE_RECORDS_OR_ACTIVE_READER';END IF;
END $guard$;
DO $restore$ DECLARE r record;BEGIN FOR r IN SELECT * FROM saas.accounting_migration_restore LOOP EXECUTE r.definition;END LOOP;END $restore$;
DROP TABLE saas.accounting_account_movements,saas.accounting_allocations,saas.accounting_operations,saas.accounting_events,saas.accounting_receivables,saas.accounting_customer_versions,saas.accounting_accounts,saas.accounting_release_state,saas.accounting_migration_restore;
DO $functions$ DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure::text signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_%' LOOP EXECUTE format('DROP FUNCTION %s',r.signature);END LOOP;END $functions$;
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_collect_receivables;
COMMIT;
