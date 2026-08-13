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

-- Restore the exact migration-061 activation bodies and their sealed preflight
-- hashes before returning persisted configs to the legacy one-field shape.
DO $activation_compatibility$
DECLARE
  routine_signature text;
  legacy_hash text;
  routine_oid oid;
  routine_definition text;
  restored_definition text;
  current_hash text;
  restored_hash text;
  preflight_definition text;
  legacy_config constant text:='''{"environment":"test"}''::jsonb';
  upgraded_config constant text:='''{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}''::jsonb';
BEGIN
  IF pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_activation_runtime_preflight()') IS NULL
    OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.iyzico_iframe_tenant_activation_runtime_preflight()'::pg_catalog.regprocedure
  ) INTO preflight_definition;

  FOR routine_signature,legacy_hash IN SELECT * FROM (VALUES
    ('iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
      'fa0657fcc802d3e61658858d533cdf99'),
    ('iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
      '1fb9069c782aadd6cc85c9084a58bf7f'),
    ('iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
      '3e11a935ca294cfe281acfff0f04a448')
  ) AS expected(signature,body_hash) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_signature);
    IF routine_oid IS NULL
    THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
    SELECT pg_catalog.pg_get_functiondef(routine_oid),pg_catalog.md5(procedure.prosrc)
      INTO routine_definition,current_hash
    FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=routine_oid;
    restored_definition:=pg_catalog.replace(routine_definition,upgraded_config,legacy_config);
    IF restored_definition=routine_definition
    THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
    EXECUTE restored_definition;

    SELECT pg_catalog.md5(procedure.prosrc) INTO restored_hash
    FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=routine_oid;
    IF restored_hash<>legacy_hash OR pg_catalog.strpos(preflight_definition,current_hash)=0
    THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
    preflight_definition:=pg_catalog.replace(preflight_definition,current_hash,legacy_hash);
  END LOOP;

  EXECUTE preflight_definition;
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
END
$activation_compatibility$;

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

UPDATE saas.payment_methods AS method
SET config=pg_catalog.jsonb_build_object('environment',method.config->>'environment'),
  version=method.version+1,
  updated_at=GREATEST(method.updated_at,pg_catalog.transaction_timestamp())
WHERE method.kind='provider'
  AND method.provider_code IN('paytr_iframe','iyzico_iframe')
  AND saas.provider_payment_method_config_valid(method.provider_code,method.config);

DO $legacy_config_restore$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.kind='provider'
      AND method.provider_code IN('paytr_iframe','iyzico_iframe')
      AND (
        pg_catalog.jsonb_typeof(method.config)<>'object'
        OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(method.config))<>1
        OR pg_catalog.jsonb_typeof(method.config->'environment')<>'string'
        OR method.config->>'environment' NOT IN('test','live')
      )
  ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_LEGACY_CONFIG_RESTORE_INVALID'; END IF;
END
$legacy_config_restore$;

DROP FUNCTION saas.provider_payment_method_config_valid(text,jsonb);

COMMIT;
