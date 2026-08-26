BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) FROM PUBLIC;
DROP FUNCTION saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid);

COMMIT;
