-- Tenant-branded admin hostname, cross-host handoff, and principal-global logout authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3_tenant_admin_auth_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.admin_domains') IS NOT NULL
     OR pg_catalog.to_regclass('saas.cross_host_panel_handoffs') IS NOT NULL
     OR pg_catalog.to_regclass('saas.panel_sessions') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_host_resolver')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_bootstrap') THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_PRECONDITION_FAILED';
  END IF;
END
$phase3_tenant_admin_auth_precondition$;

CREATE TABLE saas.admin_domains (
  id uuid,
  store_id uuid NOT NULL,
  hostname text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  canonical boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT admin_domains_pkey PRIMARY KEY (id),
  CONSTRAINT admin_domains_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT admin_domains_hostname_key UNIQUE (hostname),
  CONSTRAINT admin_domains_store_id_key UNIQUE (store_id, id),
  CONSTRAINT admin_domains_hostname_check CHECK (
    hostname = lower(hostname)
    AND char_length(hostname) BETWEEN 3 AND 253
    AND hostname !~ '[*:/?#@[:space:]]'
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT admin_domains_kind_check CHECK (kind IN ('platform_subdomain', 'custom_alias')),
  CONSTRAINT admin_domains_status_check CHECK (status IN ('pending_verification', 'active', 'disabled')),
  CONSTRAINT admin_domains_activation_check CHECK (
    (status = 'pending_verification' AND verified_at IS NULL AND NOT canonical)
    OR (status = 'active' AND verified_at IS NOT NULL)
    OR (status = 'disabled' AND NOT canonical)
  ),
  CONSTRAINT admin_domains_canonical_kind_check CHECK (NOT canonical OR kind = 'platform_subdomain'),
  CONSTRAINT admin_domains_version_check CHECK (version BETWEEN 1 AND 2147483647),
  CONSTRAINT admin_domains_timestamp_check CHECK (
    updated_at >= created_at
    AND (verified_at IS NULL OR (verified_at >= created_at AND verified_at <= updated_at))
  )
);

CREATE UNIQUE INDEX admin_domains_one_active_canonical_per_store_idx
  ON saas.admin_domains (store_id)
  WHERE canonical AND status = 'active';
CREATE INDEX admin_domains_public_resolver_idx
  ON saas.admin_domains (hostname, status, verified_at, store_id);
CREATE INDEX admin_domains_store_status_idx
  ON saas.admin_domains (store_id, status, canonical DESC, hostname);

ALTER TABLE saas.admin_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.admin_domains FORCE ROW LEVEL SECURITY;

CREATE TABLE saas.cross_host_panel_handoffs (
  handoff_id uuid,
  operation_id uuid NOT NULL,
  token_key_id text NOT NULL,
  token_digest character(64) NOT NULL,
  principal_id uuid NOT NULL,
  source_session_id uuid NOT NULL,
  destination_store_id uuid NOT NULL,
  destination_admin_domain_id uuid NOT NULL,
  destination_hostname text NOT NULL,
  session_operation_id uuid,
  session_id uuid,
  family_id uuid,
  session_token_key_id text,
  session_token_digest character(64),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  session_expires_at timestamptz,
  redeemed_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT cross_host_panel_handoffs_pkey PRIMARY KEY (handoff_id),
  CONSTRAINT cross_host_panel_handoffs_operation_key UNIQUE (operation_id),
  CONSTRAINT cross_host_panel_handoffs_token_key UNIQUE (token_key_id, token_digest),
  CONSTRAINT cross_host_panel_handoffs_session_operation_key UNIQUE (session_operation_id),
  CONSTRAINT cross_host_panel_handoffs_session_key UNIQUE (session_id),
  CONSTRAINT cross_host_panel_handoffs_family_key UNIQUE (family_id),
  CONSTRAINT cross_host_panel_handoffs_session_token_key UNIQUE (session_token_key_id, session_token_digest),
  CONSTRAINT cross_host_panel_handoffs_principal_fk FOREIGN KEY (principal_id) REFERENCES saas.principals(id) ON DELETE RESTRICT,
  CONSTRAINT cross_host_panel_handoffs_source_session_fk FOREIGN KEY (source_session_id) REFERENCES saas.panel_sessions(session_id) ON DELETE RESTRICT,
  CONSTRAINT cross_host_panel_handoffs_destination_domain_fk
    FOREIGN KEY (destination_store_id, destination_admin_domain_id)
    REFERENCES saas.admin_domains(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT cross_host_panel_handoffs_token_key_id_check CHECK (
    token_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND token_key_id !~ '^\.|\.$|\.\.'
  ),
  CONSTRAINT cross_host_panel_handoffs_token_digest_check CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT cross_host_panel_handoffs_session_token_key_id_check CHECK (
    session_token_key_id IS NULL OR (
      session_token_key_id ~ '^[A-Za-z0-9._-]{1,64}$' AND session_token_key_id !~ '^\.|\.$|\.\.'
    )
  ),
  CONSTRAINT cross_host_panel_handoffs_session_token_digest_check CHECK (
    session_token_digest IS NULL OR session_token_digest ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT cross_host_panel_handoffs_hostname_check CHECK (
    destination_hostname = lower(destination_hostname)
    AND char_length(destination_hostname) BETWEEN 3 AND 253
    AND destination_hostname !~ '[*:/?#@[:space:]]'
    AND destination_hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT cross_host_panel_handoffs_lifetime_check CHECK (
    issued_at < expires_at AND expires_at <= issued_at + interval '2 minutes'
  ),
  CONSTRAINT cross_host_panel_handoffs_redemption_check CHECK (
    (
      redeemed_at IS NULL
      AND session_operation_id IS NULL AND session_id IS NULL AND family_id IS NULL
      AND session_token_key_id IS NULL AND session_token_digest IS NULL AND session_expires_at IS NULL
    ) OR (
      redeemed_at IS NOT NULL AND redeemed_at >= issued_at AND redeemed_at < expires_at
      AND session_operation_id IS NOT NULL AND session_id IS NOT NULL AND family_id IS NOT NULL
      AND session_token_key_id IS NOT NULL AND session_token_digest IS NOT NULL
      AND session_expires_at > redeemed_at AND session_expires_at <= redeemed_at + interval '8 hours'
    )
  ),
  CONSTRAINT cross_host_panel_handoffs_version_check CHECK (
    (redeemed_at IS NULL AND version = 1) OR (redeemed_at IS NOT NULL AND version = 2)
  ),
  CONSTRAINT cross_host_panel_handoffs_timestamp_check CHECK (
    created_at = issued_at AND updated_at = COALESCE(redeemed_at, issued_at)
  )
);

CREATE INDEX cross_host_panel_handoffs_expiry_idx
  ON saas.cross_host_panel_handoffs (expires_at, handoff_id) WHERE redeemed_at IS NULL;
CREATE INDEX cross_host_panel_handoffs_principal_idx
  ON saas.cross_host_panel_handoffs (principal_id, destination_store_id, issued_at);

ALTER TABLE saas.cross_host_panel_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cross_host_panel_handoffs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.guard_cross_host_panel_handoff_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase3_cross_host_handoff_guard$
BEGIN
  IF NEW.handoff_id IS DISTINCT FROM OLD.handoff_id
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.token_key_id IS DISTINCT FROM OLD.token_key_id
     OR NEW.token_digest IS DISTINCT FROM OLD.token_digest
     OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
     OR NEW.source_session_id IS DISTINCT FROM OLD.source_session_id
     OR NEW.destination_store_id IS DISTINCT FROM OLD.destination_store_id
     OR NEW.destination_admin_domain_id IS DISTINCT FROM OLD.destination_admin_domain_id
     OR NEW.destination_hostname IS DISTINCT FROM OLD.destination_hostname
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.redeemed_at IS NOT NULL
     OR NEW.redeemed_at IS NULL
     OR NEW.redeemed_at >= OLD.expires_at
     OR OLD.session_operation_id IS NOT NULL OR NEW.session_operation_id IS NULL
     OR OLD.session_id IS NOT NULL OR NEW.session_id IS NULL
     OR OLD.family_id IS NOT NULL OR NEW.family_id IS NULL
     OR OLD.session_token_key_id IS NOT NULL OR NEW.session_token_key_id IS NULL
     OR OLD.session_token_digest IS NOT NULL OR NEW.session_token_digest IS NULL
     OR OLD.session_expires_at IS NOT NULL OR NEW.session_expires_at IS NULL
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_at <> NEW.redeemed_at THEN
    RAISE EXCEPTION 'PHASE3_CROSS_HOST_HANDOFF_INVALID_TRANSITION';
  END IF;
  RETURN NEW;
END
$phase3_cross_host_handoff_guard$;

CREATE TRIGGER cross_host_panel_handoffs_guard
BEFORE UPDATE ON saas.cross_host_panel_handoffs
FOR EACH ROW EXECUTE FUNCTION saas.guard_cross_host_panel_handoff_mutation();

CREATE FUNCTION saas.provision_canonical_admin_domain(
  p_domain_id uuid,
  p_store_id uuid,
  p_hostname text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_provision_admin_domain$
DECLARE
  selected_store saas.stores%ROWTYPE;
  existing saas.admin_domains%ROWTYPE;
BEGIN
  IF p_domain_id IS NULL OR p_store_id IS NULL OR p_hostname IS NULL OR p_now IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_hostname <> lower(p_hostname)
     OR char_length(p_hostname) NOT BETWEEN 3 AND 253
     OR p_hostname ~ '[*:/?#@[:space:]]'
     OR p_hostname !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text, 30006901));
  SELECT store.* INTO selected_store FROM saas.stores AS store WHERE store.id = p_store_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'store_inactive'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_hostname NOT IN (
    selected_store.slug || '.admin.celebix.site',
    selected_store.slug || '.admin.saas-staging.celebix.site'
  ) THEN
    RETURN QUERY SELECT 'admin_host_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT domain.* INTO existing
  FROM saas.admin_domains AS domain
  WHERE domain.hostname = p_hostname OR (domain.store_id = p_store_id AND domain.canonical AND domain.status = 'active')
  ORDER BY (domain.hostname = p_hostname) DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF existing.id <> p_domain_id OR existing.store_id <> p_store_id OR existing.hostname <> p_hostname
       OR existing.kind <> 'platform_subdomain' OR existing.status <> 'active'
       OR NOT existing.canonical OR existing.verified_at IS NULL THEN
      RETURN QUERY SELECT 'admin_domain_conflict'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
      'storeSlug', selected_store.slug,
      'canonicalAdminOrigin', 'https://' || existing.hostname
    );
    RETURN;
  END IF;

  INSERT INTO saas.admin_domains(
    id, store_id, hostname, kind, status, canonical, verified_at, version, created_at, updated_at
  ) VALUES (
    p_domain_id, p_store_id, p_hostname, 'platform_subdomain', 'active', true, p_now, 1, p_now, p_now
  );
  RETURN QUERY SELECT 'provisioned'::text, pg_catalog.jsonb_build_object(
    'storeSlug', selected_store.slug,
    'canonicalAdminOrigin', 'https://' || p_hostname
  );
END
$phase3_provision_admin_domain$;

CREATE FUNCTION saas.resolve_public_admin_brand(
  p_hostname text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_resolve_public_admin_brand$
  SELECT
    CASE WHEN resolved.store_id IS NULL THEN 'admin_host_unknown' ELSE 'resolved' END,
    CASE WHEN resolved.store_id IS NULL THEN NULL::jsonb ELSE pg_catalog.jsonb_build_object(
      'storeSlug', resolved.store_slug,
      'displayName', resolved.display_name,
      'logoUrl', NULL,
      'accentColor', NULL,
      'canonicalAdminOrigin', 'https://' || resolved.canonical_hostname
    ) END
  FROM (SELECT 1) AS seed
  LEFT JOIN LATERAL (
    SELECT store.id AS store_id, store.slug AS store_slug, store.name AS display_name,
           canonical.hostname AS canonical_hostname
    FROM saas.admin_domains AS requested
    JOIN saas.stores AS store
      ON store.id = requested.store_id AND store.status = 'active'
    JOIN saas.admin_domains AS canonical
      ON canonical.store_id = store.id
     AND canonical.canonical
     AND canonical.status = 'active'
     AND canonical.verified_at IS NOT NULL
     AND canonical.verified_at <= p_now
    WHERE p_hostname IS NOT NULL
      AND p_now IS NOT NULL
      AND p_hostname = lower(p_hostname)
      AND char_length(p_hostname) BETWEEN 3 AND 253
      AND p_hostname !~ '[*:/?#@[:space:]]'
      AND requested.hostname = p_hostname
      AND requested.status = 'active'
      AND requested.verified_at IS NOT NULL
      AND requested.verified_at <= p_now
    LIMIT 1
  ) AS resolved ON true;
$phase3_resolve_public_admin_brand$;

CREATE FUNCTION saas.issue_cross_host_panel_handoff(
  p_source_token_key_id text,
  p_source_token_digest text,
  p_handoff_id uuid,
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text,
  p_destination_store_id uuid,
  p_destination_hostname text,
  p_now timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_issue_cross_host_handoff$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
  destination_domain saas.admin_domains%ROWTYPE;
  existing saas.cross_host_panel_handoffs%ROWTYPE;
BEGIN
  IF p_source_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_source_token_key_id ~ '^\.|\.$|\.\.'
     OR p_source_token_digest !~ '^[a-f0-9]{64}$'
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_handoff_id IS NULL OR p_operation_id IS NULL OR p_destination_store_id IS NULL
     OR p_destination_hostname IS NULL OR p_now IS NULL OR p_expires_at IS NULL
     OR p_destination_hostname <> lower(p_destination_hostname)
     OR p_destination_hostname ~ '[*:/?#@[:space:]]'
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_expires_at <= p_now OR p_expires_at > p_now + interval '2 minutes' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_source_token_key_id AND session.token_digest = p_source_token_digest;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 30006902));

  SELECT handoff.* INTO existing
  FROM saas.cross_host_panel_handoffs AS handoff
  WHERE handoff.operation_id = p_operation_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing.source_session_id <> current_session.session_id
       OR existing.token_key_id <> p_token_key_id OR existing.token_digest <> p_token_digest
       OR existing.destination_store_id <> p_destination_store_id
       OR existing.destination_hostname <> p_destination_hostname
       OR existing.issued_at <> p_now OR existing.expires_at <> p_expires_at THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;
    IF existing.redeemed_at IS NOT NULL THEN
      RETURN QUERY SELECT 'handoff_replayed'::text, NULL::jsonb;
      RETURN;
    END IF;
    IF p_now >= existing.expires_at THEN
      RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
      'destinationOrigin', 'https://' || existing.destination_hostname,
      'expiresAt', pg_catalog.to_char(existing.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    RETURN;
  END IF;

  SELECT domain.* INTO destination_domain
  FROM saas.admin_domains AS domain
  JOIN saas.stores AS store
    ON store.id = domain.store_id AND store.status = 'active'
  JOIN saas.memberships AS membership
    ON membership.store_id = store.id
   AND membership.principal_id = current_session.principal_id
   AND membership.status = 'active'
  WHERE domain.store_id = p_destination_store_id
    AND domain.hostname = p_destination_hostname
    AND domain.kind = 'platform_subdomain'
    AND domain.status = 'active'
    AND domain.canonical
    AND domain.verified_at IS NOT NULL
    AND domain.verified_at <= p_now
  FOR SHARE OF domain, store, membership;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO saas.cross_host_panel_handoffs(
    handoff_id, operation_id, token_key_id, token_digest, principal_id, source_session_id,
    destination_store_id, destination_admin_domain_id, destination_hostname,
    issued_at, expires_at, redeemed_at, version, created_at, updated_at
  ) VALUES (
    p_handoff_id, p_operation_id, p_token_key_id, p_token_digest, current_session.principal_id,
    current_session.session_id, p_destination_store_id, destination_domain.id, p_destination_hostname,
    p_now, p_expires_at, NULL, 1, p_now, p_now
  );
  RETURN QUERY SELECT 'handoff_issued'::text, pg_catalog.jsonb_build_object(
    'destinationOrigin', 'https://' || p_destination_hostname,
    'expiresAt', pg_catalog.to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END
$phase3_issue_cross_host_handoff$;

CREATE FUNCTION saas.redeem_cross_host_panel_handoff(
  p_token_key_id text,
  p_token_digest text,
  p_destination_hostname text,
  p_session_operation_id uuid,
  p_session_id uuid,
  p_family_id uuid,
  p_session_token_key_id text,
  p_session_token_digest text,
  p_now timestamptz,
  p_session_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_redeem_cross_host_handoff$
DECLARE
  handoff saas.cross_host_panel_handoffs%ROWTYPE;
  issued_outcome text;
  issued_authority jsonb;
BEGIN
  IF p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_destination_hostname IS NULL OR p_destination_hostname <> lower(p_destination_hostname)
     OR p_destination_hostname ~ '[*:/?#@[:space:]]'
     OR p_session_operation_id IS NULL OR p_session_id IS NULL OR p_family_id IS NULL
     OR p_session_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_session_token_key_id ~ '^\.|\.$|\.\.'
     OR p_session_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now IS NULL OR p_session_expires_at IS NULL
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds'
     OR p_session_expires_at <= p_now OR p_session_expires_at > p_now + interval '8 hours' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  SELECT candidate.* INTO handoff
  FROM saas.cross_host_panel_handoffs AS candidate
  WHERE candidate.token_key_id = p_token_key_id
    AND candidate.token_digest = p_token_digest
    AND candidate.destination_hostname = p_destination_hostname
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF handoff.redeemed_at IS NOT NULL THEN
    IF handoff.session_operation_id <> p_session_operation_id
       OR handoff.session_id <> p_session_id OR handoff.family_id <> p_family_id
       OR handoff.session_token_key_id <> p_session_token_key_id
       OR handoff.session_token_digest <> p_session_token_digest
       OR handoff.redeemed_at <> p_now OR handoff.session_expires_at <> p_session_expires_at THEN
      RETURN QUERY SELECT 'handoff_replayed'::text, NULL::jsonb;
      RETURN;
    END IF;
    SELECT recovered.outcome, recovered.authority INTO issued_outcome, issued_authority
    FROM saas.recover_panel_session_operation(
      p_session_operation_id, 'issue', p_session_token_key_id, p_session_token_digest,
      handoff.principal_id, handoff.destination_store_id, NULL, NULL, NULL
    ) AS recovered;
    IF issued_outcome = 'operation_replayed' THEN
      RETURN QUERY SELECT 'redeemed'::text, issued_authority;
    ELSE
      RETURN QUERY SELECT 'unavailable'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  IF p_now >= handoff.expires_at THEN
    RETURN QUERY SELECT 'expired'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM saas.admin_domains AS domain
    JOIN saas.stores AS store ON store.id = domain.store_id AND store.status = 'active'
    JOIN saas.memberships AS membership
      ON membership.store_id = store.id
     AND membership.principal_id = handoff.principal_id
     AND membership.status = 'active'
    WHERE domain.id = handoff.destination_admin_domain_id
      AND domain.store_id = handoff.destination_store_id
      AND domain.hostname = handoff.destination_hostname
      AND domain.status = 'active' AND domain.canonical
      AND domain.verified_at IS NOT NULL AND domain.verified_at <= p_now
  ) THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT issued.outcome, issued.authority INTO issued_outcome, issued_authority
  FROM saas.issue_panel_session(
    p_session_id, p_family_id, p_session_operation_id,
    p_session_token_key_id, p_session_token_digest,
    handoff.principal_id, handoff.destination_store_id,
    p_now, p_session_expires_at
  ) AS issued;
  IF issued_outcome NOT IN ('issued', 'operation_replayed') THEN
    RETURN QUERY SELECT issued_outcome, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.cross_host_panel_handoffs AS candidate
  SET session_operation_id = p_session_operation_id,
      session_id = p_session_id,
      family_id = p_family_id,
      session_token_key_id = p_session_token_key_id,
      session_token_digest = p_session_token_digest,
      session_expires_at = p_session_expires_at,
      redeemed_at = p_now,
      version = candidate.version + 1,
      updated_at = p_now
  WHERE candidate.handoff_id = handoff.handoff_id;
  RETURN QUERY SELECT 'redeemed'::text, issued_authority;
END
$phase3_redeem_cross_host_handoff$;

CREATE FUNCTION saas.recover_cross_host_panel_handoff(
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text,
  p_destination_hostname text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_recover_cross_host_handoff$
  SELECT CASE
      WHEN handoff.operation_id IS NULL THEN 'unavailable'
      WHEN handoff.redeemed_at IS NOT NULL THEN 'handoff_replayed'
      WHEN p_now >= handoff.expires_at THEN 'expired'
      ELSE 'operation_replayed'
    END,
    CASE WHEN handoff.operation_id IS NOT NULL AND handoff.redeemed_at IS NULL AND p_now < handoff.expires_at
      THEN pg_catalog.jsonb_build_object(
        'destinationOrigin', 'https://' || handoff.destination_hostname,
        'expiresAt', pg_catalog.to_char(handoff.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) ELSE NULL::jsonb END
  FROM (SELECT 1) AS seed
  LEFT JOIN saas.cross_host_panel_handoffs AS handoff
    ON handoff.operation_id = p_operation_id
   AND handoff.token_key_id = p_token_key_id
   AND handoff.token_digest = p_token_digest
   AND handoff.destination_hostname = p_destination_hostname;
$phase3_recover_cross_host_handoff$;

CREATE FUNCTION saas.revoke_principal_panel_sessions(
  p_token_key_id text,
  p_token_digest text,
  p_reason text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase3_revoke_principal_sessions$
DECLARE
  current_session saas.panel_sessions%ROWTYPE;
  affected bigint;
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
  WHERE session.token_key_id = p_token_key_id AND session.token_digest = p_token_digest;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_session.principal_id::text, 30006903)
  );
  SELECT session.* INTO current_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_token_key_id AND session.token_digest = p_token_digest
  FOR UPDATE;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;
  UPDATE saas.panel_sessions AS session
  SET revoked_at = p_now,
      revocation_reason = p_reason,
      version = session.version + 1,
      updated_at = p_now
  WHERE session.principal_id = current_session.principal_id
    AND session.revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN QUERY SELECT 'principal_revoked'::text, pg_catalog.jsonb_build_object('revokedCount', affected);
END
$phase3_revoke_principal_sessions$;

ALTER FUNCTION saas.guard_cross_host_panel_handoff_mutation() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.provision_canonical_admin_domain(uuid,uuid,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.resolve_public_admin_brand(text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.revoke_principal_panel_sessions(text,text,text,timestamptz) OWNER TO celebix_saas_owner;

REVOKE ALL ON saas.admin_domains FROM PUBLIC;
REVOKE ALL ON saas.admin_domains FROM celebix_saas_bootstrap;
REVOKE ALL ON saas.admin_domains FROM celebix_saas_host_resolver;
REVOKE ALL ON saas.admin_domains FROM celebix_saas_identity;
REVOKE ALL ON saas.cross_host_panel_handoffs FROM PUBLIC;
REVOKE ALL ON saas.cross_host_panel_handoffs FROM celebix_saas_identity;

REVOKE ALL ON FUNCTION saas.guard_cross_host_panel_handoff_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.provision_canonical_admin_domain(uuid,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.resolve_public_admin_brand(text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.revoke_principal_panel_sessions(text,text,text,timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.provision_canonical_admin_domain(uuid,uuid,text,timestamptz) TO celebix_saas_bootstrap;
GRANT EXECUTE ON FUNCTION saas.resolve_public_admin_brand(text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.revoke_principal_panel_sessions(text,text,text,timestamptz) TO celebix_saas_identity;

COMMIT;
