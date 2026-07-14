-- Phase 2B2B1 durable registration-to-panel-session handoff authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b2b1_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.registration_workflows') IS NULL
     OR pg_catalog.to_regclass('saas.registration_verified_identities') IS NULL
     OR pg_catalog.to_regclass('saas.registration_tenant_completions') IS NULL
     OR pg_catalog.to_regclass('saas.panel_sessions') IS NULL THEN
    RAISE EXCEPTION 'PHASE2B2B1_PREREQUISITE_MISSING';
  END IF;
END
$phase2b2b1_precondition$;

CREATE TABLE saas.panel_session_handoffs (
  handoff_id uuid PRIMARY KEY,
  attempt_id text NOT NULL,
  state_digest character(64) NOT NULL,
  token_key_id text NOT NULL,
  token_digest character(64) NOT NULL,
  tenant_operation_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  active_store_id uuid NOT NULL,
  session_operation_id uuid NOT NULL,
  session_id uuid NOT NULL,
  family_id uuid NOT NULL,
  session_token_key_id text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  session_expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT panel_session_handoffs_attempt_unique UNIQUE (attempt_id),
  CONSTRAINT panel_session_handoffs_state_unique UNIQUE (state_digest),
  CONSTRAINT panel_session_handoffs_token_unique UNIQUE (token_key_id, token_digest),
  CONSTRAINT panel_session_handoffs_session_operation_unique UNIQUE (session_operation_id),
  CONSTRAINT panel_session_handoffs_session_id_unique UNIQUE (session_id),
  CONSTRAINT panel_session_handoffs_workflow_fk
    FOREIGN KEY (attempt_id) REFERENCES saas.registration_workflows(attempt_id) ON DELETE RESTRICT,
  CONSTRAINT panel_session_handoffs_tenant_operation_fk
    FOREIGN KEY (tenant_operation_id) REFERENCES saas.tenant_operations(id) ON DELETE RESTRICT,
  CONSTRAINT panel_session_handoffs_principal_fk
    FOREIGN KEY (principal_id) REFERENCES saas.principals(id) ON DELETE RESTRICT,
  CONSTRAINT panel_session_handoffs_active_store_fk
    FOREIGN KEY (active_store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT panel_session_handoffs_attempt_format
    CHECK (attempt_id ~ '^attempt_[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT panel_session_handoffs_state_digest_format
    CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_session_handoffs_token_key_id_format
    CHECK (token_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND token_key_id !~ '^\.|\.$|\.\.'),
  CONSTRAINT panel_session_handoffs_token_digest_format
    CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_session_handoffs_session_token_key_id_format
    CHECK (session_token_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND session_token_key_id !~ '^\.|\.$|\.\.'),
  CONSTRAINT panel_session_handoffs_lifetime
    CHECK (issued_at < expires_at AND expires_at <= issued_at + interval '10 minutes'),
  CONSTRAINT panel_session_handoffs_session_lifetime
    CHECK (issued_at < session_expires_at AND session_expires_at <= issued_at + interval '8 hours'),
  CONSTRAINT panel_session_handoffs_redemption_time
    CHECK (redeemed_at IS NULL OR (redeemed_at >= issued_at AND redeemed_at < expires_at)),
  CONSTRAINT panel_session_handoffs_version_shape
    CHECK ((redeemed_at IS NULL AND version = 1) OR (redeemed_at IS NOT NULL AND version = 2)),
  CONSTRAINT panel_session_handoffs_timestamp_shape
    CHECK (created_at = issued_at AND updated_at = COALESCE(redeemed_at, issued_at))
);

CREATE INDEX panel_session_handoffs_expiry_idx
  ON saas.panel_session_handoffs (expires_at, handoff_id);
CREATE INDEX panel_session_handoffs_tenant_operation_idx
  ON saas.panel_session_handoffs (tenant_operation_id);
CREATE INDEX panel_session_handoffs_principal_store_idx
  ON saas.panel_session_handoffs (principal_id, active_store_id);

ALTER TABLE saas.panel_session_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_session_handoffs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.guard_panel_session_handoff_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b2b1_handoff_guard$
BEGIN
  IF NEW.handoff_id IS DISTINCT FROM OLD.handoff_id
     OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.state_digest IS DISTINCT FROM OLD.state_digest
     OR NEW.token_key_id IS DISTINCT FROM OLD.token_key_id
     OR NEW.token_digest IS DISTINCT FROM OLD.token_digest
     OR NEW.tenant_operation_id IS DISTINCT FROM OLD.tenant_operation_id
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.active_store_id IS DISTINCT FROM OLD.active_store_id
     OR NEW.session_operation_id IS DISTINCT FROM OLD.session_operation_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.session_token_key_id IS DISTINCT FROM OLD.session_token_key_id
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.session_expires_at IS DISTINCT FROM OLD.session_expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PHASE2B2B1_IMMUTABLE_HANDOFF_AUTHORITY';
  END IF;

  IF NOT (
    OLD.redeemed_at IS NULL
    AND NEW.redeemed_at IS NOT NULL
    AND NEW.version = OLD.version + 1
    AND NEW.updated_at = NEW.redeemed_at
    AND NEW.redeemed_at < OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'PHASE2B2B1_INVALID_HANDOFF_TRANSITION';
  END IF;
  RETURN NEW;
END
$phase2b2b1_handoff_guard$;

CREATE TRIGGER panel_session_handoffs_guard
BEFORE UPDATE ON saas.panel_session_handoffs
FOR EACH ROW EXECUTE FUNCTION saas.guard_panel_session_handoff_mutation();

CREATE FUNCTION saas.create_panel_session_handoff(
  p_state_digest text,
  p_token_key_id text,
  p_token_digest text,
  p_session_token_key_id text,
  p_handoff_id uuid,
  p_session_operation_id uuid,
  p_session_id uuid,
  p_family_id uuid,
  p_now timestamptz,
  p_expires_at timestamptz,
  p_session_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b1_create_handoff$
DECLARE
  existing saas.panel_session_handoffs%ROWTYPE;
  completed_attempt_id text;
  completed_tenant_operation_id uuid;
  completed_principal_id uuid;
  completed_store_id uuid;
BEGIN
  IF p_state_digest !~ '^[a-f0-9]{64}$'
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_session_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_session_token_key_id ~ '^\.|\.$|\.\.'
     OR p_handoff_id IS NULL OR p_session_operation_id IS NULL OR p_session_id IS NULL OR p_family_id IS NULL
     OR p_now IS NULL OR p_expires_at IS NULL OR p_session_expires_at IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_expires_at <= p_now OR p_expires_at > p_now + interval '10 minutes'
     OR p_session_expires_at <= p_now OR p_session_expires_at > p_now + interval '8 hours' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_state_digest, 2607140016)
  );

  SELECT handoff.* INTO existing
  FROM saas.panel_session_handoffs AS handoff
  WHERE handoff.state_digest = p_state_digest
  FOR UPDATE;

  IF FOUND THEN
    IF p_now >= existing.expires_at THEN
      RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
      RETURN;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM saas.registration_workflows AS workflow
      JOIN saas.registration_verified_identities AS verified
        ON verified.attempt_id = workflow.attempt_id
       AND verified.canonical_fingerprint = workflow.canonical_fingerprint
      JOIN saas.registration_tenant_completions AS completion
        ON completion.attempt_id = workflow.attempt_id
       AND completion.state = 'completed'
       AND completion.tenant_operation_id = existing.tenant_operation_id
      JOIN saas.registration_tenant_operation_proofs AS proof
        ON proof.operation_id = completion.tenant_operation_id
      JOIN saas.tenant_operations AS operation
        ON operation.id = proof.operation_id
       AND operation.status = 'committed'
       AND operation.result_principal_id = existing.principal_id
       AND operation.result_store_id = existing.active_store_id
      JOIN saas.memberships AS membership
        ON membership.id = operation.result_membership_id
       AND membership.principal_id = existing.principal_id
       AND membership.store_id = existing.active_store_id
       AND membership.role = 'store_owner'
       AND membership.status = 'active'
      WHERE workflow.attempt_id = existing.attempt_id
        AND workflow.state_digest = p_state_digest
        AND workflow.status IN ('tenant_created', 'session_created')
    ) THEN
      RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'handoff_replayed'::text, pg_catalog.jsonb_build_object(
      'handoffId', existing.handoff_id,
      'attemptId', existing.attempt_id,
      'tenantOperationId', existing.tenant_operation_id,
      'principalId', existing.principal_id,
      'activeStoreId', existing.active_store_id,
      'sessionOperationId', existing.session_operation_id,
      'sessionId', existing.session_id,
      'familyId', existing.family_id,
      'tokenKeyId', existing.token_key_id,
      'tokenDigest', existing.token_digest,
      'sessionTokenKeyId', existing.session_token_key_id,
      'issuedAt', pg_catalog.to_char(existing.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(existing.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sessionExpiresAt', pg_catalog.to_char(existing.session_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    RETURN;
  END IF;

  SELECT workflow.attempt_id, completion.tenant_operation_id,
         operation.result_principal_id, operation.result_store_id
    INTO completed_attempt_id, completed_tenant_operation_id,
         completed_principal_id, completed_store_id
  FROM saas.registration_workflows AS workflow
  JOIN saas.registration_verified_identities AS verified
    ON verified.attempt_id = workflow.attempt_id
   AND verified.canonical_fingerprint = workflow.canonical_fingerprint
  JOIN saas.registration_tenant_completions AS completion
    ON completion.attempt_id = workflow.attempt_id
   AND completion.canonical_fingerprint = workflow.canonical_fingerprint
   AND completion.state = 'completed'
   AND completion.completed_at <= p_now
  JOIN saas.registration_tenant_operation_proofs AS proof
    ON proof.operation_id = completion.tenant_operation_id
   AND proof.payload_fingerprint = workflow.canonical_fingerprint
   AND proof.tenant_idempotency_digest = workflow.tenant_idempotency_digest
   AND proof.requested_at = workflow.requested_at
  JOIN saas.tenant_operations AS operation
    ON operation.id = proof.operation_id
   AND completion.tenant_operation_id = operation.id
   AND operation.status = 'committed'
  JOIN saas.principals AS principal
    ON principal.id = operation.result_principal_id
   AND principal.email_verified
  JOIN saas.stores AS store
    ON store.id = operation.result_store_id
   AND store.status = 'active'
  JOIN saas.memberships AS membership
    ON membership.id = operation.result_membership_id
   AND membership.principal_id = principal.id
   AND membership.store_id = store.id
   AND membership.role = 'store_owner'
   AND membership.status = 'active'
  WHERE workflow.state_digest = p_state_digest
    AND workflow.status IN ('tenant_created', 'session_created')
    AND workflow.consumed_at IS NOT NULL
    AND p_now < workflow.expires_at;

  IF completed_attempt_id IS NULL
     OR completed_tenant_operation_id IS NULL
     OR completed_principal_id IS NULL
     OR completed_store_id IS NULL THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO saas.panel_session_handoffs (
    handoff_id, attempt_id, state_digest, token_key_id, token_digest,
    tenant_operation_id, principal_id, active_store_id,
    session_operation_id, session_id, family_id, session_token_key_id,
    issued_at, expires_at, session_expires_at, redeemed_at,
    version, created_at, updated_at
  ) VALUES (
    p_handoff_id, completed_attempt_id, p_state_digest, p_token_key_id, p_token_digest,
    completed_tenant_operation_id, completed_principal_id, completed_store_id,
    p_session_operation_id, p_session_id, p_family_id, p_session_token_key_id,
    p_now, p_expires_at, p_session_expires_at, NULL,
    1, p_now, p_now
  );

  RETURN QUERY SELECT 'handoff_created'::text, pg_catalog.jsonb_build_object(
    'handoffId', p_handoff_id,
    'attemptId', completed_attempt_id,
    'tenantOperationId', completed_tenant_operation_id,
    'principalId', completed_principal_id,
    'activeStoreId', completed_store_id,
    'sessionOperationId', p_session_operation_id,
    'sessionId', p_session_id,
    'familyId', p_family_id,
    'tokenKeyId', p_token_key_id,
    'tokenDigest', p_token_digest,
    'sessionTokenKeyId', p_session_token_key_id,
    'issuedAt', pg_catalog.to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', pg_catalog.to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sessionExpiresAt', pg_catalog.to_char(p_session_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
EXCEPTION
  WHEN unique_violation OR foreign_key_violation THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
END
$phase2b2b1_create_handoff$;

CREATE FUNCTION saas.recover_panel_session_handoff(
  p_state_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b1_recover_handoff$
DECLARE
  existing saas.panel_session_handoffs%ROWTYPE;
BEGIN
  IF p_state_digest !~ '^[a-f0-9]{64}$' OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT handoff.* INTO existing
  FROM saas.panel_session_handoffs AS handoff
  WHERE handoff.state_digest = p_state_digest;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_now >= existing.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'handoff_replayed'::text, pg_catalog.jsonb_build_object(
    'handoffId', existing.handoff_id,
    'attemptId', existing.attempt_id,
    'tenantOperationId', existing.tenant_operation_id,
    'principalId', existing.principal_id,
    'activeStoreId', existing.active_store_id,
    'sessionOperationId', existing.session_operation_id,
    'sessionId', existing.session_id,
    'familyId', existing.family_id,
    'tokenKeyId', existing.token_key_id,
    'tokenDigest', existing.token_digest,
    'sessionTokenKeyId', existing.session_token_key_id,
    'issuedAt', pg_catalog.to_char(existing.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', pg_catalog.to_char(existing.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sessionExpiresAt', pg_catalog.to_char(existing.session_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END
$phase2b2b1_recover_handoff$;

CREATE FUNCTION saas.redeem_panel_session_handoff(
  p_handoff_token_key_id text,
  p_handoff_token_digest text,
  p_session_token_key_id text,
  p_session_token_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b1_redeem_handoff$
DECLARE
  handoff saas.panel_session_handoffs%ROWTYPE;
  session saas.panel_sessions%ROWTYPE;
  issued_outcome text;
  issued_authority jsonb;
BEGIN
  IF p_handoff_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_handoff_token_key_id ~ '^\.|\.$|\.\.'
     OR p_handoff_token_digest !~ '^[a-f0-9]{64}$'
     OR p_session_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_session_token_key_id ~ '^\.|\.$|\.\.'
     OR p_session_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_handoff_token_digest, -2607140016)
  );

  SELECT candidate.* INTO handoff
  FROM saas.panel_session_handoffs AS candidate
  WHERE candidate.token_key_id = p_handoff_token_key_id
    AND candidate.token_digest = p_handoff_token_digest
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_now >= handoff.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF handoff.session_token_key_id <> p_session_token_key_id THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF handoff.redeemed_at IS NOT NULL THEN
    SELECT persisted.* INTO session
    FROM saas.panel_sessions AS persisted
    WHERE persisted.operation_id = handoff.session_operation_id;
    IF NOT FOUND
       OR session.session_id <> handoff.session_id
       OR session.family_id <> handoff.family_id
       OR session.operation_kind <> 'issue'
       OR session.token_key_id <> p_session_token_key_id
       OR session.token_digest <> p_session_token_digest
       OR session.principal_id <> handoff.principal_id
       OR session.active_store_id IS DISTINCT FROM handoff.active_store_id
       OR session.issued_at <> handoff.redeemed_at
       OR session.rotated_at <> handoff.redeemed_at
       OR session.expires_at <> handoff.session_expires_at
       OR session.previous_session_id IS NOT NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'session_replayed'::text, pg_catalog.jsonb_build_object(
      'session', pg_catalog.jsonb_build_object(
        'sessionId', session.session_id,
        'familyId', session.family_id,
        'principalId', session.principal_id,
        'activeStoreId', session.active_store_id,
        'version', session.version,
        'issuedAt', pg_catalog.to_char(session.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'rotatedAt', pg_catalog.to_char(session.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', pg_catalog.to_char(session.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.principals AS principal
    JOIN saas.memberships AS membership
      ON membership.principal_id = principal.id
     AND membership.store_id = handoff.active_store_id
     AND membership.role = 'store_owner'
     AND membership.status = 'active'
    JOIN saas.stores AS store
      ON store.id = membership.store_id
     AND store.status = 'active'
    WHERE principal.id = handoff.principal_id
      AND principal.email_verified
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT issued.outcome, issued.authority
    INTO issued_outcome, issued_authority
  FROM saas.issue_panel_session(
    handoff.session_id,
    handoff.family_id,
    handoff.session_operation_id,
    p_session_token_key_id,
    p_session_token_digest,
    handoff.principal_id,
    handoff.active_store_id,
    p_now,
    handoff.session_expires_at
  ) AS issued;

  IF issued_outcome <> 'issued' OR issued_authority IS NULL THEN
    RETURN QUERY SELECT CASE
      WHEN issued_outcome IN ('membership_denied', 'operation_mismatch', 'durable_authority_invalid') THEN issued_outcome
      ELSE 'durable_authority_invalid'
    END::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.panel_session_handoffs
  SET redeemed_at = p_now,
      version = version + 1,
      updated_at = p_now
  WHERE handoff_id = handoff.handoff_id
    AND redeemed_at IS NULL
    AND version = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE2B2B1_REDEMPTION_CONFLICT';
  END IF;

  RETURN QUERY SELECT 'session_issued'::text, issued_authority;
END
$phase2b2b1_redeem_handoff$;

CREATE FUNCTION saas.recover_panel_session_handoff_redemption(
  p_handoff_token_key_id text,
  p_handoff_token_digest text,
  p_session_token_key_id text,
  p_session_token_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b1_recover_redemption$
DECLARE
  handoff saas.panel_session_handoffs%ROWTYPE;
  session saas.panel_sessions%ROWTYPE;
BEGIN
  IF p_handoff_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_handoff_token_key_id ~ '^\.|\.$|\.\.'
     OR p_handoff_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR ((p_session_token_key_id IS NULL) <> (p_session_token_digest IS NULL))
     OR (p_session_token_key_id IS NOT NULL AND (
       p_session_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$'
       OR p_session_token_key_id ~ '^\.|\.$|\.\.'
       OR p_session_token_digest !~ '^[a-f0-9]{64}$'
     )) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.* INTO handoff
  FROM saas.panel_session_handoffs AS candidate
  WHERE candidate.token_key_id = p_handoff_token_key_id
    AND candidate.token_digest = p_handoff_token_digest;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_now >= handoff.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_session_token_key_id IS NULL THEN
    RETURN QUERY SELECT 'handoff_replayed'::text, pg_catalog.jsonb_build_object(
      'sessionTokenKeyId', handoff.session_token_key_id
    );
    RETURN;
  END IF;
  IF handoff.session_token_key_id <> p_session_token_key_id OR handoff.redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT persisted.* INTO session
  FROM saas.panel_sessions AS persisted
  WHERE persisted.operation_id = handoff.session_operation_id;
  IF NOT FOUND
     OR session.session_id <> handoff.session_id
     OR session.family_id <> handoff.family_id
     OR session.operation_kind <> 'issue'
     OR session.token_key_id <> p_session_token_key_id
     OR session.token_digest <> p_session_token_digest
     OR session.principal_id <> handoff.principal_id
     OR session.active_store_id IS DISTINCT FROM handoff.active_store_id
     OR session.issued_at <> handoff.redeemed_at
     OR session.rotated_at <> handoff.redeemed_at
     OR session.expires_at <> handoff.session_expires_at
     OR session.previous_session_id IS NOT NULL THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'session_replayed'::text, pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_build_object(
      'sessionId', session.session_id,
      'familyId', session.family_id,
      'principalId', session.principal_id,
      'activeStoreId', session.active_store_id,
      'version', session.version,
      'issuedAt', pg_catalog.to_char(session.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'rotatedAt', pg_catalog.to_char(session.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(session.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
END
$phase2b2b1_recover_redemption$;

ALTER FUNCTION saas.create_panel_session_handoff(text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.recover_panel_session_handoff(text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.redeem_panel_session_handoff(text,text,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.recover_panel_session_handoff_redemption(text,text,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.guard_panel_session_handoff_mutation() OWNER TO celebix_saas_owner;

REVOKE ALL ON saas.panel_session_handoffs FROM PUBLIC;
REVOKE ALL ON saas.panel_session_handoffs FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.create_panel_session_handoff(text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.recover_panel_session_handoff(text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.redeem_panel_session_handoff(text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.recover_panel_session_handoff_redemption(text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_panel_session_handoff_mutation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.create_panel_session_handoff(text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.recover_panel_session_handoff(text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.redeem_panel_session_handoff(text,text,text,text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.recover_panel_session_handoff_redemption(text,text,text,text,timestamptz) TO celebix_saas_identity;

DO $phase2b2b1_catalog_assertions$
DECLARE
  function_name text;
BEGIN
  IF (SELECT owner.rolname FROM pg_catalog.pg_class AS class JOIN pg_catalog.pg_roles AS owner ON owner.oid = class.relowner WHERE class.oid = 'saas.panel_session_handoffs'::regclass) <> 'celebix_saas_owner'
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'saas.panel_session_handoffs'::regclass) THEN
    RAISE EXCEPTION 'PHASE2B2B1_CATALOG_ASSERTION_FAILED: ownership or RLS drift';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.panel_session_handoffs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.panel_session_handoffs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B2B1_CATALOG_ASSERTION_FAILED: direct table privilege';
  END IF;
  FOREACH function_name IN ARRAY ARRAY[
    'saas.create_panel_session_handoff(text,text,text,text,uuid,uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)',
    'saas.recover_panel_session_handoff(text,timestamp with time zone)',
    'saas.redeem_panel_session_handoff(text,text,text,text,timestamp with time zone)',
    'saas.recover_panel_session_handoff_redemption(text,text,text,text,timestamp with time zone)'
  ] LOOP
    IF NOT pg_catalog.has_function_privilege('celebix_saas_identity', function_name, 'EXECUTE')
       OR pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE2B2B1_CATALOG_ASSERTION_FAILED: function grant drift';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'saas'
      AND procedure.proname IN (
        'create_panel_session_handoff', 'recover_panel_session_handoff',
        'redeem_panel_session_handoff', 'recover_panel_session_handoff_redemption'
      )
      AND (
        owner.rolname <> 'celebix_saas_owner'
        OR NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2B2B1_CATALOG_ASSERTION_FAILED: function ownership or search_path drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'saas.panel_session_handoffs'::regclass AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'PHASE2B2B1_CATALOG_ASSERTION_FAILED: mutation guard drift';
  END IF;
END
$phase2b2b1_catalog_assertions$;

COMMIT;
