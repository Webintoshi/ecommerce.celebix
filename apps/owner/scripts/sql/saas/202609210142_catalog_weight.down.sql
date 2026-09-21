BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.catalog_weight_declarations)
    OR EXISTS (SELECT 1 FROM saas.catalog_weight_operations)
    OR EXISTS (SELECT 1 FROM saas.catalog_weight_store_profiles) THEN
    RAISE EXCEPTION 'CATALOG_WEIGHT_DOWN_REFUSED_DATA_EXISTS';
  END IF;
END $guard$;
DROP FUNCTION saas.catalog_weight_import_rollback(uuid,uuid,text,uuid,uuid,uuid,timestamptz);
DROP FUNCTION saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamptz);
DROP FUNCTION saas.catalog_weight_profile_set(uuid,uuid,text,text,uuid,timestamptz);
DROP FUNCTION saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer);
DROP FUNCTION saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_weight_operation_result(uuid,uuid,text,text);
DROP FUNCTION saas.catalog_weight_projection(uuid,uuid);
DROP TABLE saas.catalog_weight_operations,saas.catalog_weight_declarations,saas.catalog_weight_store_profiles;
COMMIT;
