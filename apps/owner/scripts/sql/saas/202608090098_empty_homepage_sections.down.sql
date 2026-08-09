BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $empty_homepage_sections_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_empty_homepage_sections_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_DOWN_BLOCKED';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.merchant_admin_records record
    WHERE record.record_kind='starter_theme_composition'
      AND CASE WHEN pg_catalog.jsonb_typeof(record.config->'sections')='array'
        THEN pg_catalog.jsonb_array_length(record.config->'sections')=0 ELSE false END
  ) OR EXISTS(
    SELECT 1
    FROM saas.campaign_starter_publications publication
    WHERE CASE WHEN pg_catalog.jsonb_typeof(publication.config->'sections')='array'
      THEN pg_catalog.jsonb_array_length(publication.config->'sections')=0 ELSE false END
  ) OR EXISTS(
    SELECT 1
    FROM saas.storefront_designs design
    WHERE CASE WHEN pg_catalog.jsonb_typeof(design.draft_config->'composition'->'sections')='array'
      THEN pg_catalog.jsonb_array_length(design.draft_config->'composition'->'sections')=0 ELSE false END
       OR CASE WHEN pg_catalog.jsonb_typeof(design.published_config->'composition'->'sections')='array'
      THEN pg_catalog.jsonb_array_length(design.published_config->'composition'->'sections')=0 ELSE false END
  ) THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_DOWN_DATA_LOSS';
  END IF;
END
$empty_homepage_sections_down_guard$;

ALTER TABLE saas.campaign_starter_publications
  DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_published_unified_theme_check;

DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
ALTER FUNCTION saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)
  RENAME TO campaign_starter_composition_valid;

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check
  CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION saas.campaign_starter_composition_valid(jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
