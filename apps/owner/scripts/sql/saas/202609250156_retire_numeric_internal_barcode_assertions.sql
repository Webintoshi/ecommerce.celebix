DO $assertions$
BEGIN
  IF pg_catalog.to_regprocedure('saas.barcode_label_next_numeric_internal(uuid,timestamptz)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_reserve_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_generate_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_next_ean13_internal(uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)') IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname='saas' AND indexname='product_variants_store_numeric_internal_barcode_key'
    )
  THEN RAISE EXCEPTION 'numeric_internal_barcode_retirement_invalid'; END IF;
END
$assertions$;
