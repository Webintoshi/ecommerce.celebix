BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.payment_attempt_apply_hosted_callback(
  p_provider_code text,p_callback_binding_digest text,p_operation_id uuid,
  p_fingerprint text,p_event_key_digest text,p_expected_version bigint,
  p_credential_version bigint,p_status text,p_safe_provider_reference text,
  p_safe_code text,p_amount_minor bigint,p_currency text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_attempt_id uuid;
  operation saas.payment_attempt_operations%ROWTYPE;
  prior_event saas.payment_attempt_events%ROWTYPE;
  attempt saas.payment_attempts%ROWTYPE;
  result jsonb;
  terminal_increment bigint;
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_callback_binding_digest IS NULL
    OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_event_key_digest IS NULL OR p_event_key_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_status NOT IN('captured','failed','provider_outcome_unknown')
    OR p_safe_code IS NULL OR p_safe_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
    OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_safe_provider_reference IS NOT NULL AND (
      p_safe_provider_reference<>pg_catalog.btrim(p_safe_provider_reference)
      OR pg_catalog.char_length(p_safe_provider_reference) NOT BETWEEN 1 AND 256
      OR p_safe_provider_reference~'[[:cntrl:]]'
    ))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT binding.attempt_id INTO selected_attempt_id
  FROM saas.payment_callback_bindings AS binding
  WHERE binding.callback_binding_digest=p_callback_binding_digest
    AND binding.provider_code=p_provider_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.attempt_id<>selected_attempt_id
      OR operation.operation_kind<>'settle_callback'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',
        operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO attempt FROM saas.payment_attempts
  WHERE id=selected_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.callback.event:'||attempt.profile_id::text||':'
      ||attempt.environment||':'||p_event_key_digest,0
  ));
  SELECT * INTO prior_event FROM saas.payment_attempt_events
  WHERE profile_id=attempt.profile_id
    AND environment=attempt.environment
    AND event_key_digest=p_event_key_digest;
  IF FOUND THEN
    IF prior_event.attempt_id<>attempt.id
      OR prior_event.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'callback_replayed',
        saas.payment_attempt_event_projection(prior_event.event_id,true);
    END IF;
    RETURN;
  END IF;

  IF attempt.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF attempt.credential_version<>p_credential_version THEN
    RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN;
  END IF;
  IF attempt.amount_minor<>p_amount_minor THEN
    RETURN QUERY SELECT 'amount_mismatch',NULL::jsonb; RETURN;
  END IF;
  IF attempt.currency<>p_currency THEN
    RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb; RETURN;
  END IF;
  IF attempt.safe_provider_reference IS NOT NULL
    AND attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN
    RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN;
  END IF;

  IF attempt.status IN('provider_outcome_unknown','reconciliation_required') THEN
    INSERT INTO saas.payment_attempt_events(
      event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
      from_status,to_status,attempt_version,safe_provider_reference,safe_code,
      event_key_digest,payload_fingerprint,occurred_at
    ) VALUES(
      p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
      attempt.provider_code,attempt.environment,'callback',attempt.status,
      attempt.status,attempt.version,attempt.safe_provider_reference,
      attempt.safe_code,p_event_key_digest,p_fingerprint,p_now
    );
    result:=saas.payment_attempt_mutation_projection(attempt.id,false);
    INSERT INTO saas.payment_attempt_operations(
      operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
      result_payload,committed_at
    ) VALUES(
      p_operation_id,attempt.store_id,attempt.id,'settle_callback',
      p_fingerprint,result,p_now
    );
    RETURN QUERY SELECT 'processing',result;
    RETURN;
  END IF;

  IF p_status='provider_outcome_unknown' THEN
    IF attempt.status NOT IN('awaiting_customer','submitted','authorized') THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.payment_attempts SET
      status=p_status,
      safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
      safe_code=p_safe_code,version=version+1,updated_at=p_now
    WHERE id=attempt.id;
    terminal_increment:=1;
  ELSE
    IF attempt.status='awaiting_customer' THEN
      UPDATE saas.payment_attempts SET
        status='submitted',
        safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
        safe_code=p_safe_code,version=version+1,updated_at=p_now
      WHERE id=attempt.id;
      UPDATE saas.payment_attempts SET
        status=p_status,
        safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
        safe_code=p_safe_code,version=version+1,updated_at=p_now
      WHERE id=attempt.id;
      terminal_increment:=2;
    ELSIF attempt.status IN('submitted','authorized') THEN
      UPDATE saas.payment_attempts SET
        status=p_status,
        safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
        safe_code=p_safe_code,version=version+1,updated_at=p_now
      WHERE id=attempt.id;
      terminal_increment:=1;
    ELSE
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
  END IF;

  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'callback',attempt.status,p_status,
    attempt.version+terminal_increment,
    COALESCE(attempt.safe_provider_reference,p_safe_provider_reference),
    p_safe_code,p_event_key_digest,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(attempt.id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,attempt.store_id,attempt.id,'settle_callback',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT p_status,result;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.payment_attempt_apply_hosted_callback(
    text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz
  )
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.payment_attempt_apply_hosted_callback(
    text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz
  )
TO celebix_saas_workflow;

COMMIT;
