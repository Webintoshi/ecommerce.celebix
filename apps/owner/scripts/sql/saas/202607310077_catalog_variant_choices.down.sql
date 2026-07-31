BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM celebix_saas_app;
DROP FUNCTION saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);

COMMIT;
