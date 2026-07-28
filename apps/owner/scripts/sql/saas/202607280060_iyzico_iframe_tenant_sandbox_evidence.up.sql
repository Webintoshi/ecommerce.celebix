-- Phase 3S: tenant-scoped Iyzico sandbox evidence and attested activation.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_method_single_active_provider_preflight()') IS NULL
    OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_SINGLE_PROVIDER_BOUNDARY_REQUIRED'; END IF;
END
$f$;

CREATE TABLE saas.iyzico_iframe_tenant_evidence_runs(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  capability text NOT NULL,
  environment text NOT NULL,
  adapter_version integer NOT NULL,
  candidate_evidence_digest text NOT NULL,
  profile_version bigint NOT NULL,
  credential_version bigint NOT NULL,
  begin_fingerprint char(64) NOT NULL,
  status text NOT NULL,
  rejection_code text,
  lease_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK(provider_code='iyzico_iframe'),
  CHECK(capability='payment_processing'),
  CHECK(environment='test'),
  CHECK(adapter_version>0),
  CHECK(candidate_evidence_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(profile_version>0 AND credential_version>0 AND version>0),
  CHECK(begin_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(status IN('pending','leased','attested','rejected')),
  CHECK(
    (status='leased' AND rejection_code IS NULL AND lease_id IS NOT NULL
      AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status<>'leased' AND lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK(
    (status='rejected' AND rejection_code IN('callback_mismatch','timeout_mismatch','stale_evidence'))
    OR (status<>'rejected' AND rejection_code IS NULL)
  ),
  CHECK(lease_owner IS NULL OR (
    lease_owner=pg_catalog.btrim(lease_owner)
    AND pg_catalog.char_length(lease_owner) BETWEEN 1 AND 128
    AND lease_owner~'^[A-Za-z0-9._:-]+$'
  )),
  CHECK(lease_expires_at IS NULL OR pg_catalog.isfinite(lease_expires_at)),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)),
  CHECK(updated_at>=created_at)
);

CREATE TABLE saas.iyzico_iframe_tenant_evidence_cases(
  store_id uuid NOT NULL,
  run_id uuid NOT NULL,
  case_kind text NOT NULL,
  ordinal smallint NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(run_id,case_kind),
  UNIQUE(store_id,run_id,case_kind),
  UNIQUE(run_id,ordinal),
  FOREIGN KEY(store_id,run_id)
    REFERENCES saas.iyzico_iframe_tenant_evidence_runs(store_id,id) ON DELETE RESTRICT,
  CHECK(
    (case_kind='success' AND ordinal=1)
    OR (case_kind='decline' AND ordinal=2)
    OR (case_kind='controlled_timeout_recovery' AND ordinal=3)
    OR (case_kind='callback_replay' AND ordinal=4)
  ),
  CHECK(pg_catalog.isfinite(created_at))
);

CREATE TABLE saas.iyzico_iframe_tenant_evidence_events(
  event_id uuid NOT NULL,
  store_id uuid NOT NULL,
  run_id uuid NOT NULL,
  case_kind text NOT NULL,
  event_kind text NOT NULL,
  attempt_id uuid NOT NULL,
  observation_digest char(64) NOT NULL,
  outcome_code text NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(event_id),
  UNIQUE(run_id,case_kind,event_kind),
  FOREIGN KEY(store_id,run_id,case_kind)
    REFERENCES saas.iyzico_iframe_tenant_evidence_cases(store_id,run_id,case_kind)
    ON DELETE RESTRICT,
  CHECK(observation_digest~'^[a-f0-9]{64}$'),
  CHECK(
    (case_kind='success' AND event_kind='success_captured' AND outcome_code='captured')
    OR (case_kind='decline' AND event_kind='declined' AND outcome_code='declined')
    OR (case_kind='controlled_timeout_recovery'
      AND event_kind='timeout_unknown' AND outcome_code='unknown')
    OR (case_kind='controlled_timeout_recovery'
      AND event_kind='timeout_recovered' AND outcome_code='recovered')
    OR (case_kind='callback_replay'
      AND event_kind='callback_original' AND outcome_code='accepted')
    OR (case_kind='callback_replay'
      AND event_kind='callback_replay' AND outcome_code='replayed')
  ),
  CHECK(pg_catalog.isfinite(observed_at))
);

CREATE TABLE saas.iyzico_iframe_tenant_evidence_attestations(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  run_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  capability text NOT NULL,
  environment text NOT NULL,
  adapter_version integer NOT NULL,
  candidate_evidence_digest text NOT NULL,
  profile_version bigint NOT NULL,
  credential_version bigint NOT NULL,
  matrix_digest text NOT NULL,
  finalization_fingerprint char(64) NOT NULL,
  attested_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(run_id),
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id,run_id)
    REFERENCES saas.iyzico_iframe_tenant_evidence_runs(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK(provider_code='iyzico_iframe'),
  CHECK(capability='payment_processing'),
  CHECK(environment='test'),
  CHECK(adapter_version>0 AND profile_version>0 AND credential_version>0),
  CHECK(candidate_evidence_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(matrix_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(finalization_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.isfinite(attested_at))
);

-- Rows exist only inside the activation transaction and cannot be supplied by callers.
CREATE TABLE saas.iyzico_iframe_tenant_activation_fences(
  transaction_id bigint NOT NULL,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  method_id uuid NOT NULL,
  attestation_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(transaction_id,method_id),
  UNIQUE(transaction_id,profile_id),
  FOREIGN KEY(store_id,attestation_id)
    REFERENCES saas.iyzico_iframe_tenant_evidence_attestations(store_id,id) ON DELETE RESTRICT,
  CHECK(transaction_id>0),
  CHECK(pg_catalog.isfinite(created_at))
);

CREATE INDEX iyzico_iframe_tenant_evidence_runs_claim_idx
  ON saas.iyzico_iframe_tenant_evidence_runs(status,lease_expires_at,created_at,id)
  WHERE status IN('pending','leased');
CREATE INDEX iyzico_iframe_tenant_evidence_runs_profile_idx
  ON saas.iyzico_iframe_tenant_evidence_runs(
    store_id,profile_id,profile_version,credential_version,created_at,id
  );
CREATE INDEX iyzico_iframe_tenant_evidence_attestations_profile_idx
  ON saas.iyzico_iframe_tenant_evidence_attestations(
    store_id,profile_id,profile_version,credential_version,attested_at,id
  );

ALTER TABLE saas.iyzico_iframe_tenant_evidence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_events FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_evidence_attestations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_activation_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.iyzico_iframe_tenant_activation_fences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE saas.iyzico_iframe_tenant_evidence_runs
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON TABLE saas.iyzico_iframe_tenant_evidence_cases
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON TABLE saas.iyzico_iframe_tenant_evidence_events
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON TABLE saas.iyzico_iframe_tenant_evidence_attestations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON TABLE saas.iyzico_iframe_tenant_activation_fences
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TRIGGER iyzico_iframe_tenant_evidence_cases_immutable
  BEFORE UPDATE OR DELETE ON saas.iyzico_iframe_tenant_evidence_cases
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER iyzico_iframe_tenant_evidence_events_immutable
  BEFORE UPDATE OR DELETE ON saas.iyzico_iframe_tenant_evidence_events
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER iyzico_iframe_tenant_evidence_attestations_immutable
  BEFORE UPDATE OR DELETE ON saas.iyzico_iframe_tenant_evidence_attestations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_run_current(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE candidate saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  SELECT * INTO candidate FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id=p_run_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=candidate.store_id AND id=candidate.profile_id FOR SHARE;
  IF NOT FOUND OR profile.provider_code<>candidate.provider_code
    OR profile.capability<>candidate.capability OR profile.status<>'active'
    OR profile.version<>candidate.profile_version
    OR profile.credential_version<>candidate.credential_version
    OR profile.validation_environment<>candidate.environment
    OR profile.validation_adapter_version<>candidate.adapter_version
  THEN RETURN false; END IF;
  RETURN saas.merchant_provider_execution_authority_matches(
    candidate.provider_code,candidate.capability,candidate.environment,
    candidate.adapter_version,candidate.candidate_evidence_digest
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_attestation_insert_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  callback_original saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  callback_replay saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  timeout_unknown saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  timeout_recovered saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  matrix_source text;
  derived_matrix_digest text;
BEGIN
  SELECT * INTO run FROM saas.iyzico_iframe_tenant_evidence_runs
  WHERE id=NEW.run_id FOR SHARE;
  IF NOT FOUND OR run.status<>'leased' OR run.lease_expires_at<=NEW.attested_at
    OR NOT saas.iyzico_iframe_tenant_evidence_run_current(NEW.run_id)
    OR (run.store_id,run.profile_id,run.provider_code,run.capability,run.environment,
        run.adapter_version,run.candidate_evidence_digest,run.profile_version,
        run.credential_version)
       IS DISTINCT FROM
       (NEW.store_id,NEW.profile_id,NEW.provider_code,NEW.capability,NEW.environment,
        NEW.adapter_version,NEW.candidate_evidence_digest,NEW.profile_version,
        NEW.credential_version)
    OR (SELECT pg_catalog.count(*) FROM saas.iyzico_iframe_tenant_evidence_events
        WHERE run_id=NEW.run_id)<>6
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EXACT_ATTESTATION_REQUIRED'; END IF;
  SELECT * INTO timeout_unknown FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=NEW.run_id AND event_kind='timeout_unknown';
  SELECT * INTO timeout_recovered FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=NEW.run_id AND event_kind='timeout_recovered';
  SELECT * INTO callback_original FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=NEW.run_id AND event_kind='callback_original';
  SELECT * INTO callback_replay FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=NEW.run_id AND event_kind='callback_replay';
  IF timeout_unknown.event_id IS NULL OR timeout_recovered.event_id IS NULL
    OR callback_original.event_id IS NULL OR callback_replay.event_id IS NULL
    OR timeout_unknown.attempt_id<>timeout_recovered.attempt_id
    OR callback_original.attempt_id<>callback_replay.attempt_id
    OR callback_original.observation_digest<>callback_replay.observation_digest
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EXACT_ATTESTATION_REQUIRED'; END IF;
  SELECT pg_catalog.string_agg(
    candidate.case_kind||':'||candidate.event_kind||':'||candidate.attempt_id::text||':'||
    candidate.observation_digest||':'||candidate.outcome_code,'|'
    ORDER BY candidate.ordinal,candidate.event_ordinal
  ) INTO matrix_source
  FROM (
    SELECT evidence.case_kind,evidence.event_kind,evidence.attempt_id,
      evidence.observation_digest,evidence.outcome_code,scenario.ordinal,
      CASE evidence.event_kind
        WHEN 'timeout_unknown' THEN 1 WHEN 'callback_original' THEN 1 ELSE 2 END AS event_ordinal
    FROM saas.iyzico_iframe_tenant_evidence_events AS evidence
    JOIN saas.iyzico_iframe_tenant_evidence_cases AS scenario
      ON scenario.run_id=evidence.run_id AND scenario.case_kind=evidence.case_kind
    WHERE evidence.run_id=NEW.run_id
  ) AS candidate;
  derived_matrix_digest:='sha256:'||pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(matrix_source,'UTF8')),'hex'
  );
  IF NEW.matrix_digest<>derived_matrix_digest THEN
    RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EXACT_ATTESTATION_REQUIRED';
  END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER iyzico_iframe_tenant_attestation_insert_guard
  BEFORE INSERT ON saas.iyzico_iframe_tenant_evidence_attestations
  FOR EACH ROW EXECUTE FUNCTION saas.iyzico_iframe_tenant_attestation_insert_guard();

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_begin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_run_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_profile_version bigint,
  p_expected_credential_version bigint,p_candidate_evidence_digest text,p_adapter_version integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
  existing saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
  result jsonb;
BEGIN
  IF p_run_id IS NULL OR p_profile_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_profile_version IS NULL OR p_expected_profile_version<1
    OR p_expected_credential_version IS NULL OR p_expected_credential_version<1
    OR p_candidate_evidence_digest IS NULL
    OR p_candidate_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.merchant_provider_definitions
  WHERE provider_code='iyzico_iframe' AND capability='payment_processing'
    AND enabled AND allows_verification_without_execution_authority
  FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.iyzico.tenant.evidence.run:'||p_run_id::text,0
  ));
  SELECT * INTO existing FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id=p_run_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.profile_id=p_profile_id
      AND existing.begin_fingerprint=p_fingerprint
      AND existing.profile_version=p_expected_profile_version
      AND existing.credential_version=p_expected_credential_version
      AND existing.candidate_evidence_digest=p_candidate_evidence_digest
      AND existing.adapter_version=p_adapter_version
    THEN
      RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object(
        'runId',existing.id,'status',existing.status,'replayed',true
      );
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=p_profile_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.provider_code<>'iyzico_iframe' OR profile.capability<>'payment_processing'
    OR profile.validation_environment<>'test'
    OR profile.validation_adapter_version<>p_adapter_version
  THEN RETURN QUERY SELECT 'profile_not_eligible',NULL::jsonb; RETURN; END IF;
  IF profile.status<>'active' THEN
    RETURN QUERY SELECT 'profile_not_active',NULL::jsonb; RETURN;
  END IF;
  IF profile.version<>p_expected_profile_version
    OR profile.credential_version<>p_expected_credential_version
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF profile.execution_environment IS NOT NULL
    OR profile.execution_adapter_version IS NOT NULL
    OR profile.execution_evidence_digest IS NOT NULL
  THEN RETURN QUERY SELECT 'already_bound',NULL::jsonb; RETURN; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    'iyzico_iframe','payment_processing','test',p_adapter_version,p_candidate_evidence_digest
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.iyzico_iframe_tenant_evidence_runs(
    id,store_id,profile_id,provider_code,capability,environment,adapter_version,
    candidate_evidence_digest,profile_version,credential_version,begin_fingerprint,
    status,rejection_code,lease_id,lease_owner,lease_expires_at,version,created_at,updated_at
  ) VALUES(
    p_run_id,p_store_id,p_profile_id,'iyzico_iframe','payment_processing','test',p_adapter_version,
    p_candidate_evidence_digest,p_expected_profile_version,p_expected_credential_version,
    p_fingerprint,'pending',NULL,NULL,NULL,NULL,1,p_now,p_now
  );
  INSERT INTO saas.iyzico_iframe_tenant_evidence_cases(
    store_id,run_id,case_kind,ordinal,created_at
  ) VALUES
    (p_store_id,p_run_id,'success',1,p_now),
    (p_store_id,p_run_id,'decline',2,p_now),
    (p_store_id,p_run_id,'controlled_timeout_recovery',3,p_now),
    (p_store_id,p_run_id,'callback_replay',4,p_now);
  result:=pg_catalog.jsonb_build_object('runId',p_run_id,'status','pending','replayed',false);
  RETURN QUERY SELECT 'created',result;
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_claim(
  p_run_id uuid,p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_lease_id IS NULL OR p_worker_id IS NULL
    OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.char_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id!~'^[A-Za-z0-9._:-]+$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_lease_expires_at IS NULL OR NOT pg_catalog.isfinite(p_lease_expires_at)
    OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.iyzico.tenant.evidence.run:'||p_run_id::text,0
  ));
  SELECT * INTO run FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'run_not_found',NULL::jsonb; RETURN; END IF;
  IF run.status IN('attested','rejected') THEN
    RETURN QUERY SELECT 'run_closed',NULL::jsonb; RETURN;
  END IF;
  IF run.status='leased' AND run.lease_expires_at>p_now THEN
    IF run.lease_id=p_lease_id AND run.lease_owner=p_worker_id
      AND run.lease_expires_at=p_lease_expires_at
    THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object(
      'runId',run.id,'leaseId',run.lease_id,'replayed',true
    );
    ELSE RETURN QUERY SELECT 'lease_conflict',NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF NOT saas.iyzico_iframe_tenant_evidence_run_current(p_run_id) THEN
    UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
      status='rejected',rejection_code='stale_evidence',lease_id=NULL,lease_owner=NULL,
      lease_expires_at=NULL,version=version+1,updated_at=p_now
    WHERE id=p_run_id;
    RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
    status='leased',rejection_code=NULL,lease_id=p_lease_id,lease_owner=p_worker_id,
    lease_expires_at=p_lease_expires_at,version=version+1,updated_at=p_now
  WHERE id=p_run_id;
  RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
    'runId',p_run_id,'leaseId',p_lease_id,'replayed',false
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_record_event(
  p_run_id uuid,p_lease_id uuid,p_worker_id text,p_event_id uuid,
  p_case_kind text,p_event_kind text,p_attempt_id uuid,p_observation_digest text,
  p_outcome_code text,p_observed_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  existing saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  witness saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_lease_id IS NULL OR p_event_id IS NULL OR p_attempt_id IS NULL
    OR p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.char_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id!~'^[A-Za-z0-9._:-]+$'
    OR p_observation_digest IS NULL OR p_observation_digest!~'^[a-f0-9]{64}$'
    OR p_observed_at IS NULL OR NOT pg_catalog.isfinite(p_observed_at)
    OR NOT (
      (p_case_kind='success' AND p_event_kind='success_captured' AND p_outcome_code='captured')
      OR (p_case_kind='decline' AND p_event_kind='declined' AND p_outcome_code='declined')
      OR (p_case_kind='controlled_timeout_recovery'
        AND p_event_kind='timeout_unknown' AND p_outcome_code='unknown')
      OR (p_case_kind='controlled_timeout_recovery'
        AND p_event_kind='timeout_recovered' AND p_outcome_code='recovered')
      OR (p_case_kind='callback_replay'
        AND p_event_kind='callback_original' AND p_outcome_code='accepted')
      OR (p_case_kind='callback_replay'
        AND p_event_kind='callback_replay' AND p_outcome_code='replayed')
    )
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.iyzico.tenant.evidence.run:'||p_run_id::text,0
  ));
  SELECT * INTO existing FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE event_id=p_event_id;
  IF FOUND THEN
    IF existing.run_id=p_run_id AND existing.case_kind=p_case_kind
      AND existing.event_kind=p_event_kind AND existing.attempt_id=p_attempt_id
      AND existing.observation_digest=p_observation_digest
      AND existing.outcome_code=p_outcome_code AND existing.observed_at=p_observed_at
    THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object(
      'eventId',existing.event_id,'replayed',true
    );
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO existing FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=p_run_id AND case_kind=p_case_kind AND event_kind=p_event_kind;
  IF FOUND THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT * INTO run FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'run_not_found',NULL::jsonb; RETURN; END IF;
  IF run.status<>'leased' OR run.lease_id<>p_lease_id OR run.lease_owner<>p_worker_id
    OR run.lease_expires_at<=p_observed_at
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  IF NOT saas.iyzico_iframe_tenant_evidence_run_current(p_run_id) THEN
    UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
      status='rejected',rejection_code='stale_evidence',lease_id=NULL,lease_owner=NULL,
      lease_expires_at=NULL,version=version+1,updated_at=p_observed_at
    WHERE id=p_run_id;
    RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_cases
    WHERE run_id=p_run_id AND case_kind=p_case_kind
  ) THEN RETURN QUERY SELECT 'case_not_found',NULL::jsonb; RETURN; END IF;
  IF p_event_kind='callback_replay' THEN
    SELECT * INTO witness FROM saas.iyzico_iframe_tenant_evidence_events
    WHERE run_id=p_run_id AND case_kind='callback_replay' AND event_kind='callback_original';
    IF NOT FOUND OR witness.attempt_id<>p_attempt_id
      OR witness.observation_digest<>p_observation_digest
    THEN
      INSERT INTO saas.iyzico_iframe_tenant_evidence_events(
        event_id,store_id,run_id,case_kind,event_kind,attempt_id,
        observation_digest,outcome_code,observed_at
      ) VALUES(
        p_event_id,run.store_id,p_run_id,p_case_kind,p_event_kind,p_attempt_id,
        p_observation_digest,p_outcome_code,p_observed_at
      );
      UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
        status='rejected',rejection_code='callback_mismatch',lease_id=NULL,lease_owner=NULL,
        lease_expires_at=NULL,version=version+1,updated_at=p_observed_at
      WHERE id=p_run_id;
      RETURN QUERY SELECT 'callback_mismatch',NULL::jsonb; RETURN;
    END IF;
  ELSIF p_event_kind='timeout_recovered' THEN
    SELECT * INTO witness FROM saas.iyzico_iframe_tenant_evidence_events
    WHERE run_id=p_run_id AND case_kind='controlled_timeout_recovery'
      AND event_kind='timeout_unknown';
    IF NOT FOUND OR witness.attempt_id<>p_attempt_id THEN
      INSERT INTO saas.iyzico_iframe_tenant_evidence_events(
        event_id,store_id,run_id,case_kind,event_kind,attempt_id,
        observation_digest,outcome_code,observed_at
      ) VALUES(
        p_event_id,run.store_id,p_run_id,p_case_kind,p_event_kind,p_attempt_id,
        p_observation_digest,p_outcome_code,p_observed_at
      );
      UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
        status='rejected',rejection_code='timeout_mismatch',lease_id=NULL,lease_owner=NULL,
        lease_expires_at=NULL,version=version+1,updated_at=p_observed_at
      WHERE id=p_run_id;
      RETURN QUERY SELECT 'timeout_mismatch',NULL::jsonb; RETURN;
    END IF;
  END IF;
  INSERT INTO saas.iyzico_iframe_tenant_evidence_events(
    event_id,store_id,run_id,case_kind,event_kind,attempt_id,
    observation_digest,outcome_code,observed_at
  ) VALUES(
    p_event_id,run.store_id,p_run_id,p_case_kind,p_event_kind,p_attempt_id,
    p_observation_digest,p_outcome_code,p_observed_at
  );
  RETURN QUERY SELECT 'recorded',pg_catalog.jsonb_build_object(
    'eventId',p_event_id,'replayed',false
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_finalize(
  p_run_id uuid,p_lease_id uuid,p_worker_id text,p_attestation_id uuid,
  p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  existing saas.iyzico_iframe_tenant_evidence_attestations%ROWTYPE;
  callback_original saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  callback_replay saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  timeout_unknown saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  timeout_recovered saas.iyzico_iframe_tenant_evidence_events%ROWTYPE;
  matrix_source text;
  derived_matrix_digest text;
BEGIN
  IF p_run_id IS NULL OR p_lease_id IS NULL OR p_attestation_id IS NULL
    OR p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.char_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id!~'^[A-Za-z0-9._:-]+$'
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.iyzico.tenant.evidence.run:'||p_run_id::text,0
  ));
  SELECT * INTO existing FROM saas.iyzico_iframe_tenant_evidence_attestations
  WHERE id=p_attestation_id OR run_id=p_run_id ORDER BY (id=p_attestation_id) DESC LIMIT 1;
  IF FOUND THEN
    IF existing.id=p_attestation_id AND existing.run_id=p_run_id
      AND existing.finalization_fingerprint=p_fingerprint
    THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object(
      'attestationId',existing.id,'matrixDigest',existing.matrix_digest,'replayed',true
    );
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO run FROM saas.iyzico_iframe_tenant_evidence_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'run_not_found',NULL::jsonb; RETURN; END IF;
  IF run.status<>'leased' OR run.lease_id<>p_lease_id OR run.lease_owner<>p_worker_id
    OR run.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  IF NOT saas.iyzico_iframe_tenant_evidence_run_current(p_run_id) THEN
    UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
      status='rejected',rejection_code='stale_evidence',lease_id=NULL,lease_owner=NULL,
      lease_expires_at=NULL,version=version+1,updated_at=p_now
    WHERE id=p_run_id;
    RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id)<>6
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='success' AND event_kind='success_captured')
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='decline' AND event_kind='declined')
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='controlled_timeout_recovery' AND event_kind='timeout_unknown')
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='controlled_timeout_recovery' AND event_kind='timeout_recovered')
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='callback_replay' AND event_kind='callback_original')
    OR NOT EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events
      WHERE run_id=p_run_id AND case_kind='callback_replay' AND event_kind='callback_replay')
  THEN RETURN QUERY SELECT 'evidence_incomplete',NULL::jsonb; RETURN; END IF;
  SELECT * INTO timeout_unknown FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=p_run_id AND event_kind='timeout_unknown';
  SELECT * INTO timeout_recovered FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=p_run_id AND event_kind='timeout_recovered';
  SELECT * INTO callback_original FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=p_run_id AND event_kind='callback_original';
  SELECT * INTO callback_replay FROM saas.iyzico_iframe_tenant_evidence_events
  WHERE run_id=p_run_id AND event_kind='callback_replay';
  IF timeout_unknown.attempt_id<>timeout_recovered.attempt_id
    OR callback_original.attempt_id<>callback_replay.attempt_id
    OR callback_original.observation_digest<>callback_replay.observation_digest
  THEN RETURN QUERY SELECT 'evidence_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.string_agg(
    candidate.case_kind||':'||candidate.event_kind||':'||candidate.attempt_id::text||':'||
    candidate.observation_digest||':'||candidate.outcome_code,'|'
    ORDER BY candidate.ordinal,candidate.event_ordinal
  ) INTO matrix_source
  FROM (
    SELECT evidence.case_kind,evidence.event_kind,evidence.attempt_id,
      evidence.observation_digest,evidence.outcome_code,scenario.ordinal,
      CASE evidence.event_kind
        WHEN 'timeout_unknown' THEN 1 WHEN 'callback_original' THEN 1 ELSE 2 END AS event_ordinal
    FROM saas.iyzico_iframe_tenant_evidence_events AS evidence
    JOIN saas.iyzico_iframe_tenant_evidence_cases AS scenario
      ON scenario.run_id=evidence.run_id AND scenario.case_kind=evidence.case_kind
    WHERE evidence.run_id=p_run_id
  ) AS candidate;
  derived_matrix_digest:='sha256:'||pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(matrix_source,'UTF8')),'hex'
  );
  INSERT INTO saas.iyzico_iframe_tenant_evidence_attestations(
    id,store_id,run_id,profile_id,provider_code,capability,environment,adapter_version,
    candidate_evidence_digest,profile_version,credential_version,matrix_digest,
    finalization_fingerprint,attested_at
  ) VALUES(
    p_attestation_id,run.store_id,run.id,run.profile_id,run.provider_code,run.capability,
    run.environment,run.adapter_version,run.candidate_evidence_digest,run.profile_version,
    run.credential_version,derived_matrix_digest,p_fingerprint,p_now
  );
  UPDATE saas.iyzico_iframe_tenant_evidence_runs SET
    status='attested',rejection_code=NULL,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    version=version+1,updated_at=p_now
  WHERE id=p_run_id;
  RETURN QUERY SELECT 'attested',pg_catalog.jsonb_build_object(
    'attestationId',p_attestation_id,'matrixDigest',derived_matrix_digest,'replayed',false
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_profile_binding_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF NEW.provider_code<>'iyzico_iframe' OR NEW.capability<>'payment_processing'
    OR (
      NEW.execution_environment IS NOT DISTINCT FROM OLD.execution_environment
      AND NEW.execution_adapter_version IS NOT DISTINCT FROM OLD.execution_adapter_version
      AND NEW.execution_evidence_digest IS NOT DISTINCT FROM OLD.execution_evidence_digest
    )
    OR (
      NEW.execution_environment IS NULL AND NEW.execution_adapter_version IS NULL
      AND NEW.execution_evidence_digest IS NULL
    )
  THEN RETURN NEW; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM saas.iyzico_iframe_tenant_activation_fences AS fence
    JOIN saas.iyzico_iframe_tenant_evidence_attestations AS attestation
      ON attestation.store_id=fence.store_id AND attestation.id=fence.attestation_id
    JOIN saas.iyzico_iframe_tenant_evidence_runs AS run
      ON run.store_id=attestation.store_id AND run.id=attestation.run_id
    JOIN saas.merchant_provider_execution_authorities AS authority
      ON authority.provider_code=attestation.provider_code
      AND authority.capability=attestation.capability
      AND authority.environment=attestation.environment
      AND authority.adapter_version=attestation.adapter_version
      AND authority.evidence_digest=attestation.candidate_evidence_digest
      AND authority.readiness='sandbox_ready' AND authority.enabled
    WHERE fence.transaction_id=pg_catalog.txid_current()
      AND fence.store_id=NEW.store_id AND fence.profile_id=NEW.id
      AND attestation.profile_id=NEW.id AND run.status='attested'
      AND attestation.provider_code=NEW.provider_code
      AND attestation.capability=NEW.capability
      AND attestation.environment=NEW.execution_environment
      AND attestation.adapter_version=NEW.execution_adapter_version
      AND attestation.candidate_evidence_digest=NEW.execution_evidence_digest
      AND attestation.profile_version=OLD.version
      AND attestation.credential_version=OLD.credential_version
      AND NEW.credential_version=OLD.credential_version
  ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ATTESTATION_REQUIRED_FOR_PROFILE_BINDING'; END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER iyzico_iframe_tenant_profile_binding_guard
  BEFORE UPDATE ON saas.merchant_provider_profiles
  FOR EACH ROW EXECUTE FUNCTION saas.iyzico_iframe_tenant_profile_binding_guard();

CREATE FUNCTION saas.iyzico_iframe_tenant_payment_method_active_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF NEW.kind<>'provider' OR NEW.provider_code<>'iyzico_iframe' OR NEW.state<>'active'
    OR (TG_OP='UPDATE' AND OLD.state='active')
  THEN RETURN NEW; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM saas.iyzico_iframe_tenant_activation_fences AS fence
    JOIN saas.iyzico_iframe_tenant_evidence_attestations AS attestation
      ON attestation.store_id=fence.store_id AND attestation.id=fence.attestation_id
    JOIN saas.iyzico_iframe_tenant_evidence_runs AS run
      ON run.store_id=attestation.store_id AND run.id=attestation.run_id
    JOIN saas.merchant_provider_profiles AS profile
      ON profile.store_id=attestation.store_id AND profile.id=attestation.profile_id
    JOIN saas.merchant_provider_execution_authorities AS authority
      ON authority.provider_code=attestation.provider_code
      AND authority.capability=attestation.capability
      AND authority.environment=attestation.environment
      AND authority.adapter_version=attestation.adapter_version
      AND authority.evidence_digest=attestation.candidate_evidence_digest
      AND authority.readiness='sandbox_ready' AND authority.enabled
    WHERE fence.transaction_id=pg_catalog.txid_current()
      AND fence.store_id=NEW.store_id AND fence.method_id=NEW.id
      AND fence.profile_id=NEW.profile_id AND attestation.profile_id=NEW.profile_id
      AND run.status='attested' AND profile.status='active'
      AND profile.credential_version=attestation.credential_version
      AND profile.version=attestation.profile_version+1
      AND profile.execution_environment=attestation.environment
      AND profile.execution_adapter_version=attestation.adapter_version
      AND profile.execution_evidence_digest=attestation.candidate_evidence_digest
  ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ATTESTATION_REQUIRED_FOR_METHOD_ACTIVATION'; END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER iyzico_iframe_tenant_payment_method_active_guard
  BEFORE INSERT OR UPDATE ON saas.payment_methods
  FOR EACH ROW EXECUTE FUNCTION saas.iyzico_iframe_tenant_payment_method_active_guard();

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_method_version bigint,
  p_attestation_id uuid,p_expected_profile_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
  operation saas.payment_method_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
  attestation saas.iyzico_iframe_tenant_evidence_attestations%ROWTYPE;
  violated_constraint text;
  result jsonb;
  bound boolean;
BEGIN
  IF p_operation_id IS NULL OR p_method_id IS NULL OR p_attestation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_method_version IS NULL OR p_expected_method_version<1
    OR p_expected_profile_version IS NULL OR p_expected_profile_version<1
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'single_provider_boundary_invalid',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id AND operation.operation_kind='set_state'
      AND operation.payload_fingerprint=p_fingerprint
      AND operation.result_payload->>'id'=p_method_id::text
      AND operation.result_payload->>'activationAttestationId'=p_attestation_id::text
    THEN RETURN QUERY SELECT 'operation_replayed',saas.payment_method_replay_payload(operation.result_payload);
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.active-provider:'||p_store_id::text,0
  ));
  PERFORM 1 FROM saas.payment_methods WHERE store_id=p_store_id ORDER BY id FOR UPDATE;
  SELECT * INTO method FROM saas.payment_methods
  WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'method_not_found',NULL::jsonb; RETURN; END IF;
  IF method.kind<>'provider' OR method.provider_code<>'iyzico_iframe'
    OR method.profile_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF method.state='active' THEN RETURN QUERY SELECT 'already_active',NULL::jsonb; RETURN; END IF;
  IF method.version<>p_expected_method_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=method.profile_id FOR UPDATE;
  SELECT * INTO attestation FROM saas.iyzico_iframe_tenant_evidence_attestations
  WHERE store_id=p_store_id AND id=p_attestation_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'attestation_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.id IS NULL OR attestation.profile_id<>profile.id
    OR attestation.provider_code<>'iyzico_iframe'
    OR attestation.capability<>'payment_processing' OR attestation.environment<>'test'
    OR attestation.profile_version<>p_expected_profile_version
    OR profile.version<>attestation.profile_version
    OR profile.credential_version<>attestation.credential_version
    OR profile.status<>'active' OR profile.validation_environment<>'test'
    OR profile.validation_adapter_version<>attestation.adapter_version
    OR profile.execution_environment IS NOT NULL
    OR profile.execution_adapter_version IS NOT NULL
    OR profile.execution_evidence_digest IS NOT NULL
    OR NOT EXISTS(
      SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_runs
      WHERE id=attestation.run_id AND store_id=p_store_id AND status='attested'
    )
  THEN RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    attestation.provider_code,attestation.capability,attestation.environment,
    attestation.adapter_version,attestation.candidate_evidence_digest
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.payment_methods
    WHERE store_id=p_store_id AND kind='provider' AND state='active' AND id<>p_method_id
  ) THEN RETURN QUERY SELECT 'provider_already_active',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.iyzico_iframe_tenant_activation_fences(
    transaction_id,store_id,profile_id,method_id,attestation_id,operation_id,created_at
  ) VALUES(
    pg_catalog.txid_current(),p_store_id,profile.id,method.id,attestation.id,p_operation_id,p_now
  );
  BEGIN
    bound:=saas.merchant_provider_profile_bind_execution_authority(
      profile.id,attestation.provider_code,attestation.capability,attestation.environment,
      attestation.adapter_version,attestation.candidate_evidence_digest,p_now,
      p_expected_profile_version
    );
    IF bound IS DISTINCT FROM true THEN
      DELETE FROM saas.iyzico_iframe_tenant_activation_fences
      WHERE transaction_id=pg_catalog.txid_current() AND method_id=p_method_id;
      RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.payment_methods SET
      state='active',emergency_reason=NULL,version=version+1,updated_at=p_now
    WHERE id=p_method_id;
    result:=saas.payment_method_mutation_projection(p_store_id,p_method_id,false)
      ||pg_catalog.jsonb_build_object('activationAttestationId',p_attestation_id);
    INSERT INTO saas.payment_method_operations(
      operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES(p_operation_id,p_store_id,'set_state',p_fingerprint,result,p_now);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
    IF violated_constraint='payment_methods_one_active_provider_per_store_idx' THEN
      DELETE FROM saas.iyzico_iframe_tenant_activation_fences
      WHERE transaction_id=pg_catalog.txid_current() AND method_id=p_method_id;
      RETURN QUERY SELECT 'provider_already_active',NULL::jsonb; RETURN;
    END IF;
    RAISE;
  END;
  DELETE FROM saas.iyzico_iframe_tenant_activation_fences
  WHERE transaction_id=pg_catalog.txid_current() AND method_id=p_method_id;
  RETURN QUERY SELECT 'state_changed',result;
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  relation_name text;
  routine_name text;
  routine_oid oid;
BEGIN
  IF pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_method_single_active_provider_preflight()') IS NULL
    OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  THEN RETURN false; END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'iyzico_iframe_tenant_evidence_runs','iyzico_iframe_tenant_evidence_cases',
    'iyzico_iframe_tenant_evidence_events','iyzico_iframe_tenant_evidence_attestations',
    'iyzico_iframe_tenant_activation_fences'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname=relation_name
        AND relation.relkind='r' AND relation.relowner=owner_oid
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) OR pg_catalog.has_table_privilege(app_oid,'saas.'||relation_name,'SELECT,INSERT,UPDATE,DELETE')
      OR pg_catalog.has_table_privilege(workflow_oid,'saas.'||relation_name,'SELECT,INSERT,UPDATE,DELETE')
      OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
        ) AS privilege
        WHERE namespace.nspname='saas' AND relation.relname=relation_name
          AND privilege.grantee<>owner_oid
      )
    THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname LIKE 'iyzico_iframe_tenant_%'
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND attribute.attname~'(secret|token|body|header|email|phone|address|identity|name)'
  ) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='saas.merchant_provider_profiles'::regclass
        AND tgname='iyzico_iframe_tenant_profile_binding_guard' AND tgenabled='O' AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='saas.payment_methods'::regclass
        AND tgname='iyzico_iframe_tenant_payment_method_active_guard' AND tgenabled='O' AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='saas.iyzico_iframe_tenant_evidence_attestations'::regclass
        AND tgname='iyzico_iframe_tenant_attestation_insert_guard' AND tgenabled='O' AND NOT tgisinternal)
  THEN RETURN false; END IF;
  FOREACH routine_name IN ARRAY ARRAY[
    'iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
    'iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)',
    'iyzico_iframe_tenant_evidence_record_event(uuid,uuid,text,uuid,text,text,uuid,text,text,timestamp with time zone)',
    'iyzico_iframe_tenant_evidence_finalize(uuid,uuid,text,uuid,text,timestamp with time zone)',
    'iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',
    'iyzico_iframe_tenant_evidence_preflight()'
  ] LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_name);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND procedure.proowner=owner_oid AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RETURN false; END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_record_event(uuid,uuid,text,uuid,text,text,uuid,text,text,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_finalize(uuid,uuid,text,uuid,text,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure,'EXECUTE')
  THEN RETURN false; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(
      'saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_record_event(uuid,uuid,text,uuid,text,text,uuid,text,text,timestamp with time zone)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_finalize(uuid,uuid,text,uuid,text,timestamp with time zone)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure
    ) AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(
        owner_oid,
        CASE WHEN procedure.proname IN(
          'iyzico_iframe_tenant_evidence_begin','iyzico_iframe_tenant_evidence_activate',
          'iyzico_iframe_tenant_evidence_preflight'
        ) THEN app_oid ELSE owner_oid END,
        CASE WHEN procedure.proname IN(
          'iyzico_iframe_tenant_evidence_claim','iyzico_iframe_tenant_evidence_record_event',
          'iyzico_iframe_tenant_evidence_finalize','iyzico_iframe_tenant_evidence_preflight'
        ) THEN workflow_oid ELSE owner_oid END
      )
    )
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(
      'saas.iyzico_iframe_tenant_evidence_run_current(uuid)'::regprocedure,
      'saas.iyzico_iframe_tenant_attestation_insert_guard()'::regprocedure,
      'saas.iyzico_iframe_tenant_profile_binding_guard()'::regprocedure,
      'saas.iyzico_iframe_tenant_payment_method_active_guard()'::regprocedure
    ) AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid OR privilege.grantee<>owner_oid
    )
  ) THEN RETURN false; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.iyzico_iframe_tenant_evidence_run_current(uuid),
  saas.iyzico_iframe_tenant_attestation_insert_guard(),
  saas.iyzico_iframe_tenant_profile_binding_guard(),
  saas.iyzico_iframe_tenant_payment_method_active_guard()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_begin(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_claim(
  uuid,text,uuid,timestamptz,timestamptz
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_record_event(
  uuid,uuid,text,uuid,text,text,uuid,text,text,timestamptz
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_finalize(
  uuid,uuid,text,uuid,text,timestamptz
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_activate(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.iyzico_iframe_tenant_evidence_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_begin(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_claim(
  uuid,text,uuid,timestamptz,timestamptz
) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_record_event(
  uuid,uuid,text,uuid,text,text,uuid,text,text,timestamptz
) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_finalize(
  uuid,uuid,text,uuid,text,timestamptz
) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_activate(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint
) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_evidence_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
