BEGIN;
-- Bind returning panel login session issuance to one verified canonical admin hostname.
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.issue_returning_panel_session_for_admin_host(
  p_issuer text,
  p_subject text,
  p_destination_hostname text,
  p_session_id uuid,
  p_family_id uuid,
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text,
  p_now timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $returning_login_admin_host_issue$
DECLARE
  selected_principal_id uuid;
  selected_store_id uuid;
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL OR p_destination_hostname IS NULL
     OR p_session_id IS NULL OR p_family_id IS NULL OR p_operation_id IS NULL
     OR p_token_key_id IS NULL OR p_token_digest IS NULL OR p_now IS NULL OR p_expires_at IS NULL
     OR p_issuer = '' OR p_subject = '' OR p_destination_hostname = ''
     OR length(p_issuer) > 2048 OR length(p_subject) > 512 OR length(p_destination_hostname) > 253
     OR p_issuer <> btrim(p_issuer) OR p_subject <> btrim(p_subject)
     OR p_destination_hostname <> lower(btrim(p_destination_hostname))
     OR p_issuer ~ '[[:cntrl:]]' OR p_subject ~ '[[:cntrl:]]'
     OR p_destination_hostname !~ '^[a-z0-9]+(-[a-z0-9]+)*\.admin(\.saas-staging)?\.celebix\.site$'
     OR p_expires_at <= p_now OR p_expires_at > p_now + interval '8 hours' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT principal.id, store.id
    INTO selected_principal_id, selected_store_id
  FROM saas.principals AS principal
  JOIN saas.memberships AS membership
    ON membership.principal_id = principal.id
   AND membership.role = 'store_owner'
   AND membership.status = 'active'
  JOIN saas.stores AS store
    ON store.id = membership.store_id
   AND store.status = 'active'
  JOIN saas.admin_domains AS domain
    ON domain.store_id = store.id
   AND domain.hostname = p_destination_hostname
   AND domain.kind = 'platform_subdomain'
   AND domain.status = 'active'
   AND domain.canonical
   AND domain.verified_at IS NOT NULL
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
  WHERE principal.issuer = p_issuer
    AND principal.subject = p_subject
    AND principal.email_verified
  FOR SHARE OF principal, membership, store, domain, subscription, plan;

  IF selected_principal_id IS NULL OR selected_store_id IS NULL THEN
    RETURN QUERY SELECT 'membership_denied'::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT issued.outcome, issued.authority
  FROM saas.issue_panel_session(
    p_session_id, p_family_id, p_operation_id, p_token_key_id, p_token_digest,
    selected_principal_id, selected_store_id, p_now, p_expires_at
  ) AS issued;
END
$returning_login_admin_host_issue$;

CREATE FUNCTION saas.recover_returning_panel_session_for_admin_host(
  p_issuer text,
  p_subject text,
  p_destination_hostname text,
  p_operation_id uuid,
  p_token_key_id text,
  p_token_digest text
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $returning_login_admin_host_recover$
DECLARE
  recovered_principal_id uuid;
  recovered_store_id uuid;
BEGIN
  SELECT session.principal_id, session.active_store_id
    INTO recovered_principal_id, recovered_store_id
  FROM saas.panel_sessions AS session
  JOIN saas.principals AS principal
    ON principal.id = session.principal_id
   AND principal.issuer = p_issuer
   AND principal.subject = p_subject
   AND principal.email_verified
  JOIN saas.memberships AS membership
    ON membership.principal_id = principal.id
   AND membership.store_id = session.active_store_id
   AND membership.role = 'store_owner'
   AND membership.status = 'active'
  JOIN saas.stores AS store
    ON store.id = membership.store_id
   AND store.status = 'active'
  JOIN saas.admin_domains AS domain
    ON domain.store_id = store.id
   AND domain.hostname = p_destination_hostname
   AND domain.kind = 'platform_subdomain'
   AND domain.status = 'active'
   AND domain.canonical
   AND domain.verified_at IS NOT NULL
  WHERE session.operation_id = p_operation_id
    AND session.operation_kind = 'issue'
    AND session.token_key_id = p_token_key_id
    AND session.token_digest = p_token_digest;

  IF recovered_principal_id IS NULL OR recovered_store_id IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT recovered.outcome, recovered.authority
  FROM saas.recover_panel_session_operation(
    p_operation_id, 'issue', p_token_key_id, p_token_digest,
    recovered_principal_id, recovered_store_id, NULL, NULL, NULL
  ) AS recovered;
END
$returning_login_admin_host_recover$;

ALTER FUNCTION saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text) TO celebix_saas_identity;

COMMIT;
