BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.catalog_admin_resources IN EXCLUSIVE MODE;
DO $guard$
BEGIN
 -- Even archived/disabled guide content must be recovered before the old body
 -- limit and reader are restored. Never remove merchant content automatically.
 IF EXISTS(SELECT 1 FROM saas.catalog_admin_resources WHERE config->>'type'='size_guide') THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_ROLLBACK_REQUIRES_DATA_RECOVERY';END IF;
END $guard$;
DO $restore$
DECLARE row record;
BEGIN
 FOR row IN SELECT * FROM saas.catalog_size_guides_203_backup WHERE identity NOT LIKE 'constraint:%' ORDER BY identity LOOP
  EXECUTE row.definition;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (pg_get_functiondef(oid)<>row.definition OR proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'CATEGORY_SIZE_GUIDE_ROLLBACK_AUTHORITY_CHANGED';END IF;
 END LOOP;
 FOR row IN SELECT * FROM saas.catalog_size_guides_203_backup WHERE identity LIKE 'constraint:%' LOOP
  EXECUTE format('ALTER TABLE saas.catalog_admin_resources DROP CONSTRAINT %I',substring(row.identity FROM 12));
  EXECUTE row.definition;
 END LOOP;
END $restore$;
DROP TRIGGER catalog_size_guide_product_relation ON saas.catalog_admin_resource_products;
DROP FUNCTION saas.guard_catalog_size_guide_product_relation(),saas.catalog_size_guide_config_valid(jsonb),saas.catalog_size_guide_text_length(text);
DROP TABLE saas.catalog_size_guides_203_backup;
COMMIT;
