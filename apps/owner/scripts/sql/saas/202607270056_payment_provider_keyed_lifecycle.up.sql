BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE saas.merchant_provider_definitions
  ADD COLUMN allows_verification_without_execution_authority boolean NOT NULL DEFAULT false;
ALTER TABLE saas.merchant_provider_definitions DISABLE TRIGGER merchant_provider_definitions_immutable;
UPDATE saas.merchant_provider_definitions
SET allows_verification_without_execution_authority=false;
ALTER TABLE saas.merchant_provider_definitions ENABLE TRIGGER merchant_provider_definitions_immutable;

INSERT INTO saas.merchant_provider_definitions(
  provider_code,capability,enabled,allows_verification_without_execution_authority,created_at
) VALUES(
  'iyzico_iframe','payment_processing',true,true,pg_catalog.transaction_timestamp()
) ON CONFLICT(provider_code,capability) DO NOTHING;

DO $f$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='iyzico_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_DEFINITION_CORRUPT'; END IF;
END
$f$;

ALTER TABLE saas.merchant_provider_profiles
  ADD COLUMN validation_environment text,
  ADD COLUMN validation_adapter_version integer;

UPDATE saas.merchant_provider_profiles
SET validation_environment=execution_environment,
    validation_adapter_version=execution_adapter_version
WHERE capability='payment_processing';

ALTER TABLE saas.merchant_provider_profiles
  ADD CONSTRAINT merchant_provider_profiles_execution_authority_check_v056 CHECK(
    (
      capability<>'payment_processing'
      AND validation_environment IS NULL
      AND validation_adapter_version IS NULL
      AND execution_environment IS NULL
      AND execution_adapter_version IS NULL
      AND execution_evidence_digest IS NULL
    ) OR (
      capability='payment_processing'
      AND validation_environment IN('test','live')
      AND validation_adapter_version>0
      AND public_config->>'environment' IS NOT DISTINCT FROM validation_environment
      AND (
        (
          execution_environment IS NULL
          AND execution_adapter_version IS NULL
          AND execution_evidence_digest IS NULL
        ) OR (
          execution_environment IS NOT NULL
          AND execution_adapter_version IS NOT NULL
          AND execution_evidence_digest IS NOT NULL
          AND execution_environment=validation_environment
          AND execution_adapter_version=validation_adapter_version
          AND execution_evidence_digest~'^sha256:[a-f0-9]{64}$'
        )
      )
    )
  ) NOT VALID;
ALTER TABLE saas.merchant_provider_profiles
  VALIDATE CONSTRAINT merchant_provider_profiles_execution_authority_check_v056;
ALTER TABLE saas.merchant_provider_profiles
  DROP CONSTRAINT merchant_provider_profiles_execution_authority_check;
ALTER TABLE saas.merchant_provider_profiles
  RENAME CONSTRAINT merchant_provider_profiles_execution_authority_check_v056
  TO merchant_provider_profiles_execution_authority_check;

CREATE UNIQUE INDEX merchant_provider_profiles_one_live_nonpayment_capability_idx
  ON saas.merchant_provider_profiles(store_id,provider_code,capability)
  WHERE status<>'revoked' AND capability<>'payment_processing';
CREATE UNIQUE INDEX merchant_provider_profiles_one_live_payment_environment_idx
  ON saas.merchant_provider_profiles(
    store_id,provider_code,capability,validation_environment
  ) WHERE status<>'revoked' AND capability='payment_processing';
CREATE INDEX merchant_provider_profiles_verification_claim_idx
  ON saas.merchant_provider_profiles(
    provider_code,capability,validation_environment,validation_adapter_version,
    validation_lease_expires_at,created_at,id
  ) WHERE status='pending_validation' AND capability='payment_processing';
DROP INDEX saas.merchant_provider_profiles_one_live_capability_idx;

CREATE FUNCTION saas.merchant_provider_profiles_validation_identity_compat()
RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF NEW.capability<>'payment_processing' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.validation_environment IS NULL AND NEW.validation_adapter_version IS NULL
      AND NEW.execution_environment IS NOT NULL
      AND NEW.execution_adapter_version IS NOT NULL
      AND NEW.execution_evidence_digest IS NOT NULL
    THEN
      NEW.validation_environment:=NEW.execution_environment;
      NEW.validation_adapter_version:=NEW.execution_adapter_version;
    END IF;
  ELSIF NEW.validation_environment IS NOT DISTINCT FROM OLD.validation_environment
    AND NEW.validation_adapter_version IS NOT DISTINCT FROM OLD.validation_adapter_version
    AND (
      NEW.execution_environment IS DISTINCT FROM OLD.execution_environment
      OR NEW.execution_adapter_version IS DISTINCT FROM OLD.execution_adapter_version
      OR NEW.execution_evidence_digest IS DISTINCT FROM OLD.execution_evidence_digest
    ) AND NEW.execution_environment IS NOT NULL
      AND NEW.execution_adapter_version IS NOT NULL
      AND NEW.execution_evidence_digest IS NOT NULL
  THEN
    NEW.validation_environment:=NEW.execution_environment;
    NEW.validation_adapter_version:=NEW.execution_adapter_version;
  END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER merchant_provider_profiles_validation_identity_compat
  BEFORE INSERT OR UPDATE ON saas.merchant_provider_profiles
  FOR EACH ROW EXECUTE FUNCTION saas.merchant_provider_profiles_validation_identity_compat();

CREATE FUNCTION saas.merchant_provider_profiles_disable_bound_methods()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF NEW.credential_version IS DISTINCT FROM OLD.credential_version
    OR NEW.execution_environment IS DISTINCT FROM OLD.execution_environment
    OR NEW.execution_adapter_version IS DISTINCT FROM OLD.execution_adapter_version
    OR NEW.execution_evidence_digest IS DISTINCT FROM OLD.execution_evidence_digest
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'active')
  THEN
    UPDATE saas.payment_methods SET
      state='disabled',emergency_reason=NULL,version=version+1,updated_at=NEW.updated_at
    WHERE store_id=NEW.store_id AND profile_id=NEW.id
      AND kind='provider' AND provider_code=NEW.provider_code
      AND state NOT IN('disabled','emergency_disabled');
  END IF;
  RETURN NULL;
END
$f$;

CREATE TRIGGER merchant_provider_profiles_disable_bound_methods
  AFTER UPDATE ON saas.merchant_provider_profiles
  FOR EACH ROW EXECUTE FUNCTION saas.merchant_provider_profiles_disable_bound_methods();

CREATE FUNCTION saas.merchant_provider_profile_save_verification(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_provider_code text,
  p_capability text,p_public_config jsonb,p_masked_reference text,p_sealed_credentials jsonb,
  p_credential_digest text,p_credential_key_id text,p_credential_schema_version integer,
  p_validation_environment text,p_validation_adapter_version integer,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.merchant_provider_profile_operations%ROWTYPE;
  current_profile saas.merchant_provider_profiles%ROWTYPE;
  result jsonb;
  definition_enabled boolean;
  definition_allows boolean;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing'
    OR p_public_config IS NULL OR NOT saas.merchant_provider_public_config_valid(p_public_config)
    OR p_validation_environment NOT IN('test','live')
    OR p_public_config->>'environment' IS DISTINCT FROM p_validation_environment
    OR p_validation_adapter_version IS NULL OR p_validation_adapter_version<1
    OR p_masked_reference IS NULL OR p_masked_reference<>pg_catalog.btrim(p_masked_reference)
    OR pg_catalog.char_length(p_masked_reference) NOT BETWEEN 1 AND 160
    OR p_masked_reference~'[[:cntrl:]]'
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_credential_key_id IS NULL OR p_credential_key_id!~'^[A-Za-z0-9._-]{1,128}$'
    OR p_credential_schema_version<>1
    OR p_sealed_credentials IS NULL
    OR NOT saas.merchant_provider_sealed_envelope_valid(p_sealed_credentials,p_credential_key_id)
    OR p_expected_version IS NULL OR p_expected_version<0
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;

  SELECT definition.enabled,definition.allows_verification_without_execution_authority
  INTO definition_enabled,definition_allows
  FROM saas.merchant_provider_definitions AS definition
  WHERE definition.provider_code=p_provider_code AND definition.capability=p_capability
  FOR SHARE;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code=p_provider_code)
    THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'provider_not_found',NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF NOT definition_enabled OR NOT definition_allows THEN
    RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
      OR operation.operation_kind<>'save'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile:'||p_store_id::text||':'||p_provider_code||':'||
    p_capability||':'||p_validation_environment,0
  ));
  PERFORM 1 FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO current_profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF FOUND THEN
    IF current_profile.provider_code<>p_provider_code
      OR current_profile.capability<>p_capability
      OR current_profile.status='revoked'
      OR current_profile.validation_environment<>p_validation_environment
      OR current_profile.validation_adapter_version<>p_validation_adapter_version
    THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF current_profile.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.merchant_provider_profiles SET
      public_config=p_public_config,
      masked_account_reference=p_masked_reference,
      sealed_credentials=p_sealed_credentials,
      credential_digest=p_credential_digest,
      credential_key_id=p_credential_key_id,
      credential_schema_version=p_credential_schema_version,
      credential_version=credential_version+1,
      status='pending_validation',
      version=version+1,
      validation_lease_id=NULL,
      validation_lease_owner=NULL,
      validation_lease_expires_at=NULL,
      execution_environment=NULL,
      execution_adapter_version=NULL,
      execution_evidence_digest=NULL,
      revoked_at=NULL,
      updated_at=p_now
    WHERE store_id=p_store_id AND id=p_profile_id;
  ELSE
    IF p_expected_version<>0 THEN
      RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN;
    END IF;
    IF EXISTS(
      SELECT 1 FROM saas.merchant_provider_profiles
      WHERE store_id=p_store_id AND provider_code=p_provider_code
        AND capability=p_capability AND validation_environment=p_validation_environment
        AND status<>'revoked'
    ) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    BEGIN
      INSERT INTO saas.merchant_provider_profiles(
        id,store_id,provider_code,capability,public_config,masked_account_reference,
        sealed_credentials,credential_digest,credential_key_id,credential_schema_version,
        credential_version,status,version,last_validated_at,created_at,updated_at,revoked_at,
        validation_environment,validation_adapter_version,
        execution_environment,execution_adapter_version,execution_evidence_digest
      ) VALUES(
        p_profile_id,p_store_id,p_provider_code,p_capability,p_public_config,p_masked_reference,
        p_sealed_credentials,p_credential_digest,p_credential_key_id,p_credential_schema_version,
        1,'pending_validation',1,NULL,p_now,p_now,NULL,
        p_validation_environment,p_validation_adapter_version,NULL,NULL,NULL
      );
    EXCEPTION WHEN unique_violation THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END;
  END IF;
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'saved',result;
END
$f$;

CREATE FUNCTION saas.merchant_provider_profile_claim_verification(
  p_worker_id text,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_now timestamptz,p_lease_expires_at timestamptz,p_lease_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_lease_expires_at IS NULL OR NOT pg_catalog.isfinite(p_lease_expires_at)
    OR p_lease_id IS NULL OR p_lease_expires_at<=p_now
    OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.verification.lease:'||p_lease_id::text,0
  ));
  IF EXISTS(SELECT 1 FROM saas.merchant_provider_profile_operations WHERE operation_id=p_lease_id)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE validation_lease_id=p_lease_id;
  IF FOUND THEN
    IF profile.status='pending_validation'
      AND profile.validation_lease_owner=p_worker_id
      AND profile.validation_lease_expires_at=p_lease_expires_at
      AND profile.validation_lease_expires_at>p_now
      AND profile.provider_code=p_provider_code
      AND profile.capability=p_capability
      AND profile.validation_environment=p_environment
      AND profile.validation_adapter_version=p_adapter_version
      AND profile.execution_environment IS NULL
      AND profile.execution_adapter_version IS NULL
      AND profile.execution_evidence_digest IS NULL
    THEN
      RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object(
        'profileId',profile.id,'storeId',profile.store_id,
        'providerCode',profile.provider_code,'capability',profile.capability,
        'publicConfig',profile.public_config,
        'validationIdentity',pg_catalog.jsonb_build_object(
          'environment',profile.validation_environment,
          'adapterVersion',profile.validation_adapter_version
        ),
        'sealedCredentials',profile.sealed_credentials,
        'credentialVersion',profile.credential_version,
        'profileVersion',profile.version,
        'leaseId',p_lease_id,'leaseOwner',p_worker_id,
        'leaseExpiresAt',saas.merchant_admin_timestamp(p_lease_expires_at)
      );
    ELSE
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT candidate.* INTO profile
  FROM saas.merchant_provider_profiles AS candidate
  JOIN saas.merchant_provider_definitions AS definition
    ON definition.provider_code=candidate.provider_code
   AND definition.capability=candidate.capability
   AND definition.enabled
   AND definition.allows_verification_without_execution_authority
  WHERE candidate.status='pending_validation'
    AND (candidate.validation_lease_id IS NULL OR candidate.validation_lease_expires_at<=p_now)
    AND candidate.provider_code=p_provider_code
    AND candidate.capability=p_capability
    AND candidate.validation_environment=p_environment
    AND candidate.validation_adapter_version=p_adapter_version
    AND candidate.execution_environment IS NULL
    AND candidate.execution_adapter_version IS NULL
    AND candidate.execution_evidence_digest IS NULL
  ORDER BY candidate.created_at,candidate.id
  FOR UPDATE OF candidate SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET
    validation_lease_id=p_lease_id,
    validation_lease_owner=p_worker_id,
    validation_lease_expires_at=p_lease_expires_at
  WHERE id=profile.id;
  RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
    'profileId',profile.id,'storeId',profile.store_id,
    'providerCode',profile.provider_code,'capability',profile.capability,
    'publicConfig',profile.public_config,
    'validationIdentity',pg_catalog.jsonb_build_object(
      'environment',profile.validation_environment,
      'adapterVersion',profile.validation_adapter_version
    ),
    'sealedCredentials',profile.sealed_credentials,
    'credentialVersion',profile.credential_version,
    'profileVersion',profile.version,
    'leaseId',p_lease_id,'leaseOwner',p_worker_id,
    'leaseExpiresAt',saas.merchant_admin_timestamp(p_lease_expires_at)
  );
END
$f$;

CREATE FUNCTION saas.merchant_provider_profile_mark_verification(
  p_profile_id uuid,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_worker_id text,p_now timestamptz,p_lease_id uuid,
  p_credential_version bigint,p_profile_version bigint,
  p_validation_outcome text,p_outcome_code text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  profile saas.merchant_provider_profiles%ROWTYPE;
  operation saas.merchant_provider_profile_operations%ROWTYPE;
  result jsonb;
  fingerprint_source text;
  fingerprint text;
BEGIN
  IF p_profile_id IS NULL
    OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
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
  PERFORM 1 FROM saas.payment_methods WHERE profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE id=p_profile_id FOR UPDATE;
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
    version=version+1,
    last_validated_at=CASE WHEN p_validation_outcome='validated' THEN p_now ELSE last_validated_at END,
    validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,
    updated_at=p_now
  WHERE id=p_profile_id;
  result:=saas.merchant_provider_profile_projection(profile.store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_lease_id,profile.store_id,'validate',fingerprint,result,p_now);
  RETURN QUERY SELECT p_validation_outcome,result;
END
$f$;

CREATE FUNCTION saas.merchant_provider_profile_bind_execution_authority(
  p_profile_id uuid,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text,p_now timestamptz,p_expected_version bigint
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE;
  definition_allows boolean;
BEGIN
  IF p_profile_id IS NULL OR p_provider_code IS NULL
    OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_expected_version IS NULL OR p_expected_version<1
  THEN RETURN false; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest
  ) THEN RETURN false; END IF;
  PERFORM 1 FROM saas.payment_methods WHERE profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR profile.provider_code<>p_provider_code
    OR profile.capability<>p_capability OR profile.status<>'active'
    OR profile.validation_environment<>p_environment
    OR profile.validation_adapter_version<>p_adapter_version
  THEN RETURN false; END IF;
  SELECT definition.allows_verification_without_execution_authority
  INTO definition_allows
  FROM saas.merchant_provider_definitions AS definition
  WHERE definition.provider_code=profile.provider_code
    AND definition.capability=profile.capability
    AND definition.enabled
  FOR SHARE;
  IF NOT FOUND OR NOT definition_allows THEN RETURN false; END IF;
  IF profile.execution_environment=p_environment
    AND profile.execution_adapter_version=p_adapter_version
    AND profile.execution_evidence_digest=p_evidence_digest
  THEN RETURN true; END IF;
  IF profile.version<>p_expected_version THEN RETURN false; END IF;
  IF profile.execution_environment IS NULL
    AND profile.execution_adapter_version IS NULL
    AND profile.execution_evidence_digest IS NULL
  THEN
    UPDATE saas.merchant_provider_profiles SET
      execution_environment=p_environment,
      execution_adapter_version=p_adapter_version,
      execution_evidence_digest=p_evidence_digest,
      version=version+1,updated_at=p_now
    WHERE id=p_profile_id;
    RETURN true;
  END IF;
  RETURN false;
END
$f$;

ALTER FUNCTION saas.payment_method_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) RENAME TO payment_method_save_without_execution_authority;

REVOKE ALL ON FUNCTION saas.payment_method_save_without_execution_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,
  text,uuid,text,text,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.payment_method_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
  p_kind text,p_profile_id uuid,p_provider_code text,p_label text,p_config jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE snapshot_profile saas.merchant_provider_profiles%ROWTYPE;
  locked_profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_kind='provider' THEN
    SELECT * INTO snapshot_profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=p_profile_id;
    IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
    IF snapshot_profile.provider_code IS DISTINCT FROM p_provider_code
      OR snapshot_profile.capability<>'payment_processing'
    THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN; END IF;
    IF snapshot_profile.status<>'active'
      OR snapshot_profile.execution_environment IS NULL
      OR snapshot_profile.execution_adapter_version IS NULL
      OR snapshot_profile.execution_evidence_digest IS NULL
      OR p_config->>'environment' IS DISTINCT FROM snapshot_profile.validation_environment
      OR NOT saas.merchant_provider_execution_authority_matches(
        snapshot_profile.provider_code,snapshot_profile.capability,
        snapshot_profile.execution_environment,snapshot_profile.execution_adapter_version,
        snapshot_profile.execution_evidence_digest
      )
    THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
    PERFORM 1 FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
    SELECT * INTO locked_profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=p_profile_id FOR SHARE;
    IF NOT FOUND
      OR locked_profile.provider_code<>snapshot_profile.provider_code
      OR locked_profile.capability<>snapshot_profile.capability
      OR locked_profile.status<>'active'
      OR locked_profile.execution_environment<>snapshot_profile.execution_environment
      OR locked_profile.execution_adapter_version<>snapshot_profile.execution_adapter_version
      OR locked_profile.execution_evidence_digest<>snapshot_profile.execution_evidence_digest
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.payment_method_save_without_execution_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_operation_id,p_fingerprint,p_method_id,p_expected_version,p_kind,p_profile_id,
    p_provider_code,p_label,p_config
  );
END
$f$;

REVOKE ALL ON FUNCTION
  saas.merchant_provider_profiles_validation_identity_compat(),
  saas.merchant_provider_profiles_disable_bound_methods(),
  saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint),
  saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text),
  saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamptz,bigint),
  saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint),
  saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION
  saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamptz,uuid,bigint,bigint,text,text)
TO celebix_saas_workflow;

CREATE FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  signature text;
  expected_hash text;
  allowed_role text;
  expected_security boolean;
  function_oid oid;
  allowed_oid oid;
  owner_oid oid:='celebix_saas_owner'::regrole;
BEGIN
  IF saas.paytr_iframe_activation_preflight() IS NOT TRUE THEN RETURN false; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='iyzico_iframe' AND capability='payment_processing'
      AND enabled AND allows_verification_without_execution_authority
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_profiles'::regclass
      AND conname='merchant_provider_profiles_execution_authority_check'
      AND convalidated
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%validation_environment%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%execution_evidence_digest%'
  ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute
        WHERE attrelid='saas.merchant_provider_profiles'::regclass
          AND attname IN('validation_environment','validation_adapter_version')
          AND attnum>0 AND NOT attisdropped)<>2
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_capability_idx') IS NOT NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_payment_environment_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_one_live_nonpayment_capability_idx') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_profiles_verification_claim_idx') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.merchant_provider_profiles'::regclass
      AND tgname='merchant_provider_profiles_validation_identity_compat'
      AND tgenabled='O' AND NOT tgisinternal
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.merchant_provider_profiles'::regclass
      AND tgname='merchant_provider_profiles_disable_bound_methods'
      AND tgenabled='O' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;

  FOR signature,expected_hash,allowed_role,expected_security IN SELECT * FROM (VALUES
    ('saas.merchant_provider_profiles_validation_identity_compat()','e58ed91405efafc57842d258c2915370',NULL::text,false),
    ('saas.merchant_provider_profiles_disable_bound_methods()','d47dda73304fdd5f1cadd116a65c7560',NULL::text,true),
    ('saas.merchant_provider_profile_save_verification(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,bigint)','16390c6b605f3d1e0697238c4eefbce9','celebix_saas_app',true),
    ('saas.merchant_provider_profile_claim_verification(text,text,text,text,integer,timestamp with time zone,timestamp with time zone,uuid)','bdb8179dd889c57d5223654e3135db10','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)','0f52a99dc71a7424a68cb0cdff64bdc0','celebix_saas_workflow',true),
    ('saas.merchant_provider_profile_bind_execution_authority(uuid,text,text,text,integer,text,timestamp with time zone,bigint)','343e0912c1cb144d4a4eb29dfebf73be',NULL::text,true),
    ('saas.payment_method_save_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','95759feb45130750226426a364a9d94d',NULL::text,true),
    ('saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)','d28dfa0740950aa197950675b4d6737b','celebix_saas_app',true)
  ) AS expected(signature,expected_hash,allowed_role,expected_security) LOOP
    function_oid:=signature::regprocedure;
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef=expected_security
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR (privilege.grantee<>owner_oid
          AND (allowed_oid IS NULL OR privilege.grantee<>allowed_oid))
      )
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
      OR (allowed_oid IS NOT NULL AND NOT pg_catalog.has_function_privilege(allowed_oid,function_oid,'EXECUTE'))
      OR (allowed_oid IS NULL AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=function_oid AND privilege.grantee<>owner_oid
      ))
    THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;
  END LOOP;

  function_oid:='saas.payment_provider_keyed_lifecycle_preflight()'::regprocedure;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=function_oid AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(
        owner_oid,'celebix_saas_app'::regrole,'celebix_saas_workflow'::regrole
      )
    )
  ) OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',function_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'PAYMENT_PROVIDER_KEYED_LIFECYCLE_PREFLIGHT_INVALID'; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.payment_provider_keyed_lifecycle_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
