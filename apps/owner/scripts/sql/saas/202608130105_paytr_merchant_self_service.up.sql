-- Phase 4V: finalize merchant-owned PayTR verification and method activation atomically.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE saas.merchant_provider_definitions
  DISABLE TRIGGER merchant_provider_definitions_immutable;
UPDATE saas.merchant_provider_definitions
SET allows_verification_without_execution_authority=true
WHERE provider_code='paytr_iframe' AND capability='payment_processing';
ALTER TABLE saas.merchant_provider_definitions
  ENABLE TRIGGER merchant_provider_definitions_immutable;

DO $definition$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='paytr_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_DEFINITION_INVALID'; END IF;
END
$definition$;

CREATE FUNCTION saas.paytr_merchant_self_service_mark_verification(
  p_profile_id uuid,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_worker_id text,p_now timestamptz,p_lease_id uuid,
  p_credential_version bigint,p_profile_version bigint,
  p_validation_outcome text,p_outcome_code text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE
  profile saas.merchant_provider_profiles%ROWTYPE;
  authority saas.merchant_provider_execution_authorities%ROWTYPE;
  operation saas.merchant_provider_profile_operations%ROWTYPE;
  current_method saas.payment_methods%ROWTYPE;
  result jsonb;
  method_config jsonb;
  fingerprint_source text;
  fingerprint text;
  selected_store_id uuid;
  selected_method_id uuid;
  next_position integer;
  method_count bigint;
BEGIN
  IF p_profile_id IS NULL OR p_provider_code<>'paytr_iframe'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_lease_id IS NULL
    OR p_credential_version IS NULL OR p_credential_version<1
    OR p_profile_version IS NULL OR p_profile_version<1
    OR p_validation_outcome NOT IN('validated','rejected','unavailable')
    OR p_outcome_code IS NULL OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR (p_validation_outcome='unavailable')<>(p_outcome_code='validation_unavailable')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  fingerprint_source:=p_profile_id::text||':'||p_provider_code||':'||p_capability||':'||
    p_environment||':'||p_adapter_version::text||':'||p_worker_id||':'||
    p_credential_version::text||':'||p_profile_version::text||':'||
    p_validation_outcome||':'||p_outcome_code;
  fingerprint:=pg_catalog.md5(fingerprint_source)||pg_catalog.md5('v1:'||fingerprint_source);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile.operation:'||p_lease_id::text,0
  ));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations
  WHERE operation_id=p_lease_id;
  IF FOUND THEN
    IF operation.operation_kind<>'validate' OR operation.payload_fingerprint<>fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||
    p_capability||':'||p_environment,0
  ));
  SELECT * INTO authority
  FROM saas.merchant_provider_execution_authorities AS candidate
  WHERE candidate.provider_code='paytr_iframe'
    AND candidate.capability='payment_processing'
    AND candidate.environment=p_environment
    AND candidate.adapter_version=p_adapter_version
    AND candidate.readiness=CASE p_environment
      WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
    AND candidate.enabled
  FOR SHARE;

  SELECT candidate.store_id INTO selected_store_id
  FROM saas.merchant_provider_profiles AS candidate
  WHERE candidate.id=p_profile_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.position:'||selected_store_id::text,0
  ));
  PERFORM 1
  FROM saas.payment_methods AS method
  WHERE method.store_id=selected_store_id
  ORDER BY method.id
  FOR UPDATE;
  SELECT * INTO profile
  FROM saas.merchant_provider_profiles AS candidate
  WHERE candidate.id=p_profile_id AND candidate.store_id=selected_store_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;

  IF profile.provider_code<>p_provider_code OR profile.capability<>p_capability
    OR profile.validation_environment<>p_environment
    OR profile.validation_adapter_version<>p_adapter_version
    OR profile.execution_environment IS NOT NULL
    OR profile.execution_adapter_version IS NOT NULL
    OR profile.execution_evidence_digest IS NOT NULL
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF profile.status<>'pending_validation'
    OR profile.validation_lease_id IS NULL OR profile.validation_lease_owner IS NULL
    OR profile.validation_lease_expires_at IS NULL
    OR profile.validation_lease_id<>p_lease_id
    OR profile.validation_lease_owner<>p_worker_id
    OR profile.validation_lease_expires_at<=p_now
    OR profile.credential_version<>p_credential_version
    OR profile.version<>p_profile_version
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;

  UPDATE saas.merchant_provider_profiles SET
    status=CASE p_validation_outcome
      WHEN 'validated' THEN 'active'
      WHEN 'rejected' THEN 'rotation_required'
      ELSE 'pending_validation'
    END,
    execution_environment=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN p_environment ELSE NULL END,
    execution_adapter_version=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN p_adapter_version ELSE NULL END,
    execution_evidence_digest=CASE
      WHEN p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL
      THEN authority.evidence_digest ELSE NULL END,
    version=version+1,
    last_validated_at=CASE
      WHEN p_validation_outcome='validated' THEN p_now ELSE last_validated_at END,
    validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,
    updated_at=p_now
  WHERE id=p_profile_id;

  method_config:=pg_catalog.jsonb_build_object(
    'environment',p_environment,
    'locale','tr',
    'threeDSecure','provider_managed',
    'installmentMode','all',
    'maxInstallment',0
  );

  IF p_validation_outcome='validated' AND authority.evidence_digest IS NOT NULL THEN
    SELECT pg_catalog.count(*) INTO method_count
    FROM saas.payment_methods AS method
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='paytr_iframe';
    IF method_count>1 THEN
      RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_METHOD_BINDING_CORRUPT';
    END IF;

    SELECT * INTO current_method
    FROM saas.payment_methods AS method
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='paytr_iframe';

    IF current_method.state IS DISTINCT FROM 'emergency_disabled' THEN
      UPDATE saas.payment_methods AS method SET
        state='disabled',emergency_reason=NULL,version=method.version+1,updated_at=p_now
      WHERE method.store_id=profile.store_id
        AND method.kind='provider' AND method.state='active'
        AND NOT (
          method.profile_id=p_profile_id AND method.provider_code='paytr_iframe'
        );
    END IF;

    selected_method_id:=COALESCE(current_method.id,p_profile_id);
    IF current_method.id IS NULL AND EXISTS(
      SELECT 1 FROM saas.payment_methods AS method WHERE method.id=selected_method_id
    ) THEN RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_METHOD_ID_COLLISION'; END IF;

    IF current_method.id IS NULL THEN
      SELECT COALESCE(pg_catalog.max(method.position)+1,0) INTO next_position
      FROM saas.payment_methods AS method WHERE method.store_id=profile.store_id;
      IF next_position>9999 THEN
        RAISE EXCEPTION 'PAYTR_MERCHANT_SELF_SERVICE_METHOD_POSITION_EXHAUSTED';
      END IF;
    ELSE
      next_position:=current_method.position;
    END IF;

    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      selected_method_id,profile.store_id,'provider',p_profile_id,'paytr_iframe',
      'Kredi veya banka kartı','active',NULL,next_position,method_config,1,p_now,p_now
    ) ON CONFLICT (id) DO UPDATE SET
      label=EXCLUDED.label,
      state=CASE WHEN saas.payment_methods.state='emergency_disabled'
        THEN 'emergency_disabled' ELSE 'active' END,
      emergency_reason=CASE WHEN saas.payment_methods.state='emergency_disabled'
        THEN saas.payment_methods.emergency_reason ELSE NULL END,
      config=EXCLUDED.config,
      version=saas.payment_methods.version+1,
      updated_at=EXCLUDED.updated_at;
  ELSE
    UPDATE saas.payment_methods AS method SET
      state='disabled',emergency_reason=NULL,version=method.version+1,updated_at=p_now
    WHERE method.store_id=profile.store_id
      AND method.profile_id=p_profile_id
      AND method.kind='provider' AND method.provider_code='paytr_iframe'
      AND method.state NOT IN('disabled','emergency_disabled');
  END IF;

  result:=saas.merchant_provider_profile_projection(profile.store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_lease_id,profile.store_id,'validate',fingerprint,result,p_now);
  RETURN QUERY SELECT p_validation_outcome,result;
END
$function$;

REVOKE ALL ON FUNCTION saas.paytr_merchant_self_service_mark_verification(
  uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.paytr_merchant_self_service_mark_verification(
  uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text
) TO celebix_saas_workflow;

COMMIT;
