DO $assertions$
DECLARE definition text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'catalog_bulk_mutate_products missing';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)')) INTO definition;
  IF definition NOT LIKE '%SECURITY DEFINER%' OR definition NOT LIKE '%SET search_path TO pg_catalog, saas%' THEN
    RAISE EXCEPTION 'catalog bulk security boundary drift';
  END IF;
  IF definition NOT LIKE '%ORDER BY product.id%' OR definition NOT LIKE '%FOR UPDATE OF product%' THEN
    RAISE EXCEPTION 'catalog bulk deterministic lock drift';
  END IF;
  IF pg_catalog.has_function_privilege('PUBLIC','saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'catalog bulk public execute';
  END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'catalog bulk app execute missing';
  END IF;
END
$assertions$;
