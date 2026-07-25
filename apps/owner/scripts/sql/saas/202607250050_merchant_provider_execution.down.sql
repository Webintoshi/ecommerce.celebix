BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.merchant_provider_jobs WHERE status NOT IN('awaiting_provider_activation','cancelled'))
    OR EXISTS(SELECT 1 FROM saas.merchant_provider_operations WHERE operation_kind='queue')
    OR EXISTS(SELECT 1 FROM saas.merchant_provider_workflow_operations)
  THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_EXECUTION_ROLLBACK_REQUIRES_DRAIN'; END IF;
END
$guard$;

REVOKE ALL ON FUNCTION
 saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint)
FROM celebix_saas_app;
REVOKE ALL ON FUNCTION
 saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid),
 saas.merchant_provider_heartbeat(uuid,text,uuid,timestamptz,timestamptz,bigint),
 saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_recover_workflow_operation(uuid,text)
FROM celebix_saas_workflow;

DROP FUNCTION saas.merchant_provider_recover_workflow_operation(uuid,text);
DROP FUNCTION saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text);
DROP FUNCTION saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text);
DROP FUNCTION saas.merchant_provider_heartbeat(uuid,text,uuid,timestamptz,timestamptz,bigint);
DROP FUNCTION saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid);
DROP FUNCTION saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint);

DROP TRIGGER merchant_provider_profile_credential_in_use ON saas.merchant_provider_profiles;
DROP FUNCTION saas.guard_merchant_provider_credential_in_use();
DROP TABLE saas.merchant_provider_workflow_operations;

DROP INDEX saas.merchant_provider_jobs_claim_idx;
DROP INDEX saas.merchant_provider_jobs_lease_id_idx;
DROP INDEX saas.merchant_provider_jobs_one_live_idx;

ALTER TABLE saas.merchant_provider_operations
  DROP CONSTRAINT merchant_provider_operations_operation_kind_check;
ALTER TABLE saas.merchant_provider_operations
  ADD CONSTRAINT merchant_provider_operations_operation_kind_check
  CHECK(operation_kind IN('prepare','cancel'));

ALTER TABLE saas.merchant_provider_jobs
  DROP CONSTRAINT merchant_provider_jobs_execution_shape_check,
  DROP CONSTRAINT merchant_provider_jobs_status_check,
  DROP CONSTRAINT merchant_provider_jobs_profile_fk,
  DROP CONSTRAINT merchant_provider_jobs_plan_fk,
  DROP COLUMN profile_id,
  DROP COLUMN provider_code,
  DROP COLUMN credential_version,
  DROP COLUMN plan_id,
  DROP COLUMN plan_code,
  DROP COLUMN plan_version,
  DROP COLUMN attempt_count,
  DROP COLUMN lease_id,
  DROP COLUMN lease_owner,
  DROP COLUMN lease_expires_at,
  DROP COLUMN safe_provider_reference,
  DROP COLUMN outcome_code,
  DROP COLUMN finished_at;
ALTER TABLE saas.merchant_provider_jobs ADD CONSTRAINT merchant_provider_jobs_status_check
  CHECK(status IN('awaiting_provider_activation','cancelled'));
CREATE UNIQUE INDEX merchant_provider_jobs_one_waiting_idx
  ON saas.merchant_provider_jobs(store_id,record_id,action_kind)
  WHERE status='awaiting_provider_activation';

ALTER TABLE saas.merchant_provider_profiles
  DROP CONSTRAINT merchant_provider_profiles_store_id_id_provider_code_key;

CREATE OR REPLACE FUNCTION saas.merchant_provider_job_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,'version',j.version,
   'requestedAt',saas.merchant_admin_timestamp(j.requested_at),
   'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_job_mutation_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,'version',j.version,
   'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_cancel(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_expected_version bigint,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing_operation saas.merchant_provider_operations%ROWTYPE; job saas.merchant_provider_jobs%ROWTYPE; result jsonb;
BEGIN
 IF saas.merchant_provider_action_for_kind(p_kind) IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO existing_operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=p_job_id AND record_kind=p_kind FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status<>'awaiting_provider_activation' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status='cancelled',version=version+1,cancelled_at=p_now,updated_at=p_now WHERE store_id=p_store_id AND id=p_job_id;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations VALUES(p_operation_id,p_store_id,'cancel',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'cancelled',result;
END $f$;

DROP FUNCTION saas.merchant_provider_capability_for_kind(text);

COMMIT;
