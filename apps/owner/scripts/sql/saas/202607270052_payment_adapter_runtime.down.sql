BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.payment_attempt_operations)
    OR EXISTS(SELECT 1 FROM saas.payment_attempt_events)
    OR EXISTS(SELECT 1 FROM saas.payment_callback_bindings)
    OR EXISTS(SELECT 1 FROM saas.payment_attempts)
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_ROLLBACK_REQUIRES_DRAIN';
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text),
  saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamptz),
  saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamptz),
  saas.payment_callback_authority(text,text,timestamptz),
  saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz),
  saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz),
  saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)
FROM celebix_saas_workflow;

DROP FUNCTION saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz);
DROP FUNCTION saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz);
DROP FUNCTION saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamptz);
DROP FUNCTION saas.payment_callback_authority(text,text,timestamptz);
DROP FUNCTION saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamptz);
DROP FUNCTION saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamptz);
DROP FUNCTION saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text);

DROP FUNCTION saas.payment_attempt_claim_projection(uuid);
DROP FUNCTION saas.payment_attempt_authority_projection(uuid);
DROP FUNCTION saas.payment_attempt_begin_projection(uuid);
DROP FUNCTION saas.payment_attempt_event_projection(uuid,boolean);
DROP FUNCTION saas.payment_attempt_mutation_projection(uuid,boolean);

DROP TRIGGER payment_attempt_operations_immutable ON saas.payment_attempt_operations;
DROP TRIGGER payment_attempt_events_immutable ON saas.payment_attempt_events;
DROP TRIGGER payment_callback_bindings_immutable ON saas.payment_callback_bindings;
DROP TRIGGER payment_attempts_transition ON saas.payment_attempts;
DROP FUNCTION saas.guard_payment_attempt_transition();

DROP TABLE saas.payment_attempt_operations;
DROP TABLE saas.payment_attempt_events;
DROP TABLE saas.payment_callback_bindings;
DROP TABLE saas.payment_attempts;

COMMIT;
