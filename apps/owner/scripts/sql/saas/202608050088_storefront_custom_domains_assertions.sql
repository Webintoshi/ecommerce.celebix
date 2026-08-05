DO $storefront_custom_domains_assertions$
DECLARE missing_functions integer; table_grants integer;
BEGIN
  IF pg_catalog.to_regclass('saas.store_domain_provisioning') IS NULL
     OR pg_catalog.to_regclass('saas.store_domain_operations') IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_TABLES_MISSING';
  END IF;
  SELECT count(*) INTO missing_functions FROM (VALUES
    ('saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'::regprocedure),
    ('saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)'::regprocedure),
    ('saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,text,jsonb,jsonb)'::regprocedure),
    ('saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)'::regprocedure),
    ('saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)'::regprocedure),
    ('saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)'::regprocedure),
    ('saas.store_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)'::regprocedure),
    ('saas.store_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)'::regprocedure),
    ('saas.store_domain_work_fail(uuid,uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)'::regprocedure),
    ('saas.resolve_public_storefront(text,timestamp with time zone)'::regprocedure)
  ) AS expected(proc) WHERE expected.proc IS NULL;
  IF missing_functions <> 0 THEN RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_FUNCTIONS_MISSING'; END IF;
  SELECT count(*) INTO table_grants FROM information_schema.role_table_grants
    WHERE table_schema='saas' AND table_name IN('store_domain_provisioning','store_domain_operations')
      AND grantee IN('celebix_saas_app','celebix_saas_workflow');
  IF table_grants <> 0 THEN RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_TABLE_GRANT_LEAK'; END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.store_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_WORKFLOW_GRANT_MISSING';
  END IF;
  IF pg_catalog.strpos(COALESCE((
    SELECT procedure.prosrc
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.resolve_public_storefront(text,timestamp with time zone)'::regprocedure
  ),''),'''canonicalUrl'',''https://''||primary_domain.hostname||''/''')=0 THEN
    RAISE EXCEPTION 'STOREFRONT_CUSTOM_DOMAINS_CANONICAL_AUTHORITY_INVALID';
  END IF;
END
$storefront_custom_domains_assertions$;
