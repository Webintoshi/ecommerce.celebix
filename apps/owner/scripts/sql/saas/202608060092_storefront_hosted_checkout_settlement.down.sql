BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

LOCK TABLE saas.storefront_hosted_checkout_sessions,saas.payment_attempts IN ACCESS EXCLUSIVE MODE;
DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions)
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_SETTLEMENT_DOWN_BLOCKED'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_hosted_checkout_expire_created(timestamptz,integer),
  saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer),
  saas.storefront_hosted_checkout_settlement_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.storefront_hosted_checkout_settlement_preflight();
DROP FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer);
DROP FUNCTION saas.storefront_hosted_checkout_expire_created(timestamptz,integer);
DROP TRIGGER payment_attempt_standard_checkout_terminal ON saas.payment_attempts;
DROP FUNCTION saas.storefront_hosted_checkout_terminal_transition();

COMMIT;
