-- Disposable rehearsal only. Destructive execution is not authorized for staging or production.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION IF EXISTS saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION IF EXISTS saas.media_reorder_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[]);
DROP FUNCTION IF EXISTS saas.media_update_alt(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text);
DROP FUNCTION IF EXISTS saas.media_list_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean);
DROP FUNCTION IF EXISTS saas.media_attach_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint);
DROP FUNCTION IF EXISTS saas.media_operation_replay(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS saas.media_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION IF EXISTS saas.public_list_product_media(uuid,text,timestamptz,uuid);
DROP FUNCTION IF EXISTS saas.public_get_product_by_slug(uuid,text,timestamptz,text);
DROP FUNCTION IF EXISTS saas.public_list_products(uuid,text,timestamptz,integer);
DROP FUNCTION IF EXISTS saas.public_storefront_authorized(uuid,text,timestamptz);
DROP FUNCTION IF EXISTS saas.resolve_public_storefront(text,timestamptz);
DROP FUNCTION IF EXISTS saas.public_product_projection(uuid,uuid);
DROP FUNCTION IF EXISTS saas.public_media_projection(uuid);
DROP FUNCTION IF EXISTS saas.media_projection(uuid);
DROP TABLE IF EXISTS saas.product_media_operations;
DROP FUNCTION IF EXISTS saas.guard_product_media_operation_mutation();
DROP TABLE IF EXISTS saas.product_media;
DROP FUNCTION IF EXISTS saas.guard_product_media_authority();
DROP TABLE IF EXISTS saas.store_domains;
DROP FUNCTION IF EXISTS saas.guard_store_domain_authority();

COMMIT;
