-- Phase 3J guarded rollback. Destructive rollback requires all 051 authority to be drained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.payment_methods)
    OR EXISTS(SELECT 1 FROM saas.payment_method_operations)
    OR EXISTS(
      SELECT 1 FROM saas.merchant_provider_profiles
      WHERE capability='payment_processing'
    )
    OR EXISTS(
      SELECT 1 FROM saas.merchant_provider_definitions
      WHERE capability='payment_processing'
    )
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_ROLLBACK_REQUIRES_DRAIN';
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb),
  saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),
  saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb),
  saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM celebix_saas_app;

DROP FUNCTION saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb);
DROP FUNCTION saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text);
DROP FUNCTION saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb);
DROP FUNCTION saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.payment_method_replay_payload(jsonb);
DROP FUNCTION saas.payment_method_reorder_projection(uuid,boolean);
DROP FUNCTION saas.payment_method_mutation_projection(uuid,uuid,boolean);
DROP FUNCTION saas.payment_method_projection(uuid,uuid);

DROP TRIGGER payment_method_operations_immutable ON saas.payment_method_operations;
DROP TABLE saas.payment_method_operations;
DROP TABLE saas.payment_methods;

ALTER TABLE saas.merchant_provider_definitions
  DROP CONSTRAINT merchant_provider_definitions_capability_check;
ALTER TABLE saas.merchant_provider_definitions
  ADD CONSTRAINT merchant_provider_definitions_capability_check CHECK(capability IN(
    'marketplace_sync','invoice_reconciliation','email_delivery',
    'phone_delivery','whatsapp_delivery','indexing'
  ));

COMMIT;
