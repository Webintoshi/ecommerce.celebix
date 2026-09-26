BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$ BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_categories WHERE image_asset_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM saas.catalog_category_order_operations)
  THEN RAISE EXCEPTION 'CATEGORY_IMAGE_AND_ORDER_DATA_MUST_BE_PRESERVED'; END IF;
END $guard$;
DROP FUNCTION saas.catalog_recover_category_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_reorder_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,jsonb);
DROP FUNCTION saas.catalog_category_projection(uuid,uuid);
ALTER FUNCTION saas.catalog_category_projection_without_images(uuid,uuid) RENAME TO catalog_category_projection;
DROP FUNCTION saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb);
ALTER FUNCTION saas.catalog_create_category_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) RENAME TO catalog_create_category;
GRANT EXECUTE ON FUNCTION saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) TO celebix_saas_app;
DROP FUNCTION saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb);
ALTER FUNCTION saas.catalog_update_category_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) RENAME TO catalog_update_category;
GRANT EXECUTE ON FUNCTION saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
DROP FUNCTION saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
ALTER FUNCTION saas.storefront_asset_archive_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) RENAME TO storefront_asset_archive;
GRANT EXECUTE ON FUNCTION saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
DROP FUNCTION saas.catalog_category_image_valid(jsonb);
DROP TABLE saas.catalog_category_order_operations;
DROP FUNCTION saas.guard_catalog_category_order_operation_mutation();
DROP INDEX saas.catalog_categories_image_asset_idx;
ALTER TABLE saas.catalog_categories DROP CONSTRAINT catalog_categories_image_asset_fk;
ALTER TABLE saas.catalog_categories DROP CONSTRAINT catalog_categories_image_pair_check;
ALTER TABLE saas.catalog_categories DROP COLUMN image_asset_id, DROP COLUMN image_alt_text;
COMMIT;
