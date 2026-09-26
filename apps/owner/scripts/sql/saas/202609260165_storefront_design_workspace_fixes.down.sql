BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Acquire the same transaction-held writer lock before the unchanged-data guard.
LOCK TABLE saas.storefront_designs IN EXCLUSIVE MODE;
DO $rollback$
DECLARE selected record;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.storefront_designs design LEFT JOIN saas.storefront_design_workspace_fixes_backup backup ON backup.identity=design.store_id::text
  WHERE backup.migrated IS NULL OR backup.migrated<>pg_catalog.jsonb_build_object('draft',design.draft_config,'published',design.published_config,'draftVersion',design.draft_version,'publishedVersion',design.published_version)) THEN
  RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_DOWN_DATA_CHANGED';
 END IF;
 -- Restore data while the accepting validators are still installed.
 UPDATE saas.storefront_designs design SET draft_config=backup.original->'draft',published_config=backup.original->'published'
 FROM saas.storefront_design_workspace_fixes_backup backup WHERE backup.identity=design.store_id::text;
 FOR selected IN SELECT definition FROM saas.storefront_design_workspace_fixes_backup WHERE definition IS NOT NULL ORDER BY identity LOOP
  EXECUTE selected.definition;
 END LOOP;
END $rollback$;
DROP FUNCTION saas.public_content_page_get(text,timestamptz,text);
DROP FUNCTION saas.storefront_design_public_payload_before_workspace_fixes(uuid,jsonb,bigint,timestamptz);
DROP FUNCTION saas.storefront_design_category_asset(uuid,jsonb,uuid);
DROP FUNCTION saas.storefront_design_composition_valid(jsonb);
DROP FUNCTION saas.storefront_design_composition_without_selections(jsonb);
DROP TABLE saas.storefront_design_workspace_fixes_backup;
COMMIT;
