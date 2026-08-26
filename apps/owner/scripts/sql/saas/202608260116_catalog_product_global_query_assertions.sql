BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  v1_function regprocedure := 'saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure;
  v2_function regprocedure := 'saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure;
  v3_function regprocedure := 'saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,text,text,uuid,uuid,uuid,text,integer,timestamp with time zone,text,uuid)'::regprocedure;
  search_key_function regprocedure := 'saas.catalog_product_search_key(text)'::regprocedure;
  title_sort_key_function regprocedure := 'saas.catalog_product_title_sort_key(text)'::regprocedure;
  v1_definition text;
  v2_definition text;
  v3_definition text;
  v3_security_definer boolean;
  v3_volatility "char";
  v3_configuration text[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v1_function) INTO v1_definition;
  IF v1_definition IS NULL
     OR pg_catalog.strpos(v1_definition, 'featuredImages') = 0
     OR pg_catalog.strpos(v1_definition, 'variantSummaries') <> 0
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', v1_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v1_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V1_COMPATIBILITY_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v2_function) INTO v2_definition;
  IF v2_definition IS NULL
     OR pg_catalog.strpos(v2_definition, '''variantSummaries''') = 0
     OR pg_catalog.strpos(v2_definition, '''catalogTotal''') <> 0
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', v2_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v2_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V2_COMPATIBILITY_INVALID';
  END IF;

  SELECT
    pg_catalog.pg_get_functiondef(v3_function),
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig
  INTO v3_definition, v3_security_definer, v3_volatility, v3_configuration
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = v3_function;

  IF v3_definition IS NULL
     OR NOT v3_security_definer
     OR v3_volatility <> 's'
     OR v3_configuration IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', v3_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v3_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', search_key_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', title_sort_key_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app', search_key_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app', title_sort_key_function, 'EXECUTE')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.products', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_variants', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.catalog_product_categories', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.catalog_admin_resources', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V3_AUTHORITY_INVALID';
  END IF;

  IF pg_catalog.strpos(v3_definition, 'product.store_id = p_store_id') = 0
     OR pg_catalog.strpos(v3_definition, 'searched_variant.store_id = p_store_id') = 0
     OR pg_catalog.strpos(v3_definition, 'catalog_product_categories') = 0
     OR pg_catalog.strpos(v3_definition, 'catalog_admin_resource_products') = 0
     OR pg_catalog.strpos(v3_definition, 'resource.resource_kind = ''brand''') = 0
     OR pg_catalog.strpos(v3_definition, 'resource.resource_kind = ''collection''') = 0
     OR pg_catalog.strpos(v3_definition, 'catalog_product_search_key') = 0
     OR pg_catalog.strpos(v3_definition, 'catalog_product_title_sort_key') = 0
     OR pg_catalog.strpos(v3_definition, 'page AS MATERIALIZED') = 0
     OR pg_catalog.strpos(v3_definition, 'LEFT JOIN LATERAL') = 0
     OR pg_catalog.strpos(v3_definition, '''catalogTotal''') = 0
     OR pg_catalog.strpos(v3_definition, '''cursorAnchor''') = 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V3_DEFINITION_INVALID';
  END IF;
END
$assertions$;

COMMIT;
