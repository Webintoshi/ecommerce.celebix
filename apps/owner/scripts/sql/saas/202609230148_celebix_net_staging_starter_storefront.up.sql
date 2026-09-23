-- .net staging only: bridge newly registered platform domains to the current
-- storefront authority and seed the same safe starter design used by migration 081.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.provision_celebix_net_starter_storefront(p_domain_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE
  legacy_domain saas.domains%ROWTYPE;
  selected_store saas.stores%ROWTYPE;
  storefront_domain saas.store_domains%ROWTYPE;
  seeded_design jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO legacy_domain FROM saas.domains WHERE id=p_domain_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NET_STARTER_DOMAIN_MISSING'; END IF;
  IF legacy_domain.domain_type<>'platform_subdomain'
     OR legacy_domain.status<>'active'
     OR NOT legacy_domain.canonical THEN
    RETURN;
  END IF;
  SELECT * INTO selected_store FROM saas.stores WHERE id=legacy_domain.store_id;
  IF NOT FOUND OR selected_store.status<>'active'
     OR legacy_domain.normalized_hostname<>selected_store.slug||'.saas-staging.celebix.net' THEN
    RETURN;
  END IF;

  SELECT * INTO storefront_domain FROM saas.store_domains
    WHERE hostname=legacy_domain.normalized_hostname FOR UPDATE;
  IF FOUND THEN
    IF storefront_domain.store_id<>selected_store.id
       OR storefront_domain.hostname_type<>'platform_subdomain'
       OR storefront_domain.status<>'active'
       OR NOT storefront_domain.is_primary
       OR storefront_domain.verified_at IS NULL THEN
      RAISE EXCEPTION 'NET_STARTER_STOREFRONT_CONFLICT';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM saas.store_domains WHERE store_id=selected_store.id AND is_primary)
       OR EXISTS(SELECT 1 FROM saas.store_domains WHERE id=legacy_domain.id) THEN
      RAISE EXCEPTION 'NET_STARTER_STOREFRONT_CONFLICT';
    END IF;
    INSERT INTO saas.store_domains(
      id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version
    ) VALUES (
      legacy_domain.id,selected_store.id,legacy_domain.normalized_hostname,
      'platform_subdomain','active',true,now_at,now_at,now_at,1
    );
  END IF;

  seeded_design:=saas.storefront_design_document_with_home_ids(
    saas.storefront_design_upgrade_v3(
      saas.storefront_design_upgrade_v2(pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'brand',pg_catalog.jsonb_build_object(
      'logo',NULL,'favicon',NULL,'primaryColor','#FF5A00','accentColor','#171717',
      'backgroundColor','#FFFFFF','textColor','#171717','fontFamily','inter'
    ),
    'hero',pg_catalog.jsonb_build_object(
      'headline',selected_store.name,'body','','image','null'::jsonb,
      'destination',pg_catalog.jsonb_build_object('kind','none'),'enabled',true
    ),
    'promotion',pg_catalog.jsonb_build_object(
      'headline','Ücretsiz kargo','body','',
      'destination',pg_catalog.jsonb_build_object('kind','none'),
      'startsAt','null'::jsonb,'endsAt','null'::jsonb,'enabled',false
    ),
    'announcement',pg_catalog.jsonb_build_object(
      'items',pg_catalog.jsonb_build_array(selected_store.name),'icon','none',
      'speed','normal','direction','left','animation','continuous','enabled',false
    )
      ),false),
      saas.storefront_theme_default_composition()
    )
  );
  IF NOT saas.storefront_design_document_valid(selected_store.id,seeded_design,true) THEN
    RAISE EXCEPTION 'NET_STARTER_DESIGN_INVALID';
  END IF;
  INSERT INTO saas.storefront_designs(
    store_id,schema_version,draft_config,published_config,draft_version,published_version,
    draft_updated_at,published_at,draft_updated_by,published_by
  ) VALUES (
    selected_store.id,4,seeded_design,seeded_design,1,1,now_at,now_at,
    '00000000-0000-4000-8000-000000000000'::uuid,
    '00000000-0000-4000-8000-000000000000'::uuid
  ) ON CONFLICT(store_id) DO NOTHING;
END
$function$;
REVOKE ALL ON FUNCTION saas.provision_celebix_net_starter_storefront(uuid) FROM PUBLIC;

CREATE FUNCTION saas.provision_celebix_net_starter_storefront_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
  PERFORM saas.provision_celebix_net_starter_storefront(NEW.id);
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.provision_celebix_net_starter_storefront_trigger() FROM PUBLIC;
CREATE TRIGGER celebix_net_starter_storefront_created
AFTER INSERT ON saas.domains
FOR EACH ROW EXECUTE FUNCTION saas.provision_celebix_net_starter_storefront_trigger();

DO $backfill$
DECLARE selected_domain_id uuid;
BEGIN
  SELECT domain.id INTO selected_domain_id
  FROM saas.domains domain JOIN saas.stores store ON store.id=domain.store_id
  WHERE store.slug='butik-siora'
    AND store.name='Butik Siora'
    AND store.status='active'
    AND domain.normalized_hostname='butik-siora.saas-staging.celebix.net'
    AND domain.domain_type='platform_subdomain'
    AND domain.status='active'
    AND domain.canonical;
  IF selected_domain_id IS NULL THEN RAISE EXCEPTION 'SIORA_STARTER_BACKFILL_TARGET_MISSING'; END IF;
  PERFORM saas.provision_celebix_net_starter_storefront(selected_domain_id);
END
$backfill$;
COMMIT;
