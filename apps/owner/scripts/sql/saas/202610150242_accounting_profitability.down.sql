-- Captured historical cost evidence is never discarded by rollback.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $unused$
BEGIN
 IF to_regclass('saas.accounting_profitability_line_costs') IS NULL THEN RETURN;END IF;
 LOCK TABLE saas.order_items IN ACCESS EXCLUSIVE MODE;
 LOCK TABLE saas.accounting_profitability_line_costs,saas.accounting_profitability_cost_invalidations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_profitability_line_costs) OR EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations)
 THEN RAISE EXCEPTION 'PROFITABILITY242_DOWN_RETAIN_COST_HISTORY';END IF;
END $unused$;
DROP TRIGGER IF EXISTS accounting_profitability_capture_line ON saas.order_items;
DROP FUNCTION IF EXISTS saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_profitability_filters_valid(jsonb);
DROP FUNCTION IF EXISTS saas.accounting_profitability_capture_line();
DROP TABLE IF EXISTS saas.accounting_profitability_cost_invalidations;
DROP TABLE IF EXISTS saas.accounting_profitability_line_costs;
COMMIT;
