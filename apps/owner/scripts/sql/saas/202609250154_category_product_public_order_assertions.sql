DO $assertions$
DECLARE category_function regprocedure:=
  'saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)'::regprocedure;
  catalog_function regprocedure:=
  'saas.public_catalog_query_v2(text,timestamp with time zone,text,text,text,text,integer,integer)'::regprocedure;
  category_source text;
  catalog_source text;
BEGIN
  SELECT proc.prosrc INTO category_source FROM pg_catalog.pg_proc proc WHERE proc.oid=category_function;
  SELECT proc.prosrc INTO catalog_source FROM pg_catalog.pg_proc proc WHERE proc.oid=catalog_function;
  IF pg_catalog.strpos(category_source,'relation.storefront_position')=0
    OR pg_catalog.strpos(category_source,'relation.category_id=selected_category.id')=0
    OR pg_catalog.strpos(category_source,'selected.storefront_position ASC NULLS LAST')=0
    OR pg_catalog.strpos(catalog_source,'assignment.category_id=selected_category')=0
    OR pg_catalog.strpos(catalog_source,'selected_category IS NOT NULL')=0
    OR pg_catalog.strpos(catalog_source,'page.storefront_position')=0
    OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',category_function,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',catalog_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',category_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',catalog_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',category_function,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',catalog_function,'EXECUTE')
  THEN RAISE EXCEPTION 'CATEGORY_PRODUCT_PUBLIC_ORDER_ASSERTION_FAILED'; END IF;
END $assertions$;
