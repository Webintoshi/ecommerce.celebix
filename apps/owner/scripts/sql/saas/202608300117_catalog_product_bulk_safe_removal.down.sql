BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_operations WHERE operation_kind IN ('bulk_mutate_products','remove_product')) THEN
    RAISE EXCEPTION 'CATALOG_117_DOWN_REQUIRES_PRE_RESTORE';
  END IF;
END
$guard$;

DROP FUNCTION saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb);

ALTER TABLE saas.catalog_operations
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product','restore_product',
    'create_variant','update_variant','archive_variant'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product','restore_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product','restore_product') AND result_variant_id IS NULL)
  ),
  ALTER COLUMN result_product_id SET NOT NULL;

COMMIT;
