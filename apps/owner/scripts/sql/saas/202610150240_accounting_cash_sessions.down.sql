-- Count history is retained permanently. Only an unused installation may be removed.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $unused$
BEGIN
 IF to_regclass('saas.accounting_cash_sessions') IS NULL THEN RETURN;END IF;
 LOCK TABLE saas.accounting_cash_sessions,saas.accounting_cash_operations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_cash_sessions) OR EXISTS(SELECT 1 FROM saas.accounting_cash_operations)
 THEN RAISE EXCEPTION 'ACCOUNTING240_DOWN_RETAIN_COUNT_HISTORY';END IF;
END $unused$;
DROP FUNCTION IF EXISTS saas.accounting_cash_session_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_cash_session_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS saas.accounting_cash_session_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION IF EXISTS saas.accounting_cash_session_projection(uuid,uuid);
DROP TABLE IF EXISTS saas.accounting_cash_operations;
DROP TABLE IF EXISTS saas.accounting_cash_sessions;
DROP FUNCTION IF EXISTS saas.accounting_cash_session_intent_valid(text,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_cash_session_guard();
COMMIT;
