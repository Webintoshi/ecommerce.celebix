-- Guarded rollback for Phase 4U payment-method preference snapshots.
DO $guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_payment_method_preference_snapshot_down',true) IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_DOWN_GUARD_REQUIRED'; END IF;
END
$guard$;

BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
LOCK TABLE saas.payment_methods,saas.payment_attempts IN ACCESS EXCLUSIVE MODE;

DO $drain$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.payment_attempts)
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_DOWN_REQUIRES_DRAIN'; END IF;
END
$drain$;

CREATE OR REPLACE FUNCTION saas.payment_attempt_begin_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$function$;

CREATE OR REPLACE FUNCTION saas.payment_attempt_authority_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,'orderReference',attempt.order_reference,
    'amountMinor',attempt.amount_minor,'currency',attempt.currency,'status',attempt.status,
    'version',attempt.version,'providerReference',attempt.safe_provider_reference,
    'publicConfig',profile.public_config,'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$function$;

DROP TRIGGER payment_attempt_method_config_immutable ON saas.payment_attempts;
DROP TRIGGER payment_attempt_bind_method_config ON saas.payment_attempts;
DROP FUNCTION saas.guard_payment_attempt_method_config_immutable();
DROP FUNCTION saas.payment_attempt_bind_method_config();
ALTER TABLE saas.payment_attempts
  DROP CONSTRAINT payment_attempts_method_config_snapshot_check,
  DROP COLUMN method_config_snapshot;
ALTER TABLE saas.payment_methods
  DROP CONSTRAINT payment_methods_provider_preference_check;
DROP FUNCTION saas.provider_payment_method_config_valid(text,jsonb);

COMMIT;
