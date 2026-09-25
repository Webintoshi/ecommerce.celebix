BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_category_product_order_state)
    OR EXISTS(SELECT 1 FROM saas.catalog_category_product_order_operations)
    OR EXISTS(SELECT 1 FROM saas.catalog_product_categories WHERE storefront_position IS NOT NULL)
  THEN RAISE EXCEPTION 'CATEGORY_PRODUCT_ORDER_DATA_MUST_BE_PRESERVED'; END IF;
END $guard$;

DROP FUNCTION saas.catalog_recover_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_reorder_category_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[]);
DROP FUNCTION saas.catalog_get_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_category_product_order_projection(uuid,uuid);
DROP TABLE saas.catalog_category_product_order_operations;
DROP TABLE saas.catalog_category_product_order_state;
DROP INDEX saas.catalog_product_categories_storefront_order_idx;
ALTER TABLE saas.catalog_product_categories
  DROP CONSTRAINT catalog_product_categories_storefront_position_check;
ALTER TABLE saas.catalog_product_categories DROP COLUMN storefront_position;
COMMIT;
