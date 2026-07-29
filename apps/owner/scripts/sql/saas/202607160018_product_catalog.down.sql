-- Phase 3A1 rollback is intentionally destructive to catalog rows.
-- It is permitted only in an isolated disposable rehearsal before any shared catalog data exists.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM celebix_saas_app;

DROP FUNCTION saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text);
DROP FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid);
DROP FUNCTION saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.catalog_variant_input_valid(text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_product_input_valid(text,text,text,text,text);
DROP FUNCTION saas.catalog_variant_projection(uuid);
DROP FUNCTION saas.catalog_product_projection(uuid);
DROP FUNCTION saas.catalog_timestamp(timestamptz);

DROP TABLE saas.catalog_operations;
DROP FUNCTION saas.guard_catalog_operation_mutation();
DROP TABLE saas.product_variants;
DROP TABLE saas.products;
DROP FUNCTION saas.catalog_attributes_are_valid(jsonb);

COMMIT;
