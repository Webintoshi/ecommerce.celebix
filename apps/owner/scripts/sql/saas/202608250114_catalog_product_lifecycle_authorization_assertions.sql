BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  function_name text;
  restore_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.product_variants'::pg_catalog.regclass
      AND attname='archived_by_product' AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'CATALOG_PRODUCT_RESTORE_INVALID'; END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'saas.catalog_create_product_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.catalog_update_product_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,text)',
    'saas.catalog_archive_product_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.catalog_create_variant_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.catalog_update_variant_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.catalog_archive_variant_authorized(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)'
  ] LOOP
    IF pg_catalog.to_regprocedure(function_name) IS NULL
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'CATALOG_PRODUCT_LIFECYCLE_ACL_INVALID';
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIFECYCLE_ACL_INVALID';
  END IF;

  restore_definition := pg_catalog.pg_get_functiondef(
    'saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::pg_catalog.regprocedure
  );
  IF pg_catalog.strpos(restore_definition, 'status=''draft''') = 0
     OR pg_catalog.strpos(restore_definition, 'archived_by_product=true') = 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_RESTORE_INVALID';
  END IF;

  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef(
       'saas.media_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)'::pg_catalog.regprocedure
     ), 'catalog_admin.manage') = 0
     OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(
       'saas.media_list_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)'::pg_catalog.regprocedure
     ), 'media_read_authority_error') = 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_MEDIA_AUTHORITY_INVALID';
  END IF;
END
$assertions$;

COMMIT;
