BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.payment_attempts(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  environment text NOT NULL,
  credential_version bigint NOT NULL,
  order_reference text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  safe_provider_reference text,
  safe_code text NOT NULL,
  reconciliation_lease_id uuid,
  reconciliation_lease_owner text,
  reconciliation_lease_expires_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  UNIQUE(store_id,id,payment_method_id,profile_id,provider_code,environment,credential_version),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,payment_method_id)
    REFERENCES saas.payment_methods(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK(provider_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK(environment IN('test','live')),
  CHECK(credential_version BETWEEN 1 AND 9007199254740991),
  CHECK(order_reference~'^[A-Za-z0-9._:-]{1,128}$'),
  CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
  CHECK(currency~'^[A-Z]{3}$'),
  CHECK(status IN(
    'created','awaiting_customer','submitted','provider_outcome_unknown',
    'authorized','captured','failed','cancelled','partially_refunded',
    'refunded','expired','reconciliation_required'
  )),
  CHECK(safe_provider_reference IS NULL OR (
    safe_provider_reference=pg_catalog.btrim(safe_provider_reference)
    AND pg_catalog.char_length(safe_provider_reference) BETWEEN 1 AND 256
    AND safe_provider_reference!~'[[:cntrl:]]'
  )),
  CHECK(safe_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at),
  CHECK(
    (status='reconciliation_required'
      AND reconciliation_lease_id IS NOT NULL
      AND reconciliation_lease_owner IS NOT NULL
      AND reconciliation_lease_expires_at IS NOT NULL)
    OR
    (status<>'reconciliation_required'
      AND reconciliation_lease_id IS NULL
      AND reconciliation_lease_owner IS NULL
      AND reconciliation_lease_expires_at IS NULL)
  ),
  CHECK(reconciliation_lease_owner IS NULL OR (
    reconciliation_lease_owner~'^[A-Za-z0-9._-]{1,128}$'
    AND reconciliation_lease_owner=pg_catalog.btrim(reconciliation_lease_owner)
  )),
  CHECK(reconciliation_lease_expires_at IS NULL OR (
    pg_catalog.isfinite(reconciliation_lease_expires_at)
    AND reconciliation_lease_expires_at>updated_at
  ))
);

CREATE TABLE saas.payment_callback_bindings(
  callback_binding_digest char(64) NOT NULL,
  attempt_id uuid NOT NULL,
  store_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  environment text NOT NULL,
  credential_version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(callback_binding_digest),
  UNIQUE(attempt_id),
  FOREIGN KEY(
    store_id,attempt_id,payment_method_id,profile_id,
    provider_code,environment,credential_version
  ) REFERENCES saas.payment_attempts(
    store_id,id,payment_method_id,profile_id,
    provider_code,environment,credential_version
  ) ON DELETE RESTRICT,
  CHECK(callback_binding_digest~'^[a-f0-9]{64}$'),
  CHECK(provider_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK(environment IN('test','live')),
  CHECK(credential_version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at))
);

CREATE TABLE saas.payment_attempt_events(
  event_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  environment text NOT NULL,
  source text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  attempt_version bigint NOT NULL,
  safe_provider_reference text,
  safe_code text NOT NULL,
  event_key_digest char(64),
  payload_fingerprint char(64) NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY(event_id),
  FOREIGN KEY(store_id,attempt_id)
    REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT,
  CHECK(source IN('begin','initialize','callback','reconciliation')),
  CHECK(from_status IS NULL OR from_status IN(
    'created','awaiting_customer','submitted','provider_outcome_unknown',
    'authorized','captured','failed','cancelled','partially_refunded',
    'refunded','expired','reconciliation_required'
  )),
  CHECK(to_status IN(
    'created','awaiting_customer','submitted','provider_outcome_unknown',
    'authorized','captured','failed','cancelled','partially_refunded',
    'refunded','expired','reconciliation_required'
  )),
  CHECK(attempt_version BETWEEN 1 AND 9007199254740991),
  CHECK(safe_provider_reference IS NULL OR (
    safe_provider_reference=pg_catalog.btrim(safe_provider_reference)
    AND pg_catalog.char_length(safe_provider_reference) BETWEEN 1 AND 256
    AND safe_provider_reference!~'[[:cntrl:]]'
  )),
  CHECK(safe_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK(event_key_digest IS NULL OR event_key_digest~'^[a-f0-9]{64}$'),
  CHECK((source='callback')=(event_key_digest IS NOT NULL)),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.isfinite(occurred_at))
);

CREATE TABLE saas.payment_attempt_operations(
  operation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id,attempt_id)
    REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT,
  CHECK(operation_kind IN(
    'begin','mark_initialized','mark_unknown','settle_callback',
    'claim_reconciliation','finalize_reconciliation'
  )),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768),
  CHECK(pg_catalog.isfinite(committed_at))
);

CREATE INDEX payment_attempts_store_order_idx
  ON saas.payment_attempts(store_id,order_reference,created_at DESC,id DESC);
CREATE INDEX payment_attempts_reconciliation_idx
  ON saas.payment_attempts(updated_at,id)
  WHERE status='provider_outcome_unknown';
CREATE UNIQUE INDEX payment_attempt_events_callback_key_idx
  ON saas.payment_attempt_events(profile_id,environment,event_key_digest)
  WHERE event_key_digest IS NOT NULL;
CREATE INDEX payment_attempt_events_attempt_idx
  ON saas.payment_attempt_events(attempt_id,occurred_at,event_id);

ALTER TABLE saas.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_attempt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_attempt_events FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_callback_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_callback_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_attempt_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.payment_attempt_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.payment_attempts,saas.payment_attempt_events,
  saas.payment_callback_bindings,saas.payment_attempt_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.guard_payment_attempt_transition()
RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_DELETE_DENIED';
  END IF;
  IF NOT (
    (OLD.status='created' AND NEW.status IN(
      'awaiting_customer','provider_outcome_unknown','failed','cancelled','expired'
    ))
    OR (OLD.status='awaiting_customer' AND NEW.status IN(
      'submitted','provider_outcome_unknown','failed','cancelled','expired'
    ))
    OR (OLD.status='submitted' AND NEW.status IN(
      'authorized','captured','provider_outcome_unknown','failed','cancelled','expired'
    ))
    OR (OLD.status='authorized' AND NEW.status IN(
      'captured','provider_outcome_unknown','failed','cancelled'
    ))
    OR (OLD.status='provider_outcome_unknown' AND NEW.status='reconciliation_required')
    OR (OLD.status='reconciliation_required' AND NEW.status IN(
      'captured','failed','provider_outcome_unknown'
    ))
    OR (OLD.status='captured' AND NEW.status='partially_refunded')
    OR (OLD.status='partially_refunded' AND NEW.status='refunded')
  ) THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_TRANSITION_DENIED';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.payment_method_id IS DISTINCT FROM NEW.payment_method_id
    OR OLD.profile_id IS DISTINCT FROM NEW.profile_id
    OR OLD.provider_code IS DISTINCT FROM NEW.provider_code
    OR OLD.environment IS DISTINCT FROM NEW.environment
    OR OLD.credential_version IS DISTINCT FROM NEW.credential_version
    OR OLD.order_reference IS DISTINCT FROM NEW.order_reference
    OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
    OR OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR (OLD.safe_provider_reference IS NOT NULL
      AND OLD.safe_provider_reference IS DISTINCT FROM NEW.safe_provider_reference)
    OR NEW.updated_at<OLD.updated_at
    OR NEW.version<>OLD.version+1
  THEN
    RAISE EXCEPTION 'PAYMENT_ATTEMPT_AUTHORITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER payment_attempts_transition
  BEFORE UPDATE OR DELETE ON saas.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION saas.guard_payment_attempt_transition();
CREATE TRIGGER payment_callback_bindings_immutable
  BEFORE UPDATE OR DELETE ON saas.payment_callback_bindings
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER payment_attempt_events_immutable
  BEFORE UPDATE OR DELETE ON saas.payment_attempt_events
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER payment_attempt_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.payment_attempt_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.payment_attempt_mutation_projection(
  p_attempt_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'status',attempt.status,
    'version',attempt.version,
    'providerReference',attempt.safe_provider_reference,
    'safeCode',attempt.safe_code,
    'replayed',p_replayed
  )
  FROM saas.payment_attempts AS attempt
  WHERE attempt.id=p_attempt_id
$f$;

CREATE FUNCTION saas.payment_attempt_event_projection(
  p_event_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',event.attempt_id,
    'status',event.to_status,
    'version',event.attempt_version,
    'providerReference',event.safe_provider_reference,
    'safeCode',event.safe_code,
    'replayed',p_replayed
  )
  FROM saas.payment_attempt_events AS event
  WHERE event.event_id=p_event_id
$f$;

CREATE FUNCTION saas.payment_attempt_begin_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'credentialVersion',attempt.credential_version,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$f$;

CREATE FUNCTION saas.payment_attempt_authority_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'credentialVersion',attempt.credential_version,
    'orderReference',attempt.order_reference,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'status',attempt.status,
    'version',attempt.version,
    'providerReference',attempt.safe_provider_reference,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$f$;

CREATE FUNCTION saas.payment_attempt_claim_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT saas.payment_attempt_authority_projection(attempt.id)
    ||pg_catalog.jsonb_build_object(
      'leaseId',attempt.reconciliation_lease_id,
      'leaseOwner',attempt.reconciliation_lease_owner,
      'leaseExpiresAt',saas.merchant_admin_timestamp(attempt.reconciliation_lease_expires_at)
    )
  FROM saas.payment_attempts AS attempt
  WHERE attempt.id=p_attempt_id
$f$;

CREATE FUNCTION saas.payment_attempt_begin(
  p_store_id uuid,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_payment_method_id uuid,p_order_reference text,p_amount_minor bigint,
  p_currency text,p_callback_binding_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  operation saas.payment_attempt_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
  selected_environment text;
  result jsonb;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_operation_id IS NULL OR p_payment_method_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_order_reference IS NULL OR p_order_reference!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 9007199254740991
    OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$'
    OR p_callback_binding_digest IS NULL
    OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id
      OR operation.attempt_id<>p_operation_id
      OR operation.operation_kind<>'begin'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      result:=saas.payment_attempt_begin_projection(operation.attempt_id);
      IF result IS NULL THEN RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb;
      ELSE RETURN QUERY SELECT 'operation_replayed',result; END IF;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM saas.stores AS store
    WHERE store.id=p_store_id AND store.status='active'
  ) THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;

  SELECT * INTO method FROM saas.payment_methods
  WHERE store_id=p_store_id AND id=p_payment_method_id FOR SHARE;
  IF NOT FOUND OR method.kind<>'provider' THEN
    RETURN QUERY SELECT 'payment_method_not_found',NULL::jsonb; RETURN;
  END IF;
  IF method.state<>'active' THEN
    RETURN QUERY SELECT 'payment_method_inactive',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=method.profile_id
    AND provider_code=method.provider_code FOR SHARE;
  IF NOT FOUND OR profile.capability<>'payment_processing' THEN
    RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN;
  END IF;
  IF profile.status<>'active' THEN
    RETURN QUERY SELECT 'profile_not_active',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions AS definition
    WHERE definition.provider_code=profile.provider_code
      AND definition.capability='payment_processing'
      AND definition.enabled
  ) THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
  IF pg_catalog.jsonb_typeof(profile.public_config->'environment')<>'string'
    OR profile.public_config->>'environment' NOT IN('test','live')
  THEN RETURN QUERY SELECT 'environment_invalid',NULL::jsonb; RETURN; END IF;
  selected_environment:=profile.public_config->>'environment';
  IF EXISTS(
    SELECT 1 FROM saas.payment_callback_bindings
    WHERE callback_binding_digest=p_callback_binding_digest
  ) THEN RETURN QUERY SELECT 'callback_binding_conflict',NULL::jsonb; RETURN; END IF;

  INSERT INTO saas.payment_attempts(
    id,store_id,payment_method_id,profile_id,provider_code,environment,
    credential_version,order_reference,amount_minor,currency,status,
    safe_provider_reference,safe_code,reconciliation_lease_id,
    reconciliation_lease_owner,reconciliation_lease_expires_at,
    version,created_at,updated_at
  ) VALUES(
    p_operation_id,p_store_id,method.id,profile.id,profile.provider_code,
    selected_environment,profile.credential_version,p_order_reference,p_amount_minor,
    p_currency,'created',NULL,'attempt_created',NULL,NULL,NULL,1,p_now,p_now
  );
  INSERT INTO saas.payment_callback_bindings(
    callback_binding_digest,attempt_id,store_id,payment_method_id,profile_id,
    provider_code,environment,credential_version,created_at
  ) VALUES(
    p_callback_binding_digest,p_operation_id,p_store_id,method.id,profile.id,
    profile.provider_code,selected_environment,profile.credential_version,p_now
  );
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,p_operation_id,p_store_id,profile.id,profile.provider_code,
    selected_environment,'begin',NULL,'created',1,NULL,'attempt_created',
    NULL,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(p_operation_id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,p_operation_id,'begin',p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT 'created',saas.payment_attempt_begin_projection(p_operation_id);
END
$f$;

CREATE FUNCTION saas.payment_attempt_mark_initialized(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_credential_version bigint,p_status text,p_safe_provider_reference text,
  p_safe_code text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  operation saas.payment_attempt_operations%ROWTYPE;
  attempt saas.payment_attempts%ROWTYPE;
  result jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_status NOT IN('awaiting_customer','submitted','failed','cancelled','expired')
    OR p_safe_code IS NULL OR p_safe_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_safe_provider_reference IS NOT NULL AND (
      p_safe_provider_reference<>pg_catalog.btrim(p_safe_provider_reference)
      OR pg_catalog.char_length(p_safe_provider_reference) NOT BETWEEN 1 AND 256
      OR p_safe_provider_reference~'[[:cntrl:]]'
    ))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.attempt_id<>p_attempt_id
      OR operation.operation_kind<>'mark_initialized'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO attempt FROM saas.payment_attempts
  WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF attempt.credential_version<>p_credential_version THEN
    RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN;
  END IF;
  IF NOT (
    (attempt.status='created' AND p_status IN(
      'awaiting_customer','failed','cancelled','expired'
    ))
    OR (attempt.status='awaiting_customer' AND p_status IN(
      'submitted','failed','cancelled','expired'
    ))
  ) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF attempt.safe_provider_reference IS NOT NULL
    AND attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;

  UPDATE saas.payment_attempts SET
    status=p_status,
    safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
    safe_code=p_safe_code,version=version+1,updated_at=p_now
  WHERE id=p_attempt_id;
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'initialize',attempt.status,p_status,
    attempt.version+1,COALESCE(attempt.safe_provider_reference,p_safe_provider_reference),
    p_safe_code,NULL,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(p_attempt_id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,attempt.store_id,attempt.id,'mark_initialized',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT p_status,result;
END
$f$;

CREATE FUNCTION saas.payment_attempt_mark_unknown(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_credential_version bigint,p_safe_provider_reference text,p_safe_code text,
  p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  operation saas.payment_attempt_operations%ROWTYPE;
  attempt saas.payment_attempts%ROWTYPE;
  result jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_safe_code IS NULL OR p_safe_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_safe_provider_reference IS NOT NULL AND (
      p_safe_provider_reference<>pg_catalog.btrim(p_safe_provider_reference)
      OR pg_catalog.char_length(p_safe_provider_reference) NOT BETWEEN 1 AND 256
      OR p_safe_provider_reference~'[[:cntrl:]]'
    ))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.attempt_id<>p_attempt_id
      OR operation.operation_kind<>'mark_unknown'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF attempt.credential_version<>p_credential_version THEN
    RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN;
  END IF;
  IF attempt.status NOT IN('created','awaiting_customer','submitted','authorized') THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF attempt.safe_provider_reference IS NOT NULL
    AND attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;
  UPDATE saas.payment_attempts SET
    status='provider_outcome_unknown',
    safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
    safe_code=p_safe_code,version=version+1,updated_at=p_now
  WHERE id=p_attempt_id;
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'initialize',attempt.status,
    'provider_outcome_unknown',attempt.version+1,
    COALESCE(attempt.safe_provider_reference,p_safe_provider_reference),
    p_safe_code,NULL,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(p_attempt_id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,attempt.store_id,attempt.id,'mark_unknown',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT 'provider_outcome_unknown',result;
END
$f$;

CREATE FUNCTION saas.payment_callback_authority(
  p_provider_code text,p_callback_binding_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_attempt_id uuid; result jsonb;
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_callback_binding_digest IS NULL
    OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT binding.attempt_id INTO selected_attempt_id
  FROM saas.payment_callback_bindings AS binding
  JOIN saas.payment_attempts AS attempt
    ON attempt.store_id=binding.store_id AND attempt.id=binding.attempt_id
    AND attempt.payment_method_id=binding.payment_method_id
    AND attempt.profile_id=binding.profile_id
    AND attempt.provider_code=binding.provider_code
    AND attempt.environment=binding.environment
    AND attempt.credential_version=binding.credential_version
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE binding.callback_binding_digest=p_callback_binding_digest
    AND binding.provider_code=p_provider_code
    AND binding.created_at<=p_now
    AND attempt.updated_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  result:=saas.payment_attempt_authority_projection(selected_attempt_id);
  IF result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',result;
END
$f$;

CREATE FUNCTION saas.payment_attempt_settle_callback(
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
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_callback_binding_digest IS NULL
    OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_event_key_digest IS NULL OR p_event_key_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_status NOT IN('authorized','captured','failed','partially_refunded','refunded')
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
  IF NOT FOUND THEN RETURN QUERY SELECT 'callback_not_found',NULL::jsonb; RETURN; END IF;
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
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO attempt FROM saas.payment_attempts
  WHERE id=selected_attempt_id FOR UPDATE;
  SELECT * INTO prior_event FROM saas.payment_attempt_events
  WHERE profile_id=attempt.profile_id AND environment=attempt.environment
    AND event_key_digest=p_event_key_digest;
  IF FOUND THEN
    IF prior_event.attempt_id<>attempt.id
      OR prior_event.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'callback_replay_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'callback_replayed',
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
  IF NOT (
    (attempt.status='submitted' AND p_status IN('authorized','captured','failed'))
    OR (attempt.status='authorized' AND p_status IN('captured','failed'))
    OR (attempt.status='captured' AND p_status='partially_refunded')
    OR (attempt.status='partially_refunded' AND p_status='refunded')
  ) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF attempt.safe_provider_reference IS NOT NULL
    AND attempt.safe_provider_reference IS DISTINCT FROM p_safe_provider_reference
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;
  UPDATE saas.payment_attempts SET
    status=p_status,
    safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
    safe_code=p_safe_code,version=version+1,updated_at=p_now
  WHERE id=attempt.id;
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'callback',attempt.status,p_status,
    attempt.version+1,COALESCE(attempt.safe_provider_reference,p_safe_provider_reference),
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

CREATE FUNCTION saas.payment_attempt_claim_reconciliation(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  operation saas.payment_attempt_operations%ROWTYPE;
  attempt saas.payment_attempts%ROWTYPE;
  result jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_operation_id IS NULL OR p_lease_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._-]{1,128}$'
    OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_lease_expires_at IS NULL OR NOT pg_catalog.isfinite(p_lease_expires_at)
    OR p_lease_expires_at<=p_now
    OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.attempt_id<>p_attempt_id
      OR operation.operation_kind<>'claim_reconciliation'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      result:=saas.payment_attempt_claim_projection(p_attempt_id);
      IF result IS NULL THEN result:=operation.result_payload||'{"replayed":true}'::jsonb;
      ELSE result:=result||'{"replayed":true}'::jsonb; END IF;
      RETURN QUERY SELECT 'operation_replayed',result;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF attempt.status<>'provider_outcome_unknown' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.payment_attempts
    WHERE reconciliation_lease_id=p_lease_id
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles AS profile
    WHERE profile.store_id=attempt.store_id AND profile.id=attempt.profile_id
      AND profile.provider_code=attempt.provider_code
      AND profile.credential_version=attempt.credential_version
  ) THEN RETURN QUERY SELECT 'credential_version_mismatch',NULL::jsonb; RETURN; END IF;
  UPDATE saas.payment_attempts SET
    status='reconciliation_required',safe_code='reconciliation_claimed',
    reconciliation_lease_id=p_lease_id,reconciliation_lease_owner=p_worker_id,
    reconciliation_lease_expires_at=p_lease_expires_at,
    version=version+1,updated_at=p_now
  WHERE id=attempt.id;
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'reconciliation',attempt.status,
    'reconciliation_required',attempt.version+1,attempt.safe_provider_reference,
    'reconciliation_claimed',NULL,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(attempt.id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,attempt.store_id,attempt.id,'claim_reconciliation',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT 'claimed',saas.payment_attempt_claim_projection(attempt.id);
END
$f$;

CREATE FUNCTION saas.payment_attempt_finalize_reconciliation(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_credential_version bigint,p_status text,
  p_safe_provider_reference text,p_safe_code text,p_amount_minor bigint,
  p_currency text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  operation saas.payment_attempt_operations%ROWTYPE;
  attempt saas.payment_attempts%ROWTYPE;
  result jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_operation_id IS NULL OR p_lease_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._-]{1,128}$'
    OR p_worker_id<>pg_catalog.btrim(p_worker_id)
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.attempt.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.attempt_id<>p_attempt_id
      OR operation.operation_kind<>'finalize_reconciliation'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||'{"replayed":true}'::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.status<>'reconciliation_required'
    OR attempt.reconciliation_lease_owner<>p_worker_id
    OR attempt.reconciliation_lease_id<>p_lease_id
    OR attempt.reconciliation_lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
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
  THEN RETURN QUERY SELECT 'provider_reference_mismatch',NULL::jsonb; RETURN; END IF;
  UPDATE saas.payment_attempts SET
    status=p_status,
    safe_provider_reference=COALESCE(safe_provider_reference,p_safe_provider_reference),
    safe_code=p_safe_code,reconciliation_lease_id=NULL,
    reconciliation_lease_owner=NULL,reconciliation_lease_expires_at=NULL,
    version=version+1,updated_at=p_now
  WHERE id=attempt.id;
  INSERT INTO saas.payment_attempt_events(
    event_id,attempt_id,store_id,profile_id,provider_code,environment,source,
    from_status,to_status,attempt_version,safe_provider_reference,safe_code,
    event_key_digest,payload_fingerprint,occurred_at
  ) VALUES(
    p_operation_id,attempt.id,attempt.store_id,attempt.profile_id,
    attempt.provider_code,attempt.environment,'reconciliation',attempt.status,
    p_status,attempt.version+1,
    COALESCE(attempt.safe_provider_reference,p_safe_provider_reference),
    p_safe_code,NULL,p_fingerprint,p_now
  );
  result:=saas.payment_attempt_mutation_projection(attempt.id,false);
  INSERT INTO saas.payment_attempt_operations(
    operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,
    result_payload,committed_at
  ) VALUES(
    p_operation_id,attempt.store_id,attempt.id,'finalize_reconciliation',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT p_status,result;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.guard_payment_attempt_transition(),
  saas.payment_attempt_mutation_projection(uuid,boolean),
  saas.payment_attempt_event_projection(uuid,boolean),
  saas.payment_attempt_begin_projection(uuid),
  saas.payment_attempt_authority_projection(uuid),
  saas.payment_attempt_claim_projection(uuid),
  saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text),
  saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamptz),
  saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamptz),
  saas.payment_callback_authority(text,text,timestamptz),
  saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz),
  saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz),
  saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text),
  saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamptz),
  saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamptz),
  saas.payment_callback_authority(text,text,timestamptz),
  saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz),
  saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz),
  saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)
TO celebix_saas_workflow;

COMMIT;
