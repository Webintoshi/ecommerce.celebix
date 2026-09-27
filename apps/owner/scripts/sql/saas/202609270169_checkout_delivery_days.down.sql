BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Acquire before any relation lock: an already validated save must finish before
-- the compatibility snapshot, and no new validation may cross the restoration.
SELECT pg_catalog.pg_advisory_xact_lock(
 pg_catalog.hashtextextended('saas.checkout_delivery_days.validation',0));
LOCK TABLE saas.merchant_admin_records IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE original text; selected record; installed record;
BEGIN
 IF pg_catalog.to_regclass('saas.checkout_delivery_days_backup') IS NULL
  OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_DOWN_BACKUP_MISSING';
 END IF;
 IF (SELECT pg_catalog.count(*) FROM saas.checkout_delivery_days_backup)<>2 THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_DOWN_DEFINITION_CHANGED';
 END IF;
 FOR selected IN SELECT * FROM saas.checkout_delivery_days_backup LOOP
  SELECT oid,proacl::text AS acl,proowner INTO installed FROM pg_catalog.pg_proc
  WHERE oid=pg_catalog.to_regprocedure(selected.identity);
  IF installed.oid IS NULL
    OR pg_catalog.pg_get_functiondef(installed.oid) IS DISTINCT FROM selected.migrated_definition
    OR installed.acl IS DISTINCT FROM selected.acl OR installed.proowner<>selected.owner_id THEN
   RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_DOWN_DEFINITION_CHANGED';
  END IF;
 END LOOP;
 -- Restoring an older validator must not silently invalidate any merchant's
 -- persisted shipping setting, including drafts and archived records.
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records
   WHERE record_kind='shipping_setting'
     AND saas.merchant_admin_config_valid(record_kind,config) IS TRUE
     AND saas.merchant_admin_config_valid_without_delivery_days(record_kind,config) IS NOT TRUE) THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_DOWN_INCOMPATIBLE_RECORD';
 END IF;
 SELECT definition INTO original FROM saas.checkout_delivery_days_backup
 WHERE identity='saas.merchant_admin_config_valid(text,jsonb)';
 EXECUTE original;
END $rollback$;
DROP FUNCTION saas.merchant_admin_config_valid_without_delivery_days(text,jsonb);
DROP TABLE saas.checkout_delivery_days_backup;
COMMIT;
