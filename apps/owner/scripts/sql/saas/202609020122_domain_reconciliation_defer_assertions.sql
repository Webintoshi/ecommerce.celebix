DO $assertions$
DECLARE store_body text; admin_body text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.store_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.admin_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)') IS NULL
     OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.store_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.admin_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.store_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.admin_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)','EXECUTE') THEN
    RAISE EXCEPTION 'DOMAIN_RECONCILIATION_DEFER_ASSERTION_FAILED';
  END IF;
  store_body:=pg_catalog.pg_get_functiondef('saas.store_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)'::regprocedure);
  admin_body:=pg_catalog.pg_get_functiondef('saas.admin_domain_work_defer(uuid,uuid,text,timestamp with time zone,timestamp with time zone)'::regprocedure);
  IF store_body!~*'attempt_count[[:space:]]*=[[:space:]]*(pg_catalog\.)?greatest'
     OR admin_body!~*'attempt_count[[:space:]]*=[[:space:]]*(pg_catalog\.)?greatest'
     OR store_body~*'status[[:space:]]*=|verified_at[[:space:]]*=|hostname_status[[:space:]]*=|ssl_status[[:space:]]*=|dns_status[[:space:]]*=|origin_status[[:space:]]*=|last_provider_error_code[[:space:]]*='
     OR admin_body~*'status[[:space:]]*=|verified_at[[:space:]]*=|canonical[[:space:]]*=|hostname_status[[:space:]]*=|ssl_status[[:space:]]*=|dns_status[[:space:]]*=|origin_status[[:space:]]*=|last_provider_error_code[[:space:]]*=' THEN
    RAISE EXCEPTION 'DOMAIN_RECONCILIATION_DEFER_BODY_ASSERTION_FAILED';
  END IF;
END
$assertions$;
