BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  sample_store uuid;
  candidate text;
  index_count integer;
BEGIN
  IF pg_catalog.to_regprocedure('saas.barcode_label_next_ean13_internal(uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)') IS NULL
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_next_ean13_internal(uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'internal_ean13_barcode_authority_invalid'; END IF;

  SELECT count(*) INTO index_count
  FROM pg_catalog.pg_class AS index_relation
  JOIN pg_catalog.pg_index AS definition ON definition.indexrelid=index_relation.oid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=index_relation.relnamespace
  WHERE namespace.nspname='saas' AND definition.indisunique
    AND definition.indpred IS NOT NULL
    AND (
      (index_relation.relname='product_variants_store_ean13_internal_barcode_key'
        AND definition.indrelid='saas.product_variants'::regclass)
      OR (index_relation.relname='barcode_label_operations_store_ean13_reservation_key'
        AND definition.indrelid='saas.barcode_label_operations'::regclass)
    );
  IF index_count<>2 THEN RAISE EXCEPTION 'internal_ean13_barcode_unique_indexes_missing'; END IF;

  SELECT id INTO sample_store FROM saas.stores ORDER BY id LIMIT 1;
  sample_store:=COALESCE(sample_store,'00000000-0000-4000-8000-000000000001'::uuid);
  FOR index_count IN 1..32 LOOP
    candidate:=saas.barcode_label_next_ean13_internal(sample_store);
    IF candidate!~'^(98|99)[0-9]{11}$'
      OR NOT saas.barcode_label_ean13_valid(candidate)
    THEN RAISE EXCEPTION 'internal_ean13_barcode_generated_invalid:%',candidate; END IF;
  END LOOP;
END
$assertions$;

COMMIT;
