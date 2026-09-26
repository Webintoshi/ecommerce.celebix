-- Remove only the additive read versions; legacy definitions/data were never changed.
-- Roll back the application to legacy reads before removing these new entrypoints.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
DROP FUNCTION saas.catalog_list_products_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid);
DROP FUNCTION saas.catalog_get_dashboard_summary_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.catalog_list_products_unpriced_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid);
DROP FUNCTION saas.catalog_product_stock_summary(uuid,uuid);
DROP FUNCTION saas.catalog_checked_product_stock_summary(bigint,bigint,numeric);
COMMIT;
