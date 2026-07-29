BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE
  import_oid oid := 'saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'::regprocedure;
  preview_oid oid := 'saas.catalog_admin_authorize_feed_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'::regprocedure;
  import_source text;
  preview_source text;
BEGIN
  SELECT pg_catalog.lower(pg_catalog.pg_get_functiondef(import_oid)) INTO import_source;
  SELECT pg_catalog.lower(pg_catalog.pg_get_functiondef(preview_oid)) INTO preview_source;

  IF import_source NOT LIKE '%security definer%'
    OR import_source NOT LIKE '%merchant_action_authority_error%catalog_admin.import%'
    OR import_source NOT LIKE '%catalog_authority_error%'
    OR import_source NOT LIKE '%pg_advisory_xact_lock%saas.catalog_admin.operation:%'
    OR import_source NOT LIKE '%pg_advisory_xact_lock%saas.catalog.store:%'
    OR import_source NOT LIKE '%jsonb_array_length(product.value->''variants'') not between 1 and 50%'
    OR import_source NOT LIKE '%variant_count not between 1 and 500%'
    OR import_source NOT LIKE '%catalog_attributes_are_valid%'
  THEN
    RAISE EXCEPTION 'CATALOG_RICH_IMPORT_AUTHORITY_INCOMPLETE';
  END IF;
  IF pg_catalog.strpos(import_source,'saas.catalog_admin.operation:') > pg_catalog.strpos(import_source,'select * into operation_row')
    OR pg_catalog.strpos(import_source,'saas.catalog.store:') > pg_catalog.strpos(import_source,'select pg_catalog.count(*) from saas.products')
  THEN
    RAISE EXCEPTION 'CATALOG_RICH_IMPORT_LOCK_ORDER_INVALID';
  END IF;
  IF preview_source NOT LIKE '%stable%'
    OR preview_source NOT LIKE '%security definer%'
    OR preview_source NOT LIKE '%merchant_action_authority_error%catalog_admin.import%'
    OR preview_source LIKE '%insert into%'
    OR preview_source LIKE '%update saas.%'
    OR preview_source LIKE '%delete from%'
  THEN
    RAISE EXCEPTION 'CATALOG_FEED_PREVIEW_AUTHORITY_INVALID';
  END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_app',import_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',preview_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',import_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',preview_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'CATALOG_RICH_IMPORT_EXECUTE_GRANT_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) acl
    WHERE procedure.oid IN (import_oid,preview_oid)
      AND acl.privilege_type='EXECUTE'
      AND acl.grantee NOT IN (procedure.proowner,'celebix_saas_app'::regrole)
  ) THEN
    RAISE EXCEPTION 'CATALOG_RICH_IMPORT_UNEXPECTED_EXECUTE_GRANT';
  END IF;
  IF pg_catalog.to_regprocedure('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)') IS NULL
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'CATALOG_IMPORT_V1_COMPATIBILITY_LOST';
  END IF;
END
$assertions$;
ROLLBACK;
