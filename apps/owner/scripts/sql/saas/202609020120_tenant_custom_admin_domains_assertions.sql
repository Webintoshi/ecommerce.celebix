DO $admin_custom_domains_assertions$
DECLARE leaked integer;
BEGIN
  IF to_regclass('saas.admin_domain_operations') IS NULL THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_OPERATIONS_MISSING'; END IF;
  IF to_regprocedure('saas.merchant_admin_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
     OR to_regprocedure('saas.resolve_admin_domain_origin_health(text,timestamp with time zone)') IS NULL
     OR to_regprocedure('saas.admin_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)') IS NULL
     OR to_regprocedure('saas.admin_domain_work_complete(uuid,uuid,text,timestamp with time zone,text,text,text,text,text,timestamp with time zone)') IS NULL
     OR to_regprocedure('saas.admin_domain_work_fail(uuid,uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)') IS NULL THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_FUNCTIONS_MISSING'; END IF;
  SELECT count(*) INTO leaked FROM information_schema.role_table_grants WHERE table_schema='saas' AND table_name IN('admin_domains','admin_domain_operations') AND grantee IN('celebix_saas_app','celebix_saas_workflow');
  IF leaked<>0 THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_TABLE_GRANT_LEAK'; END IF;
  IF NOT has_function_privilege('celebix_saas_host_resolver','saas.resolve_public_admin_brand(text,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_RESOLVER_GRANT_MISSING'; END IF;
  IF NOT has_schema_privilege('celebix_saas_workflow','saas','USAGE')
     OR NOT has_function_privilege('celebix_saas_workflow','saas.admin_domain_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_WORKFLOW_GRANT_MISSING'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.admin_domains'::regclass AND conname='admin_domains_custom_primary_ready_check') THEN RAISE EXCEPTION 'ADMIN_CUSTOM_DOMAINS_PRIMARY_GUARD_MISSING'; END IF;
END
$admin_custom_domains_assertions$;
