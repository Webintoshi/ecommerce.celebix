BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $function$
DECLARE
  table_name text;
  function_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalog_product_migration_jobs',
    'catalog_product_migration_items',
    'catalog_product_migration_media_items',
    'catalog_product_migration_operations'
  ] LOOP
    IF pg_catalog.to_regclass('saas.'||table_name) IS NULL THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: missing table %',table_name;
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname=table_name
        AND relation.relrowsecurity AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner)='celebix_saas_owner'
    ) THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: table authority %',table_name; END IF;
    IF pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: direct app privilege %',table_name; END IF;
  END LOOP;

  FOREACH function_name IN ARRAY ARRAY[
    'saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,integer,jsonb,jsonb)',
    'saas.catalog_migration_import_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)',
    'saas.catalog_migration_authorize_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,integer,text)',
    'saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,text,text,uuid,text)',
    'saas.catalog_migration_get(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.catalog_migration_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(function_name) IS NULL
       OR pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(function_name)))<>'celebix_saas_owner'
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_name,'EXECUTE')
    THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: function authority %',function_name; END IF;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger
    WHERE trigger.tgrelid='saas.catalog_product_migration_operations'::regclass
      AND trigger.tgname='catalog_product_migration_operations_immutable' AND NOT trigger.tgisinternal
  ) THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: immutable operations'; END IF;

  IF EXISTS(
    SELECT 1 FROM information_schema.columns AS catalog_column
    WHERE catalog_column.table_schema='saas' AND catalog_column.table_name LIKE 'catalog_product_migration_%'
      AND catalog_column.column_name IN('source_url','raw_url','source_payload','tenant_context')
  ) THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ASSERTION_FAILED: forbidden durable source'; END IF;
END
$function$;

COMMIT;
