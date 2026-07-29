BEGIN;

DO $phase3a4_assertions$
DECLARE
  table_name text;
  function_name text;
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 16 THEN
    RAISE EXCEPTION 'PHASE3A4_POSTGRESQL_MAJOR_INVALID';
  END IF;

  FOREACH table_name IN ARRAY ARRAY['store_domains','product_media','product_media_operations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname=table_name
        AND relation.relrowsecurity AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner)='celebix_saas_owner'
    ) THEN RAISE EXCEPTION 'PHASE3A4_TABLE_AUTHORITY_INVALID: %',table_name; END IF;
    IF has_table_privilege('public','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('celebix_saas_host_resolver','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'PHASE3A4_DIRECT_TABLE_PRIVILEGE_INVALID: %',table_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='saas' AND indexname='store_domains_one_active_primary_idx' AND indexdef LIKE '%WHERE ((status = ''active''::text) AND is_primary)%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='saas' AND indexname='product_media_active_order_key') THEN
    RAISE EXCEPTION 'PHASE3A4_PARTIAL_INDEX_INVALID';
  END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'resolve_public_storefront(text,timestamp with time zone)',
    'public_list_products(uuid,text,timestamp with time zone,integer)',
    'public_get_product_by_slug(uuid,text,timestamp with time zone,text)',
    'public_list_product_media(uuid,text,timestamp with time zone,uuid)'
  ] LOOP
    IF has_function_privilege('public','saas.'||function_name,'EXECUTE')
       OR NOT has_function_privilege('celebix_saas_host_resolver','saas.'||function_name,'EXECUTE')
       OR has_function_privilege('celebix_saas_app','saas.'||function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3A4_PUBLIC_FUNCTION_GRANT_INVALID: %',function_name;
    END IF;
  END LOOP;

  FOREACH function_name IN ARRAY ARRAY[
    'media_attach_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint)',
    'media_list_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)',
    'media_update_alt(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text)',
    'media_reorder_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[])',
    'media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)'
  ] LOOP
    IF has_function_privilege('public','saas.'||function_name,'EXECUTE')
       OR NOT has_function_privilege('celebix_saas_app','saas.'||function_name,'EXECUTE')
       OR has_function_privilege('celebix_saas_host_resolver','saas.'||function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3A4_MEDIA_FUNCTION_GRANT_INVALID: %',function_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='saas'
      AND procedure.proname IN ('resolve_public_storefront','public_list_products','public_get_product_by_slug','public_list_product_media','media_attach_product','media_list_product','media_update_alt','media_reorder_product','media_archive_product')
      AND (NOT procedure.prosecdef OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR pg_catalog.pg_get_userbyid(procedure.proowner)<>'celebix_saas_owner')
  ) THEN RAISE EXCEPTION 'PHASE3A4_FUNCTION_SECURITY_INVALID'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.store_domains'::regclass AND tgname='store_domains_authority_guard' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.product_media'::regclass AND tgname='product_media_authority_guard' AND tgenabled='O')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.product_media_operations'::regclass AND tgname='product_media_operations_immutable' AND tgenabled='O') THEN
    RAISE EXCEPTION 'PHASE3A4_TRIGGER_INVALID';
  END IF;

  IF (SELECT rolsuper OR rolbypassrls OR rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_host_resolver') THEN
    RAISE EXCEPTION 'PHASE3A4_PUBLIC_ROLE_INVALID';
  END IF;
END
$phase3a4_assertions$;

SELECT 'PHASE3A4_PILOT_STOREFRONT_ASSERTIONS_PASS' AS result;
ROLLBACK;
