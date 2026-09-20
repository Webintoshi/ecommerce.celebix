BEGIN;
SET LOCAL ROLE celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,
  uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,
  uuid);
COMMIT;
