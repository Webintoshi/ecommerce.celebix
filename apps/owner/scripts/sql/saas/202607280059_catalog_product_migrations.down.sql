-- Disposable rollback for tenant catalog product migration authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $function$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_product_migration_jobs)
     OR EXISTS(SELECT 1 FROM saas.catalog_product_migration_items)
     OR EXISTS(SELECT 1 FROM saas.catalog_product_migration_media_items)
     OR EXISTS(SELECT 1 FROM saas.catalog_product_migration_operations)
  THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ROLLBACK_REQUIRES_EMPTY_TABLES'; END IF;
END
$function$;

DROP FUNCTION saas.catalog_migration_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_migration_get(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_migration_import_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb);
DROP FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb);
DROP FUNCTION saas.catalog_migration_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.catalog_migration_projection(uuid,uuid,boolean);
DROP FUNCTION saas.catalog_migration_json_exact(jsonb,text[],text[]);
DROP TABLE saas.catalog_product_migration_operations;
DROP TABLE saas.catalog_product_migration_media_items;
DROP TABLE saas.catalog_product_migration_items;
DROP TABLE saas.catalog_product_migration_jobs;
DROP FUNCTION saas.guard_catalog_product_migration_media_item();
DROP FUNCTION saas.guard_catalog_product_migration_job();
DROP FUNCTION saas.guard_catalog_product_migration_item();
DROP FUNCTION saas.guard_catalog_product_migration_operation();

ALTER TABLE saas.products DROP CONSTRAINT products_description_check;
ALTER TABLE saas.products ADD CONSTRAINT products_description_check CHECK(
  description IS NULL OR (
    description=pg_catalog.btrim(description)
    AND pg_catalog.char_length(description) BETWEEN 1 AND 10000
    AND description!~'[[:cntrl:]]'
  )
);

COMMIT;
