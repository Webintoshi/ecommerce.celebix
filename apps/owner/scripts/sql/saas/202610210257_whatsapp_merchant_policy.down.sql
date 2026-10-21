-- Rollback is forbidden while any restrictive policy remains active.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $rollback$
DECLARE saved record;current_function record;
BEGIN
 IF to_regclass('saas.google_merchant_257_backup') IS NULL THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='whatsapp_order_setting' AND status<>'archived' AND saas.google_merchant_whatsapp_catalog_only(store_id)) THEN RAISE EXCEPTION 'MERCHANT257_ACTIVE_POLICY';END IF;
 IF (SELECT count(*) FROM saas.google_merchant_257_backup)<>5 THEN RAISE EXCEPTION 'MERCHANT257_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.google_merchant_257_backup LOOP
  SELECT * INTO current_function FROM pg_proc WHERE oid=saved.function_oid;
  IF current_function.proowner IS DISTINCT FROM saved.function_owner OR current_function.proacl IS DISTINCT FROM saved.function_acl THEN RAISE EXCEPTION 'MERCHANT257_ROLLBACK_AUTHORITY_DRIFT';END IF;
  IF to_regprocedure(saved.signature) IS DISTINCT FROM saved.function_oid OR encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256 OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256 THEN RAISE EXCEPTION 'MERCHANT257_ROLLBACK_SOURCE_DRIFT';END IF;
 END LOOP;
 DROP TRIGGER google_merchant_whatsapp_policy_changed ON saas.merchant_admin_records;
 FOR saved IN SELECT * FROM saas.google_merchant_257_backup LOOP EXECUTE saved.definition;END LOOP;
 DROP FUNCTION saas.google_merchant_whatsapp_policy_changed();
 DROP FUNCTION saas.google_merchant_whatsapp_catalog_only(uuid);
 DROP TABLE saas.google_merchant_257_backup;
END $rollback$;
COMMIT;
