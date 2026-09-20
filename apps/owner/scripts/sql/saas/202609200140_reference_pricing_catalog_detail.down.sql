BEGIN;
SET LOCAL ROLE celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean);
COMMIT;
