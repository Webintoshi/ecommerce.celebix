DO $assertions$
DECLARE definition text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'catalog_bulk_mutate_products missing';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)')) INTO definition;
  IF definition NOT LIKE '%SECURITY DEFINER%' OR definition NOT LIKE '%SET search_path TO ''pg_catalog'', ''saas''%' THEN
    RAISE EXCEPTION 'catalog bulk security boundary drift';
  END IF;
  IF definition NOT LIKE '%ORDER BY product.id%' OR definition NOT LIKE '%FOR UPDATE OF product%' THEN
    RAISE EXCEPTION 'catalog bulk deterministic lock drift';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc AS procedure CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege WHERE procedure.oid='saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)'::regprocedure AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'catalog bulk public execute';
  END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'catalog bulk app execute missing';
  END IF;
  IF pg_catalog.to_regprocedure('saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)') IS NULL OR pg_catalog.to_regprocedure('saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)') IS NULL THEN RAISE EXCEPTION 'catalog safe removal functions missing'; END IF;
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid)')) INTO definition;
  IF definition NOT LIKE '%pg_constraint%' OR definition NOT LIKE '%business_dependency%' OR definition NOT LIKE '%SECURITY DEFINER%' THEN RAISE EXCEPTION 'catalog safe removal eligibility drift'; END IF;
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)')) INTO definition;
  IF definition NOT LIKE '%catalog_product_removal_eligibility%' OR definition NOT LIKE '%FOR UPDATE%' OR definition NOT LIKE '%removal_not_eligible%' THEN RAISE EXCEPTION 'catalog safe removal recheck drift'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc AS procedure CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege WHERE procedure.oid='saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)'::regprocedure AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE') OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'catalog safe removal ACL drift'; END IF;
END
$assertions$;
