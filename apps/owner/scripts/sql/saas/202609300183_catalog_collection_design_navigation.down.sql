BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $rollback$ DECLARE r record; clone_signature text;
BEGIN
 IF to_regclass('saas.catalog_collection_design_backup_183') IS NULL THEN RAISE EXCEPTION 'COLLECTION_DESIGN_ROLLBACK_SOURCE_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_designs WHERE draft_config->'composition'->'navigation'?'rootLinks' OR published_config->'composition'->'navigation'?'rootLinks' OR draft_config::text LIKE '%catalog_collection%' OR published_config::text LIKE '%catalog_collection%') THEN RAISE EXCEPTION 'COLLECTION_DESIGN_ROLLBACK_REFERENCES_PRESENT'; END IF;
 FOR r IN SELECT * FROM saas.catalog_collection_design_backup_183 LOOP
  IF pg_get_functiondef(r.signature::regprocedure) IS DISTINCT FROM r.migrated_definition THEN RAISE EXCEPTION 'COLLECTION_DESIGN_ROLLBACK_DEFINITION_CHANGED'; END IF;
  EXECUTE r.definition;
 END LOOP;
 FOR r IN SELECT * FROM saas.catalog_collection_design_backup_183 LOOP
  clone_signature:='saas.'||r.clone_name||substring(r.signature from position('(' in r.signature));
  EXECUTE 'DROP FUNCTION '||clone_signature;
 END LOOP;
END $rollback$;
DROP FUNCTION saas.c183_navigation_valid(jsonb);
DROP TABLE saas.catalog_collection_design_backup_183;
COMMIT;
