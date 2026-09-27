BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- Catalog definition rendering must be independent of the caller's search path.
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- Serialize the existing domain INSERT trigger while replacing its helper.
-- This migration changes definitions only; it does not backfill older hosts.
LOCK TABLE saas.domains IN SHARE ROW EXCLUSIVE MODE;
DO $precondition$
BEGIN
 IF pg_catalog.to_regprocedure('saas.provision_celebix_net_starter_storefront(uuid)') IS NULL
  OR pg_catalog.to_regprocedure('saas.provision_celebix_net_starter_storefront_trigger()') IS NULL
  OR pg_catalog.to_regprocedure('saas.storefront_design_publishable(uuid,jsonb)') IS NULL
  OR pg_catalog.to_regprocedure('saas.provision_platform_starter_storefront(uuid)') IS NOT NULL
  OR pg_catalog.to_regclass('saas.platform_starter_storefront_backup') IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.domains'::regclass
    AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal AND tgenabled='O'
    AND tgfoid='saas.provision_celebix_net_starter_storefront_trigger()'::regprocedure) THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_PRECONDITION_FAILED';
 END IF;
END $precondition$;

-- Exact prior function definitions, ACLs and trigger metadata are owner-only.
-- CREATE OR REPLACE retains each existing function's identity, owner and ACL.
CREATE TABLE saas.platform_starter_storefront_backup(
 identity text PRIMARY KEY,
 definition text NOT NULL,
 acl text,
 migrated_definition text,
 owner_id oid
);
ALTER TABLE saas.platform_starter_storefront_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.platform_starter_storefront_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.platform_starter_storefront_backup FROM PUBLIC,
 celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
 celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
INSERT INTO saas.platform_starter_storefront_backup(identity,definition,acl,owner_id)
SELECT signature,pg_catalog.pg_get_functiondef(procedure.oid),procedure.proacl::text,procedure.proowner
FROM pg_catalog.unnest(ARRAY[
 'saas.provision_celebix_net_starter_storefront(uuid)',
 'saas.provision_celebix_net_starter_storefront_trigger()'
]) signature JOIN pg_catalog.pg_proc procedure ON procedure.oid=signature::regprocedure;
INSERT INTO saas.platform_starter_storefront_backup(identity,definition)
SELECT 'trigger:celebix_net_starter_storefront_created',pg_catalog.pg_get_triggerdef(oid)
FROM pg_catalog.pg_trigger WHERE tgrelid='saas.domains'::regclass
 AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal;

CREATE FUNCTION saas.provision_platform_starter_storefront(p_domain_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE
 legacy_domain saas.domains%ROWTYPE;
 selected_store saas.stores%ROWTYPE;
 storefront_domain saas.store_domains%ROWTYPE;
 seeded_design jsonb;
 starter_composition jsonb;
 starter_label text;
 now_at timestamptz:=pg_catalog.clock_timestamp();
BEGIN
 SELECT * INTO legacy_domain FROM saas.domains WHERE id=p_domain_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLATFORM_STARTER_DOMAIN_MISSING'; END IF;
 IF legacy_domain.domain_type<>'platform_subdomain'
  OR legacy_domain.status<>'active' OR NOT legacy_domain.canonical THEN RETURN; END IF;
 -- A store lock serializes concurrent authority checks for that tenant.
 SELECT * INTO selected_store FROM saas.stores WHERE id=legacy_domain.store_id FOR UPDATE;
 IF NOT FOUND OR selected_store.status<>'active' THEN RETURN; END IF;
 IF legacy_domain.normalized_hostname NOT IN (
  selected_store.slug||'.saas-staging.celebix.net',
  selected_store.slug||'.saas-staging.celebix.site',
  selected_store.slug||'.celebix.site'
 ) THEN RETURN; END IF;

 SELECT * INTO storefront_domain FROM saas.store_domains
 WHERE hostname=legacy_domain.normalized_hostname FOR UPDATE;
 IF FOUND THEN
  IF storefront_domain.store_id<>selected_store.id
   OR storefront_domain.hostname_type<>'platform_subdomain'
   OR storefront_domain.status<>'active' OR NOT storefront_domain.is_primary
   OR storefront_domain.verified_at IS NULL THEN
   RAISE EXCEPTION 'PLATFORM_STARTER_STOREFRONT_CONFLICT';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM saas.store_domains WHERE store_id=selected_store.id AND is_primary)
   OR EXISTS(SELECT 1 FROM saas.store_domains WHERE id=legacy_domain.id)
   OR EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=legacy_domain.normalized_hostname) THEN
   RAISE EXCEPTION 'PLATFORM_STARTER_STOREFRONT_CONFLICT';
  END IF;
  INSERT INTO saas.store_domains(
   id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version
  ) VALUES(legacy_domain.id,selected_store.id,legacy_domain.normalized_hostname,
   'platform_subdomain','active',true,now_at,now_at,now_at,1);
 END IF;

 -- A merchant's draft, publication, versions and attribution stay untouched.
 IF EXISTS(SELECT 1 FROM saas.storefront_designs WHERE store_id=selected_store.id) THEN RETURN; END IF;
 -- Store names have a wider limit than design text; retain valid labels and
 -- use bounded, neutral text for long names or control characters.
 starter_label:=CASE WHEN saas.storefront_design_text_valid(pg_catalog.to_jsonb(selected_store.name),1,120)
  THEN selected_store.name ELSE 'Mağazanız' END;
 starter_composition:=pg_catalog.jsonb_set(saas.storefront_theme_default_composition(),ARRAY['announcement'],
  pg_catalog.jsonb_build_object('enabled',false,'items',pg_catalog.jsonb_build_array(starter_label),'destination','/products'),false);
 seeded_design:=saas.storefront_design_document_with_home_ids(saas.storefront_design_upgrade_v3(
  saas.storefront_design_upgrade_v2(pg_catalog.jsonb_build_object(
   'schemaVersion',1,
   'brand',pg_catalog.jsonb_build_object(
    'logo',NULL,'favicon',NULL,'primaryColor','#FF5A00','accentColor','#171717',
    'backgroundColor','#FFFFFF','textColor','#171717','fontFamily','inter'),
   'hero',pg_catalog.jsonb_build_object('headline',starter_label,'body','','image','null'::jsonb,
    'destination',pg_catalog.jsonb_build_object('kind','none'),'enabled',false),
   'promotion',pg_catalog.jsonb_build_object('headline','Mağaza duyurusu','body','',
    'destination',pg_catalog.jsonb_build_object('kind','none'),'startsAt','null'::jsonb,'endsAt','null'::jsonb,'enabled',false),
   'announcement',pg_catalog.jsonb_build_object('items',pg_catalog.jsonb_build_array(starter_label),
    'icon','none','speed','normal','direction','left','animation','continuous','enabled',false)
  ),false),starter_composition));
 seeded_design:=pg_catalog.jsonb_set(seeded_design,ARRAY['hero','slides','0','enabled'],'false'::jsonb,false);
 IF saas.storefront_design_document_valid(selected_store.id,seeded_design,false) IS NOT TRUE
  OR saas.storefront_design_publishable(selected_store.id,seeded_design) IS NOT TRUE THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_DESIGN_INVALID';
 END IF;
 INSERT INTO saas.storefront_designs(
  store_id,schema_version,draft_config,published_config,draft_version,published_version,
  draft_updated_at,published_at,draft_updated_by,published_by
 ) VALUES(selected_store.id,4,seeded_design,seeded_design,1,1,now_at,now_at,
  '00000000-0000-4000-8000-000000000000'::uuid,'00000000-0000-4000-8000-000000000000'::uuid)
 ON CONFLICT(store_id) DO NOTHING;
END
$function$;
REVOKE ALL ON FUNCTION saas.provision_platform_starter_storefront(uuid) FROM PUBLIC,
 celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
 celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- Keep migration148's public identity and trigger compatible with callers.
CREATE OR REPLACE FUNCTION saas.provision_celebix_net_starter_storefront(p_domain_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
 PERFORM saas.provision_platform_starter_storefront(p_domain_id);
END
$function$;
UPDATE saas.platform_starter_storefront_backup backup
SET migrated_definition=pg_catalog.pg_get_functiondef(procedure.oid)
FROM pg_catalog.pg_proc procedure WHERE CASE WHEN backup.identity NOT LIKE 'trigger:%'
 THEN procedure.oid=pg_catalog.to_regprocedure(backup.identity) ELSE false END;
COMMIT;
