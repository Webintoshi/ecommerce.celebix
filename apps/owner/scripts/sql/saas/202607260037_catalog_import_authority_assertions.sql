BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$
DECLARE source text; function_oid oid;
BEGIN
  function_oid:='saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'::regprocedure;
  SELECT pg_catalog.lower(pg_catalog.pg_get_functiondef(function_oid)) INTO source;
  IF source NOT LIKE '%pg_advisory_xact_lock%saas.catalog_admin.operation:%' OR source NOT LIKE '%pg_advisory_xact_lock%saas.catalog.store:%' THEN RAISE EXCEPTION 'CATALOG_IMPORT_LOCKS_MISSING'; END IF;
  IF pg_catalog.strpos(source,'saas.catalog_admin.operation:')>pg_catalog.strpos(source,'select * into op') THEN RAISE EXCEPTION 'CATALOG_IMPORT_OPERATION_LOCK_ORDER_INVALID'; END IF;
  IF pg_catalog.strpos(source,'saas.catalog.store:')>pg_catalog.strpos(source,'select pg_catalog.count(*) from saas.products') THEN RAISE EXCEPTION 'CATALOG_IMPORT_STORE_LOCK_ORDER_INVALID'; END IF;
  IF source NOT LIKE '%saas.catalog_admin.operation:''||p_operation_id::text%' OR source LIKE '%saas.catalog_admin.operation:''||p_store_id::text%' OR source NOT LIKE '%where operation_id=p_operation_id;%' OR source NOT LIKE '%op.store_id is distinct from p_store_id%' THEN RAISE EXCEPTION 'CATALOG_IMPORT_GLOBAL_OPERATION_AUTHORITY_MISSING'; END IF;
  IF source NOT LIKE '%p_fingerprint is null%' OR source NOT LIKE '%p_rows is null%' OR source NOT LIKE '%jsonb_typeof(r->''title'')<>''string''%' OR source NOT LIKE '%jsonb_typeof(r->''slug'')<>''string''%' OR source NOT LIKE '%jsonb_typeof(r->''sku'') not in(''string'',''null'')%' OR source NOT LIKE '%char_length(r->>''slug'') not between 3 and 100%' OR source NOT LIKE '%pg_catalog.trunc((r->>''pricecents'')::numeric)%' OR source NOT LIKE '%pg_catalog.trunc((r->>''stockquantity'')::numeric)%' THEN RAISE EXCEPTION 'CATALOG_IMPORT_CANONICAL_ROW_VALIDATION_MISSING'; END IF;
  IF pg_catalog.has_function_privilege('public','saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'CATALOG_IMPORT_PUBLIC_EXECUTE'; END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'CATALOG_IMPORT_APP_EXECUTE_MISSING'; END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
    WHERE p.oid=function_oid
      AND acl.privilege_type='EXECUTE'
      AND acl.grantee NOT IN(p.proowner,'celebix_saas_app'::regrole)
  ) THEN RAISE EXCEPTION 'CATALOG_IMPORT_UNEXPECTED_EXECUTE_GRANT'; END IF;
END $f$;
ROLLBACK;
