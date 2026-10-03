BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $restore$
DECLARE row record;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='restock_alerts') OR EXISTS(SELECT 1 FROM saas.merchant_admin_events WHERE record_kind='restock_alerts') OR EXISTS(SELECT 1 FROM saas.restock_subscriptions) OR EXISTS(SELECT 1 FROM saas.restock_deliveries) THEN RAISE EXCEPTION 'RESTOCK_ALERTS_ROLLBACK_REQUIRES_DATA_RECOVERY';END IF;
 FOR row IN SELECT * FROM saas.restock_alerts_207_backup WHERE function_owner IS NOT NULL LOOP
  IF pg_get_functiondef(to_regprocedure(row.identity)) IS DISTINCT FROM row.migrated_definition THEN RAISE EXCEPTION 'RESTOCK_207_ROLLBACK_PREDECESSOR_DRIFT';END IF;
  EXECUTE row.definition;
 END LOOP;
 EXECUTE 'ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check';
 SELECT * INTO STRICT row FROM saas.restock_alerts_207_backup WHERE identity='constraint:merchant_admin_records_record_kind_check';
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check '||row.definition;
 FOR row IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'restock_%' OR proname='public_restock_alerts_get' OR proname LIKE '%_before_restock_alerts_207') LOOP EXECUTE 'DROP FUNCTION '||row.identity;END LOOP;
END $restore$;
DROP INDEX saas.merchant_admin_restock_alerts_singleton_207;
DROP TABLE saas.restock_request_limits,saas.restock_deliveries,saas.restock_subscriptions,saas.restock_alerts_207_backup;
COMMIT;
