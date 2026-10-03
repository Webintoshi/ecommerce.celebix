BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
DO $rollback$
DECLARE row record; signature text;
BEGIN
 IF to_regclass('saas.contact_widget_204_backup') IS NULL THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_BACKUP_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='contact_widget') OR EXISTS(SELECT 1 FROM saas.merchant_admin_events WHERE record_kind='contact_widget') THEN RAISE EXCEPTION 'CONTACT_WIDGET_ROLLBACK_REQUIRES_DATA_RECOVERY';END IF;
 FOR row IN SELECT * FROM saas.contact_widget_204_backup WHERE function_owner IS NOT NULL LOOP
  IF pg_get_functiondef(to_regprocedure(row.identity)) IS DISTINCT FROM row.migrated_definition
   OR (SELECT proowner FROM pg_proc WHERE oid=to_regprocedure(row.identity)) IS DISTINCT FROM row.function_owner
   OR (SELECT proacl::text FROM pg_proc WHERE oid=to_regprocedure(row.identity)) IS DISTINCT FROM row.function_acl THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_FUNCTION_DRIFT';END IF;
 END LOOP;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check') IS DISTINCT FROM (SELECT migrated_definition FROM saas.contact_widget_204_backup WHERE identity='constraint:merchant_admin_records_record_kind_check') THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_CONSTRAINT_DRIFT';END IF;
 FOR row IN SELECT * FROM saas.contact_widget_204_backup WHERE function_owner IS NOT NULL LOOP EXECUTE row.definition;END LOOP;
 ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check '||(SELECT definition FROM saas.contact_widget_204_backup WHERE identity='constraint:merchant_admin_records_record_kind_check');
 FOR row IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE '%\_before\_contact\_widget\_204' ESCAPE '\' LOOP EXECUTE 'DROP FUNCTION '||row.oid::regprocedure::text;END LOOP;
END $rollback$;
DROP INDEX saas.merchant_admin_contact_widget_singleton_204;
DROP FUNCTION saas.public_contact_widget_get(text,timestamptz),saas.contact_widget_page_exists(uuid,text),saas.contact_widget_config_valid(jsonb),saas.contact_widget_text_valid(jsonb,integer,integer);
DROP TABLE saas.contact_widget_204_backup;
COMMIT;
