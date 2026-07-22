DO $f$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['merchant_admin_records','merchant_admin_events','merchant_admin_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'MERCHANT_ADMIN_RLS_MISSING:%',table_name; END IF;
  IF has_table_privilege('celebix_saas_app','saas.'||table_name,'INSERT') OR has_table_privilege('celebix_saas_app','saas.'||table_name,'UPDATE') OR has_table_privilege('celebix_saas_app','saas.'||table_name,'DELETE') THEN RAISE EXCEPTION 'MERCHANT_ADMIN_DIRECT_WRITE:%',table_name; END IF;
 END LOOP;
 IF to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL OR to_regprocedure('saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamp with time zone)') IS NULL THEN RAISE EXCEPTION 'MERCHANT_ADMIN_API_MISSING'; END IF;
 IF has_function_privilege('celebix_saas_app','saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_ADMIN_WORKFLOW_LEAK'; END IF;
 IF NOT has_function_privilege('celebix_saas_workflow','saas.merchant_admin_record_event(uuid,uuid,uuid,text,jsonb,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_ADMIN_WORKFLOW_MISSING'; END IF;
END $f$;
