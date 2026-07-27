DO $f$
DECLARE table_name text; status_definition text; pair_definition text; prepare_source text; cancel_source text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['merchant_provider_jobs','merchant_provider_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_RLS_MISSING:%',table_name; END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'INSERT') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'UPDATE') OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'DELETE') THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_DIRECT_WRITE:%',table_name; END IF;
 END LOOP;
 IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','EXECUTE') OR
    NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_provider_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text)','EXECUTE') OR
    NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_provider_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_APP_API_MISSING'; END IF;
 IF pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_WORKFLOW_ESCALATION'; END IF;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO status_definition FROM pg_catalog.pg_constraint WHERE conrelid='saas.merchant_provider_jobs'::regclass AND conname='merchant_provider_jobs_status_check';
 IF status_definition IS NULL OR status_definition NOT LIKE '%awaiting_provider_activation%' OR status_definition NOT LIKE '%cancelled%' OR status_definition ~* 'success|complete|sent|delivered|synchroni[sz]ed|reconciled|indexed' THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_FALSE_SUCCESS_STATUS'; END IF;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO pair_definition FROM pg_catalog.pg_constraint WHERE conrelid='saas.merchant_provider_jobs'::regclass AND conname='merchant_provider_jobs_kind_action_check';
 IF pair_definition IS NULL OR
    pair_definition NOT LIKE '%marketplace_connection%' OR pair_definition NOT LIKE '%synchronization%' OR
    pair_definition NOT LIKE '%invoice_integration%' OR pair_definition NOT LIKE '%reconciliation%' OR
    pair_definition NOT LIKE '%indexing_request%' OR pair_definition NOT LIKE '%indexing%'
 THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_KIND_ACTION_DRIFT'; END IF;
 IF pg_catalog.to_regprocedure('saas.merchant_provider_config_ready(text,jsonb)') IS NULL OR pg_catalog.to_regclass('saas.merchant_provider_jobs_one_waiting_idx') IS NULL THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_AUTHORITY_MISSING'; END IF;
 SELECT pg_catalog.pg_get_functiondef('saas.merchant_provider_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text)'::regprocedure) INTO prepare_source;
 SELECT pg_catalog.pg_get_functiondef('saas.merchant_provider_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text)'::regprocedure) INTO cancel_source;
 IF prepare_source !~ 'pg_advisory_xact_lock' OR cancel_source !~ 'pg_advisory_xact_lock' OR
    pg_catalog.strpos(prepare_source,'pg_advisory_xact_lock')>=pg_catalog.strpos(prepare_source,'FROM saas.merchant_provider_operations') OR
    pg_catalog.strpos(cancel_source,'pg_advisory_xact_lock')>=pg_catalog.strpos(cancel_source,'FROM saas.merchant_provider_operations') THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_OPERATION_SERIALIZATION_MISSING'; END IF;
END $f$;
