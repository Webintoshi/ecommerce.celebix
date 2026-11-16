BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';

CREATE TABLE saas.iyzico_live_activation507_predecessors (
  signature regprocedure PRIMARY KEY,
  definition text NOT NULL,
  published_body_md5 text
);
REVOKE ALL ON TABLE saas.iyzico_live_activation507_predecessors FROM PUBLIC,
  celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator,
  celebix_saas_platform_operator,celebix_saas_support_runtime;

CREATE FUNCTION saas.iyzico_live_profile_authorized(p_profile saas.merchant_provider_profiles)
RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT COALESCE(
    p_profile.provider_code='iyzico_iframe'
    AND p_profile.capability='payment_processing'
    AND p_profile.status='active'
    AND p_profile.last_validated_at IS NOT NULL
    AND p_profile.public_config='{"environment":"live"}'::jsonb
    AND p_profile.validation_environment='live'
    AND p_profile.validation_adapter_version=1
    AND p_profile.execution_environment='live'
    AND p_profile.execution_adapter_version=1
    AND EXISTS (
      SELECT 1 FROM saas.merchant_provider_execution_authorities AS authority
      WHERE authority.provider_code='iyzico_iframe' AND authority.capability='payment_processing'
        AND authority.environment='live' AND authority.adapter_version=1
        AND authority.evidence_digest=p_profile.execution_evidence_digest
        AND authority.readiness='production_ready' AND authority.enabled
    ), false
  )
$f$;

CREATE FUNCTION saas.iyzico_live_method_authorized(p_store_id uuid,p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM saas.merchant_provider_profiles AS profile
    WHERE profile.store_id=p_store_id AND profile.id=p_profile_id
      AND saas.iyzico_live_profile_authorized(profile)
  )
$f$;

CREATE FUNCTION saas.iyzico_live_bind_profile(
  p_store_id uuid,p_profile_id uuid,p_expected_profile_version bigint,
  p_expected_credential_version bigint,p_evidence_digest text,p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_profile_id IS NULL
    OR p_expected_profile_version IS NULL OR p_expected_profile_version<1
    OR p_expected_credential_version IS NULL OR p_expected_credential_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN false; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    'iyzico_iframe','payment_processing','live',1,p_evidence_digest
  ) THEN RETURN false; END IF;

  -- Use the same lock order as verification and payment method changes.
  PERFORM 1 FROM saas.payment_methods AS method
  WHERE method.store_id=p_store_id AND method.profile_id=p_profile_id
  ORDER BY method.id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR profile.provider_code<>'iyzico_iframe'
    OR profile.capability<>'payment_processing' OR profile.status<>'active'
    OR profile.last_validated_at IS NULL OR profile.last_validated_at>p_now
    OR profile.validation_environment IS DISTINCT FROM 'live'
    OR profile.validation_adapter_version IS DISTINCT FROM 1
    OR profile.public_config IS DISTINCT FROM '{"environment":"live"}'::jsonb
    OR profile.credential_version<>p_expected_credential_version
  THEN RETURN false; END IF;

  IF profile.execution_environment='live' AND profile.execution_adapter_version=1
    AND profile.execution_evidence_digest=p_evidence_digest
  THEN
    RETURN profile.version=p_expected_profile_version
      OR profile.version-1=p_expected_profile_version;
  END IF;
  IF profile.version<>p_expected_profile_version THEN RETURN false; END IF;
  RETURN saas.merchant_provider_profile_bind_execution_authority(
    p_profile_id,'iyzico_iframe','payment_processing','live',1,
    p_evidence_digest,p_now,p_expected_profile_version
  );
END
$f$;

REVOKE ALL ON FUNCTION
  saas.iyzico_live_profile_authorized(saas.merchant_provider_profiles),
  saas.iyzico_live_method_authorized(uuid,uuid),
  saas.iyzico_live_bind_profile(uuid,uuid,bigint,bigint,text,timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator,celebix_saas_platform_operator,celebix_saas_support_runtime;

DO $migration$
DECLARE
  target record;
  revised text;
  new_profile_hash text;
  new_method_hash text;
  new_preflight_hash text;
  profile_anchor constant text := E'  IF (\n      NEW.execution_environment IS NOT DISTINCT FROM OLD.execution_environment';
  method_anchor constant text := E'  IF TG_OP=\'UPDATE\' AND OLD.state=\'active\' THEN\n';
  profile_checks constant text := $profile_checks$  IF NEW.execution_environment='live' THEN
    IF NEW.credential_version IS DISTINCT FROM OLD.credential_version
      OR NEW.credential_digest IS DISTINCT FROM OLD.credential_digest
      OR NEW.sealed_credentials IS DISTINCT FROM OLD.sealed_credentials
      OR NEW.credential_key_id IS DISTINCT FROM OLD.credential_key_id
      OR NEW.credential_schema_version IS DISTINCT FROM OLD.credential_schema_version
      OR NEW.public_config IS DISTINCT FROM OLD.public_config
      OR NEW.validation_environment IS DISTINCT FROM OLD.validation_environment
      OR NEW.validation_adapter_version IS DISTINCT FROM OLD.validation_adapter_version
    THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_LIVE_PROFILE_UNAUTHORIZED'; END IF;

    IF OLD.execution_environment='live'
      AND NEW.execution_adapter_version IS NOT DISTINCT FROM OLD.execution_adapter_version
      AND NEW.execution_evidence_digest IS NOT DISTINCT FROM OLD.execution_evidence_digest
    THEN RETURN NEW; END IF;

    IF OLD.execution_environment IS NULL AND OLD.status='active'
      AND OLD.last_validated_at IS NOT NULL
      AND NEW.last_validated_at IS NOT DISTINCT FROM OLD.last_validated_at
      AND NEW.version=OLD.version+1
      AND saas.iyzico_live_profile_authorized(NEW)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_LIVE_PROFILE_UNAUTHORIZED';
  END IF;
$profile_checks$;
  method_checks constant text := $method_checks$  IF NEW.config->>'environment'='live' THEN
    IF NOT saas.iyzico_live_method_authorized(NEW.store_id,NEW.profile_id)
    THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_LIVE_METHOD_UNAUTHORIZED'; END IF;
    RETURN NEW;
  END IF;
$method_checks$;
BEGIN
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_PREDECESSOR_INVALID'; END IF;

  FOR target IN
    SELECT procedure.oid,procedure.prosrc,pg_catalog.pg_get_functiondef(procedure.oid) AS definition,
      expected.expected_hash
    FROM (VALUES
      ('saas.iyzico_iframe_tenant_profile_binding_guard()'::regprocedure,
        'dfae8b1528dacd52223417e73e7c16b2'),
      ('saas.iyzico_iframe_tenant_payment_method_active_guard()'::regprocedure,
        'd0dc31eb01af4f223b4fbe480fa97af4'),
      ('saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure,
        '47fe0d9246eeaa4d676c986a86a58e3c'),
      ('saas.iyzico_iframe_tenant_activation_runtime_preflight()'::regprocedure,
        '0d45a2035f4ea0e8120974bd65f07c35')
    ) AS expected(signature,expected_hash)
    JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=expected.signature
  LOOP
    IF pg_catalog.md5(target.prosrc) IS DISTINCT FROM target.expected_hash
    THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_PREDECESSOR_INVALID:%',target.oid::regprocedure; END IF;
    INSERT INTO saas.iyzico_live_activation507_predecessors(signature,definition)
    VALUES(target.oid,target.definition);
  END LOOP;

  SELECT definition INTO STRICT revised FROM saas.iyzico_live_activation507_predecessors
  WHERE signature='saas.iyzico_iframe_tenant_profile_binding_guard()'::regprocedure;
  EXECUTE pg_catalog.replace(revised,profile_anchor,profile_checks||profile_anchor);
  SELECT pg_catalog.md5(prosrc) INTO STRICT new_profile_hash FROM pg_catalog.pg_proc
  WHERE oid='saas.iyzico_iframe_tenant_profile_binding_guard()'::regprocedure;
  IF new_profile_hash='dfae8b1528dacd52223417e73e7c16b2'
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_PROFILE_REBIND_FAILED'; END IF;

  SELECT definition INTO STRICT revised FROM saas.iyzico_live_activation507_predecessors
  WHERE signature='saas.iyzico_iframe_tenant_payment_method_active_guard()'::regprocedure;
  EXECUTE pg_catalog.replace(revised,method_anchor,method_checks||method_anchor);
  SELECT pg_catalog.md5(prosrc) INTO STRICT new_method_hash FROM pg_catalog.pg_proc
  WHERE oid='saas.iyzico_iframe_tenant_payment_method_active_guard()'::regprocedure;
  IF new_method_hash='d0dc31eb01af4f223b4fbe480fa97af4'
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_METHOD_REBIND_FAILED'; END IF;

  SELECT definition INTO STRICT revised FROM saas.iyzico_live_activation507_predecessors
  WHERE signature='saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure;
  revised:=pg_catalog.replace(revised,
    'AND profile.capability=''payment_processing'' AND profile.status=''active''',
    'AND profile.capability=''payment_processing'' AND profile.status=''active''
      AND NOT saas.iyzico_live_profile_authorized(profile)');
  revised:=pg_catalog.replace(revised,
    'AND method.state=''active'' AND NOT EXISTS(',
    'AND method.state=''active''
      AND NOT (method.config->>''environment''=''live''
        AND saas.iyzico_live_method_authorized(method.store_id,method.profile_id))
      AND NOT EXISTS(');
  revised:=pg_catalog.replace(revised,'''dfae8b1528dacd52223417e73e7c16b2''',pg_catalog.quote_literal(new_profile_hash));
  revised:=pg_catalog.replace(revised,'''d0dc31eb01af4f223b4fbe480fa97af4''',pg_catalog.quote_literal(new_method_hash));
  EXECUTE revised;
  SELECT pg_catalog.md5(prosrc) INTO STRICT new_preflight_hash FROM pg_catalog.pg_proc
  WHERE oid='saas.iyzico_iframe_tenant_evidence_preflight()'::regprocedure;

  SELECT definition INTO STRICT revised FROM saas.iyzico_live_activation507_predecessors
  WHERE signature='saas.iyzico_iframe_tenant_activation_runtime_preflight()'::regprocedure;
  revised:=pg_catalog.replace(revised,'''dfae8b1528dacd52223417e73e7c16b2''',pg_catalog.quote_literal(new_profile_hash));
  revised:=pg_catalog.replace(revised,'''d0dc31eb01af4f223b4fbe480fa97af4''',pg_catalog.quote_literal(new_method_hash));
  revised:=pg_catalog.replace(revised,'''47fe0d9246eeaa4d676c986a86a58e3c''',pg_catalog.quote_literal(new_preflight_hash));
  EXECUTE revised;

  UPDATE saas.iyzico_live_activation507_predecessors AS predecessor
  SET published_body_md5=pg_catalog.md5(procedure.prosrc)
  FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=predecessor.signature;
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_POSTCONDITION_INVALID'; END IF;
END
$migration$;

COMMIT;
