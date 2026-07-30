BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DELETE FROM saas.admin_domains AS domain
USING saas.stores AS store
WHERE domain.id = 'f3f8a04d-0af7-4de5-9b89-70a33d01f001'::uuid
  AND domain.store_id = store.id
  AND store.slug = 'guzide-kuyumcu-4'
  AND domain.hostname = 'guzide-kuyumcu-4.admin.saas-staging.celebix.site'
  AND domain.kind = 'platform_subdomain'
  AND domain.status = 'active'
  AND domain.canonical
  AND domain.version = 1;

COMMIT;
