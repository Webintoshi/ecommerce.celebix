-- Phase 2B2B2A.1 durable pre-auth browser-binding authority. Disabled and unmounted by default.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b2b2a1_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.registration_workflows') IS NULL
     OR pg_catalog.to_regclass('saas.oidc_transactions') IS NULL
     OR pg_catalog.to_regclass('saas.panel_session_handoffs') IS NULL THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_PREREQUISITE_MISSING';
  END IF;
END
$phase2b2b2a1_precondition$;

CREATE TABLE saas.panel_browser_bindings (
  binding_id uuid PRIMARY KEY,
  attempt_id text NOT NULL,
  state_digest character(64) NOT NULL,
  oidc_state_digest character(64) NOT NULL,
  bootstrap_token_key_id text NOT NULL,
  bootstrap_token_digest character(64) NOT NULL,
  authorization_url_digest character(64) NOT NULL,
  browser_binding_key_id text,
  browser_binding_digest character(64),
  issued_at timestamptz NOT NULL,
  bootstrap_expires_at timestamptz NOT NULL,
  bootstrap_redeemed_at timestamptz,
  browser_binding_expires_at timestamptz,
  callback_claimed_at timestamptz,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT panel_browser_bindings_attempt_unique UNIQUE (attempt_id),
  CONSTRAINT panel_browser_bindings_state_unique UNIQUE (state_digest),
  CONSTRAINT panel_browser_bindings_oidc_state_unique UNIQUE (oidc_state_digest),
  CONSTRAINT panel_browser_bindings_bootstrap_unique UNIQUE (bootstrap_token_key_id, bootstrap_token_digest),
  CONSTRAINT panel_browser_bindings_browser_unique UNIQUE (browser_binding_key_id, browser_binding_digest),
  CONSTRAINT panel_browser_bindings_workflow_fk
    FOREIGN KEY (attempt_id) REFERENCES saas.registration_workflows(attempt_id) ON DELETE RESTRICT,
  CONSTRAINT panel_browser_bindings_oidc_fk
    FOREIGN KEY (oidc_state_digest) REFERENCES saas.oidc_transactions(state_digest) ON DELETE RESTRICT,
  CONSTRAINT panel_browser_bindings_attempt_format
    CHECK (attempt_id ~ '^attempt_[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT panel_browser_bindings_state_digest_format
    CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_browser_bindings_oidc_state_digest_format
    CHECK (oidc_state_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_browser_bindings_bootstrap_key_format
    CHECK (bootstrap_token_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND bootstrap_token_key_id !~ '^\.|\.$|\.\.'),
  CONSTRAINT panel_browser_bindings_bootstrap_digest_format
    CHECK (bootstrap_token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_browser_bindings_authorization_digest_format
    CHECK (authorization_url_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_browser_bindings_browser_key_format
    CHECK (browser_binding_key_id IS NULL OR (
      browser_binding_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND browser_binding_key_id !~ '^\.|\.$|\.\.'
    )),
  CONSTRAINT panel_browser_bindings_browser_digest_format
    CHECK (browser_binding_digest IS NULL OR browser_binding_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_browser_bindings_bootstrap_lifetime
    CHECK (issued_at < bootstrap_expires_at AND bootstrap_expires_at <= issued_at + interval '5 minutes'),
  CONSTRAINT panel_browser_bindings_browser_lifetime
    CHECK (
      browser_binding_expires_at IS NULL OR (
        bootstrap_redeemed_at IS NOT NULL
        AND bootstrap_redeemed_at < browser_binding_expires_at
        AND browser_binding_expires_at <= bootstrap_redeemed_at + interval '15 minutes'
      )
    ),
  CONSTRAINT panel_browser_bindings_redemption_time
    CHECK (bootstrap_redeemed_at IS NULL OR (
      bootstrap_redeemed_at >= issued_at AND bootstrap_redeemed_at < bootstrap_expires_at
    )),
  CONSTRAINT panel_browser_bindings_claim_time
    CHECK (callback_claimed_at IS NULL OR (
      bootstrap_redeemed_at IS NOT NULL
      AND browser_binding_expires_at IS NOT NULL
      AND callback_claimed_at >= bootstrap_redeemed_at
      AND callback_claimed_at < browser_binding_expires_at
    )),
  CONSTRAINT panel_browser_bindings_version_shape CHECK (
    (version = 1
      AND bootstrap_redeemed_at IS NULL
      AND browser_binding_key_id IS NULL
      AND browser_binding_digest IS NULL
      AND browser_binding_expires_at IS NULL
      AND callback_claimed_at IS NULL)
    OR
    (version = 2
      AND bootstrap_redeemed_at IS NOT NULL
      AND browser_binding_key_id IS NOT NULL
      AND browser_binding_digest IS NOT NULL
      AND browser_binding_expires_at IS NOT NULL
      AND callback_claimed_at IS NULL)
    OR
    (version = 3
      AND bootstrap_redeemed_at IS NOT NULL
      AND browser_binding_key_id IS NOT NULL
      AND browser_binding_digest IS NOT NULL
      AND browser_binding_expires_at IS NOT NULL
      AND callback_claimed_at IS NOT NULL)
  ),
  CONSTRAINT panel_browser_bindings_timestamp_shape CHECK (
    created_at = issued_at
    AND updated_at = COALESCE(callback_claimed_at, bootstrap_redeemed_at, issued_at)
  )
);

CREATE INDEX panel_browser_bindings_cleanup_idx
  ON saas.panel_browser_bindings (
    COALESCE(browser_binding_expires_at, bootstrap_expires_at),
    binding_id
  );

ALTER TABLE saas.panel_browser_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_browser_bindings FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.guard_panel_browser_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b2b2a1_binding_guard$
BEGIN
  IF NEW.binding_id IS DISTINCT FROM OLD.binding_id
     OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.state_digest IS DISTINCT FROM OLD.state_digest
     OR NEW.oidc_state_digest IS DISTINCT FROM OLD.oidc_state_digest
     OR NEW.bootstrap_token_key_id IS DISTINCT FROM OLD.bootstrap_token_key_id
     OR NEW.bootstrap_token_digest IS DISTINCT FROM OLD.bootstrap_token_digest
     OR NEW.authorization_url_digest IS DISTINCT FROM OLD.authorization_url_digest
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.bootstrap_expires_at IS DISTINCT FROM OLD.bootstrap_expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_IMMUTABLE_BROWSER_BINDING_AUTHORITY';
  END IF;

  IF OLD.version = 1 AND NEW.version = 2 THEN
    IF OLD.bootstrap_redeemed_at IS NOT NULL
       OR NEW.bootstrap_redeemed_at IS NULL
       OR NEW.browser_binding_key_id IS NULL
       OR NEW.browser_binding_digest IS NULL
       OR NEW.browser_binding_expires_at IS NULL
       OR NEW.callback_claimed_at IS NOT NULL
       OR NEW.updated_at IS DISTINCT FROM NEW.bootstrap_redeemed_at THEN
      RAISE EXCEPTION 'PHASE2B2B2A1_INVALID_BROWSER_BINDING_TRANSITION';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM saas.registration_workflows AS workflow
      JOIN saas.oidc_transactions AS oidc
        ON oidc.state_digest = NEW.oidc_state_digest
       AND oidc.status = 'active'
       AND oidc.consumed_at IS NULL
       AND oidc.discarded_at IS NULL
      WHERE workflow.attempt_id = NEW.attempt_id
        AND workflow.state_digest = NEW.state_digest
        AND workflow.status = 'awaiting_identity'
        AND workflow.consumed_at IS NULL
        AND workflow.terminal_at IS NULL
        AND NEW.browser_binding_expires_at <= workflow.expires_at
        AND NEW.browser_binding_expires_at <= oidc.expires_at
    ) THEN
      RAISE EXCEPTION 'PHASE2B2B2A1_INVALID_BROWSER_BINDING_EXPIRY';
    END IF;
  ELSIF OLD.version = 2 AND NEW.version = 3 THEN
    IF NEW.bootstrap_redeemed_at IS DISTINCT FROM OLD.bootstrap_redeemed_at
       OR NEW.browser_binding_key_id IS DISTINCT FROM OLD.browser_binding_key_id
       OR NEW.browser_binding_digest IS DISTINCT FROM OLD.browser_binding_digest
       OR NEW.browser_binding_expires_at IS DISTINCT FROM OLD.browser_binding_expires_at
       OR OLD.callback_claimed_at IS NOT NULL
       OR NEW.callback_claimed_at IS NULL
       OR NEW.updated_at IS DISTINCT FROM NEW.callback_claimed_at THEN
      RAISE EXCEPTION 'PHASE2B2B2A1_INVALID_BROWSER_BINDING_TRANSITION';
    END IF;
  ELSE
    RAISE EXCEPTION 'PHASE2B2B2A1_INVALID_BROWSER_BINDING_TRANSITION';
  END IF;
  RETURN NEW;
END
$phase2b2b2a1_binding_guard$;

CREATE TRIGGER panel_browser_bindings_guard
BEFORE UPDATE ON saas.panel_browser_bindings
FOR EACH ROW EXECUTE FUNCTION saas.guard_panel_browser_binding_mutation();

CREATE FUNCTION saas.create_panel_browser_bootstrap(
  p_state_digest text,
  p_oidc_state_digest text,
  p_bootstrap_token_key_id text,
  p_bootstrap_token_digest text,
  p_authorization_url_digest text,
  p_binding_id uuid,
  p_issued_at timestamptz,
  p_bootstrap_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b2a1_create_bootstrap$
DECLARE
  existing saas.panel_browser_bindings%ROWTYPE;
  resolved_attempt_id text;
  resolved_authority_expiry timestamptz;
BEGIN
  IF p_state_digest !~ '^[a-f0-9]{64}$'
     OR p_oidc_state_digest !~ '^[a-f0-9]{64}$'
     OR p_bootstrap_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_bootstrap_token_key_id ~ '^\.|\.$|\.\.'
     OR p_bootstrap_token_digest !~ '^[a-f0-9]{64}$'
     OR p_authorization_url_digest !~ '^[a-f0-9]{64}$'
     OR p_binding_id IS NULL OR p_issued_at IS NULL OR p_bootstrap_expires_at IS NULL
     OR p_issued_at < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_issued_at > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_bootstrap_expires_at <= p_issued_at
     OR p_bootstrap_expires_at > p_issued_at + interval '5 minutes' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_state_digest, 2607140017)
  );

  SELECT workflow.attempt_id, LEAST(workflow.expires_at, oidc.expires_at)
    INTO resolved_attempt_id, resolved_authority_expiry
  FROM saas.registration_workflows AS workflow
  JOIN saas.oidc_transactions AS oidc
    ON oidc.state_digest = p_oidc_state_digest
   AND oidc.status = 'active'
   AND oidc.consumed_at IS NULL
   AND oidc.discarded_at IS NULL
  WHERE workflow.state_digest = p_state_digest
    AND workflow.status = 'awaiting_identity'
    AND workflow.consumed_at IS NULL
    AND workflow.terminal_at IS NULL
    AND p_issued_at < workflow.expires_at
    AND p_issued_at < oidc.expires_at
  FOR SHARE OF workflow, oidc;

  IF resolved_attempt_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM saas.registration_workflows AS workflow
      JOIN saas.oidc_transactions AS oidc ON oidc.state_digest = p_oidc_state_digest
      WHERE workflow.state_digest = p_state_digest
        AND p_issued_at >= LEAST(workflow.expires_at, oidc.expires_at)
    ) THEN
      RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF p_bootstrap_expires_at > resolved_authority_expiry THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.* INTO existing
  FROM saas.panel_browser_bindings AS candidate
  WHERE candidate.state_digest = p_state_digest
     OR candidate.attempt_id = resolved_attempt_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.version <> 1
       OR existing.binding_id <> p_binding_id
       OR existing.attempt_id <> resolved_attempt_id
       OR existing.state_digest <> p_state_digest
       OR existing.oidc_state_digest <> p_oidc_state_digest
       OR existing.bootstrap_token_key_id <> p_bootstrap_token_key_id
       OR existing.bootstrap_token_digest <> p_bootstrap_token_digest
       OR existing.authorization_url_digest <> p_authorization_url_digest
       OR existing.issued_at <> p_issued_at
       OR existing.bootstrap_expires_at <> p_bootstrap_expires_at THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    IF p_issued_at >= existing.bootstrap_expires_at THEN
      RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'browser_bootstrap_replayed'::text, pg_catalog.jsonb_build_object(
      'bindingId', existing.binding_id,
      'attemptId', existing.attempt_id,
      'stateDigest', existing.state_digest,
      'oidcStateDigest', existing.oidc_state_digest,
      'bootstrapTokenKeyId', existing.bootstrap_token_key_id,
      'bootstrapTokenDigest', existing.bootstrap_token_digest,
      'authorizationUrlDigest', existing.authorization_url_digest,
      'issuedAt', pg_catalog.to_char(existing.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'bootstrapExpiresAt', pg_catalog.to_char(existing.bootstrap_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'version', existing.version
    );
    RETURN;
  END IF;

  INSERT INTO saas.panel_browser_bindings (
    binding_id, attempt_id, state_digest, oidc_state_digest, bootstrap_token_key_id, bootstrap_token_digest,
    authorization_url_digest, browser_binding_key_id, browser_binding_digest,
    issued_at, bootstrap_expires_at, bootstrap_redeemed_at, browser_binding_expires_at,
    callback_claimed_at, version, created_at, updated_at
  ) VALUES (
    p_binding_id, resolved_attempt_id, p_state_digest, p_oidc_state_digest, p_bootstrap_token_key_id, p_bootstrap_token_digest,
    p_authorization_url_digest, NULL, NULL,
    p_issued_at, p_bootstrap_expires_at, NULL, NULL,
    NULL, 1, p_issued_at, p_issued_at
  );

  RETURN QUERY SELECT 'browser_bootstrap_created'::text, pg_catalog.jsonb_build_object(
    'bindingId', p_binding_id,
    'attemptId', resolved_attempt_id,
    'stateDigest', p_state_digest,
    'oidcStateDigest', p_oidc_state_digest,
    'bootstrapTokenKeyId', p_bootstrap_token_key_id,
    'bootstrapTokenDigest', p_bootstrap_token_digest,
    'authorizationUrlDigest', p_authorization_url_digest,
    'issuedAt', pg_catalog.to_char(p_issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'bootstrapExpiresAt', pg_catalog.to_char(p_bootstrap_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'version', 1
  );
EXCEPTION
  WHEN unique_violation OR foreign_key_violation THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
END
$phase2b2b2a1_create_bootstrap$;

CREATE FUNCTION saas.bind_panel_browser_credential(
  p_bootstrap_token_key_id text,
  p_bootstrap_token_digest text,
  p_authorization_url_digest text,
  p_browser_binding_key_id text,
  p_browser_binding_digest text,
  p_now timestamptz,
  p_browser_binding_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b2a1_bind_browser$
DECLARE
  existing saas.panel_browser_bindings%ROWTYPE;
  resolved_authority_expiry timestamptz;
  effective_binding_expiry timestamptz;
BEGIN
  IF p_bootstrap_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_bootstrap_token_key_id ~ '^\.|\.$|\.\.'
     OR p_bootstrap_token_digest !~ '^[a-f0-9]{64}$'
     OR p_authorization_url_digest !~ '^[a-f0-9]{64}$'
     OR p_browser_binding_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_browser_binding_key_id ~ '^\.|\.$|\.\.'
     OR p_browser_binding_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL OR p_browser_binding_expires_at IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_browser_binding_expires_at <= p_now
     OR p_browser_binding_expires_at > p_now + interval '15 minutes' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.* INTO existing
  FROM saas.panel_browser_bindings AS candidate
  WHERE candidate.bootstrap_token_key_id = p_bootstrap_token_key_id
    AND candidate.bootstrap_token_digest = p_bootstrap_token_digest
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF existing.authorization_url_digest <> p_authorization_url_digest THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF existing.version = 1 AND p_now >= existing.bootstrap_expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF existing.version IN (2, 3) AND p_now >= existing.browser_binding_expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT LEAST(workflow.expires_at, oidc.expires_at)
    INTO resolved_authority_expiry
  FROM saas.registration_workflows AS workflow
  JOIN saas.oidc_transactions AS oidc
    ON oidc.state_digest = existing.oidc_state_digest
   AND oidc.status = 'active'
   AND oidc.consumed_at IS NULL
   AND oidc.discarded_at IS NULL
  WHERE workflow.attempt_id = existing.attempt_id
    AND workflow.state_digest = existing.state_digest
    AND workflow.status = 'awaiting_identity'
    AND workflow.consumed_at IS NULL
    AND workflow.terminal_at IS NULL
    AND p_now < workflow.expires_at
    AND p_now < oidc.expires_at
  FOR SHARE OF workflow, oidc;

  IF resolved_authority_expiry IS NULL THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  effective_binding_expiry := LEAST(p_browser_binding_expires_at, resolved_authority_expiry);
  IF effective_binding_expiry <= p_now THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF existing.version = 2 THEN
    IF existing.browser_binding_key_id <> p_browser_binding_key_id
       OR existing.browser_binding_digest <> p_browser_binding_digest THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'browser_binding_replayed'::text, pg_catalog.jsonb_build_object(
      'authorizationUrlDigest', existing.authorization_url_digest,
      'browserBindingKeyId', existing.browser_binding_key_id,
      'browserBindingDigest', existing.browser_binding_digest,
      'browserBindingExpiresAt', pg_catalog.to_char(existing.browser_binding_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'version', existing.version
    );
    RETURN;
  END IF;
  IF existing.version <> 1 THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.panel_browser_bindings
  SET bootstrap_redeemed_at = p_now,
      browser_binding_key_id = p_browser_binding_key_id,
      browser_binding_digest = p_browser_binding_digest,
      browser_binding_expires_at = effective_binding_expiry,
      version = 2,
      updated_at = p_now
  WHERE binding_id = existing.binding_id
    AND version = 1
    AND bootstrap_redeemed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_BROWSER_BINDING_CONFLICT';
  END IF;

  RETURN QUERY SELECT 'browser_binding_created'::text, pg_catalog.jsonb_build_object(
    'authorizationUrlDigest', existing.authorization_url_digest,
    'browserBindingKeyId', p_browser_binding_key_id,
    'browserBindingDigest', p_browser_binding_digest,
    'browserBindingExpiresAt', pg_catalog.to_char(effective_binding_expiry AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'version', 2
  );
END
$phase2b2b2a1_bind_browser$;

CREATE FUNCTION saas.claim_panel_browser_callback(
  p_state_digest text,
  p_oidc_state_digest text,
  p_browser_binding_key_ids text[],
  p_browser_binding_digests text[],
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b2a1_claim_callback$
DECLARE
  existing saas.panel_browser_bindings%ROWTYPE;
  key_position integer;
BEGIN
  IF p_state_digest !~ '^[a-f0-9]{64}$'
     OR p_oidc_state_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL
     OR p_browser_binding_key_ids IS NULL
     OR p_browser_binding_digests IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR NOT (cardinality(p_browser_binding_key_ids) BETWEEN 1 AND 16)
     OR cardinality(p_browser_binding_key_ids) <> cardinality(p_browser_binding_digests)
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_browser_binding_key_ids) AS candidate(key_id)
       WHERE candidate.key_id IS NULL OR candidate.key_id !~ '^[A-Za-z0-9._-]{1,64}$'
          OR candidate.key_id ~ '^\.|\.$|\.\.'
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_browser_binding_digests) AS candidate(digest)
       WHERE candidate.digest IS NULL OR candidate.digest !~ '^[a-f0-9]{64}$'
     )
     OR (SELECT pg_catalog.count(DISTINCT key_id) FROM pg_catalog.unnest(p_browser_binding_key_ids) AS candidate(key_id))
        <> cardinality(p_browser_binding_key_ids) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.* INTO existing
  FROM saas.panel_browser_bindings AS candidate
  WHERE candidate.state_digest = p_state_digest
    AND candidate.oidc_state_digest = p_oidc_state_digest
  FOR UPDATE;

  IF NOT FOUND OR existing.version = 1 OR existing.browser_binding_key_id IS NULL THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;

  key_position := pg_catalog.array_position(p_browser_binding_key_ids, existing.browser_binding_key_id);
  IF key_position IS NULL THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_browser_binding_digests[key_position] <> existing.browser_binding_digest THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF existing.version = 3 THEN
    RETURN QUERY SELECT 'callback_replayed'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF existing.version <> 2 OR existing.bootstrap_redeemed_at IS NULL THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_now >= existing.browser_binding_expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM saas.registration_workflows AS workflow
    JOIN saas.oidc_transactions AS oidc
      ON oidc.state_digest = existing.oidc_state_digest
     AND oidc.status = 'active'
     AND oidc.consumed_at IS NULL
     AND oidc.discarded_at IS NULL
    WHERE workflow.attempt_id = existing.attempt_id
      AND workflow.state_digest = existing.state_digest
      AND workflow.status = 'awaiting_identity'
      AND workflow.consumed_at IS NULL
      AND workflow.terminal_at IS NULL
      AND p_now < workflow.expires_at
      AND p_now < oidc.expires_at
  ) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.panel_browser_bindings
  SET callback_claimed_at = p_now,
      version = 3,
      updated_at = p_now
  WHERE binding_id = existing.binding_id
    AND callback_claimed_at IS NULL
    AND version = 2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_CALLBACK_CLAIM_CONFLICT';
  END IF;

  RETURN QUERY SELECT 'browser_callback_claimed'::text, pg_catalog.jsonb_build_object(
    'callbackClaimedAt', pg_catalog.to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'version', 3
  );
END
$phase2b2b2a1_claim_callback$;

CREATE FUNCTION saas.cleanup_panel_browser_bindings(
  p_now timestamptz,
  p_limit integer
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2b2a1_cleanup$
DECLARE
  deleted_count integer;
BEGIN
  IF p_now IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  WITH candidates AS (
    SELECT binding.binding_id
    FROM saas.panel_browser_bindings AS binding
    WHERE (binding.version = 1 AND binding.bootstrap_expires_at <= p_now)
       OR (binding.version = 2 AND binding.browser_binding_expires_at <= p_now)
       OR (binding.version = 3 AND binding.browser_binding_expires_at <= p_now)
    ORDER BY COALESCE(binding.browser_binding_expires_at, binding.bootstrap_expires_at), binding.binding_id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM saas.panel_browser_bindings AS binding
    USING candidates
    WHERE binding.binding_id = candidates.binding_id
    RETURNING binding.binding_id
  )
  SELECT pg_catalog.count(*)::integer INTO deleted_count FROM deleted;

  RETURN QUERY SELECT 'cleaned'::text, pg_catalog.jsonb_build_object('count', deleted_count);
END
$phase2b2b2a1_cleanup$;

ALTER FUNCTION saas.guard_panel_browser_binding_mutation() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.bind_panel_browser_credential(text,text,text,text,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.claim_panel_browser_callback(text,text,text[],text[],timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.cleanup_panel_browser_bindings(timestamptz,integer) OWNER TO celebix_saas_owner;

REVOKE ALL ON saas.panel_browser_bindings FROM PUBLIC;
REVOKE ALL ON saas.panel_browser_bindings FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.guard_panel_browser_binding_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.bind_panel_browser_credential(text,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.claim_panel_browser_callback(text,text,text[],text[],timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.cleanup_panel_browser_bindings(timestamptz,integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.bind_panel_browser_credential(text,text,text,text,text,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.claim_panel_browser_callback(text,text,text[],text[],timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.cleanup_panel_browser_bindings(timestamptz,integer) TO celebix_saas_identity;

DO $phase2b2b2a1_catalog_assertions$
DECLARE
  function_name text;
BEGIN
  IF (SELECT owner.rolname FROM pg_catalog.pg_class AS class
      JOIN pg_catalog.pg_roles AS owner ON owner.oid = class.relowner
      WHERE class.oid = 'saas.panel_browser_bindings'::regclass) <> 'celebix_saas_owner'
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity
             FROM pg_catalog.pg_class WHERE oid = 'saas.panel_browser_bindings'::regclass) THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_CATALOG_ASSERTION_FAILED: ownership or RLS drift';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.panel_browser_bindings', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.panel_browser_bindings', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_CATALOG_ASSERTION_FAILED: direct table privilege';
  END IF;
  FOREACH function_name IN ARRAY ARRAY[
    'saas.create_panel_browser_bootstrap(text,text,text,text,text,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.bind_panel_browser_credential(text,text,text,text,text,timestamp with time zone,timestamp with time zone)',
    'saas.claim_panel_browser_callback(text,text,text[],text[],timestamp with time zone)',
    'saas.cleanup_panel_browser_bindings(timestamp with time zone,integer)'
  ] LOOP
    IF NOT pg_catalog.has_function_privilege('celebix_saas_identity', function_name, 'EXECUTE')
       OR pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE2B2B2A1_CATALOG_ASSERTION_FAILED: function grant drift';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'saas'
      AND procedure.proname IN (
        'create_panel_browser_bootstrap', 'bind_panel_browser_credential',
        'claim_panel_browser_callback', 'cleanup_panel_browser_bindings'
      )
      AND (
        owner.rolname <> 'celebix_saas_owner'
        OR NOT procedure.prosecdef
        OR NOT (procedure.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[])
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2B2B2A1_CATALOG_ASSERTION_FAILED: function authority drift';
  END IF;
END
$phase2b2b2a1_catalog_assertions$;

COMMIT;
