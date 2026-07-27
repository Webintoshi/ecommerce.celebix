BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.payment_attempt_apply_hosted_callback(
  text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz
);

COMMIT;
