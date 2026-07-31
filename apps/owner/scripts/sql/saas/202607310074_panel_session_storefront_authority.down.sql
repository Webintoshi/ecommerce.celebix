BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.resolve_panel_session(
  p_token_key_id text,
  p_token_digest text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $panel_session_storefront_rollback$
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
    SELECT pg_catalog.count(*)::integer INTO candidate_count
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
$panel_session_storefront_rollback$;

ALTER FUNCTION saas.resolve_panel_session(text,text,timestamptz) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.resolve_panel_session(text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.resolve_panel_session(text,text,timestamptz) TO celebix_saas_identity;

COMMIT;
