BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);

COMMIT;
