BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid) FROM celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid) FROM PUBLIC;
DROP FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid);
REVOKE ALL ON FUNCTION saas.catalog_product_title_sort_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_product_search_key(text) FROM PUBLIC;
DROP FUNCTION saas.catalog_product_title_sort_key(text);
DROP FUNCTION saas.catalog_product_search_key(text);

COMMIT;
