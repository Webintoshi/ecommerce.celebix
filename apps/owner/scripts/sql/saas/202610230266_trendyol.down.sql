BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release266',0));
DO $safe$DECLARE r saas.trendyol266_backup;BEGIN
 IF EXISTS(SELECT 1 FROM saas.trendyol_connections)OR EXISTS(SELECT 1 FROM saas.trendyol_orders)OR EXISTS(SELECT 1 FROM saas.trendyol_operations)THEN RAISE EXCEPTION 'TRENDYOL266_COMMITTED_DATA';END IF;
 FOR r IN SELECT * FROM saas.trendyol266_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'TRENDYOL266_DOWN_SOURCE_DRIFT';END IF;
  EXECUTE r.definition;
 END LOOP;
END $safe$;
DROP TRIGGER trendyol_order_guard ON saas.orders;
DROP TRIGGER trendyol_order_item_guard ON saas.order_items;
DROP TRIGGER trendyol_variant_changed ON saas.product_variants;
DROP TRIGGER trendyol_product_changed ON saas.products;
DO $triggers$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['price_lists','price_list_items','price_list_rules','pricing_reference_state','pricing_variant_policy_state','product_media','variant_media_links','variant_media_galleries','product_variant_gallery_state','catalog_variant_commerce_profiles','checkout_inventory_reservations','in_store_inventory_reservations','checkout_payment_attempts','quick_order_hosted_payment_bridges','storefront_hosted_checkout_sessions']LOOP EXECUTE format('DROP TRIGGER trendyol_price_changed ON saas.%I',t);END LOOP;END $triggers$;
DO $functions$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'trendyol_%'LOOP EXECUTE format('DROP FUNCTION %s',r.signature);END LOOP;END $functions$;
DROP TABLE saas.trendyol_catalog_dirty,saas.trendyol_price_boundaries,saas.trendyol_writer_context,saas.trendyol_stock_commitments,saas.trendyol_import_receipts,saas.trendyol_packages,saas.trendyol_orders,saas.trendyol_operations,saas.trendyol_jobs,saas.trendyol_listings,saas.trendyol_connections,saas.trendyol266_backup;
COMMIT;
