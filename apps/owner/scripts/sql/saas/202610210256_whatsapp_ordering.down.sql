BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $restore$
DECLARE row record;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='whatsapp_order_setting') OR EXISTS(SELECT 1 FROM saas.merchant_admin_events WHERE record_kind='whatsapp_order_setting') OR (SELECT readers_ready FROM saas.whatsapp_order_release_state WHERE singleton) THEN RAISE EXCEPTION 'WHATSAPP_ORDER_ROLLBACK_REQUIRES_DATA_RECOVERY';END IF;
 FOR row IN SELECT * FROM saas.whatsapp_order_256_backup WHERE function_owner IS NOT NULL LOOP
  IF pg_get_functiondef(to_regprocedure(row.identity)) IS DISTINCT FROM row.migrated_definition THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_ROLLBACK_PREDECESSOR_DRIFT';END IF;
  EXECUTE row.definition;
 END LOOP;
 EXECUTE 'ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check';
 SELECT * INTO STRICT row FROM saas.whatsapp_order_256_backup WHERE identity='constraint:merchant_admin_records_record_kind_check';
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check '||row.definition;
 FOR row IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'whatsapp_order_%' OR proname='public_whatsapp_order_get' OR proname LIKE '%_before_whatsapp_order_256') LOOP EXECUTE 'DROP FUNCTION '||row.identity;END LOOP;
END $restore$;
DROP INDEX saas.merchant_admin_whatsapp_order_singleton_256;
DROP TABLE saas.whatsapp_order_release_state,saas.whatsapp_order_256_backup;
COMMIT;
