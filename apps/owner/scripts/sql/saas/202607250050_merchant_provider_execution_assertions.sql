DO $assertions$
DECLARE status_definition text; shape_definition text; profile_fk text;
  claim_source text; heartbeat_source text; finalize_source text; reconcile_source text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname='merchant_provider_workflow_operations'
      AND relation.relrowsecurity AND relation.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'PROVIDER_WORKFLOW_OPERATION_RLS_MISSING'; END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_provider_jobs','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.merchant_provider_jobs','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.merchant_provider_workflow_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.merchant_provider_workflow_operations','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'PROVIDER_EXECUTION_DIRECT_DML'; END IF;

  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'celebix_saas_workflow',
    'saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'PROVIDER_QUEUE_ROLE_DRIFT'; END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_claim(text,timestamp with time zone,timestamp with time zone,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_heartbeat(uuid,text,uuid,timestamp with time zone,timestamp with time zone,bigint)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_finalize(uuid,text,uuid,timestamp with time zone,bigint,text,text,text,text)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_reconcile(uuid,text,uuid,timestamp with time zone,bigint,text,text,text,text)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow','saas.merchant_provider_recover_workflow_operation(uuid,text)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_provider_claim(text,timestamp with time zone,timestamp with time zone,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'PROVIDER_WORKFLOW_ROLE_DRIFT'; END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid) INTO status_definition
  FROM pg_catalog.pg_constraint WHERE conrelid='saas.merchant_provider_jobs'::regclass
    AND conname='merchant_provider_jobs_status_check';
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO shape_definition
  FROM pg_catalog.pg_constraint WHERE conrelid='saas.merchant_provider_jobs'::regclass
    AND conname='merchant_provider_jobs_execution_shape_check';
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO profile_fk
  FROM pg_catalog.pg_constraint WHERE conrelid='saas.merchant_provider_jobs'::regclass
    AND conname='merchant_provider_jobs_profile_fk';
  IF status_definition IS NULL OR status_definition NOT LIKE '%provider_outcome_unknown%'
    OR status_definition NOT LIKE '%reconciliation_required%' OR status_definition NOT LIKE '%succeeded%'
    OR shape_definition IS NULL OR shape_definition NOT LIKE '%lease_id%'
    OR shape_definition NOT LIKE '%finished_at%' OR shape_definition NOT LIKE '%safe_provider_reference%'
    OR profile_fk IS NULL OR profile_fk NOT LIKE '%store_id, profile_id, provider_code%'
  THEN RAISE EXCEPTION 'PROVIDER_EXECUTION_CONSTRAINT_DRIFT'; END IF;

  IF pg_catalog.to_regclass('saas.merchant_provider_jobs_one_live_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_jobs_lease_id_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_jobs_claim_idx') IS NULL
  THEN RAISE EXCEPTION 'PROVIDER_EXECUTION_INDEX_MISSING'; END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid)'::regprocedure
  ) INTO claim_source;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.merchant_provider_heartbeat(uuid,text,uuid,timestamptz,timestamptz,bigint)'::regprocedure
  ) INTO heartbeat_source;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text)'::regprocedure
  ) INTO finalize_source;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text)'::regprocedure
  ) INTO reconcile_source;
  IF claim_source !~ 'FOR UPDATE OF candidate SKIP LOCKED'
    OR claim_source ~ 'status IN \(''provider_outcome_unknown'''
    OR heartbeat_source !~ 'job.lease_id<>p_lease_id'
    OR finalize_source !~ 'job.lease_id<>p_lease_id'
    OR finalize_source !~ 'merchant_provider_workflow_operations'
    OR reconcile_source !~ 'provider_outcome_unknown'
    OR reconcile_source !~ 'reconciliation_required'
  THEN RAISE EXCEPTION 'PROVIDER_EXECUTION_FUNCTION_DRIFT'; END IF;

  IF pg_catalog.to_regprocedure('saas.guard_merchant_provider_credential_in_use()') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_provider_capability_for_kind(text)') IS NULL
  THEN RAISE EXCEPTION 'PROVIDER_CREDENTIAL_BINDING_GUARD_MISSING'; END IF;
END
$assertions$;
