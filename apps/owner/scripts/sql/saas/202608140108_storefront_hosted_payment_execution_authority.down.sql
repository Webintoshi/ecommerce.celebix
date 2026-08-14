BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  wrapper_oid oid:=pg_catalog.to_regprocedure(
    'saas.storefront_hosted_payment_execution_authority_matches(text,text,text,integer,text)'
  );
  definition text;
BEGIN
  IF pg_catalog.current_setting(
    'celebix.allow_storefront_hosted_payment_execution_authority_down',true
  )<>'on'
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_DOWN_GUARD_REQUIRED'; END IF;
  IF wrapper_oid IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_DOWN_FUNCTION_MISSING'; END IF;
  SELECT pg_catalog.pg_get_functiondef(wrapper_oid) INTO definition;
  IF pg_catalog.strpos(definition,'merchant_provider_execution_authority_visible')=0
    OR pg_catalog.strpos(definition,'merchant_provider_execution_authority_matches')>0
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_DOWN_FUNCTION_CHANGED'; END IF;
END
$f$;

DROP FUNCTION saas.storefront_hosted_payment_execution_authority_matches(
  text,text,text,integer,text
);

COMMIT;
