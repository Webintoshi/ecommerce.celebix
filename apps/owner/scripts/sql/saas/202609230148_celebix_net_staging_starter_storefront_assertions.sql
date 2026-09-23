BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE
  selected_store_id uuid;
  selected_outcome text;
  design_outcome text;
BEGIN
  SELECT id INTO selected_store_id FROM saas.stores
    WHERE slug='butik-siora' AND name='Butik Siora' AND status='active';
  IF selected_store_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM saas.domains
    WHERE store_id=selected_store_id
      AND normalized_hostname='butik-siora.saas-staging.celebix.net'
      AND domain_type='platform_subdomain' AND status='active' AND canonical
  ) OR NOT EXISTS (
    SELECT 1 FROM saas.store_domains
    WHERE store_id=selected_store_id
      AND hostname='butik-siora.saas-staging.celebix.net'
      AND hostname_type='platform_subdomain' AND status='active'
      AND is_primary AND verified_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM saas.storefront_designs
    WHERE store_id=selected_store_id AND published_version=1
  ) THEN
    RAISE EXCEPTION 'SIORA_STARTER_AUTHORITY_INCOMPLETE';
  END IF;
  SELECT outcome INTO selected_outcome FROM saas.resolve_public_storefront(
    'butik-siora.saas-staging.celebix.net',pg_catalog.clock_timestamp()
  );
  SELECT outcome INTO design_outcome FROM saas.storefront_design_get_public(
    selected_store_id,'butik-siora.saas-staging.celebix.net',pg_catalog.clock_timestamp()
  );
  IF selected_outcome<>'found' OR design_outcome<>'found' THEN
    RAISE EXCEPTION 'SIORA_STARTER_PUBLIC_RESOLUTION_FAILED';
  END IF;
  IF pg_catalog.to_regprocedure('saas.provision_celebix_net_starter_storefront(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='saas.domains'::regclass
         AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'NET_STARTER_FUTURE_PROVISIONING_MISSING';
  END IF;
END
$assertions$;
COMMIT;
