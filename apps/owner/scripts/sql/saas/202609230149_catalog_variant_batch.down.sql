BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_operations WHERE operation_kind='create_variant_batch') THEN
    RAISE EXCEPTION 'catalog_variant_batch_has_durable_operations';
  END IF;
END
$guard$;

REVOKE ALL ON FUNCTION saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM celebix_saas_app;
DROP FUNCTION saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
DROP FUNCTION saas.catalog_variant_combination_key(jsonb);

ALTER TABLE saas.catalog_operations
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product','restore_product',
    'create_variant','update_variant','archive_variant','bulk_mutate_products','remove_product'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=262144
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product','restore_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
    AND result_payload ? 'products' = (operation_kind='bulk_mutate_products')
    AND result_payload ? 'removed' = (operation_kind='remove_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_product_id IS NOT NULL AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product','restore_product') AND result_product_id IS NOT NULL AND result_variant_id IS NULL)
    OR (operation_kind IN ('bulk_mutate_products','remove_product') AND result_product_id IS NULL AND result_variant_id IS NULL)
  );

COMMIT;
