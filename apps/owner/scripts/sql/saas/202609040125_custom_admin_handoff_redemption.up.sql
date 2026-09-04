-- Allow a cross-host panel handoff to be redeemed on the exact active admin
-- hostname that was authorized when the handoff was issued. Custom aliases are
-- intentionally non-canonical, so redemption must not require canonical=true.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.redeem_cross_host_panel_handoff(
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
AS $custom_admin_handoff_redemption$
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
      AND domain.status = 'active'
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
$custom_admin_handoff_redemption$;

ALTER FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)
  OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)
  TO celebix_saas_identity;

COMMIT;
