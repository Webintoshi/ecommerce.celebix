BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.catalog_admin_recover_import_preview_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,bigint,uuid);
DROP FUNCTION saas.catalog_admin_get_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_admin_prepare_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,text,text,jsonb);
DROP FUNCTION saas.catalog_import_preview_uuid(uuid,integer,text);
DROP FUNCTION saas.catalog_import_preview_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.catalog_import_preview_rows_valid(jsonb);
DROP TABLE saas.catalog_import_previews;

ALTER TABLE saas.catalog_admin_operations DISABLE TRIGGER catalog_admin_operations_immutable;
DELETE FROM saas.catalog_admin_operations WHERE operation_kind IN('prepare_import_preview','commit_import_preview');
ALTER TABLE saas.catalog_admin_operations ENABLE TRIGGER catalog_admin_operations_immutable;
ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT catalog_admin_operations_operation_kind_check;
ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT catalog_admin_operations_operation_kind_check
  CHECK(operation_kind IN('save_resource','archive_resource','moderate_review','import_products'));
ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT catalog_admin_operations_result_payload_check;
ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT catalog_admin_operations_result_payload_check
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768);

COMMIT;
