-- Retain committed schedule history. An unused installation may restore its exact predecessors.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $restore$
DECLARE saved record;
BEGIN
 IF to_regclass('saas.accounting_schedule_239_backup') IS NULL THEN RETURN;END IF;
 LOCK TABLE saas.accounting_schedule_plans,saas.accounting_schedule_operations IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_schedule_plans) OR EXISTS(SELECT 1 FROM saas.accounting_schedule_operations)
 THEN RAISE EXCEPTION 'ACCOUNTING239_DOWN_RETAIN_SCHEDULE_HISTORY';END IF;
 IF (SELECT count(*) FROM saas.accounting_schedule_239_backup)<>2 THEN RAISE EXCEPTION 'ACCOUNTING239_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.accounting_schedule_239_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND p.proowner=saved.function_owner AND p.proacl IS NOT DISTINCT FROM saved.function_acl
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.published_sha256)
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  THEN RAISE EXCEPTION 'ACCOUNTING239_ROLLBACK_SOURCE_DRIFT: %',saved.signature;END IF;
 END LOOP;
 FOR saved IN SELECT * FROM saas.accounting_schedule_239_backup ORDER BY signature LOOP EXECUTE saved.definition;END LOOP;
END $restore$;
DROP FUNCTION IF EXISTS saas.accounting_schedule_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_schedule_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS saas.accounting_schedule_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION IF EXISTS saas.accounting_schedule_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb);
DROP FUNCTION IF EXISTS saas.accounting_schedule_projection(uuid,uuid);
DROP FUNCTION IF EXISTS saas.accounting_schedule_status_matches(uuid,uuid,date,text);
DROP FUNCTION IF EXISTS saas.accounting_schedule_filters_valid(jsonb);
DROP FUNCTION IF EXISTS saas.accounting_schedule_next_due(uuid,uuid);
DROP FUNCTION IF EXISTS saas.accounting_schedule_overdue_cents(uuid,uuid,date);
DROP FUNCTION IF EXISTS saas.accounting_schedule_obligations(uuid,uuid);
DROP FUNCTION IF EXISTS saas.accounting_schedule_parts(jsonb,bigint);
DROP TABLE IF EXISTS saas.accounting_schedule_operations;
DROP TABLE IF EXISTS saas.accounting_schedule_plans;
DROP FUNCTION IF EXISTS saas.accounting_schedule_installments_valid(jsonb,bigint);
DROP TABLE IF EXISTS saas.accounting_schedule_239_backup;
COMMIT;
