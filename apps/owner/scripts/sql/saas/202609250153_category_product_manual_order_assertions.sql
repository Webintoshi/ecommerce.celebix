DO $assertions$
DECLARE read_function regprocedure:=
  'saas.catalog_get_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure;
  write_function regprocedure:=
  'saas.catalog_reorder_category_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid[])'::regprocedure;
  recovery_function regprocedure:=
  'saas.catalog_recover_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'::regprocedure;
  write_source text;
BEGIN
  SELECT proc.prosrc INTO write_source FROM pg_catalog.pg_proc AS proc WHERE proc.oid=write_function;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.catalog_product_categories'::regclass
      AND attname='storefront_position' AND NOT attisdropped)
    OR pg_catalog.to_regclass('saas.catalog_category_product_order_state') IS NULL
    OR pg_catalog.to_regclass('saas.catalog_category_product_order_operations') IS NULL
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',read_function,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',write_function,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',recovery_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',read_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',write_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',recovery_function,'EXECUTE')
    OR pg_catalog.strpos(write_source,'FOR UPDATE OF assignment,product')=0
    OR pg_catalog.strpos(write_source,'order_membership_changed')=0
    OR pg_catalog.strpos(write_source,'current_version<>p_expected_version')=0
  THEN RAISE EXCEPTION 'CATEGORY_PRODUCT_MANUAL_ORDER_ASSERTION_FAILED'; END IF;
END $assertions$;
