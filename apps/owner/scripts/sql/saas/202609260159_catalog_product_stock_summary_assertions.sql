BEGIN READ ONLY;
DO $assert$
DECLARE signature text;fn pg_proc%ROWTYPE;is_public boolean;definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'saas.catalog_checked_product_stock_summary(bigint,bigint,numeric)',
    'saas.catalog_product_stock_summary(uuid,uuid)',
    'saas.catalog_list_products_unpriced_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid)',
    'saas.catalog_list_products_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid)',
    'saas.catalog_get_dashboard_summary_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)'
  ] LOOP
    SELECT * INTO fn FROM pg_proc WHERE oid=to_regprocedure(signature);
    is_public:=signature LIKE 'saas.catalog_list_products_v5(%' OR signature LIKE 'saas.catalog_get_dashboard_summary_v2(%';
    IF NOT FOUND OR fn.proowner<>('celebix_saas_owner'::regrole)::oid OR NOT fn.prosecdef
      OR NOT ('search_path=pg_catalog,saas'=ANY(fn.proconfig) OR 'search_path=pg_catalog, saas'=ANY(fn.proconfig))
      OR has_function_privilege('celebix_saas_app',fn.oid,'EXECUTE') IS DISTINCT FROM is_public
      OR EXISTS(SELECT 1 FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_AUTHORITY_INVALID: %',signature;END IF;
    definition:=pg_get_functiondef(fn.oid);
    IF signature LIKE '%unpriced_v5(%' AND (definition NOT LIKE '%saas.catalog_product_stock_summary(p_store_id,product.id)%' OR definition NOT LIKE '%''productStock'', page.product_stock%' OR definition NOT LIKE '%''stockQuantity'', page.variant_stock_quantity%' OR definition NOT LIKE '%saas.catalog_authority_error(%') THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_LIST_INVALID';END IF;
    IF signature LIKE 'saas.catalog_product_stock_summary(%' AND (definition NOT LIKE '%variant.status=''active''%' OR definition NOT LIKE '%stock_quantity::numeric%' OR definition NOT LIKE '%catalog_checked_product_stock_summary%') THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_AGGREGATE_INVALID';END IF;
  END LOOP;
  IF to_regprocedure('saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid)') IS NULL OR to_regprocedure('saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)') IS NULL THEN RAISE EXCEPTION 'CATALOG_PRODUCT_STOCK_LEGACY_READ_MISSING';END IF;
END $assert$;
ROLLBACK;
