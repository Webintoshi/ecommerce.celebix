-- Rollback only before any durable sale, grant or manual in-store price-list data exists.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_sales) OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants) OR EXISTS(SELECT 1 FROM saas.in_store_operations) OR EXISTS(SELECT 1 FROM saas.orders WHERE source='in_store') OR EXISTS(SELECT 1 FROM saas.price_list_rules WHERE channel='in_store') OR EXISTS(SELECT 1 FROM saas.inventory_movements WHERE source_kind='in_store_sale') THEN RAISE EXCEPTION 'IN_STORE_ROLLBACK_DURABLE_DATA_PRESENT';END IF;
END $guard$;
DROP TRIGGER IF EXISTS in_store_online_hold_admission ON saas.checkout_inventory_reservations;
DROP TRIGGER in_store_inventory_balance_guard ON saas.inventory_balances;
DROP TRIGGER in_store_location_hold_guard ON saas.inventory_locations;
DROP TRIGGER in_store_product_hold_guard ON saas.products;
DROP TRIGGER in_store_variant_hold_guard ON saas.product_variants;
DROP TRIGGER in_store_order_guard ON saas.orders;
DROP TRIGGER in_store_order_tombstone ON saas.orders;
DO $restore$
DECLARE fn record;
BEGIN FOR fn IN SELECT definition FROM saas.in_store_migration_restore ORDER BY signature LOOP EXECUTE fn.definition;END LOOP;END $restore$;
DROP VIEW saas.all_inventory_reservations;
DROP TABLE saas.in_store_price_snapshots,saas.in_store_discount_allocations,saas.in_store_sale_events,saas.in_store_operations,saas.in_store_inventory_reservations,saas.in_store_payment_attestations,saas.in_store_sales,saas.in_store_staff_grants,saas.in_store_migration_restore;
DO $functions$
DECLARE fn record;
BEGIN FOR fn IN SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'in_store_%' LOOP EXECUTE format('DROP FUNCTION %s',fn.signature);END LOOP;END $functions$;
DROP INDEX saas.product_variants_exact_barcode_idx;
ALTER TABLE saas.orders DROP CONSTRAINT orders_non_store_customer_check;
ALTER TABLE saas.orders ALTER COLUMN customer_name SET NOT NULL,ALTER COLUMN customer_email SET NOT NULL,ALTER COLUMN shipping_address SET NOT NULL;
ALTER TABLE saas.orders DROP CONSTRAINT orders_source_check;
ALTER TABLE saas.orders ADD CONSTRAINT orders_source_check CHECK(source IN('storefront','quick_link','marketplace','manual_import','manual'));
ALTER TABLE saas.price_list_rules DROP CONSTRAINT price_list_rules_channel_check;
ALTER TABLE saas.price_list_rules ADD CONSTRAINT price_list_rules_channel_check CHECK(channel IN('storefront','quick_order'));
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_kind_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_kind_check CHECK(movement_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer_out','transfer_in','transfer_return','checkout_sale'));
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_source_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_source_check CHECK(source_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer','checkout_sale'));
COMMIT;
