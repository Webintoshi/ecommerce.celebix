BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION saas.provision_canonical_admin_domain(
  p_domain_id uuid,
  p_store_id uuid,
  p_hostname text,
  p_now timestamptz
)
RETURNS TABLE(outcome text, authority jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $celebix_net_staging_admin_domain$
DECLARE
  selected_store saas.stores%ROWTYPE;
  existing saas.admin_domains%ROWTYPE;
BEGIN
  IF p_domain_id IS NULL OR p_store_id IS NULL OR p_hostname IS NULL OR p_now IS NULL
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
    selected_store.slug || '.admin.saas-staging.celebix.site',
    selected_store.slug || '.admin.saas-staging.celebix.net'
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
$celebix_net_staging_admin_domain$;

COMMIT;
