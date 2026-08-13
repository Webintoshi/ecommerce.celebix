BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';

DO $guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_paytr_merchant_self_service_down',true)
    IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_DOWN_GUARD_REQUIRED'; END IF;
END
$guard$;

REVOKE ALL ON FUNCTION saas.paytr_merchant_self_service_mark_verification(
  uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.paytr_merchant_self_service_mark_verification(
  uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text
);

ALTER TABLE saas.merchant_provider_definitions
  DISABLE TRIGGER merchant_provider_definitions_immutable;
UPDATE saas.merchant_provider_definitions
SET allows_verification_without_execution_authority=false
WHERE provider_code='paytr_iframe' AND capability='payment_processing';
ALTER TABLE saas.merchant_provider_definitions
  ENABLE TRIGGER merchant_provider_definitions_immutable;

COMMIT;
