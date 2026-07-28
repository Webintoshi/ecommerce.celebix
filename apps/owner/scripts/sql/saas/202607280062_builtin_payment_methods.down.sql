BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

LOCK TABLE saas.payment_methods IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_methods
    WHERE kind IN('cash_on_delivery','bank_transfer')
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_method_operations
    WHERE operation_kind='save'
      AND result_payload='{"outcome":"method_already_exists"}'::jsonb
  ) THEN
    RAISE EXCEPTION 'BUILT_IN_PAYMENT_METHODS_ROLLBACK_REQUIRES_DRAIN';
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION saas.built_in_payment_methods_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.built_in_payment_methods_preflight();

REVOKE ALL ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.payment_provider_keyed_lifecycle_preflight();
ALTER FUNCTION
  saas.payment_provider_keyed_lifecycle_preflight_without_builtin_authority()
  RENAME TO payment_provider_keyed_lifecycle_preflight;
GRANT EXECUTE ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
TO celebix_saas_app,celebix_saas_workflow;

REVOKE ALL ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
);
ALTER FUNCTION saas.payment_method_save_without_builtin_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) RENAME TO payment_method_save;
GRANT EXECUTE ON FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) TO celebix_saas_app;

DROP FUNCTION saas.built_in_payment_method_config_valid(text,jsonb);
DROP INDEX saas.payment_methods_one_builtin_kind_per_store;

COMMIT;
