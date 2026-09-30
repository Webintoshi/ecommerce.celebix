BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.storefront_designs IN EXCLUSIVE MODE;
DO $rollback$
DECLARE selected record;
BEGIN
 IF pg_catalog.to_regclass('saas.section_homepage_v4_backup') IS NULL THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_DOWN_PRECONDITION_FAILED'; END IF;
 -- No lossy downgrade: restore published content through the compatible writer
 -- before rolling back readers. An unchanged legacy saved draft is preserved.
 IF EXISTS(SELECT 1 FROM saas.storefront_designs WHERE schema_version=5 OR draft_config->>'schemaVersion'='5' OR published_config->>'schemaVersion'='5' OR draft_config->'composition'->>'schemaVersion'='4' OR published_config->'composition'->>'schemaVersion'='4')
 OR pg_catalog.to_regprocedure('saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)') IS NOT NULL THEN
  RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_DOWN_DATA_PRESENT';
 END IF;
 ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
 FOR selected IN SELECT definition FROM saas.section_homepage_v4_backup ORDER BY identity LOOP EXECUTE selected.definition; END LOOP;
END $rollback$;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_schema_version_check;
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=4);
DROP FUNCTION saas.public_homepage_banner(uuid,jsonb,timestamptz);
DROP FUNCTION saas.public_homepage_banner_media(uuid,jsonb);
DROP FUNCTION saas.storefront_design_v5_publishable(uuid,jsonb,jsonb);
DROP FUNCTION saas.storefront_design_v5_legacy_probe(jsonb);
DROP FUNCTION saas.storefront_design_normalize_v5(jsonb);
DROP FUNCTION saas.homepage_banner_destination_shape_valid(jsonb);
DROP FUNCTION saas.homepage_banner_media_shape_valid(jsonb);
DROP FUNCTION saas.storefront_design_composition_valid_pre_section_homepage(jsonb);
DROP FUNCTION saas.storefront_design_document_valid_pre_section_homepage(uuid,jsonb,boolean);
DROP FUNCTION saas.storefront_theme_composition_references_valid_pre_section_homepage(uuid,jsonb,boolean);
DROP FUNCTION saas.public_starter_retail_presentation_pre_section_homepage(uuid,timestamptz,boolean);
DROP TABLE saas.section_homepage_v4_backup;
COMMIT;
