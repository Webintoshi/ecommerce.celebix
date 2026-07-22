DO $f$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'customers_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'customers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,bigint,timestamp with time zone,uuid)',
    'customers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'customers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb)',
    'customers_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'customers_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)',
    'customer_tags_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,uuid,text,text,bigint)',
    'customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])',
    'customers_export(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'
  ] LOOP
    IF pg_catalog.to_regprocedure('saas.'||signature) IS NULL THEN RAISE EXCEPTION 'CUSTOMER_API_SIGNATURE_MISSING:%',signature; END IF;
    IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.'||signature,'EXECUTE') THEN RAISE EXCEPTION 'CUSTOMER_API_GRANT_MISSING:%',signature; END IF;
  END LOOP;
  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.customers','SELECT') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.customers','INSERT') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.customers','UPDATE') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.customers','DELETE') THEN RAISE EXCEPTION 'CUSTOMER_DIRECT_TABLE_GRANT'; END IF;
  IF pg_catalog.pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure) NOT LIKE '%customers.archive%' THEN RAISE EXCEPTION 'CUSTOMER_ACTION_AUTHORITY_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'customer%' AND p.prosecdef AND p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]) THEN RAISE EXCEPTION 'CUSTOMER_SEARCH_PATH_DRIFT'; END IF;
END $f$;
