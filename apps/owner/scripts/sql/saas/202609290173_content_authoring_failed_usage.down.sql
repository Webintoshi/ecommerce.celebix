BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Usage belongs to the durable operation; removing this additive writer never
-- removes or rewrites populated operation/usage/origin history.
DROP FUNCTION saas.content_authoring_fail_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text,jsonb);
COMMIT;
