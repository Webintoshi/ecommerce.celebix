BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.catalog_admin_authorize_feed_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb);
COMMIT;
