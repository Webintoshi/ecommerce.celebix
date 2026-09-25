BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.product_variants WHERE barcode ~ '^97[0-9]{7}$')
    OR EXISTS (SELECT 1 FROM saas.barcode_label_operations WHERE result_payload::text ~ '97[0-9]{7}')
  THEN RAISE EXCEPTION 'numeric_internal_barcodes_must_be_cleared_before_downgrade'; END IF;
END
$guard$;
DROP FUNCTION saas.barcode_label_generate_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb);
DROP FUNCTION saas.barcode_label_reserve_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.barcode_label_next_numeric_internal(uuid,timestamptz);
DROP INDEX saas.product_variants_store_numeric_internal_barcode_key;
COMMIT;
