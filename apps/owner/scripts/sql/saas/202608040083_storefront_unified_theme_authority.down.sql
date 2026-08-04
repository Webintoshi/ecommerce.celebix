BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_unified_theme_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_unified_theme_down',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'STOREFRONT_UNIFIED_THEME_DOWN_BLOCKED'; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    LEFT JOIN saas.campaign_starter_publications publication ON publication.store_id=design.store_id
    WHERE design.schema_version<>3 OR design.draft_config->>'schemaVersion'<>'3' OR design.published_config->>'schemaVersion'<>'3'
       OR design.draft_config->'composition' IS DISTINCT FROM design.published_config->'composition'
       OR publication.config IS DISTINCT FROM design.published_config->'composition'
  ) THEN RAISE EXCEPTION 'STOREFRONT_UNIFIED_THEME_DOWN_DATA_LOSS'; END IF;
END
$storefront_unified_theme_down_guard$;

DO $storefront_unified_theme_restore_public_resolver$
DECLARE source text; old_source constant text:='SELECT design.published_config->''composition'' INTO config FROM saas.storefront_designs design WHERE design.store_id=p_store_id;'; new_source constant text:='SELECT publication.config INTO config FROM saas.campaign_starter_publications publication WHERE publication.store_id=p_store_id;';
BEGIN
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc procedure WHERE procedure.oid='saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)'::regprocedure;
  IF pg_catalog.strpos(source,old_source)=0 THEN RAISE EXCEPTION 'STOREFRONT_UNIFIED_THEME_DOWN_SOURCE_INVALID'; END IF;
  source:=pg_catalog.replace(source,old_source,new_source);
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS %L',source);
END
$storefront_unified_theme_restore_public_resolver$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_schema_version_check;

UPDATE saas.storefront_designs SET schema_version=2,draft_config=(draft_config-'composition')||pg_catalog.jsonb_build_object('schemaVersion',2),published_config=(published_config-'composition')||pg_catalog.jsonb_build_object('schemaVersion',2);
ALTER TABLE saas.storefront_designs ALTER COLUMN schema_version SET DEFAULT 2;
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=2);

DROP FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean);
ALTER FUNCTION saas.storefront_design_document_v2_valid(uuid,jsonb,boolean) RENAME TO storefront_design_document_valid;
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_draft_config_check CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_published_config_check CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

CREATE OR REPLACE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $function$
DECLARE slide jsonb;
BEGIN
  IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') selected(slide) WHERE (selected.slide->>'enabled')::boolean) THEN RETURN false; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP IF (slide->>'enabled')::boolean AND (NOT saas.storefront_design_text_valid(slide->'headline',1,120) OR slide->'desktopImage'='null'::jsonb OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)) THEN RETURN false; END IF; END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
    'draftUpdatedAt',saas.storefront_design_timestamp(design.draft_updated_at),'publishedAt',saas.storefront_design_timestamp(design.published_at),
    'draft',design.draft_config,'published',saas.storefront_design_public_payload(design.store_id,design.published_config,design.published_version,design.published_at),
    'store',pg_catalog.jsonb_build_object('name',store.name,'timezone',COALESCE((SELECT setting.config->>'timezone' FROM saas.merchant_admin_records setting WHERE setting.store_id=store.id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone' ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1),'Europe/Istanbul')),
    'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) ORDER BY media.created_at DESC,media.id) FROM saas.storefront_design_media media WHERE media.store_id=design.store_id AND media.status='active'),'[]'::jsonb),
    'destinations',COALESCE((SELECT pg_catalog.jsonb_agg(choice.payload ORDER BY choice.label,choice.resource_id) FROM (
      SELECT product.title label,product.id resource_id,pg_catalog.jsonb_build_object('kind','product','resourceId',product.id,'label',product.title,'path','/products/'||product.slug) payload FROM saas.products product WHERE product.store_id=design.store_id AND product.status='active'
      UNION ALL SELECT category.name,category.id,pg_catalog.jsonb_build_object('kind','collection','resourceId',category.id,'label',category.name,'path','/collections/'||category.slug) FROM saas.catalog_categories category WHERE category.store_id=design.store_id AND category.status='active'
      UNION ALL SELECT page.name,page.id,pg_catalog.jsonb_build_object('kind','page','resourceId',page.id,'label',page.name,'path','/pages/'||(page.config->>'slug')) FROM saas.merchant_admin_records page WHERE page.store_id=design.store_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true'
    ) choice),'[]'::jsonb)
  ) FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id WHERE design.store_id=p_store_id
$function$;

DROP FUNCTION saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean);
DROP FUNCTION saas.storefront_design_upgrade_v3(jsonb,jsonb);
DROP FUNCTION saas.storefront_theme_composition_upgrade_v2(jsonb);
DROP FUNCTION saas.storefront_theme_default_composition();

REVOKE ALL ON FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean),saas.storefront_design_publishable(uuid,jsonb),saas.storefront_design_workspace_payload(uuid),saas.public_starter_retail_presentation(uuid,timestamptz,boolean) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean) TO celebix_saas_host_resolver;

COMMIT;
