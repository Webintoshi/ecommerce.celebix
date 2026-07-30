BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guzide_pilot_admin_domain_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM saas.stores AS store
    JOIN saas.admin_domains AS domain ON domain.store_id = store.id
    WHERE store.slug = 'guzide-kuyumcu-4'
      AND store.status = 'active'
      AND domain.hostname = 'guzide-kuyumcu-4.admin.saas-staging.celebix.site'
      AND domain.kind = 'platform_subdomain'
      AND domain.status = 'active'
      AND domain.canonical
      AND domain.verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'guzide_pilot_admin_domain_missing';
  END IF;
END
$guzide_pilot_admin_domain_assertions$;

COMMIT;
