DO $assertions$
DECLARE
  definition text;
BEGIN
  IF pg_catalog.to_regprocedure(
    'saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)'
  ) IS NULL THEN
    RAISE EXCEPTION 'catalog variant choice function is missing';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'public',
    'saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'catalog variant choice privileges are unsafe';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)'::pg_catalog.regprocedure
  ) INTO definition;

  IF pg_catalog.strpos(definition, 'SECURITY DEFINER') = 0
     OR pg_catalog.strpos(definition, 'catalog_authority_error') = 0
     OR pg_catalog.strpos(definition, 'product.store_id = p_store_id') = 0
     OR pg_catalog.strpos(definition, 'variant.store_id = product.store_id') = 0
     OR pg_catalog.strpos(definition, 'product.status = ''active''') = 0
     OR pg_catalog.strpos(definition, 'variant.status = ''active''') = 0
     OR pg_catalog.strpos(definition, 'choice_count > 5000') = 0 THEN
    RAISE EXCEPTION 'catalog variant choice authority or bound is incomplete';
  END IF;
END
$assertions$;
