BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);

COMMIT;
