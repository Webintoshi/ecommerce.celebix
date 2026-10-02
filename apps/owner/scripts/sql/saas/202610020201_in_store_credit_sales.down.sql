-- Rollback before any V3 durable sale/customer operation or credit grant exists.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE contract_version=3) OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_sell_on_credit) OR EXISTS(SELECT 1 FROM saas.in_store_operations WHERE operation_kind='create_customer' OR result_payload->'sale' ? 'contractVersion' OR result_payload ? 'canSellOnCredit') THEN RAISE EXCEPTION 'IN_STORE_V3_ROLLBACK_DURABLE_DATA_PRESENT';END IF;
END $guard$;
DROP TRIGGER in_store_credit_snapshot_guard ON saas.in_store_sales;
DO $restore$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT * FROM saas.in_store_v3_migration_restore ORDER BY signature LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(entry.signature::regprocedure),'UTF8')),'hex')<>entry.after_hash THEN RAISE EXCEPTION 'IN_STORE_V3_ROLLBACK_FUNCTION_DRIFT:%',entry.signature;END IF;
  EXECUTE entry.definition;
  IF encode(sha256(convert_to(pg_get_functiondef(entry.signature::regprocedure),'UTF8')),'hex')<>entry.before_hash THEN RAISE EXCEPTION 'IN_STORE_V3_ROLLBACK_RESTORE_MISMATCH:%',entry.signature;END IF;
 END LOOP;
END $restore$;
DO $functions$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE '%v3' AND p.proname LIKE 'in_store%' OR p.proname IN('in_store_projection_v3_value','in_store_can_sell_on_credit','in_store_credit_snapshot_guard','in_store_pos_customer_projection','in_store_sales_search_customers','in_store_sales_create_customer','in_store_sales_recover_customer')) LOOP EXECUTE format('DROP FUNCTION %s',entry.signature);END LOOP;
END $functions$;
ALTER TABLE saas.in_store_sales DROP CONSTRAINT in_store_v3_contract_version,DROP CONSTRAINT in_store_v3_payment_method,DROP CONSTRAINT in_store_v3_collection,DROP CONSTRAINT in_store_v3_customer_pair,DROP CONSTRAINT in_store_v3_payment_stage,DROP CONSTRAINT in_store_sales_lifecycle,
 DROP COLUMN customer_id,DROP COLUMN customer_snapshot,DROP COLUMN initial_collection_cents,DROP COLUMN due_date,
 ADD CONSTRAINT in_store_sales_contract_version_check CHECK(contract_version IN(1,2)),
 ADD CONSTRAINT in_store_sales_payment_method_check CHECK(payment_method IN('card','cash')),
 ADD CONSTRAINT in_store_v2_payment_stage CHECK(contract_version=1 OR status NOT IN('payment_pending','payment_received','completed') OR payment_method IS NOT NULL),
 ADD CONSTRAINT in_store_sales_lifecycle CHECK((status IN('draft','held','payment_pending','cancelled') AND payment_received_at IS NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL) OR(status='payment_received' AND payment_received_at IS NOT NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL) OR(status='completed' AND payment_received_at IS NOT NULL AND completed_at IS NOT NULL AND order_number IS NOT NULL));
ALTER TABLE saas.in_store_payment_attestations DROP CONSTRAINT in_store_v3_attestation_method,ADD CONSTRAINT in_store_payment_attestations_payment_method_check CHECK(payment_method IN('card','cash'));
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_sell_on_credit;
DROP TABLE saas.in_store_v3_migration_restore;
COMMIT;
