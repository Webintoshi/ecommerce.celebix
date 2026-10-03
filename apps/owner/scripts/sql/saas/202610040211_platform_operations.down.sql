BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.platform_operations_retry(uuid,jsonb,bigint,text);
DROP FUNCTION saas.platform_operations_read(uuid,jsonb);
COMMIT;
