-- Exact rollback is available before collection feature writes. Preserve history fail closed.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.catalog_admin_resources IN EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.catalog_admin_resources WHERE resource_kind='collection' AND config?'schemaVersion')
 OR EXISTS(SELECT 1 FROM saas.storefront_assets WHERE asset_kind='collection')
 OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products WHERE position>9999)
 OR EXISTS(SELECT 1 FROM saas.catalog_admin_operations WHERE operation_kind='restore_resource') THEN RAISE EXCEPTION 'COLLECTION_ROLLBACK_REQUIRES_FEATURE_DATA_RECOVERY';END IF;
END $guard$;
DROP TRIGGER catalog_collection_position_bound ON saas.catalog_admin_resource_products;
DROP FUNCTION saas.guard_catalog_collection_position_bound();
DO $restore$
DECLARE row record;
BEGIN
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup ORDER BY identity LOOP EXECUTE row.definition;END LOOP;
 FOR row IN SELECT * FROM saas.catalog_collections_182_backup WHERE identity NOT LIKE 'constraint:%' LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=row.identity::regprocedure AND (pg_get_functiondef(oid)<>row.definition OR proowner<>row.owner_id OR proacl IS DISTINCT FROM row.acl OR proconfig IS DISTINCT FROM row.settings OR prosecdef IS DISTINCT FROM row.security_definer)) THEN RAISE EXCEPTION 'COLLECTION_ROLLBACK_AUTHORITY_CHANGED';END IF;
 END LOOP;
END $restore$;
DROP FUNCTION saas.catalog_admin_list_collections(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.catalog_admin_get_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.catalog_admin_collection_members(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,jsonb),saas.catalog_admin_restore_collection(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.public_catalog_collection_query(text,timestamptz,text,text,text,text,integer,integer),saas.catalog_collection_projection(uuid,uuid,boolean),saas.catalog_collection_matches_product(uuid,uuid,uuid),saas.catalog_collection_matching_product_ids(uuid,jsonb,uuid),saas.catalog_collection_config_matches_product(uuid,jsonb,uuid),saas.catalog_collection_rule_matches_product(uuid,jsonb,uuid),saas.catalog_collection_config_valid(uuid,jsonb),saas.catalog_collection_config_normalized(jsonb);
ALTER TABLE saas.storefront_assets DROP CONSTRAINT storefront_assets_kind_check;
ALTER TABLE saas.storefront_assets ADD CONSTRAINT storefront_assets_kind_check CHECK(asset_kind IN('logo','hero','social','favicon','category'));
DROP TABLE saas.catalog_collections_182_backup;
COMMIT;
