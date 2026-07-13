-- Phase 2B2A disabled-by-default customer-panel session authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2b2a_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.panel_sessions') IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity') THEN
    RAISE EXCEPTION 'PHASE2B2A_MIGRATION_PRECONDITION_FAILED';
  END IF;
END
$phase2b2a_precondition$;

CREATE TABLE saas.panel_sessions (
  session_id uuid,
  family_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  operation_kind text NOT NULL,
  token_key_id text NOT NULL,
  token_digest character(64) NOT NULL,
  principal_id uuid NOT NULL,
  active_store_id uuid,
  previous_session_id uuid,
  replaced_by_session_id uuid,
  version bigint NOT NULL DEFAULT 1,
  issued_at timestamptz NOT NULL,
  rotated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT panel_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT panel_sessions_operation_key UNIQUE (operation_id),
  CONSTRAINT panel_sessions_token_key UNIQUE (token_key_id, token_digest),
  CONSTRAINT panel_sessions_principal_fk FOREIGN KEY (principal_id) REFERENCES saas.principals(id) ON DELETE RESTRICT,
  CONSTRAINT panel_sessions_active_store_fk FOREIGN KEY (active_store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT panel_sessions_previous_fk FOREIGN KEY (previous_session_id) REFERENCES saas.panel_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT panel_sessions_replaced_by_fk FOREIGN KEY (replaced_by_session_id) REFERENCES saas.panel_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT panel_sessions_operation_kind_check CHECK (operation_kind IN ('issue', 'rotate')),
  CONSTRAINT panel_sessions_token_key_id_check CHECK (
    token_key_id ~ '^[A-Za-z0-9._-]{1,64}$'
    AND token_key_id !~ '^\.'
    AND token_key_id !~ '\.$'
    AND token_key_id !~ '\.\.'
  ),
  CONSTRAINT panel_sessions_token_digest_check CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT panel_sessions_self_reference_check CHECK (
    (previous_session_id IS NULL OR session_id <> previous_session_id)
    AND (replaced_by_session_id IS NULL OR session_id <> replaced_by_session_id)
  ),
  CONSTRAINT panel_sessions_version_check CHECK (version BETWEEN 1 AND 2147483647),
  CONSTRAINT panel_sessions_timestamp_order_check CHECK (
    issued_at <= rotated_at AND rotated_at < expires_at
    AND expires_at <= issued_at + interval '8 hours'
    AND updated_at >= created_at
  ),
  CONSTRAINT panel_sessions_revocation_shape_check CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL)
    OR (
      revoked_at IS NOT NULL
      AND revoked_at >= issued_at
      AND revocation_reason IN ('logout', 'rotation', 'security', 'administrative', 'expired')
    )
  ),
  CONSTRAINT panel_sessions_replacement_shape_check CHECK (
    replaced_by_session_id IS NULL
    OR (revoked_at IS NOT NULL AND revocation_reason = 'rotation')
  )
);

CREATE UNIQUE INDEX panel_sessions_previous_unique_idx
  ON saas.panel_sessions (previous_session_id)
  WHERE previous_session_id IS NOT NULL;
CREATE INDEX panel_sessions_token_lookup_idx ON saas.panel_sessions (token_key_id, token_digest);
CREATE INDEX panel_sessions_principal_idx ON saas.panel_sessions (principal_id, revoked_at, expires_at);
CREATE INDEX panel_sessions_family_active_idx ON saas.panel_sessions (family_id, revoked_at, expires_at);
CREATE INDEX panel_sessions_active_store_idx ON saas.panel_sessions (active_store_id, principal_id) WHERE active_store_id IS NOT NULL;
CREATE INDEX panel_sessions_expiry_idx ON saas.panel_sessions (expires_at, session_id) WHERE revoked_at IS NULL;
CREATE INDEX panel_sessions_replacement_idx ON saas.panel_sessions (replaced_by_session_id) WHERE replaced_by_session_id IS NOT NULL;

ALTER TABLE saas.panel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.panel_sessions FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.issue_panel_session(
  p_session_id uuid,
  p_family_id uuid,
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text,
  p_principal_id uuid,
  p_active_store_id uuid,
  p_now timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_issue$
DECLARE
  existing saas.panel_sessions%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_family_id IS NULL OR p_operation_id IS NULL OR p_principal_id IS NULL
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL OR p_expires_at IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_expires_at <= p_now OR p_expires_at > p_now + interval '8 hours' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT session.* INTO existing
  FROM saas.panel_sessions AS session
  WHERE session.operation_id = p_operation_id;

  IF FOUND THEN
    IF existing.operation_kind <> 'issue'
       OR existing.token_key_id <> p_token_key_id
       OR existing.token_digest <> p_token_digest
       OR existing.principal_id <> p_principal_id
       OR existing.active_store_id IS DISTINCT FROM p_active_store_id
       OR existing.issued_at <> p_now
       OR existing.rotated_at <> p_now
       OR existing.expires_at <> p_expires_at
       OR existing.previous_session_id IS NOT NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
      'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sessionId', existing.session_id, 'familyId', existing.family_id,
        'principalId', existing.principal_id, 'activeStoreId', existing.active_store_id,
        'version', existing.version,
        'issuedAt', pg_catalog.to_char(existing.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'rotatedAt', pg_catalog.to_char(existing.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', pg_catalog.to_char(existing.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ))
    );
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.principals AS principal
    WHERE principal.id = p_principal_id AND principal.email_verified
  ) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF p_active_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM saas.stores AS store
    JOIN saas.memberships AS membership
      ON membership.store_id = store.id
     AND membership.principal_id = p_principal_id
     AND membership.status = 'active'
    WHERE store.id = p_active_store_id AND store.status = 'active'
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO saas.panel_sessions (
    session_id, family_id, operation_id, operation_kind, token_key_id, token_digest,
    principal_id, active_store_id, previous_session_id, replaced_by_session_id,
    version, issued_at, rotated_at, expires_at, revoked_at, revocation_reason, created_at, updated_at
  ) VALUES (
    p_session_id, p_family_id, p_operation_id, 'issue', p_token_key_id, p_token_digest,
    p_principal_id, p_active_store_id, NULL, NULL,
    1, p_now, p_now, p_expires_at, NULL, NULL, p_now, p_now
  );

  RETURN QUERY SELECT 'issued'::text, pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'sessionId', p_session_id, 'familyId', p_family_id,
      'principalId', p_principal_id, 'activeStoreId', p_active_store_id,
      'version', 1,
      'issuedAt', pg_catalog.to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'rotatedAt', pg_catalog.to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
  );
END
$phase2b2a_issue$;

CREATE FUNCTION saas.resolve_panel_session(
  p_token_key_id text,
  p_token_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_resolve$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
  principal_row saas.principals%ROWTYPE;
  candidate_store_id uuid;
  candidate_count integer;
  tenant_authority jsonb;
BEGIN
  IF p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_token_key_id AND session.token_digest = p_token_digest;

  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT principal.* INTO principal_row
  FROM saas.principals AS principal
  WHERE principal.id = current_session.principal_id AND principal.email_verified;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF current_session.active_store_id IS NULL THEN
    SELECT pg_catalog.count(*)::integer
      INTO candidate_count
    FROM saas.memberships AS membership
    JOIN saas.stores AS store ON store.id = membership.store_id AND store.status = 'active'
    WHERE membership.principal_id = current_session.principal_id AND membership.status = 'active';
    IF candidate_count <> 1 THEN
      RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
      RETURN;
    END IF;
    SELECT store.id INTO candidate_store_id
    FROM saas.memberships AS membership
    JOIN saas.stores AS store ON store.id = membership.store_id AND store.status = 'active'
    WHERE membership.principal_id = current_session.principal_id AND membership.status = 'active'
    ORDER BY store.id
    LIMIT 1;
    RETURN QUERY SELECT 'resolved'::text, pg_catalog.jsonb_build_object(
      'session', pg_catalog.jsonb_build_object(
        'sessionId', current_session.session_id, 'familyId', current_session.family_id,
        'principalId', current_session.principal_id, 'version', current_session.version,
        'issuedAt', pg_catalog.to_char(current_session.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'rotatedAt', pg_catalog.to_char(current_session.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', pg_catalog.to_char(current_session.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'principal', pg_catalog.jsonb_build_object('issuer', principal_row.issuer, 'subject', principal_row.subject),
      'selectionCandidate', pg_catalog.jsonb_build_object('storeId', candidate_store_id)
    );
    RETURN;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'store', pg_catalog.jsonb_build_object('id', store.id, 'slug', store.slug, 'status', store.status),
    'membership', pg_catalog.jsonb_build_object('id', membership.id, 'role', membership.role, 'status', membership.status),
    'entitlements', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'schemaVersion', 1, 'planId', plan.id, 'planCode', plan.plan_code,
      'version', plan.version, 'status', subscription.status,
      'features', (
        SELECT COALESCE(pg_catalog.jsonb_agg(feature.feature_key ORDER BY feature.feature_ordinal), '[]'::jsonb)
        FROM saas.plan_features AS feature WHERE feature.plan_id = plan.id AND feature.enabled
      ),
      'limits', (
        SELECT COALESCE(
          pg_catalog.jsonb_object_agg(limit_row.limit_key, limit_row.effective_limit ORDER BY limit_row.limit_ordinal),
          '{}'::jsonb
        ) FROM saas.plan_limits AS limit_row WHERE limit_row.plan_id = plan.id
      ),
      'validFrom', pg_catalog.to_char(subscription.valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'validUntil', CASE WHEN subscription.valid_until IS NULL THEN NULL ELSE
        pg_catalog.to_char(subscription.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
    )),
    'locale', store.locale
  ) INTO tenant_authority
  FROM saas.stores AS store
  JOIN saas.memberships AS membership
    ON membership.store_id = store.id
   AND membership.principal_id = current_session.principal_id
   AND membership.status = 'active'
  JOIN saas.subscriptions AS subscription
    ON subscription.store_id = store.id
   AND subscription.status = 'active'
   AND subscription.valid_from <= p_now
   AND (subscription.valid_until IS NULL OR p_now < subscription.valid_until)
  JOIN saas.plans AS plan
    ON plan.id = subscription.plan_id
   AND plan.plan_code = subscription.plan_code
   AND plan.version = subscription.plan_version
   AND plan.status = 'active'
   AND plan.valid_from <= p_now
   AND (plan.valid_until IS NULL OR p_now < plan.valid_until)
  WHERE store.id = current_session.active_store_id AND store.status = 'active';

  IF tenant_authority IS NULL THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'resolved'::text, pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_build_object(
      'sessionId', current_session.session_id, 'familyId', current_session.family_id,
      'principalId', current_session.principal_id, 'activeStoreId', current_session.active_store_id,
      'version', current_session.version,
      'issuedAt', pg_catalog.to_char(current_session.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'rotatedAt', pg_catalog.to_char(current_session.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(current_session.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'principal', pg_catalog.jsonb_build_object('issuer', principal_row.issuer, 'subject', principal_row.subject),
    'tenant', tenant_authority
  );
END
$phase2b2a_resolve$;

CREATE FUNCTION saas.rotate_panel_session(
  p_current_token_key_id text,
  p_current_token_digest text,
  p_session_id uuid,
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text,
  p_requested_store_id uuid,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_rotate$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
  existing saas.panel_sessions%ROWTYPE;
  previous saas.panel_sessions%ROWTYPE;
  selected_store_id uuid;
BEGIN
  IF p_session_id IS NULL OR p_operation_id IS NULL
     OR p_current_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_current_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_current_token_digest !~ '^[a-f0-9]{64}$' OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT session.* INTO existing
  FROM saas.panel_sessions AS session
  WHERE session.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.previous_session_id IS NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    SELECT session.* INTO previous
    FROM saas.panel_sessions AS session WHERE session.session_id = existing.previous_session_id;
    IF existing.operation_kind <> 'rotate'
       OR existing.token_key_id <> p_token_key_id OR existing.token_digest <> p_token_digest
       OR previous.token_key_id <> p_current_token_key_id OR previous.token_digest <> p_current_token_digest
       OR existing.family_id <> previous.family_id OR existing.principal_id <> previous.principal_id
       OR existing.issued_at <> previous.issued_at OR existing.expires_at <> previous.expires_at
       OR existing.active_store_id IS DISTINCT FROM COALESCE(p_requested_store_id, previous.active_store_id)
       OR previous.replaced_by_session_id <> existing.session_id
       OR previous.revoked_at IS NULL OR previous.revocation_reason <> 'rotation' THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
      'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sessionId', existing.session_id, 'familyId', existing.family_id,
        'principalId', existing.principal_id, 'activeStoreId', existing.active_store_id,
        'version', existing.version,
        'issuedAt', pg_catalog.to_char(existing.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'rotatedAt', pg_catalog.to_char(existing.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', pg_catalog.to_char(existing.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ))
    );
    RETURN;
  END IF;

  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_current_token_key_id AND session.token_digest = p_current_token_digest
  FOR UPDATE;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.principals AS principal
    WHERE principal.id = current_session.principal_id AND principal.email_verified
  ) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  selected_store_id := COALESCE(p_requested_store_id, current_session.active_store_id);
  IF selected_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM saas.stores AS store
    JOIN saas.memberships AS membership
      ON membership.store_id = store.id
     AND membership.principal_id = current_session.principal_id
     AND membership.status = 'active'
    WHERE store.id = selected_store_id AND store.status = 'active'
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO saas.panel_sessions (
    session_id, family_id, operation_id, operation_kind, token_key_id, token_digest,
    principal_id, active_store_id, previous_session_id, replaced_by_session_id,
    version, issued_at, rotated_at, expires_at, revoked_at, revocation_reason, created_at, updated_at
  ) VALUES (
    p_session_id, current_session.family_id, p_operation_id, 'rotate', p_token_key_id, p_token_digest,
    current_session.principal_id, selected_store_id, current_session.session_id, NULL,
    1, current_session.issued_at, p_now, current_session.expires_at, NULL, NULL, p_now, p_now
  );

  UPDATE saas.panel_sessions AS session
  SET replaced_by_session_id = p_session_id,
      revoked_at = p_now,
      revocation_reason = 'rotation',
      version = session.version + 1,
      updated_at = p_now
  WHERE session.session_id = current_session.session_id;

  RETURN QUERY SELECT 'rotated'::text, pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'sessionId', p_session_id, 'familyId', current_session.family_id,
      'principalId', current_session.principal_id, 'activeStoreId', selected_store_id,
      'version', 1,
      'issuedAt', pg_catalog.to_char(current_session.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'rotatedAt', pg_catalog.to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(current_session.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
  );
END
$phase2b2a_rotate$;

CREATE FUNCTION saas.revoke_panel_session(
  p_token_key_id text,
  p_token_digest text,
  p_reason text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_revoke$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
BEGIN
  IF p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_reason NOT IN ('logout', 'security', 'administrative')
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_token_key_id AND session.token_digest = p_token_digest
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF current_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.principals AS principal
    WHERE principal.id = current_session.principal_id AND principal.email_verified
  ) OR (
    current_session.active_store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM saas.stores AS store
      JOIN saas.memberships AS membership
        ON membership.store_id = store.id
       AND membership.principal_id = current_session.principal_id
       AND membership.status = 'active'
      WHERE store.id = current_session.active_store_id AND store.status = 'active'
    )
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;
  UPDATE saas.panel_sessions AS session
  SET revoked_at = p_now, revocation_reason = p_reason,
      version = session.version + 1, updated_at = p_now
  WHERE session.session_id = current_session.session_id;
  RETURN QUERY SELECT 'revoked'::text, NULL::jsonb;
END
$phase2b2a_revoke$;

CREATE FUNCTION saas.revoke_panel_session_family(
  p_token_key_id text,
  p_token_digest text,
  p_reason text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_revoke_family$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
BEGIN
  IF p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_reason NOT IN ('logout', 'security', 'administrative')
     OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_token_key_id AND session.token_digest = p_token_digest
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF current_session.revoked_at IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM saas.panel_sessions AS family WHERE family.family_id = current_session.family_id AND family.revoked_at IS NULL) THEN
      RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'family_revoked'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  IF current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.principals AS principal
    WHERE principal.id = current_session.principal_id AND principal.email_verified
  ) OR (
    current_session.active_store_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM saas.stores AS store
      JOIN saas.memberships AS membership
        ON membership.store_id = store.id
       AND membership.principal_id = current_session.principal_id
       AND membership.status = 'active'
      WHERE store.id = current_session.active_store_id AND store.status = 'active'
    )
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;
  UPDATE saas.panel_sessions AS session
  SET revoked_at = p_now, revocation_reason = p_reason,
      version = session.version + 1, updated_at = p_now
  WHERE session.family_id = current_session.family_id AND session.revoked_at IS NULL;
  RETURN QUERY SELECT 'family_revoked'::text, NULL::jsonb;
END
$phase2b2a_revoke_family$;

CREATE FUNCTION saas.expire_due_panel_sessions(
  p_now timestamptz,
  p_limit integer
)
RETURNS TABLE(outcome text, expired_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_expire$
DECLARE
  affected bigint;
BEGIN
  IF p_now IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 500
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, 0::bigint;
    RETURN;
  END IF;
  WITH due AS (
    SELECT session.session_id
    FROM saas.panel_sessions AS session
    WHERE session.revoked_at IS NULL AND session.expires_at <= p_now
    ORDER BY session.expires_at, session.session_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE saas.panel_sessions AS session
  SET revoked_at = p_now, revocation_reason = 'expired',
      version = session.version + 1, updated_at = p_now
  FROM due
  WHERE session.session_id = due.session_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN QUERY SELECT 'expired'::text, affected;
END
$phase2b2a_expire$;

CREATE FUNCTION saas.recover_panel_session_operation(
  p_operation_id uuid,
  p_operation_kind text,
  p_token_key_id text,
  p_token_digest text,
  p_principal_id uuid,
  p_active_store_id uuid,
  p_current_token_key_id text,
  p_current_token_digest text
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b2a_recover$
DECLARE
  recovered saas.panel_sessions%ROWTYPE;
  previous saas.panel_sessions%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_operation_kind NOT IN ('issue', 'rotate')
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT session.* INTO recovered
  FROM saas.panel_sessions AS session
  WHERE session.operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF recovered.operation_kind <> p_operation_kind
     OR recovered.token_key_id <> p_token_key_id
     OR recovered.token_digest <> p_token_digest THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_operation_kind = 'issue' THEN
    IF p_principal_id IS NULL
       OR recovered.principal_id <> p_principal_id
       OR recovered.active_store_id IS DISTINCT FROM p_active_store_id
       OR recovered.previous_session_id IS NOT NULL
       OR p_current_token_key_id IS NOT NULL OR p_current_token_digest IS NOT NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
  ELSE
    IF recovered.previous_session_id IS NULL
       OR p_current_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$'
       OR p_current_token_digest !~ '^[a-f0-9]{64}$'
       OR p_principal_id IS NOT NULL OR p_active_store_id IS NOT NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    SELECT session.* INTO previous
    FROM saas.panel_sessions AS session WHERE session.session_id = recovered.previous_session_id;
    IF NOT FOUND
       OR previous.token_key_id <> p_current_token_key_id
       OR previous.token_digest <> p_current_token_digest
       OR previous.replaced_by_session_id <> recovered.session_id
       OR previous.revoked_at IS NULL OR previous.revocation_reason <> 'rotation'
       OR previous.family_id <> recovered.family_id
       OR previous.principal_id <> recovered.principal_id
       OR previous.issued_at <> recovered.issued_at
       OR previous.expires_at <> recovered.expires_at THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
    'session', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'sessionId', recovered.session_id, 'familyId', recovered.family_id,
      'principalId', recovered.principal_id, 'activeStoreId', recovered.active_store_id,
      'version', recovered.version,
      'issuedAt', pg_catalog.to_char(recovered.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'rotatedAt', pg_catalog.to_char(recovered.rotated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', pg_catalog.to_char(recovered.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
  );
END
$phase2b2a_recover$;

CREATE FUNCTION saas.guard_panel_session_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b2a_session_guard$
DECLARE
  replacement saas.panel_sessions%ROWTYPE;
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.operation_kind IS DISTINCT FROM OLD.operation_kind
     OR NEW.token_key_id IS DISTINCT FROM OLD.token_key_id
     OR NEW.token_digest IS DISTINCT FROM OLD.token_digest
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.active_store_id IS DISTINCT FROM OLD.active_store_id
     OR NEW.previous_session_id IS DISTINCT FROM OLD.previous_session_id
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.rotated_at IS DISTINCT FROM OLD.rotated_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PHASE2B2A_IMMUTABLE_SESSION_AUTHORITY';
  END IF;
  IF OLD.revoked_at IS NOT NULL
     OR OLD.replaced_by_session_id IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR NEW.revocation_reason IS NULL
     OR NEW.version <> OLD.version + 1
     OR NEW.version > 2147483647
     OR NEW.updated_at < OLD.updated_at
     OR NEW.updated_at <> NEW.revoked_at
     OR NEW.revoked_at < OLD.issued_at
     OR NEW.replaced_by_session_id IS DISTINCT FROM OLD.replaced_by_session_id
        AND NOT (OLD.replaced_by_session_id IS NULL AND NEW.replaced_by_session_id IS NOT NULL AND NEW.revocation_reason = 'rotation') THEN
    RAISE EXCEPTION 'PHASE2B2A_INVALID_SESSION_TRANSITION';
  END IF;
  IF NEW.replaced_by_session_id IS NOT NULL THEN
    SELECT session.* INTO replacement
    FROM saas.panel_sessions AS session WHERE session.session_id = NEW.replaced_by_session_id;
    IF NOT FOUND
       OR replacement.previous_session_id <> OLD.session_id
       OR replacement.family_id <> OLD.family_id
       OR replacement.principal_id <> OLD.principal_id
       OR replacement.issued_at <> OLD.issued_at
       OR replacement.expires_at <> OLD.expires_at THEN
      RAISE EXCEPTION 'PHASE2B2A_INVALID_SESSION_TRANSITION';
    END IF;
  END IF;
  RETURN NEW;
END
$phase2b2a_session_guard$;

CREATE TRIGGER panel_sessions_mutation_guard
BEFORE UPDATE ON saas.panel_sessions
FOR EACH ROW EXECUTE FUNCTION saas.guard_panel_session_mutation();

ALTER FUNCTION saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.resolve_panel_session(text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.revoke_panel_session(text,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.revoke_panel_session_family(text,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.expire_due_panel_sessions(timestamptz,integer) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.guard_panel_session_mutation() OWNER TO celebix_saas_owner;

REVOKE ALL ON saas.panel_sessions FROM PUBLIC;
REVOKE ALL ON saas.panel_sessions FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.resolve_panel_session(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.revoke_panel_session(text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.revoke_panel_session_family(text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.expire_due_panel_sessions(timestamptz,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_panel_session_mutation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.resolve_panel_session(text,text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.revoke_panel_session(text,text,text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.revoke_panel_session_family(text,text,text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.expire_due_panel_sessions(timestamptz,integer) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text) TO celebix_saas_identity;

DO $phase2b2a_catalog_assertions$
DECLARE
  function_name text;
BEGIN
  IF (SELECT owner.rolname FROM pg_catalog.pg_class AS class JOIN pg_catalog.pg_roles AS owner ON owner.oid = class.relowner WHERE class.oid = 'saas.panel_sessions'::regclass) <> 'celebix_saas_owner'
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'saas.panel_sessions'::regclass) THEN
    RAISE EXCEPTION 'PHASE2B2A_CATALOG_ASSERTION_FAILED: ownership or RLS drift';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.panel_sessions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.panel_sessions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE2B2A_CATALOG_ASSERTION_FAILED: direct table privilege';
  END IF;
  FOREACH function_name IN ARRAY ARRAY[
    'saas.issue_panel_session(uuid,uuid,uuid,text,text,uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.resolve_panel_session(text,text,timestamp with time zone)',
    'saas.rotate_panel_session(text,text,uuid,uuid,text,text,uuid,timestamp with time zone)',
    'saas.revoke_panel_session(text,text,text,timestamp with time zone)',
    'saas.revoke_panel_session_family(text,text,text,timestamp with time zone)',
    'saas.expire_due_panel_sessions(timestamp with time zone,integer)',
    'saas.recover_panel_session_operation(uuid,text,text,text,uuid,uuid,text,text)'
  ] LOOP
    IF NOT pg_catalog.has_function_privilege('celebix_saas_identity', function_name, 'EXECUTE')
       OR pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE2B2A_CATALOG_ASSERTION_FAILED: function grant drift';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'saas'
      AND procedure.proname IN (
        'issue_panel_session', 'resolve_panel_session', 'rotate_panel_session', 'revoke_panel_session',
        'revoke_panel_session_family', 'expire_due_panel_sessions', 'recover_panel_session_operation'
      )
      AND (
        owner.rolname <> 'celebix_saas_owner'
        OR NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2B2A_CATALOG_ASSERTION_FAILED: function ownership or search_path drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'saas.panel_sessions'::regclass AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION 'PHASE2B2A_CATALOG_ASSERTION_FAILED: mutation guard drift';
  END IF;
END
$phase2b2a_catalog_assertions$;

COMMIT;
