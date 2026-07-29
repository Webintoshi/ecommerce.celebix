BEGIN;

DO $assertions$
DECLARE
  list_function regprocedure := 'saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)'::regprocedure;
  definition text;
  is_security_definer boolean;
  volatility "char";
BEGIN
  SELECT pg_catalog.pg_get_functiondef(list_function), procedure.prosecdef, procedure.provolatile
  INTO definition, is_security_definer, volatility
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid = list_function;

  IF definition IS NULL
     OR pg_catalog.strpos(definition, 'featuredImages') = 0
     OR pg_catalog.strpos(definition, 'media.status = ''active''') = 0
     OR pg_catalog.strpos(definition, 'ORDER BY media.sort_order, media.id') = 0
     OR pg_catalog.strpos(definition, 'LIMIT 1') = 0 THEN
    RAISE EXCEPTION 'CATALOG_FEATURED_IMAGE_LIST_PROJECTION_MISSING';
  END IF;
  IF NOT is_security_definer OR volatility <> 's' THEN
    RAISE EXCEPTION 'CATALOG_FEATURED_IMAGE_LIST_FUNCTION_AUTHORITY_INVALID';
  END IF;
  IF pg_catalog.has_function_privilege('public', list_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_FEATURED_IMAGE_LIST_PUBLIC_EXECUTE';
  END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app', list_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'CATALOG_FEATURED_IMAGE_LIST_APP_EXECUTE_MISSING';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_app', 'saas.product_media', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'CATALOG_FEATURED_IMAGE_LIST_TABLE_PRIVILEGE_LEAK';
  END IF;
END
$assertions$;

COMMIT;
