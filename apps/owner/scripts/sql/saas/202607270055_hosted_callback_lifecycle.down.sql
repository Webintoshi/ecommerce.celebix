BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.payment_attempt_apply_hosted_callback(
  text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz
);

DO $f$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_attempt_events
    WHERE observed_callback_status IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_ROLLBACK_OBSERVATIONS_PRESENT';
  END IF;
END
$f$;

ALTER TABLE saas.payment_attempt_events
  DROP CONSTRAINT payment_attempt_events_observed_callback_status_check,
  DROP COLUMN observed_callback_status;

COMMIT;
