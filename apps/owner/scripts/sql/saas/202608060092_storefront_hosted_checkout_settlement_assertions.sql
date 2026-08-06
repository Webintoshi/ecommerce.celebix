BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF saas.storefront_hosted_checkout_settlement_preflight() IS DISTINCT FROM true
    OR pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('saas.storefront_hosted_checkout_terminal_transition()'::pg_catalog.regprocedure),
      'INSERT INTO saas.storefront_checkout_operations'
    )=0
    OR pg_catalog.strpos(
      pg_catalog.pg_get_functiondef('saas.storefront_hosted_checkout_terminal_transition()'::pg_catalog.regprocedure),
      'paymentStatus'
    )=0
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.storefront_hosted_checkout_expire_created(timestamp with time zone,integer)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.storefront_hosted_checkout_reconciliation_candidates(timestamp with time zone,integer)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_host_resolver',
      'saas.storefront_hosted_checkout_expire_created(timestamp with time zone,integer)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_SETTLEMENT_CONTRACT_INVALID'; END IF;
END
$f$;

COMMIT;
