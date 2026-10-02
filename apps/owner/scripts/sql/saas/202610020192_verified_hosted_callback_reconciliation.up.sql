-- Reconcile only an exact immutable, authenticated hosted callback observation.
-- Existing claim/finalize functions retain all payment, lease and inventory rules.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE source record;
BEGIN
  IF pg_catalog.to_regclass('saas.payment_attempts') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_execution_authorities') IS NULL
    OR pg_catalog.to_regclass('saas.payment_callback_bindings') IS NULL
    OR pg_catalog.to_regclass('saas.payment_attempt_events') IS NULL
    OR pg_catalog.to_regclass('saas.payment_attempt_operations') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.payment_attempt_events'::regclass
      AND attname='observed_callback_status' AND atttypid='text'::regtype AND NOT attisdropped)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace
      AND proname IN('payment_attempt_claim_verified_hosted_callback','payment_attempt_finalize_verified_hosted_callback','payment_attempt_verified_hosted_callback_evidence','payment_attempt_finalize_reconciliation_guarded'))
  THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_SOURCE_INVALID'; END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class relation
      WHERE relation.oid IN('saas.payment_attempts'::regclass,'saas.payment_callback_bindings'::regclass,
        'saas.payment_attempt_events'::regclass,'saas.payment_attempt_operations'::regclass)
        AND relation.relowner='celebix_saas_owner'::regrole AND relation.relrowsecurity AND relation.relforcerowsecurity)<>4
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger trigger
      WHERE (trigger.tgrelid,trigger.tgname) IN(
        ('saas.payment_callback_bindings'::regclass,'payment_callback_bindings_immutable'),
        ('saas.payment_attempt_events'::regclass,'payment_attempt_events_immutable'),
        ('saas.payment_attempt_operations'::regclass,'payment_attempt_operations_immutable'))
        AND trigger.tgfoid='saas.guard_merchant_admin_immutable()'::regprocedure
        AND trigger.tgenabled='O' AND trigger.tgtype=27 AND NOT trigger.tgisinternal)<>3
  THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_IMMUTABLE_SOURCE_INVALID'; END IF;
  FOR source IN SELECT * FROM (VALUES
    ('saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz)','9f1038ca8741a52301c8fe554573b9c15f0dabca4a1b21232b8a80824c7eecac','{celebix_saas_owner=X/celebix_saas_owner}'),
    ('saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text)','fbae63fb5e5f60ef409f7b5a6601b2931e358a2fea277b9de38f2f93fb9fa27c','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)','8a83d23717a5f6ddd08efad44b1c8130a7d8e333e2da5912702566ff85b59210','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)','8c928d237e67e799742de6c6abe3e7f32d58b8e10b9fa8914eaa2a10b314bff1','{celebix_saas_owner=X/celebix_saas_owner}')
  ) AS reviewed(signature,body_hash,acl) LOOP
    IF pg_catalog.to_regprocedure(source.signature) IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=pg_catalog.to_regprocedure(source.signature)
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')=source.body_hash
        AND procedure.proowner='celebix_saas_owner'::regrole
        AND procedure.proacl::text=source.acl AND procedure.prosecdef
        AND procedure.provolatile='v'
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_PREDECESSOR_INVALID'; END IF;
  END LOOP;
END $preflight$;

CREATE FUNCTION saas.payment_attempt_claim_verified_hosted_callback(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz,
  p_execution_environment text,p_execution_adapter_version integer,p_execution_evidence_digest text,
  p_provider_code text,p_callback_binding_digest text,p_event_key_digest text,p_observation_fingerprint text,
  p_status text,p_safe_provider_reference text,p_credential_version bigint,p_amount_minor bigint,p_currency text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  attempt saas.payment_attempts%ROWTYPE;
  operation saas.payment_attempt_operations%ROWTYPE;
  observation saas.payment_attempt_events%ROWTYPE;
  known_operation boolean;
BEGIN
  IF (p_attempt_id IS NOT NULL AND p_operation_id IS NOT NULL AND p_lease_id IS NOT NULL
    AND p_fingerprint~'^[a-f0-9]{64}$' AND p_expected_version>=1
    AND p_worker_id~'^[A-Za-z0-9._-]{1,128}$' AND p_worker_id=pg_catalog.btrim(p_worker_id)
    AND p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND p_provider_code~'^[a-z][a-z0-9_]{0,63}$'
    AND p_callback_binding_digest~'^[a-f0-9]{64}$'
    AND p_event_key_digest~'^[a-f0-9]{64}$'
    AND p_observation_fingerprint~'^[a-f0-9]{64}$'
    AND p_status IN('captured','failed')
    AND p_safe_provider_reference IS NOT NULL
    AND p_safe_provider_reference=pg_catalog.btrim(p_safe_provider_reference)
    AND pg_catalog.char_length(p_safe_provider_reference) BETWEEN 1 AND 256
    AND p_safe_provider_reference!~'[[:cntrl:]]'
    AND p_credential_version>=1 AND p_amount_minor BETWEEN 1 AND 9007199254740991
    AND p_currency~'^[A-Z]{3}$'
    AND p_lease_expires_at IS NOT NULL AND pg_catalog.isfinite(p_lease_expires_at)
    AND p_lease_expires_at>p_now AND p_lease_expires_at<=p_now+INTERVAL '15 minutes'
    AND p_execution_environment IN('test','live') AND p_execution_adapter_version>=1
    AND p_execution_evidence_digest~'^sha256:[a-f0-9]{64}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  -- Committed operations are immutable. Read their replay before locking so
  -- the repository can recover a lost COMMIT acknowledgement in READ ONLY.
  SELECT * INTO operation FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id;
  known_operation:=FOUND;
  IF known_operation THEN
    SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id;
  ELSE
    -- SQL055 takes this same lock before recording a callback observation.
    -- Keep it through both the evidence check and the existing durable mutation.
    SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF NOT known_operation THEN
    SELECT * INTO operation FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id;
    known_operation:=FOUND;
  END IF;
  IF attempt.environment IS DISTINCT FROM p_execution_environment
    OR attempt.execution_adapter_version IS DISTINCT FROM p_execution_adapter_version
    OR attempt.execution_evidence_digest IS DISTINCT FROM p_execution_evidence_digest
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF attempt.provider_code IS DISTINCT FROM p_provider_code
    OR attempt.execution_adapter_version IS NULL OR attempt.execution_evidence_digest IS NULL
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF known_operation THEN
    -- Same reviewed approval predicate as the locking helper; committed replay
    -- performs no mutation and must work inside BEGIN READ ONLY.
    IF NOT EXISTS(SELECT 1 FROM saas.merchant_provider_execution_authorities authority
      WHERE authority.provider_code=attempt.provider_code AND authority.capability='payment_processing'
        AND authority.environment=attempt.environment AND authority.adapter_version=attempt.execution_adapter_version
        AND authority.evidence_digest=attempt.execution_evidence_digest
        AND authority.readiness=CASE attempt.environment WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
        AND authority.enabled)
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  ELSIF saas.merchant_provider_execution_authority_matches(
    attempt.provider_code,'payment_processing',attempt.environment,
    attempt.execution_adapter_version,attempt.execution_evidence_digest) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF attempt.credential_version IS DISTINCT FROM p_credential_version
  THEN RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.amount_minor IS DISTINCT FROM p_amount_minor
  THEN RETURN QUERY SELECT 'amount_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.currency IS DISTINCT FROM p_currency
  THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.safe_provider_reference IS NULL
    OR attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;
  IF NOT known_operation AND attempt.updated_at>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.payment_callback_bindings binding
    WHERE binding.callback_binding_digest=p_callback_binding_digest AND binding.attempt_id=attempt.id
      AND binding.store_id=attempt.store_id AND binding.payment_method_id=attempt.payment_method_id
      AND binding.profile_id=attempt.profile_id AND binding.provider_code=attempt.provider_code
      AND binding.environment=attempt.environment AND binding.credential_version=attempt.credential_version)
  THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO observation FROM saas.payment_attempt_events event
    WHERE event.attempt_id=attempt.id AND event.event_key_digest=p_event_key_digest;
  IF NOT FOUND THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
  IF observation.store_id IS DISTINCT FROM attempt.store_id
    OR observation.profile_id IS DISTINCT FROM attempt.profile_id
    OR observation.provider_code IS DISTINCT FROM attempt.provider_code
    OR observation.environment IS DISTINCT FROM attempt.environment
    OR observation.source IS DISTINCT FROM 'callback'
    OR observation.observed_callback_status IS DISTINCT FROM p_status
    OR observation.from_status IS DISTINCT FROM observation.to_status
    OR observation.to_status NOT IN('provider_outcome_unknown','reconciliation_required')
    OR observation.attempt_version>attempt.version OR observation.occurred_at>p_now
    OR observation.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
    OR observation.payload_fingerprint IS DISTINCT FROM p_observation_fingerprint
    OR NOT EXISTS(SELECT 1 FROM saas.payment_attempt_operations callback_operation
      WHERE callback_operation.operation_id=observation.event_id
        AND callback_operation.attempt_id=attempt.id AND callback_operation.store_id=attempt.store_id
        AND callback_operation.operation_kind='settle_callback'
        AND callback_operation.payload_fingerprint=p_observation_fingerprint)
    OR EXISTS(SELECT 1 FROM saas.payment_attempt_events contrary
      WHERE contrary.attempt_id=attempt.id AND contrary.source='callback'
        AND (contrary.observed_callback_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END
          OR contrary.to_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END))
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  IF known_operation THEN
    IF operation.attempt_id IS DISTINCT FROM attempt.id OR operation.store_id IS DISTINCT FROM attempt.store_id
      OR operation.operation_kind IS DISTINCT FROM 'claim_reconciliation'
      OR operation.payload_fingerprint IS DISTINCT FROM p_fingerprint
      OR operation.result_payload->>'leaseId' IS DISTINCT FROM p_lease_id::text
      OR operation.result_payload->>'leaseOwner' IS DISTINCT FROM p_worker_id
      OR (operation.result_payload->>'leaseExpiresAt')::timestamptz IS DISTINCT FROM p_lease_expires_at
      OR (operation.result_payload->>'version')::bigint IS DISTINCT FROM p_expected_version+1
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    -- Authority and callback evidence were checked above; base8 can replay
    -- without057's unconditional attempt lock.
    RETURN QUERY SELECT * FROM saas.payment_attempt_claim_reconciliation(
      p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_now,p_lease_expires_at);
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM saas.payment_attempt_claim_reconciliation(
    p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_now,p_lease_expires_at,
    p_execution_environment,p_execution_adapter_version,p_execution_evidence_digest);
END $fn$;

CREATE FUNCTION saas.payment_attempt_finalize_verified_hosted_callback(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_credential_version bigint,p_status text,
  p_safe_provider_reference text,p_safe_code text,p_amount_minor bigint,p_currency text,p_now timestamptz,
  p_provider_code text,p_callback_binding_digest text,p_event_key_digest text,p_observation_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  attempt saas.payment_attempts%ROWTYPE;
  operation saas.payment_attempt_operations%ROWTYPE;
  observation saas.payment_attempt_events%ROWTYPE;
  known_operation boolean;
BEGIN
  IF (p_attempt_id IS NOT NULL AND p_operation_id IS NOT NULL AND p_lease_id IS NOT NULL
    AND p_fingerprint~'^[a-f0-9]{64}$' AND p_expected_version>=1
    AND p_worker_id~'^[A-Za-z0-9._-]{1,128}$' AND p_worker_id=pg_catalog.btrim(p_worker_id)
    AND p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND p_provider_code~'^[a-z][a-z0-9_]{0,63}$'
    AND p_callback_binding_digest~'^[a-f0-9]{64}$'
    AND p_event_key_digest~'^[a-f0-9]{64}$'
    AND p_observation_fingerprint~'^[a-f0-9]{64}$'
    AND p_status IN('captured','failed')
    AND p_safe_provider_reference IS NOT NULL
    AND p_safe_provider_reference=pg_catalog.btrim(p_safe_provider_reference)
    AND pg_catalog.char_length(p_safe_provider_reference) BETWEEN 1 AND 256
    AND p_safe_provider_reference!~'[[:cntrl:]]'
    AND p_credential_version>=1 AND p_amount_minor BETWEEN 1 AND 9007199254740991
    AND p_currency~'^[A-Z]{3}$'
    AND p_safe_code~'^[a-z][a-z0-9_]{0,63}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  -- Committed operations are immutable. Read their replay before locking so
  -- the repository can recover a lost COMMIT acknowledgement in READ ONLY.
  SELECT * INTO operation FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id;
  known_operation:=FOUND;
  IF known_operation THEN
    SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id;
  ELSE
    -- SQL055 takes this same lock before recording a callback observation.
    -- Keep it through both the evidence check and the existing durable mutation.
    SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF NOT known_operation THEN
    SELECT * INTO operation FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id;
    known_operation:=FOUND;
  END IF;
  IF attempt.provider_code IS DISTINCT FROM p_provider_code
    OR attempt.execution_adapter_version IS NULL OR attempt.execution_evidence_digest IS NULL
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF known_operation THEN
    -- Same reviewed approval predicate as the locking helper; committed replay
    -- performs no mutation and must work inside BEGIN READ ONLY.
    IF NOT EXISTS(SELECT 1 FROM saas.merchant_provider_execution_authorities authority
      WHERE authority.provider_code=attempt.provider_code AND authority.capability='payment_processing'
        AND authority.environment=attempt.environment AND authority.adapter_version=attempt.execution_adapter_version
        AND authority.evidence_digest=attempt.execution_evidence_digest
        AND authority.readiness=CASE attempt.environment WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
        AND authority.enabled)
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  ELSIF saas.merchant_provider_execution_authority_matches(
    attempt.provider_code,'payment_processing',attempt.environment,
    attempt.execution_adapter_version,attempt.execution_evidence_digest) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF attempt.credential_version IS DISTINCT FROM p_credential_version
  THEN RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.amount_minor IS DISTINCT FROM p_amount_minor
  THEN RETURN QUERY SELECT 'amount_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.currency IS DISTINCT FROM p_currency
  THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb; RETURN; END IF;
  IF attempt.safe_provider_reference IS NULL
    OR attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;
  IF NOT known_operation AND attempt.updated_at>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.payment_callback_bindings binding
    WHERE binding.callback_binding_digest=p_callback_binding_digest AND binding.attempt_id=attempt.id
      AND binding.store_id=attempt.store_id AND binding.payment_method_id=attempt.payment_method_id
      AND binding.profile_id=attempt.profile_id AND binding.provider_code=attempt.provider_code
      AND binding.environment=attempt.environment AND binding.credential_version=attempt.credential_version)
  THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO observation FROM saas.payment_attempt_events event
    WHERE event.attempt_id=attempt.id AND event.event_key_digest=p_event_key_digest;
  IF NOT FOUND THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
  IF observation.store_id IS DISTINCT FROM attempt.store_id
    OR observation.profile_id IS DISTINCT FROM attempt.profile_id
    OR observation.provider_code IS DISTINCT FROM attempt.provider_code
    OR observation.environment IS DISTINCT FROM attempt.environment
    OR observation.source IS DISTINCT FROM 'callback'
    OR observation.observed_callback_status IS DISTINCT FROM p_status
    OR observation.from_status IS DISTINCT FROM observation.to_status
    OR observation.to_status NOT IN('provider_outcome_unknown','reconciliation_required')
    OR observation.attempt_version>attempt.version OR observation.occurred_at>p_now
    OR observation.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
    OR observation.payload_fingerprint IS DISTINCT FROM p_observation_fingerprint
    OR NOT EXISTS(SELECT 1 FROM saas.payment_attempt_operations callback_operation
      WHERE callback_operation.operation_id=observation.event_id
        AND callback_operation.attempt_id=attempt.id AND callback_operation.store_id=attempt.store_id
        AND callback_operation.operation_kind='settle_callback'
        AND callback_operation.payload_fingerprint=p_observation_fingerprint)
    OR EXISTS(SELECT 1 FROM saas.payment_attempt_events contrary
      WHERE contrary.attempt_id=attempt.id AND contrary.source='callback'
        AND (contrary.observed_callback_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END
          OR contrary.to_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END))
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  IF observation.safe_code IS DISTINCT FROM p_safe_code
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  IF known_operation AND (
    operation.attempt_id IS DISTINCT FROM attempt.id OR operation.store_id IS DISTINCT FROM attempt.store_id
    OR operation.operation_kind IS DISTINCT FROM 'finalize_reconciliation'
    OR operation.payload_fingerprint IS DISTINCT FROM p_fingerprint
    OR operation.result_payload->>'status' IS DISTINCT FROM p_status
    OR operation.result_payload->>'providerReference' IS DISTINCT FROM p_safe_provider_reference
    OR operation.result_payload->>'safeCode' IS DISTINCT FROM p_safe_code
    OR (operation.result_payload->>'version')::bigint IS DISTINCT FROM p_expected_version+1)
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.payment_attempt_finalize_reconciliation(
    p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_credential_version,
    p_status,p_safe_provider_reference,p_safe_code,p_amount_minor,p_currency,p_now);
END $fn$;

-- Read existing durable facts for a worker that missed the original callback.
-- Fresh claim and final wrappers recheck this evidence under the attempt lock.
CREATE FUNCTION saas.payment_attempt_verified_hosted_callback_evidence(
  p_attempt_id uuid,p_expected_version bigint,p_now timestamptz,
  p_execution_environment text,p_execution_adapter_version integer,p_execution_evidence_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  attempt saas.payment_attempts%ROWTYPE;
  binding saas.payment_callback_bindings%ROWTYPE;
  observation saas.payment_attempt_events%ROWTYPE;
BEGIN
  IF (p_attempt_id IS NOT NULL AND p_expected_version>=1
    AND p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND p_execution_environment IN('test','live') AND p_execution_adapter_version>=1
    AND p_execution_evidence_digest~'^sha256:[a-f0-9]{64}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.version IS DISTINCT FROM p_expected_version
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF attempt.status NOT IN('provider_outcome_unknown','reconciliation_required')
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF attempt.updated_at>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF attempt.environment IS DISTINCT FROM p_execution_environment
    OR attempt.execution_adapter_version IS DISTINCT FROM p_execution_adapter_version
    OR attempt.execution_evidence_digest IS DISTINCT FROM p_execution_evidence_digest
    OR NOT EXISTS(SELECT 1 FROM saas.merchant_provider_execution_authorities authority
      WHERE authority.provider_code=attempt.provider_code AND authority.capability='payment_processing'
        AND authority.environment=attempt.environment AND authority.adapter_version=attempt.execution_adapter_version
        AND authority.evidence_digest=attempt.execution_evidence_digest
        AND authority.readiness=CASE attempt.environment WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
        AND authority.enabled)
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;

  -- Include historical terminal transitions in conflict detection; never turn
  -- a damaged or contradictory terminal fact into permission to query/capture.
  IF EXISTS(SELECT 1 FROM saas.payment_attempt_events captured
      WHERE captured.attempt_id=attempt.id AND captured.source='callback'
        AND (captured.observed_callback_status='captured' OR captured.to_status='captured'))
    AND EXISTS(SELECT 1 FROM saas.payment_attempt_events failed
      WHERE failed.attempt_id=attempt.id AND failed.source='callback'
        AND (failed.observed_callback_status='failed' OR failed.to_status='failed'))
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT * INTO observation FROM saas.payment_attempt_events event
    WHERE event.attempt_id=attempt.id AND event.source='callback'
      AND (event.observed_callback_status IN('captured','failed') OR event.to_status IN('captured','failed'))
    ORDER BY event.occurred_at,event.event_id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'no_observation',NULL::jsonb; RETURN; END IF;
  SELECT * INTO binding FROM saas.payment_callback_bindings WHERE attempt_id=attempt.id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
  IF binding.store_id IS DISTINCT FROM attempt.store_id
    OR binding.payment_method_id IS DISTINCT FROM attempt.payment_method_id
    OR binding.profile_id IS DISTINCT FROM attempt.profile_id
    OR binding.provider_code IS DISTINCT FROM attempt.provider_code
    OR binding.environment IS DISTINCT FROM attempt.environment
    OR binding.credential_version IS DISTINCT FROM attempt.credential_version
    OR observation.store_id IS DISTINCT FROM attempt.store_id
    OR observation.profile_id IS DISTINCT FROM attempt.profile_id
    OR observation.provider_code IS DISTINCT FROM attempt.provider_code
    OR observation.environment IS DISTINCT FROM attempt.environment
    OR observation.observed_callback_status IS NULL OR observation.observed_callback_status NOT IN('captured','failed')
    OR observation.from_status IS DISTINCT FROM observation.to_status
    OR observation.to_status NOT IN('provider_outcome_unknown','reconciliation_required')
    OR observation.attempt_version>attempt.version OR observation.occurred_at>p_now
    OR attempt.safe_provider_reference IS NULL
    OR observation.safe_provider_reference IS DISTINCT FROM attempt.safe_provider_reference
    OR observation.event_key_digest IS NULL
    OR NOT EXISTS(SELECT 1 FROM saas.payment_attempt_operations callback_operation
      WHERE callback_operation.operation_id=observation.event_id
        AND callback_operation.attempt_id=attempt.id AND callback_operation.store_id=attempt.store_id
        AND callback_operation.operation_kind='settle_callback'
        AND callback_operation.payload_fingerprint=observation.payload_fingerprint)
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'providerCode',attempt.provider_code,'callbackBindingDigest',binding.callback_binding_digest,
    'eventKeyDigest',observation.event_key_digest,'observationFingerprint',observation.payload_fingerprint,
    'status',observation.observed_callback_status,'providerReference',observation.safe_provider_reference,
    'credentialVersion',attempt.credential_version,'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,'safeCode',observation.safe_code);
END $fn$;

-- A provider query can race with an authenticated callback. Keep its existing
-- outcome rules, but never commit the opposite terminal result after that fact.
CREATE FUNCTION saas.payment_attempt_finalize_reconciliation_guarded(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_credential_version bigint,p_status text,
  p_safe_provider_reference text,p_safe_code text,p_amount_minor bigint,p_currency text,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE attempt saas.payment_attempts%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN('captured','failed','provider_outcome_unknown')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  -- The base function validates the immutable operation and fingerprint before
  -- replaying; no table lock or second mutation is needed for READ ONLY recovery.
  IF EXISTS(SELECT 1 FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id) THEN
    RETURN QUERY SELECT * FROM saas.payment_attempt_finalize_reconciliation(
      p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_credential_version,
      p_status,p_safe_provider_reference,p_safe_code,p_amount_minor,p_currency,p_now);
    RETURN;
  END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  -- A prior concurrent final may have committed while this row lock waited.
  IF EXISTS(SELECT 1 FROM saas.payment_attempt_operations WHERE operation_id=p_operation_id) THEN
    RETURN QUERY SELECT * FROM saas.payment_attempt_finalize_reconciliation(
      p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_credential_version,
      p_status,p_safe_provider_reference,p_safe_code,p_amount_minor,p_currency,p_now);
    RETURN;
  END IF;
  IF p_status IN('captured','failed') AND EXISTS(
    SELECT 1 FROM saas.payment_attempt_events observation
    WHERE observation.attempt_id=attempt.id AND observation.source='callback'
      AND (observation.observed_callback_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END
        OR observation.to_status=CASE p_status WHEN 'captured' THEN 'failed' ELSE 'captured' END))
  THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.payment_attempt_finalize_reconciliation(
    p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,p_lease_id,p_credential_version,
    p_status,p_safe_provider_reference,p_safe_code,p_amount_minor,p_currency,p_now);
END $fn$;

REVOKE ALL ON FUNCTION
  saas.payment_attempt_finalize_reconciliation_guarded(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz),
  saas.payment_attempt_verified_hosted_callback_evidence(uuid,bigint,timestamptz,text,integer,text),
  saas.payment_attempt_claim_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,text,text,bigint,bigint,text),
  saas.payment_attempt_finalize_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz,text,text,text,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.payment_attempt_finalize_reconciliation_guarded(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz),
  saas.payment_attempt_verified_hosted_callback_evidence(uuid,bigint,timestamptz,text,integer,text),
  saas.payment_attempt_claim_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,text,text,bigint,bigint,text),
  saas.payment_attempt_finalize_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz,text,text,text,text)
TO celebix_saas_workflow;

COMMIT;
