\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $shared_merchant_catalog_dashboard_assertions$
DECLARE
  summary_function regprocedure := 'saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)'::regprocedure;
  function_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(summary_function)
    INTO function_definition;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = summary_function
      AND owner.rolname = 'celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN
    RAISE EXCEPTION 'SHARED_MERCHANT_CATALOG_DASHBOARD_FUNCTION_AUTHORITY_INVALID';
  END IF;

  IF pg_catalog.has_function_privilege('public', summary_function, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', summary_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'SHARED_MERCHANT_CATALOG_DASHBOARD_FUNCTION_ACL_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_app', 'saas.products', 'SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_variants', 'SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_media', 'SELECT') THEN
    RAISE EXCEPTION 'SHARED_MERCHANT_CATALOG_DASHBOARD_DIRECT_SELECT_PRESENT';
  END IF;

  IF function_definition !~ 'catalog_authority_error'
     OR function_definition !~ 'product[.]store_id = p_store_id'
     OR function_definition !~ 'variant[.]store_id = p_store_id'
     OR function_definition !~ 'media[.]store_id = p_store_id'
     OR function_definition !~ 'product[.]status <> ''archived'''
     OR function_definition !~ 'variant[.]status = ''active'''
     OR function_definition !~ 'media[.]status = ''active'''
     OR function_definition !~ 'NOT EXISTS' THEN
    RAISE EXCEPTION 'SHARED_MERCHANT_CATALOG_DASHBOARD_SCOPE_INVALID';
  END IF;
END
$shared_merchant_catalog_dashboard_assertions$;

ROLLBACK;
