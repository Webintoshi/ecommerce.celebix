BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $modular_homepage_builder_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_modular_homepage_builder_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_DOWN_BLOCKED';
  END IF;
END
$modular_homepage_builder_down_guard$;

LOCK TABLE saas.storefront_designs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.campaign_starter_publications IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.campaign_starter_publications
  DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_published_unified_theme_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_schema_version_check;

UPDATE saas.storefront_designs
SET schema_version=3,
    draft_config=pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(draft_config,ARRAY['schemaVersion'],'3'::jsonb,false),
      ARRAY['composition'],saas.storefront_theme_composition_without_home_ids(draft_config->'composition'),false
    ),
    published_config=pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(published_config,ARRAY['schemaVersion'],'3'::jsonb,false),
      ARRAY['composition'],saas.storefront_theme_composition_without_home_ids(published_config->'composition'),false
    );
ALTER TABLE saas.storefront_designs
  ALTER COLUMN schema_version SET DEFAULT 3;
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=3);

DROP FUNCTION saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean);
ALTER FUNCTION saas.public_starter_retail_presentation_without_home_ids(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation_without_category_layout;

DROP FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean);
ALTER FUNCTION saas.storefront_design_document_valid_without_home_ids(uuid,jsonb,boolean)
  RENAME TO storefront_design_document_valid;

DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
ALTER FUNCTION saas.campaign_starter_composition_valid_without_home_ids(jsonb)
  RENAME TO campaign_starter_composition_valid;

DROP FUNCTION saas.storefront_design_document_with_home_ids(jsonb);
DROP FUNCTION saas.storefront_theme_composition_with_home_ids(jsonb);
DROP FUNCTION saas.storefront_theme_composition_without_home_ids(jsonb);

CREATE OR REPLACE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE slide jsonb;
BEGIN
  IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false)
     OR NOT saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',true) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') selected(slide) WHERE (selected.slide->>'enabled')::boolean) THEN RETURN false; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
    IF (slide->>'enabled')::boolean AND (NOT saas.storefront_design_text_valid(slide->'headline',1,120) OR slide->'desktopImage'='null'::jsonb OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check
  CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.campaign_starter_composition_valid(jsonb),
  saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.storefront_design_publishable(uuid,jsonb),
  saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
