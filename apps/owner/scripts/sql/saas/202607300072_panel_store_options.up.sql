BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.list_panel_session_store_options(
  p_token_key_id text,
  p_token_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $panel_store_options$
DECLARE
  selected_session saas.panel_sessions%ROWTYPE;
  option_count bigint;
  includes_active boolean;
  options jsonb;
BEGIN
  IF p_token_key_id IS NULL OR p_token_digest IS NULL OR p_now IS NULL
     OR p_token_key_id !~ '^[A-Za-z0-9._-]{1,64}$' OR p_token_key_id ~ '^\.|\.$|\.\.'
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_now < pg_catalog.clock_timestamp() - interval '30 seconds'
     OR p_now > pg_catalog.clock_timestamp() + interval '30 seconds' THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT session.* INTO selected_session
  FROM saas.panel_sessions AS session
  WHERE session.token_key_id = p_token_key_id
    AND session.token_digest = p_token_digest;
  IF NOT FOUND OR selected_session.revoked_at IS NOT NULL OR selected_session.expires_at <= p_now THEN
    RETURN QUERY SELECT 'unauthenticated'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*),
         pg_catalog.bool_or(store.id = selected_session.active_store_id),
         pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'storeId', store.id,
             'storeSlug', store.slug,
             'displayName', store.name,
             'canonicalAdminOrigin', 'https://' || domain.hostname
           ) ORDER BY store.slug, store.id
         )
    INTO option_count, includes_active, options
  FROM saas.memberships AS membership
  JOIN saas.stores AS store
    ON store.id = membership.store_id
   AND store.status = 'active'
  JOIN saas.admin_domains AS domain
    ON domain.store_id = store.id
   AND domain.kind = 'platform_subdomain'
   AND domain.status = 'active'
   AND domain.canonical
   AND domain.verified_at IS NOT NULL
   AND domain.verified_at <= p_now
  WHERE membership.principal_id = selected_session.principal_id
    AND membership.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM saas.subscriptions AS subscription
      JOIN saas.plans AS plan
        ON plan.id = subscription.plan_id
       AND plan.plan_code = subscription.plan_code
       AND plan.version = subscription.plan_version
       AND plan.status = 'active'
       AND plan.valid_from <= p_now
       AND (plan.valid_until IS NULL OR p_now < plan.valid_until)
      WHERE subscription.store_id = store.id
        AND subscription.status = 'active'
        AND subscription.valid_from <= p_now
        AND (subscription.valid_until IS NULL OR p_now < subscription.valid_until)
    );

  IF option_count < 1 OR option_count > 100 OR NOT COALESCE(includes_active, false) THEN
    RETURN QUERY SELECT 'durable_authority_invalid'::text, NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'resolved'::text, pg_catalog.jsonb_build_object(
    'activeStoreId', selected_session.active_store_id,
    'stores', options
  );
END
$panel_store_options$;

ALTER FUNCTION saas.list_panel_session_store_options(text,text,timestamptz) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.list_panel_session_store_options(text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.list_panel_session_store_options(text,text,timestamptz) TO celebix_saas_identity;

COMMIT;
