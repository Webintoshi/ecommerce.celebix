BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE procedure_id regprocedure;
BEGIN
  procedure_id:=pg_catalog.to_regprocedure('saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)');
  IF procedure_id IS NULL OR NOT pg_catalog.has_function_privilege('celebix_saas_app',procedure_id,'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_BATCH_AUTHORITY_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.catalog_operations'::regclass AND conname='catalog_operations_kind_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%create_variant_batch%'
  ) OR pg_catalog.to_regprocedure('saas.catalog_variant_combination_key(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_BATCH_SCHEMA_MISSING';
  END IF;
END
$assertions$;

COMMIT;
