-- Phase 3I provider execution lifecycle. No adapter, scheduler, route, or external connection is activated here.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.merchant_provider_profiles
  ADD CONSTRAINT merchant_provider_profiles_store_id_id_provider_code_key
  UNIQUE(store_id,id,provider_code);

ALTER TABLE saas.merchant_provider_jobs
  ADD COLUMN profile_id uuid,
  ADD COLUMN provider_code text,
  ADD COLUMN credential_version bigint,
  ADD COLUMN plan_id uuid,
  ADD COLUMN plan_code text,
  ADD COLUMN plan_version bigint,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lease_id uuid,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN safe_provider_reference text,
  ADD COLUMN outcome_code text,
  ADD COLUMN finished_at timestamptz,
  ADD CONSTRAINT merchant_provider_jobs_profile_fk
    FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  ADD CONSTRAINT merchant_provider_jobs_plan_fk
    FOREIGN KEY(plan_id) REFERENCES saas.plans(id) ON DELETE RESTRICT;

UPDATE saas.merchant_provider_jobs SET finished_at=cancelled_at WHERE status='cancelled';

ALTER TABLE saas.merchant_provider_jobs DROP CONSTRAINT merchant_provider_jobs_status_check;
ALTER TABLE saas.merchant_provider_jobs ADD CONSTRAINT merchant_provider_jobs_status_check
  CHECK(status IN(
    'awaiting_provider_activation','queued','leased','provider_outcome_unknown',
    'reconciliation_required','succeeded','retryable_failed',
    'permanently_failed','cancelled'
  ));
ALTER TABLE saas.merchant_provider_jobs ADD CONSTRAINT merchant_provider_jobs_execution_shape_check CHECK(
  attempt_count>=0
  AND ((profile_id IS NULL)=(provider_code IS NULL))
  AND ((profile_id IS NULL)=(credential_version IS NULL))
  AND ((profile_id IS NULL)=(plan_id IS NULL))
  AND ((profile_id IS NULL)=(plan_code IS NULL))
  AND ((profile_id IS NULL)=(plan_version IS NULL))
  AND (profile_id IS NULL OR (
    provider_code~'^[a-z][a-z0-9_]{0,63}$' AND credential_version>0
    AND plan_code=pg_catalog.btrim(plan_code) AND pg_catalog.char_length(plan_code) BETWEEN 1 AND 64
    AND plan_version>0
  ))
  AND (status NOT IN('queued','leased','provider_outcome_unknown','reconciliation_required','succeeded','retryable_failed','permanently_failed') OR profile_id IS NOT NULL)
  AND (status<>'awaiting_provider_activation' OR (profile_id IS NULL AND attempt_count=0))
  AND ((status='leased')=(lease_id IS NOT NULL))
  AND ((status='leased')=(lease_owner IS NOT NULL))
  AND ((status='leased')=(lease_expires_at IS NOT NULL))
  AND (lease_owner IS NULL OR (
    lease_owner=pg_catalog.btrim(lease_owner) AND pg_catalog.char_length(lease_owner) BETWEEN 1 AND 128
    AND lease_owner~'^[A-Za-z0-9._-]+$'
  ))
  AND (status<>'leased' OR attempt_count>0)
  AND ((status IN('provider_outcome_unknown','reconciliation_required','succeeded','retryable_failed','permanently_failed'))=(outcome_code IS NOT NULL))
  AND (outcome_code IS NULL OR outcome_code~'^[a-z][a-z0-9_]{0,63}$')
  AND (safe_provider_reference IS NULL OR (
    status IN('succeeded','reconciliation_required')
    AND safe_provider_reference=pg_catalog.btrim(safe_provider_reference)
    AND pg_catalog.char_length(safe_provider_reference) BETWEEN 1 AND 256
    AND safe_provider_reference!~'[[:cntrl:]]'
  ))
  AND ((status IN('provider_outcome_unknown','reconciliation_required','succeeded','retryable_failed','permanently_failed','cancelled'))=(finished_at IS NOT NULL))
  AND (finished_at IS NULL OR finished_at>=requested_at)
);

DROP INDEX saas.merchant_provider_jobs_one_waiting_idx;
CREATE UNIQUE INDEX merchant_provider_jobs_one_live_idx
  ON saas.merchant_provider_jobs(store_id,record_id,action_kind)
  WHERE status IN('awaiting_provider_activation','queued','leased','provider_outcome_unknown','reconciliation_required','retryable_failed');
CREATE UNIQUE INDEX merchant_provider_jobs_lease_id_idx
  ON saas.merchant_provider_jobs(lease_id) WHERE lease_id IS NOT NULL;
CREATE INDEX merchant_provider_jobs_claim_idx
  ON saas.merchant_provider_jobs(status,updated_at,requested_at,id);

ALTER TABLE saas.merchant_provider_operations
  DROP CONSTRAINT merchant_provider_operations_operation_kind_check;
ALTER TABLE saas.merchant_provider_operations
  ADD CONSTRAINT merchant_provider_operations_operation_kind_check
  CHECK(operation_kind IN('prepare','cancel','queue'));

CREATE TABLE saas.merchant_provider_workflow_operations(
  operation_id uuid NOT NULL,
  job_id uuid NOT NULL,
  operation_kind text NOT NULL,
  operation_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  UNIQUE(job_id,operation_fingerprint),
  FOREIGN KEY(job_id) REFERENCES saas.merchant_provider_jobs(id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('finalize','reconcile')),
  CHECK(operation_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768)
);
ALTER TABLE saas.merchant_provider_workflow_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_provider_workflow_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_provider_workflow_operations
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
CREATE TRIGGER merchant_provider_workflow_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.merchant_provider_workflow_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.merchant_provider_capability_for_kind(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE p_kind
  WHEN 'email_campaign' THEN 'email_delivery'
  WHEN 'phone_campaign' THEN 'phone_delivery'
  WHEN 'whatsapp_campaign' THEN 'whatsapp_delivery'
  WHEN 'marketplace_connection' THEN 'marketplace_sync'
  WHEN 'invoice_integration' THEN 'invoice_reconciliation'
  WHEN 'indexing_request' THEN 'indexing'
  ELSE NULL END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_job_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,
   'profileId',j.profile_id,'providerCode',j.provider_code,
   'credentialVersion',j.credential_version,'attempt',j.attempt_count,
   'safeProviderReference',j.safe_provider_reference,'outcomeCode',j.outcome_code,
   'version',j.version,
   'requestedAt',saas.merchant_admin_timestamp(j.requested_at),
   'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_job_mutation_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,
   'profileId',j.profile_id,'providerCode',j.provider_code,
   'credentialVersion',j.credential_version,'attempt',j.attempt_count,
   'safeProviderReference',j.safe_provider_reference,'outcomeCode',j.outcome_code,
   'version',j.version,'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE FUNCTION saas.merchant_provider_queue(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
 p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_expected_job_version bigint,
 p_profile_id uuid,p_expected_profile_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; operation saas.merchant_provider_operations%ROWTYPE;
  job saas.merchant_provider_jobs%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  expected_capability text; result jsonb;
BEGIN
 IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
  OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_operation_id IS NULL
  OR p_job_id IS NULL OR p_profile_id IS NULL OR p_fingerprint IS NULL
  OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_job_version<1 OR p_expected_profile_version<1
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF operation.store_id<>p_store_id OR operation.operation_kind<>'queue' OR operation.payload_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,job.record_kind,true
 );
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_provider_profile_authority_error(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true
 );
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF job.status<>'awaiting_provider_activation' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_job_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 SELECT * INTO profile FROM saas.merchant_provider_profiles
 WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
 IF profile.version<>p_expected_profile_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 expected_capability:=saas.merchant_provider_capability_for_kind(job.record_kind);
 IF profile.capability<>expected_capability THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN; END IF;
 IF profile.status<>'active' OR NOT EXISTS(
   SELECT 1 FROM saas.merchant_provider_definitions definition
   WHERE definition.provider_code=profile.provider_code AND definition.capability=profile.capability AND definition.enabled
 ) THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET
  profile_id=profile.id,provider_code=profile.provider_code,credential_version=profile.credential_version,
  plan_id=p_plan_id,plan_code=p_plan_code,plan_version=p_plan_version,
  status='queued',version=version+1,updated_at=p_now
 WHERE store_id=p_store_id AND id=p_job_id;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_store_id,'queue',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'queued',result;
END $f$;

CREATE FUNCTION saas.merchant_provider_claim(
 p_worker_id text,p_now timestamptz,p_lease_expires_at timestamptz,p_lease_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.merchant_provider_jobs%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
 IF p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id)
  OR p_worker_id!~'^[A-Za-z0-9._-]{1,128}$' OR p_now IS NULL OR p_lease_id IS NULL
  OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
  OR EXISTS(SELECT 1 FROM saas.merchant_provider_jobs existing WHERE existing.lease_id=p_lease_id)
  OR EXISTS(SELECT 1 FROM saas.merchant_provider_workflow_operations operation WHERE operation.operation_id=p_lease_id)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT candidate.* INTO job
 FROM saas.merchant_provider_jobs candidate
 JOIN saas.merchant_provider_profiles selected
  ON selected.store_id=candidate.store_id AND selected.id=candidate.profile_id
  AND selected.provider_code=candidate.provider_code
  AND selected.capability=saas.merchant_provider_capability_for_kind(candidate.record_kind)
  AND selected.credential_version=candidate.credential_version
  AND selected.status='active'
 WHERE (
   candidate.status IN('queued','retryable_failed')
   OR (candidate.status='leased' AND candidate.lease_expires_at<=p_now)
  )
  AND candidate.attempt_count<5
  AND EXISTS(
   SELECT 1 FROM saas.stores store
   JOIN saas.subscriptions subscription ON subscription.store_id=store.id
   JOIN saas.plans plan ON plan.id=subscription.plan_id
    AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
   JOIN saas.plan_features feature ON feature.plan_id=plan.id
   WHERE store.id=candidate.store_id AND store.status='active'
    AND subscription.plan_id=candidate.plan_id AND subscription.plan_code=candidate.plan_code
    AND subscription.plan_version=candidate.plan_version AND subscription.status='active'
    AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
    AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
    AND feature.feature_key='integrations' AND feature.enabled
  )
 ORDER BY candidate.requested_at,candidate.id
 FOR UPDATE OF candidate SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status='leased',attempt_count=attempt_count+1,
  lease_id=p_lease_id,lease_owner=p_worker_id,lease_expires_at=p_lease_expires_at,
  safe_provider_reference=NULL,outcome_code=NULL,finished_at=NULL,
  version=version+1,updated_at=p_now WHERE id=job.id;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE id=job.id;
 SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE store_id=job.store_id AND id=job.profile_id;
 RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
  'jobId',job.id,'recordId',job.record_id,'storeId',job.store_id,'profileId',job.profile_id,
  'providerCode',job.provider_code,'capability',profile.capability,'publicConfig',profile.public_config,
  'sealedCredentials',profile.sealed_credentials,'credentialVersion',job.credential_version,
  'jobVersion',job.version,'leaseId',job.lease_id,'leaseOwner',job.lease_owner,
  'leaseExpiresAt',saas.merchant_admin_timestamp(job.lease_expires_at),'attempt',job.attempt_count
 );
END $f$;

CREATE FUNCTION saas.merchant_provider_heartbeat(
 p_job_id uuid,p_lease_owner text,p_lease_id uuid,p_now timestamptz,
 p_lease_expires_at timestamptz,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.merchant_provider_jobs%ROWTYPE;
BEGIN
 IF p_job_id IS NULL OR p_lease_id IS NULL OR p_lease_owner IS NULL
  OR p_lease_owner<>pg_catalog.btrim(p_lease_owner) OR p_lease_owner!~'^[A-Za-z0-9._-]{1,128}$'
  OR p_now IS NULL OR p_expected_version<1 OR p_lease_expires_at<=p_now
  OR p_lease_expires_at>p_now+interval '15 minutes'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status<>'leased' OR job.lease_owner<>p_lease_owner OR job.lease_id<>p_lease_id OR job.lease_expires_at<=p_now
 THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF p_lease_expires_at<=job.lease_expires_at THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET lease_expires_at=p_lease_expires_at,version=version+1,updated_at=p_now WHERE id=p_job_id;
 RETURN QUERY SELECT 'heartbeat',saas.merchant_provider_job_projection(job.store_id,p_job_id);
END $f$;

CREATE FUNCTION saas.merchant_provider_finalize(
 p_job_id uuid,p_lease_owner text,p_lease_id uuid,p_now timestamptz,p_expected_version bigint,
 p_outcome text,p_outcome_code text,p_safe_provider_reference text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.merchant_provider_jobs%ROWTYPE; operation saas.merchant_provider_workflow_operations%ROWTYPE; result jsonb;
BEGIN
 IF p_job_id IS NULL OR p_lease_id IS NULL OR p_lease_owner IS NULL
  OR p_lease_owner<>pg_catalog.btrim(p_lease_owner) OR p_lease_owner!~'^[A-Za-z0-9._-]{1,128}$'
  OR p_now IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  OR p_outcome NOT IN('succeeded','retryable_failed','permanently_failed','provider_outcome_unknown','reconciliation_required')
  OR p_outcome_code IS NULL OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$'
  OR (p_safe_provider_reference IS NOT NULL AND (
    p_safe_provider_reference<>pg_catalog.btrim(p_safe_provider_reference)
    OR pg_catalog.char_length(p_safe_provider_reference) NOT BETWEEN 1 AND 256
    OR p_safe_provider_reference~'[[:cntrl:]]'
  ))
  OR ((p_outcome IN('succeeded','reconciliation_required'))<>(p_safe_provider_reference IS NOT NULL))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.workflow.operation:'||p_lease_id::text,0));
 SELECT * INTO operation FROM saas.merchant_provider_workflow_operations WHERE operation_id=p_lease_id;
 IF FOUND THEN
  IF operation.job_id<>p_job_id OR operation.operation_kind<>'finalize' OR operation.operation_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status<>'leased' OR job.lease_owner<>p_lease_owner OR job.lease_id<>p_lease_id OR job.lease_expires_at<=p_now
 THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status=p_outcome,safe_provider_reference=p_safe_provider_reference,
  outcome_code=p_outcome_code,finished_at=p_now,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
  version=version+1,updated_at=p_now WHERE id=p_job_id;
 result:=saas.merchant_provider_job_projection(job.store_id,p_job_id);
 INSERT INTO saas.merchant_provider_workflow_operations(operation_id,job_id,operation_kind,operation_fingerprint,result_payload,committed_at)
 VALUES(p_lease_id,p_job_id,'finalize',p_fingerprint,result,p_now);
 RETURN QUERY SELECT p_outcome,result;
END $f$;

CREATE FUNCTION saas.merchant_provider_reconcile(
 p_job_id uuid,p_worker_id text,p_operation_id uuid,p_now timestamptz,p_expected_version bigint,
 p_outcome text,p_outcome_code text,p_safe_provider_reference text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.merchant_provider_jobs%ROWTYPE; operation saas.merchant_provider_workflow_operations%ROWTYPE; result jsonb;
BEGIN
 IF p_job_id IS NULL OR p_operation_id IS NULL OR p_worker_id IS NULL
  OR p_worker_id<>pg_catalog.btrim(p_worker_id) OR p_worker_id!~'^[A-Za-z0-9._-]{1,128}$'
  OR p_now IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  OR p_outcome NOT IN('succeeded','permanently_failed','provider_outcome_unknown','reconciliation_required')
  OR p_outcome_code IS NULL OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$'
  OR (p_safe_provider_reference IS NOT NULL AND (
    p_safe_provider_reference<>pg_catalog.btrim(p_safe_provider_reference)
    OR pg_catalog.char_length(p_safe_provider_reference) NOT BETWEEN 1 AND 256
    OR p_safe_provider_reference~'[[:cntrl:]]'
  ))
  OR ((p_outcome IN('succeeded','reconciliation_required'))<>(p_safe_provider_reference IS NOT NULL))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.workflow.operation:'||p_operation_id::text,0));
 SELECT * INTO operation FROM saas.merchant_provider_workflow_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF operation.job_id<>p_job_id OR operation.operation_kind<>'reconcile' OR operation.operation_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status NOT IN('provider_outcome_unknown','reconciliation_required')
 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status=p_outcome,safe_provider_reference=p_safe_provider_reference,
  outcome_code=p_outcome_code,finished_at=p_now,version=version+1,updated_at=p_now WHERE id=p_job_id;
 result:=saas.merchant_provider_job_projection(job.store_id,p_job_id);
 INSERT INTO saas.merchant_provider_workflow_operations(operation_id,job_id,operation_kind,operation_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_job_id,'reconcile',p_fingerprint,result,p_now);
 RETURN QUERY SELECT p_outcome,result;
END $f$;

CREATE FUNCTION saas.merchant_provider_recover_workflow_operation(p_job_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE operation saas.merchant_provider_workflow_operations%ROWTYPE;
BEGIN
 IF p_job_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT * INTO operation FROM saas.merchant_provider_workflow_operations
 WHERE job_id=p_job_id AND operation_fingerprint=p_fingerprint;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_cancel(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_expected_version bigint,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing_operation saas.merchant_provider_operations%ROWTYPE; job saas.merchant_provider_jobs%ROWTYPE; result jsonb;
BEGIN
 IF p_operation_id IS NULL OR p_job_id IS NULL OR p_now IS NULL OR saas.merchant_provider_action_for_kind(p_kind) IS NULL
  OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO existing_operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF existing_operation.store_id<>p_store_id OR existing_operation.operation_kind<>'cancel' OR existing_operation.payload_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=p_job_id AND record_kind=p_kind FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status NOT IN('awaiting_provider_activation','queued','retryable_failed') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status='cancelled',version=version+1,cancelled_at=p_now,
  lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,finished_at=p_now,updated_at=p_now
 WHERE store_id=p_store_id AND id=p_job_id;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_store_id,'cancel',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'cancelled',result;
END $f$;

CREATE FUNCTION saas.guard_merchant_provider_credential_in_use()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF NEW.credential_version<>OLD.credential_version AND EXISTS(
  SELECT 1 FROM saas.merchant_provider_jobs job
  WHERE job.store_id=OLD.store_id AND job.profile_id=OLD.id
   AND job.credential_version=OLD.credential_version
   AND job.status IN('queued','leased','retryable_failed','provider_outcome_unknown','reconciliation_required')
 ) THEN RAISE EXCEPTION 'MERCHANT_PROVIDER_CREDENTIAL_IN_USE'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER merchant_provider_profile_credential_in_use
  BEFORE UPDATE OF credential_version ON saas.merchant_provider_profiles
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_provider_credential_in_use();

REVOKE ALL ON FUNCTION
 saas.merchant_provider_capability_for_kind(text),
 saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint),
 saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid),
 saas.merchant_provider_heartbeat(uuid,text,uuid,timestamptz,timestamptz,bigint),
 saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_recover_workflow_operation(uuid,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
 saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION
 saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid),
 saas.merchant_provider_heartbeat(uuid,text,uuid,timestamptz,timestamptz,bigint),
 saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text),
 saas.merchant_provider_recover_workflow_operation(uuid,text)
TO celebix_saas_workflow;

COMMIT;
