BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.barcode_label_operations
    WHERE operation_kind='reserve_internal'
      AND result_payload->>'barcode' ~ '^(98|99)[0-9]{11}$'
  ) OR EXISTS(
    SELECT 1 FROM saas.barcode_label_operations AS operation
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      CASE WHEN pg_catalog.jsonb_typeof(operation.result_payload->'succeeded')='array'
        THEN operation.result_payload->'succeeded' ELSE '[]'::jsonb END
    ) AS result_row
    WHERE operation.operation_kind='generate_internal'
      AND result_row->>'barcode' ~ '^(98|99)[0-9]{11}$'
  ) THEN RAISE EXCEPTION 'internal_ean13_barcodes_must_be_cleared_before_downgrade'; END IF;
END
$guard$;

DROP FUNCTION saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb);
DROP FUNCTION saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.barcode_label_next_ean13_internal(uuid);
DROP INDEX saas.barcode_label_operations_store_ean13_reservation_key;
DROP INDEX saas.product_variants_store_ean13_internal_barcode_key;
COMMIT;
