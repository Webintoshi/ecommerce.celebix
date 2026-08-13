-- Phase 4U: bind exact provider checkout preferences to each durable payment attempt.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';

LOCK TABLE saas.payment_methods,saas.payment_attempts IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION saas.provider_payment_method_config_valid(
  p_provider_code text,
  p_config jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT COALESCE(
    p_provider_code IN('paytr_iframe','iyzico_iframe')
    AND pg_catalog.jsonb_typeof(p_config)='object'
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_config))=5
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key)
      WHERE field.key NOT IN(
        'environment','locale','threeDSecure','installmentMode','maxInstallment'
      )
    )
    AND pg_catalog.jsonb_typeof(p_config->'environment')='string'
    AND p_config->>'environment' IN('test','live')
    AND pg_catalog.jsonb_typeof(p_config->'locale')='string'
    AND p_config->>'locale' IN('tr','en')
    AND (p_provider_code<>'paytr_iframe' OR p_config->>'locale'='tr')
    AND pg_catalog.jsonb_typeof(p_config->'threeDSecure')='string'
    AND p_config->>'threeDSecure'='provider_managed'
    AND pg_catalog.jsonb_typeof(p_config->'installmentMode')='string'
    AND p_config->>'installmentMode' IN('all','single_payment','limited')
    AND pg_catalog.jsonb_typeof(p_config->'maxInstallment')='number'
    AND (p_config->>'maxInstallment')::numeric IN(0,2,3,6,9,12)
    AND (
      (p_config->>'installmentMode'='limited' AND (p_config->>'maxInstallment')::numeric<>0)
      OR
      (p_config->>'installmentMode'<>'limited' AND (p_config->>'maxInstallment')::numeric=0)
    ),
    false
  )
$function$;

-- Upgrade only the exact legacy environment-only shape. Any other malformed row
-- remains visible to the fail-closed assertion below.
UPDATE saas.payment_methods AS method
SET config=pg_catalog.jsonb_build_object(
    'environment',method.config->>'environment',
    'locale','tr',
    'threeDSecure','provider_managed',
    'installmentMode','all',
    'maxInstallment',0
  ),
  version=method.version+1,
  updated_at=GREATEST(method.updated_at,pg_catalog.transaction_timestamp())
WHERE method.kind='provider'
  AND method.provider_code IN('paytr_iframe','iyzico_iframe')
  AND pg_catalog.jsonb_typeof(method.config)='object'
  AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(method.config))=1
  AND pg_catalog.jsonb_typeof(method.config->'environment')='string'
  AND method.config->>'environment' IN('test','live');

DO $validation$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.kind='provider'
      AND method.provider_code IN('paytr_iframe','iyzico_iframe')
      AND NOT saas.provider_payment_method_config_valid(method.provider_code,method.config)
  ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_CONFIG_INVALID'; END IF;
END
$validation$;

ALTER TABLE saas.payment_methods
  ADD CONSTRAINT payment_methods_provider_preference_check CHECK(
    kind<>'provider'
    OR provider_code NOT IN('paytr_iframe','iyzico_iframe')
    OR saas.provider_payment_method_config_valid(provider_code,config)
  ) NOT VALID;
ALTER TABLE saas.payment_methods
  VALIDATE CONSTRAINT payment_methods_provider_preference_check;

-- Migration 061 seals exact Iyzico activation functions by body hash and used the
-- legacy one-field method config. Upgrade those already-installed functions from
-- the verified donor body rather than weakening either the config constraint or
-- the attestation preflight.
DO $activation_compatibility$
DECLARE
  routine_signature text;
  legacy_hash text;
  routine_oid oid;
  routine_definition text;
  upgraded_definition text;
  upgraded_hash text;
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
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND pg_catalog.md5(procedure.prosrc)=legacy_hash
    ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;

    SELECT pg_catalog.pg_get_functiondef(routine_oid) INTO routine_definition;
    upgraded_definition:=pg_catalog.replace(routine_definition,legacy_config,upgraded_config);
    IF upgraded_definition=routine_definition
    THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
    EXECUTE upgraded_definition;

    SELECT pg_catalog.md5(procedure.prosrc) INTO upgraded_hash
    FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=routine_oid;
    IF pg_catalog.strpos(preflight_definition,legacy_hash)=0
    THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
    preflight_definition:=pg_catalog.replace(preflight_definition,legacy_hash,upgraded_hash);
  END LOOP;

  EXECUTE preflight_definition;
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT'; END IF;
END
$activation_compatibility$;

ALTER TABLE saas.payment_attempts
  ADD COLUMN method_config_snapshot jsonb;

UPDATE saas.payment_attempts AS attempt
SET method_config_snapshot=method.config
FROM saas.payment_methods AS method
WHERE method.store_id=attempt.store_id
  AND method.id=attempt.payment_method_id
  AND method.profile_id=attempt.profile_id
  AND method.provider_code=attempt.provider_code
  AND method.kind='provider'
  AND method.config->>'environment'=attempt.environment
  AND saas.provider_payment_method_config_valid(method.provider_code,method.config);

DO $backfill$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.payment_attempts
    WHERE method_config_snapshot IS NULL
      OR NOT saas.provider_payment_method_config_valid(provider_code,method_config_snapshot)
      OR method_config_snapshot->>'environment' IS DISTINCT FROM environment
  ) THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_PREFERENCE_BACKFILL_INVALID'; END IF;
END
$backfill$;

ALTER TABLE saas.payment_attempts
  ALTER COLUMN method_config_snapshot SET NOT NULL,
  ADD CONSTRAINT payment_attempts_method_config_snapshot_check CHECK(
    saas.provider_payment_method_config_valid(provider_code,method_config_snapshot)
    AND method_config_snapshot->>'environment'=environment
  );

CREATE FUNCTION saas.payment_attempt_bind_method_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_config jsonb;
BEGIN
  IF NEW.method_config_snapshot IS NOT NULL
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_METHOD_CONFIG_CALLER_AUTHORITY_FORBIDDEN'; END IF;

  SELECT method.config INTO selected_config
  FROM saas.payment_methods AS method
  WHERE method.store_id=NEW.store_id
    AND method.id=NEW.payment_method_id
    AND method.profile_id=NEW.profile_id
    AND method.provider_code=NEW.provider_code
    AND method.kind='provider'
    AND method.state='active'
    AND method.config->>'environment'=NEW.environment
    AND saas.provider_payment_method_config_valid(method.provider_code,method.config)
  FOR SHARE OF method;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_METHOD_CONFIG_INVALID'; END IF;

  NEW.method_config_snapshot:=selected_config;
  RETURN NEW;
END
$function$;

CREATE TRIGGER payment_attempt_bind_method_config
BEFORE INSERT ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.payment_attempt_bind_method_config();

CREATE FUNCTION saas.guard_payment_attempt_method_config_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF NEW.method_config_snapshot IS DISTINCT FROM OLD.method_config_snapshot
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_METHOD_CONFIG_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER payment_attempt_method_config_immutable
BEFORE UPDATE OF method_config_snapshot ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.guard_payment_attempt_method_config_immutable();

CREATE OR REPLACE FUNCTION saas.payment_attempt_begin_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'methodConfig',attempt.method_config_snapshot,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$function$;

CREATE OR REPLACE FUNCTION saas.payment_attempt_authority_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,
    'orderReference',attempt.order_reference,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'status',attempt.status,
    'version',attempt.version,
    'providerReference',attempt.safe_provider_reference,
    'methodConfig',attempt.method_config_snapshot,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$function$;

REVOKE ALL ON FUNCTION
  saas.provider_payment_method_config_valid(text,jsonb),
  saas.payment_attempt_bind_method_config(),
  saas.guard_payment_attempt_method_config_immutable()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

COMMIT;
