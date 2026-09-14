DO $assertions$
BEGIN
  IF to_regclass('saas.store_domain_replacements') IS NULL
     OR to_regprocedure('saas.store_domain_replacement_projection(uuid)') IS NULL
     OR to_regprocedure('saas.merchant_store_domain_replacement_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
     OR to_regprocedure('saas.merchant_store_domain_replacement_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,uuid,text,text)') IS NULL
     OR to_regclass('saas.store_domain_replacement_actions') IS NULL
     OR to_regprocedure('saas.merchant_store_domain_replacement_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL
     OR to_regprocedure('saas.merchant_store_domain_replacement_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL
     OR to_regprocedure('saas.merchant_store_domain_replacement_rollback(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL
     OR has_table_privilege('celebix_saas_app','saas.store_domain_replacements','SELECT')
     OR has_table_privilege('celebix_saas_app','saas.store_domain_replacement_actions','SELECT')
     OR NOT has_function_privilege('celebix_saas_app','saas.merchant_store_domain_replacement_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,uuid,text,text)','EXECUTE')
     OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='saas' AND indexname='store_domain_replacements_one_open_per_store_idx') THEN
    RAISE EXCEPTION 'STORE_DOMAIN_REPLACEMENT_ASSERTION_FAILED';
  END IF;
END
$assertions$;
