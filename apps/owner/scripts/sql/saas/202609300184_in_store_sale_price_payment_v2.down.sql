-- Roll back only before any durable v2 sale, operation or configured price grant exists.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE contract_version=2 OR payment_method IS NOT NULL)
  OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_edit_price)
  OR EXISTS(SELECT 1 FROM saas.in_store_operations WHERE result_payload ? 'canEditPrice' OR result_payload->'sale' ? 'paymentMethod')
  OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE payment_method IS NOT NULL)
 THEN RAISE EXCEPTION 'IN_STORE_V2_ROLLBACK_DURABLE_DATA_PRESENT';END IF;
END $guard$;
DROP TRIGGER in_store_payment_method_guard ON saas.in_store_sales;
DO $restore$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT * FROM saas.in_store_v2_migration_restore ORDER BY signature LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(entry.signature::regprocedure),'UTF8')),'hex')<>entry.after_hash THEN RAISE EXCEPTION 'IN_STORE_V2_ROLLBACK_FUNCTION_DRIFT:%',entry.signature;END IF;
  EXECUTE entry.definition;
  IF encode(sha256(convert_to(pg_get_functiondef(entry.signature::regprocedure),'UTF8')),'hex')<>entry.before_hash THEN RAISE EXCEPTION 'IN_STORE_V2_ROLLBACK_RESTORE_MISMATCH:%',entry.signature;END IF;
 END LOOP;
END $restore$;
DO $functions$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='saas' AND (p.proname LIKE 'in_store%v2' OR p.proname IN('in_store_can_edit_price','in_store_payment_method_guard','in_store_projection_v2_value','orders_get_with_archive_v2'))
 LOOP EXECUTE format('DROP FUNCTION %s',entry.signature);END LOOP;
END $functions$;
ALTER TABLE saas.in_store_payment_attestations DROP COLUMN payment_method;
ALTER TABLE saas.in_store_sales DROP COLUMN payment_method,DROP COLUMN contract_version;
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_edit_price;
DROP TABLE saas.in_store_v2_migration_restore;
COMMIT;
