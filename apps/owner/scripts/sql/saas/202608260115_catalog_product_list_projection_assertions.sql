BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  v1_function regprocedure := 'saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure;
  v2_function regprocedure := 'saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure;
  v1_definition text;
  v2_definition text;
  v2_security_definer boolean;
  v2_volatility "char";
  v2_configuration text[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v1_function)
  INTO v1_definition;
  IF v1_definition IS NULL
     OR pg_catalog.strpos(v1_definition, 'featuredImages') = 0
     OR pg_catalog.strpos(v1_definition, 'variantSummaries') <> 0
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', v1_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v1_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V1_COMPATIBILITY_INVALID';
  END IF;

  SELECT
    pg_catalog.pg_get_functiondef(v2_function),
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig
  INTO v2_definition, v2_security_definer, v2_volatility, v2_configuration
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = v2_function;

  IF v2_definition IS NULL
     OR NOT v2_security_definer
     OR v2_volatility <> 's'
     OR v2_configuration IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', v2_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', v2_function, 'EXECUTE')
     OR pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_variants', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V2_AUTHORITY_INVALID';
  END IF;

  IF pg_catalog.strpos(v2_definition, 'page AS MATERIALIZED') = 0
     OR pg_catalog.strpos(v2_definition, 'LEFT JOIN LATERAL') = 0
     OR pg_catalog.strpos(v2_definition, 'variant.product_id = page.id') = 0
     OR pg_catalog.strpos(v2_definition, 'variant.store_id = p_store_id') = 0
     OR pg_catalog.strpos(v2_definition, 'variant.status = ''active''') = 0
     OR pg_catalog.strpos(v2_definition, 'variant.created_at ASC, variant.id ASC') = 0
     OR pg_catalog.strpos(v2_definition, '''variantSummaries''') = 0 THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIST_V2_DEFINITION_INVALID';
  END IF;
END
$assertions$;

COMMIT;
