-- Ordinary application rollback is safe; deleting edited mandatory content is not.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.stores,saas.merchant_admin_records,saas.store_required_pages IN SHARE ROW EXCLUSIVE MODE;
DO $restore$ DECLARE item record; BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_required_pages) OR EXISTS(SELECT 1 FROM saas.merchant_content_versions WHERE write_source='seed') THEN RAISE EXCEPTION 'REQUIRED_PAGES_209_DOWN_REQUIRES_EMPTY_MAPPING';END IF;
 FOR item IN SELECT * FROM saas.required_pages_209_backup ORDER BY identity LOOP
  IF pg_get_functiondef(to_regprocedure(item.identity)) IS DISTINCT FROM item.migrated_definition THEN RAISE EXCEPTION 'REQUIRED_PAGES_209_DOWN_SOURCE_DRIFT';END IF;
  EXECUTE item.definition;
 END LOOP;
END $restore$;
DROP TRIGGER stores_required_pages ON saas.stores;
DROP TRIGGER merchant_admin_required_pages_guard ON saas.merchant_admin_records;
DROP TRIGGER store_required_pages_identity_guard ON saas.store_required_pages;
DROP FUNCTION saas.public_required_page_get(text,timestamptz,text,text);
DROP FUNCTION saas.create_store_required_pages();
DROP FUNCTION saas.seed_store_required_pages(uuid,timestamptz);
DROP FUNCTION saas.required_page_seed_plan(uuid);
DROP FUNCTION saas.guard_required_page_mapping();
DROP FUNCTION saas.guard_required_page_record();
DROP FUNCTION saas.required_page_transition_valid(uuid,uuid,text,jsonb,text);
DROP FUNCTION saas.required_page_content_path(uuid,uuid,text);
DROP FUNCTION saas.required_page_content_locale(uuid,uuid,text);
DROP FUNCTION saas.required_page_public_locale_allowed(uuid,uuid);
DROP TABLE saas.store_required_pages,saas.required_pages_209_backup;
ALTER TABLE saas.merchant_content_versions DROP CONSTRAINT merchant_content_versions_write_source_check;
ALTER TABLE saas.merchant_content_versions ALTER COLUMN operation_id SET NOT NULL,ALTER COLUMN principal_id SET NOT NULL;
ALTER TABLE saas.merchant_content_versions ADD CONSTRAINT merchant_content_versions_write_source_check CHECK(write_source IN('typed','generic','archive'));
COMMIT;
