BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.product_tax.release268',0));
DO $safe$DECLARE r saas.product_tax268_backup;BEGIN
 IF EXISTS(SELECT 1 FROM saas.products WHERE tax_treatment IS NOT NULL OR tax_rate_bps IS NOT NULL)OR EXISTS(SELECT 1 FROM saas.product_variants WHERE tax_treatment IS NOT NULL OR tax_rate_bps IS NOT NULL)OR EXISTS(SELECT 1 FROM saas.product_tax_prepared)OR EXISTS(SELECT 1 FROM saas.product_tax_order_revisions)OR EXISTS(SELECT 1 FROM saas.product_tax_recognition)THEN RAISE EXCEPTION 'PRODUCT_TAX268_COMMITTED_DATA';END IF;
 FOR r IN SELECT * FROM saas.product_tax268_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'PRODUCT_TAX268_DOWN_SOURCE_DRIFT';END IF;EXECUTE r.definition;
 END LOOP;
END $safe$;
DROP TRIGGER product_tax_prepare ON saas.storefront_hosted_checkout_sessions;
DROP TRIGGER product_tax_prepare ON saas.in_store_price_snapshots;
DROP TRIGGER product_tax_prepare ON saas.quick_order_hosted_payment_bridges;
DROP TRIGGER product_tax_prepare ON saas.checkout_payment_attempts;
DROP TRIGGER product_tax_order_created ON saas.order_events;
DROP TRIGGER product_tax_edit_revision ON saas.order_edit_revisions;
DROP TRIGGER product_tax_recognition ON saas.accounting_events;
DROP TRIGGER product_tax_recognition ON saas.order_events;
DROP TRIGGER product_tax_recognition ON saas.trendyol_import_receipts;
DROP TRIGGER product_tax_recognition ON saas.storefront_hosted_checkout_sessions;
DROP TRIGGER product_tax_recognition ON saas.quick_order_hosted_payment_bridges;
DROP TRIGGER product_tax_recognition ON saas.checkout_payment_attempts;
DROP TRIGGER product_tax_recognition ON saas.in_store_sales;
DO $functions$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'product_tax_%'OR proname LIKE 'tax268_%'OR proname IN('catalog_effective_tax','catalog_tax_read','accounting_tax_report','catalog_create_product_with_tax','catalog_update_product_with_tax','catalog_create_variant_with_tax','catalog_update_variant_with_tax'))LOOP EXECUTE format('DROP FUNCTION %s',r.signature);END LOOP;END $functions$;
DROP TABLE saas.product_tax_prepared,saas.product_tax_order_revisions,saas.product_tax268_backup,saas.product_tax_release,saas.product_tax_recognition;
ALTER TABLE saas.products DROP CONSTRAINT products_tax_choice,DROP COLUMN tax_treatment,DROP COLUMN tax_rate_bps;
ALTER TABLE saas.product_variants DROP CONSTRAINT product_variants_tax_choice,DROP COLUMN tax_treatment,DROP COLUMN tax_rate_bps;
COMMIT;
