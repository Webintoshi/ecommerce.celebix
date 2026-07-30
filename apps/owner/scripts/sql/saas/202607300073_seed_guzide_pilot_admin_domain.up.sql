BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guzide_pilot_admin_domain_seed$
DECLARE
  target_store_id uuid;
  existing_domain saas.admin_domains%ROWTYPE;
  provision_outcome text;
  provision_authority jsonb;
BEGIN
  SELECT store.id
    INTO target_store_id
  FROM saas.stores AS store
  WHERE store.slug = 'guzide-kuyumcu-4'
    AND store.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'guzide_pilot_active_store_missing';
  END IF;

  SELECT domain.*
    INTO existing_domain
  FROM saas.admin_domains AS domain
  WHERE domain.hostname = 'guzide-kuyumcu-4.admin.saas-staging.celebix.site'
     OR (domain.store_id = target_store_id AND domain.canonical AND domain.status = 'active')
  ORDER BY (domain.hostname = 'guzide-kuyumcu-4.admin.saas-staging.celebix.site') DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF existing_domain.store_id <> target_store_id
       OR existing_domain.hostname <> 'guzide-kuyumcu-4.admin.saas-staging.celebix.site'
       OR existing_domain.kind <> 'platform_subdomain'
       OR existing_domain.status <> 'active'
       OR NOT existing_domain.canonical
       OR existing_domain.verified_at IS NULL THEN
      RAISE EXCEPTION 'admin_domain_conflict';
    END IF;
    RETURN;
  END IF;

  SELECT outcome, authority
    INTO provision_outcome, provision_authority
  FROM saas.provision_canonical_admin_domain(
    'f3f8a04d-0af7-4de5-9b89-70a33d01f001'::uuid,
    target_store_id,
    'guzide-kuyumcu-4.admin.saas-staging.celebix.site',
    pg_catalog.clock_timestamp()
  );

  IF provision_outcome NOT IN ('provisioned', 'operation_replayed')
     OR provision_authority ->> 'storeSlug' <> 'guzide-kuyumcu-4'
     OR provision_authority ->> 'canonicalAdminOrigin' <> 'https://guzide-kuyumcu-4.admin.saas-staging.celebix.site' THEN
    RAISE EXCEPTION 'guzide_pilot_admin_domain_provision_failed';
  END IF;
END
$guzide_pilot_admin_domain_seed$;

COMMIT;
