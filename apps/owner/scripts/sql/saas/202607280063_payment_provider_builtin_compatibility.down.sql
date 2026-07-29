BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
BEGIN
  IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
    OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid='saas.built_in_payment_methods_preflight()'::regprocedure
        AND pg_catalog.md5(procedure.prosrc)='54c393baa4a396d0526908e8fad359a5'
    ) OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid='saas.payment_provider_keyed_lifecycle_preflight()'::regprocedure
        AND pg_catalog.md5(procedure.prosrc)='8983b28d075eda62453decb82b1b5880'
    )
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_BUILTIN_COMPATIBILITY_ROLLBACK_INVALID'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION saas.built_in_payment_methods_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.built_in_payment_methods_preflight();
ALTER FUNCTION
  saas.built_in_payment_methods_preflight_without_provider_compatibility()
  RENAME TO built_in_payment_methods_preflight;
GRANT EXECUTE ON FUNCTION saas.built_in_payment_methods_preflight()
TO celebix_saas_app,celebix_saas_workflow;

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

COMMIT;
