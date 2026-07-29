-- Disposable rollback to the exact migration-027 private projection bodies. Durable rows are retained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.quick_checkout_attempt_authority_projection(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'storeId',attempt.store_id,'attemptId',attempt.id,'merchantOid',attempt.merchant_oid,
    'providerConfigId',attempt.provider_config_id,'status',attempt.status,
    'expectedPaymentAmount',attempt.expected_payment_amount,'currency',attempt.currency,
    'configurationDigest',attempt.configuration_digest,'configurationKeyId',attempt.configuration_key_id,
    'sealedConfiguration',attempt.sealed_configuration
  )
  FROM saas.checkout_payment_attempts AS attempt WHERE attempt.id=p_attempt_id
$function$;

CREATE OR REPLACE FUNCTION saas.quick_checkout_reconciliation_projection(
  p_attempt_id uuid,p_worker_id uuid,p_lease_token text,p_attempt_number integer
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.quick_checkout_attempt_authority_projection(p_attempt_id)||pg_catalog.jsonb_build_object(
    'workerId',p_worker_id,'leaseToken',p_lease_token,'attemptNumber',p_attempt_number
  )
$function$;

ALTER FUNCTION saas.quick_checkout_attempt_authority_projection(uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.quick_checkout_reconciliation_projection(uuid,uuid,text,integer) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.quick_checkout_attempt_authority_projection(uuid)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.quick_checkout_reconciliation_projection(uuid,uuid,text,integer)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
COMMIT;
