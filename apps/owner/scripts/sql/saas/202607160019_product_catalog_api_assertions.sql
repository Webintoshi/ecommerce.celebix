\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3a2_product_catalog_api_assertions$
DECLARE
  detail_function regprocedure := 'saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)'::regprocedure;
  function_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(detail_function)
    INTO function_definition;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE procedure.oid = detail_function
      AND owner.rolname = 'celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN
    RAISE EXCEPTION 'PHASE3A2_DETAIL_FUNCTION_AUTHORITY_INVALID';
  END IF;

  IF pg_catalog.has_function_privilege('public', detail_function, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', detail_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE3A2_DETAIL_FUNCTION_ACL_INVALID';
  END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_app', 'saas.products', 'SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_variants', 'SELECT') THEN
    RAISE EXCEPTION 'PHASE3A2_DIRECT_CATALOG_SELECT_PRESENT';
  END IF;

  IF function_definition !~ 'catalog_authority_error'
     OR function_definition !~ 'product[.]store_id = p_store_id'
     OR function_definition !~ 'product[.]status <> ''archived'''
     OR function_definition !~ 'variant[.]product_id = p_product_id'
     OR function_definition !~ 'variant[.]store_id = p_store_id'
     OR function_definition !~ 'variant[.]created_at ASC, variant[.]id ASC' THEN
    RAISE EXCEPTION 'PHASE3A2_DETAIL_FUNCTION_SCOPE_INVALID';
  END IF;
END
$phase3a2_product_catalog_api_assertions$;

ROLLBACK;
