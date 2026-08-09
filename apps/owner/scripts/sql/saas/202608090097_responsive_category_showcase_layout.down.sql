BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $responsive_category_showcase_layout_down_guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_responsive_category_showcase_layout_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_DOWN_BLOCKED';
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.campaign_starter_publications publication
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(publication.config->'sections') section
    WHERE section->>'kind'='category_grid' AND section->>'layout'='duo'
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(design.draft_config->'composition'->'sections') section
    WHERE section->>'kind'='category_grid' AND section->>'layout'='duo'
  ) OR EXISTS(
    SELECT 1 FROM saas.storefront_designs design
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(design.published_config->'composition'->'sections') section
    WHERE section->>'kind'='category_grid' AND section->>'layout'='duo'
  ) THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_DOWN_DATA_LOSS';
  END IF;
END
$responsive_category_showcase_layout_down_guard$;

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;

UPDATE saas.merchant_admin_records
SET config=saas.campaign_starter_category_layout_strip(config)
WHERE record_kind='starter_theme_composition' AND config->>'schemaVersion'='2';

UPDATE saas.campaign_starter_publications
SET config=saas.campaign_starter_category_layout_strip(config)
WHERE config->>'schemaVersion'='2';

UPDATE saas.storefront_designs
SET draft_config=CASE WHEN draft_config->'composition'->>'schemaVersion'='2'
      THEN pg_catalog.jsonb_set(draft_config,ARRAY['composition'],saas.campaign_starter_category_layout_strip(draft_config->'composition'),false)
      ELSE draft_config END,
    published_config=CASE WHEN published_config->'composition'->>'schemaVersion'='2'
      THEN pg_catalog.jsonb_set(published_config,ARRAY['composition'],saas.campaign_starter_category_layout_strip(published_config->'composition'),false)
      ELSE published_config END;

DROP FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean);
ALTER FUNCTION saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation;

DROP FUNCTION saas.storefront_theme_composition_upgrade_v2(jsonb);
ALTER FUNCTION saas.storefront_theme_composition_upgrade_v2_without_category_layout(jsonb)
  RENAME TO storefront_theme_composition_upgrade_v2;

DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
ALTER FUNCTION saas.campaign_starter_composition_valid_without_category_layout(jsonb)
  RENAME TO campaign_starter_composition_valid;

DROP FUNCTION saas.campaign_starter_category_layout_strip(jsonb);
DROP FUNCTION saas.campaign_starter_category_layout_add_default(jsonb);

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.campaign_starter_composition_valid(jsonb),
  saas.storefront_theme_composition_upgrade_v2(jsonb),
  saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
