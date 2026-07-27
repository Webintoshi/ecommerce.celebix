BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at)
  VALUES('paytr_iframe','payment_processing',true,pg_catalog.transaction_timestamp())
  ON CONFLICT(provider_code,capability) DO NOTHING;
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='paytr_iframe' AND capability='payment_processing' AND enabled
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_PROVIDER_DEFINITION_CORRUPT'; END IF;
END
$f$;

CREATE TABLE saas.merchant_provider_execution_authorities(
  provider_code text NOT NULL,
  capability text NOT NULL,
  environment text NOT NULL,
  adapter_version integer NOT NULL,
  evidence_digest text NOT NULL,
  readiness text NOT NULL,
  enabled boolean NOT NULL,
  approved_at timestamptz NOT NULL,
  PRIMARY KEY(provider_code,environment),
  UNIQUE(provider_code,capability,environment,adapter_version,evidence_digest),
  FOREIGN KEY(provider_code,capability)
    REFERENCES saas.merchant_provider_definitions(provider_code,capability),
  CHECK(capability='payment_processing'),
  CHECK(environment IN('test','live')),
  CHECK(adapter_version>0),
  CHECK(evidence_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(pg_catalog.isfinite(approved_at)),
  CHECK(
    (environment='test' AND readiness='sandbox_ready')
    OR (environment='live' AND readiness='production_ready')
  )
);
ALTER TABLE saas.merchant_provider_execution_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_provider_execution_authorities FORCE ROW LEVEL SECURITY;

ALTER TABLE saas.merchant_provider_profiles
  ADD COLUMN execution_environment text,
  ADD COLUMN execution_adapter_version integer,
  ADD COLUMN execution_evidence_digest text,
  ADD CONSTRAINT merchant_provider_profiles_execution_authority_check CHECK(
    (capability<>'payment_processing' AND (
      execution_environment IS NULL
      AND execution_adapter_version IS NULL
      AND execution_evidence_digest IS NULL
    )) OR (
      capability='payment_processing'
      AND execution_environment IN('test','live')
      AND execution_adapter_version>0
      AND execution_evidence_digest~'^sha256:[a-f0-9]{64}$'
      AND public_config->>'environment'=execution_environment
    )
  );

CREATE FUNCTION saas.merchant_provider_execution_authority_matches(
  p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE approved boolean;
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
  THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||p_capability||':'||p_environment,0
  ));
  SELECT true INTO approved
  FROM saas.merchant_provider_execution_authorities AS authority
  WHERE authority.provider_code=p_provider_code
    AND authority.capability=p_capability
    AND authority.environment=p_environment
    AND authority.adapter_version=p_adapter_version
    AND authority.evidence_digest=p_evidence_digest
    AND authority.readiness=CASE p_environment
      WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END
    AND authority.enabled
  FOR SHARE;
  RETURN COALESCE(approved,false);
END
$f$;

CREATE FUNCTION saas.merchant_provider_execution_authority_invalidate_bound(
  p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text,p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
BEGIN
  UPDATE saas.payment_methods AS method SET
    state='disabled',emergency_reason=NULL,version=method.version+1,updated_at=p_now
  FROM saas.merchant_provider_profiles AS profile
  WHERE profile.provider_code=p_provider_code AND profile.capability=p_capability
    AND profile.execution_environment=p_environment
    AND profile.execution_adapter_version=p_adapter_version
    AND profile.execution_evidence_digest=p_evidence_digest
    AND method.store_id=profile.store_id AND method.profile_id=profile.id
    AND method.kind='provider' AND method.provider_code=profile.provider_code
    AND method.state NOT IN('disabled','emergency_disabled');
  UPDATE saas.merchant_provider_profiles AS profile SET
    status=CASE WHEN profile.status IN('active','pending_validation') THEN 'rotation_required' ELSE profile.status END,
    validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,
    version=profile.version+1,updated_at=p_now
  WHERE profile.provider_code=p_provider_code AND profile.capability=p_capability
    AND profile.execution_environment=p_environment
    AND profile.execution_adapter_version=p_adapter_version
    AND profile.execution_evidence_digest=p_evidence_digest
    AND (profile.status IN('active','pending_validation') OR profile.validation_lease_id IS NOT NULL);
END
$f$;

CREATE FUNCTION saas.merchant_provider_execution_authority_approve(
  p_provider_code text,p_capability text,p_environment text,p_adapter_version integer,
  p_evidence_digest text,p_readiness text,p_approved_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE current_authority saas.merchant_provider_execution_authorities%ROWTYPE;
BEGIN
  IF p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_readiness<>(CASE p_environment WHEN 'test' THEN 'sandbox_ready' ELSE 'production_ready' END)
    OR p_approved_at IS NULL OR NOT pg_catalog.isfinite(p_approved_at)
  THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||p_capability||':'||p_environment,0
  ));
  SELECT * INTO current_authority FROM saas.merchant_provider_execution_authorities
  WHERE provider_code=p_provider_code AND environment=p_environment FOR UPDATE;
  IF FOUND AND (
    current_authority.capability<>p_capability
    OR current_authority.adapter_version<>p_adapter_version
    OR current_authority.evidence_digest<>p_evidence_digest
    OR current_authority.readiness<>p_readiness
  ) THEN
    PERFORM saas.merchant_provider_execution_authority_invalidate_bound(
      current_authority.provider_code,current_authority.capability,current_authority.environment,
      current_authority.adapter_version,current_authority.evidence_digest,p_approved_at
    );
  END IF;
  INSERT INTO saas.merchant_provider_execution_authorities(
    provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at
  ) VALUES(p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest,p_readiness,true,p_approved_at)
  ON CONFLICT(provider_code,environment) DO UPDATE SET
    capability=EXCLUDED.capability,adapter_version=EXCLUDED.adapter_version,
    evidence_digest=EXCLUDED.evidence_digest,readiness=EXCLUDED.readiness,
    enabled=true,approved_at=EXCLUDED.approved_at;
  RETURN true;
END
$f$;

CREATE FUNCTION saas.merchant_provider_execution_authority_revoke(
  p_provider_code text,p_capability text,p_environment text,p_adapter_version integer,
  p_evidence_digest text,p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE current_authority saas.merchant_provider_execution_authorities%ROWTYPE;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.execution.authority:'||p_provider_code||':'||p_capability||':'||p_environment,0
  ));
  SELECT * INTO current_authority FROM saas.merchant_provider_execution_authorities
  WHERE provider_code=p_provider_code AND capability=p_capability AND environment=p_environment
    AND adapter_version=p_adapter_version AND evidence_digest=p_evidence_digest AND enabled
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM saas.merchant_provider_execution_authority_invalidate_bound(
    p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest,p_now
  );
  UPDATE saas.merchant_provider_execution_authorities SET enabled=false
  WHERE provider_code=p_provider_code AND environment=p_environment;
  RETURN true;
END
$f$;

REVOKE ALL ON TABLE saas.merchant_provider_execution_authorities
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION
  saas.merchant_provider_execution_authority_matches(text,text,text,integer,text),
  saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamptz),
  saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamptz),
  saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.paytr_iframe_test_payment_method_disable(
  p_store_id uuid,p_profile_id uuid,p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
BEGIN
  UPDATE saas.payment_methods AS method SET
    state='disabled',emergency_reason=NULL,version=method.version+1,updated_at=p_now
  FROM saas.merchant_provider_profiles AS profile
  WHERE profile.store_id=p_store_id AND profile.id=p_profile_id
    AND profile.provider_code='paytr_iframe' AND profile.capability='payment_processing'
    AND method.store_id=profile.store_id AND method.profile_id=profile.id
    AND method.kind='provider' AND method.provider_code='paytr_iframe'
    AND method.state NOT IN('disabled','emergency_disabled');
END
$f$;

CREATE FUNCTION saas.paytr_iframe_test_payment_method_stage(
  p_store_id uuid,p_profile_id uuid,p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE method saas.payment_methods%ROWTYPE; next_position integer; method_count bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.position:'||p_store_id::text,0
  ));
  SELECT pg_catalog.count(*) INTO method_count FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id
    AND kind='provider' AND provider_code='paytr_iframe';
  IF method_count>1 THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_BINDING_CORRUPT'; END IF;
  SELECT * INTO method FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id
    AND kind='provider' AND provider_code='paytr_iframe' FOR UPDATE;
  IF FOUND THEN
    IF method.kind<>'provider' OR method.profile_id<>p_profile_id
      OR method.provider_code<>'paytr_iframe'
    THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_CORRUPT'; END IF;
    IF method.state='emergency_disabled' THEN RETURN; END IF;
    IF method.state<>'disabled' OR method.emergency_reason IS NOT NULL
      OR method.config<>'{"environment":"test"}'::jsonb
    THEN
      UPDATE saas.payment_methods SET state='disabled',emergency_reason=NULL,config='{"environment":"test"}'::jsonb,
        version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=method.id;
    END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.payment_methods WHERE id=p_profile_id) THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_ID_COLLISION';
  END IF;
  SELECT COALESCE(pg_catalog.max(position)+1,0) INTO next_position
  FROM saas.payment_methods WHERE store_id=p_store_id;
  IF next_position>9999 THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_POSITION_EXHAUSTED'; END IF;
  INSERT INTO saas.payment_methods(
    id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
    position,config,version,created_at,updated_at
  ) VALUES(
    p_profile_id,p_store_id,'provider',p_profile_id,'paytr_iframe','PayTR iFrame',
    'disabled',NULL,next_position,'{"environment":"test"}'::jsonb,1,p_now,p_now
  );
END
$f$;

CREATE FUNCTION saas.paytr_iframe_test_payment_method_activate(
  p_store_id uuid,p_profile_id uuid,p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE method saas.payment_methods%ROWTYPE; next_position integer; method_count bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.position:'||p_store_id::text,0
  ));
  SELECT pg_catalog.count(*) INTO method_count FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id
    AND kind='provider' AND provider_code='paytr_iframe';
  IF method_count>1 THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_BINDING_CORRUPT'; END IF;
  SELECT * INTO method FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id
    AND kind='provider' AND provider_code='paytr_iframe' FOR UPDATE;
  IF FOUND THEN
    IF method.kind<>'provider' OR method.profile_id<>p_profile_id
      OR method.provider_code<>'paytr_iframe'
    THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_CORRUPT'; END IF;
    IF method.state='emergency_disabled' THEN RETURN; END IF;
    IF method.state<>'active' OR method.emergency_reason IS NOT NULL
      OR method.config<>'{"environment":"test"}'::jsonb
    THEN
      UPDATE saas.payment_methods SET state='active',emergency_reason=NULL,config='{"environment":"test"}'::jsonb,
        version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=method.id;
    END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.payment_methods WHERE id=p_profile_id) THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_ID_COLLISION';
  END IF;
  SELECT COALESCE(pg_catalog.max(position)+1,0) INTO next_position
  FROM saas.payment_methods WHERE store_id=p_store_id;
  IF next_position>9999 THEN RAISE EXCEPTION 'PAYTR_IFRAME_PAYMENT_METHOD_POSITION_EXHAUSTED'; END IF;
  INSERT INTO saas.payment_methods(
    id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
    position,config,version,created_at,updated_at
  ) VALUES(
    p_profile_id,p_store_id,'provider',p_profile_id,'paytr_iframe','PayTR iFrame',
    'active',NULL,next_position,'{"environment":"test"}'::jsonb,1,p_now,p_now
  );
END
$f$;

DROP FUNCTION saas.merchant_provider_profile_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,
  jsonb,text,jsonb,text,text,integer,bigint
);

CREATE FUNCTION saas.merchant_provider_profile_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_provider_code text,
  p_capability text,p_public_config jsonb,p_masked_reference text,p_sealed_credentials jsonb,
  p_credential_digest text,p_credential_key_id text,p_credential_schema_version integer,
  p_execution_environment text,p_execution_adapter_version integer,p_execution_evidence_digest text,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE;
  current_profile saas.merchant_provider_profiles%ROWTYPE; result jsonb; definition_enabled boolean;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability IS NULL OR p_capability NOT IN('marketplace_sync','invoice_reconciliation','email_delivery','phone_delivery','whatsapp_delivery','indexing','payment_processing')
    OR p_public_config IS NULL OR NOT saas.merchant_provider_public_config_valid(p_public_config)
    OR p_masked_reference IS NULL OR p_masked_reference<>pg_catalog.btrim(p_masked_reference)
    OR pg_catalog.char_length(p_masked_reference) NOT BETWEEN 1 AND 160 OR p_masked_reference~'[[:cntrl:]]'
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_credential_key_id IS NULL OR p_credential_key_id!~'^[A-Za-z0-9._-]{1,128}$'
    OR p_credential_schema_version IS NULL OR p_credential_schema_version<>1
    OR p_sealed_credentials IS NULL OR NOT saas.merchant_provider_sealed_envelope_valid(p_sealed_credentials,p_credential_key_id)
    OR (p_capability='payment_processing' AND (
      p_execution_environment IS NULL OR p_execution_environment NOT IN('test','live')
      OR p_public_config->>'environment'<>p_execution_environment
      OR p_execution_adapter_version IS NULL OR p_execution_adapter_version<1
      OR p_execution_evidence_digest IS NULL OR p_execution_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    ))
    OR (p_capability<>'payment_processing' AND (
      p_execution_environment IS NOT NULL OR p_execution_adapter_version IS NOT NULL
      OR p_execution_evidence_digest IS NOT NULL
    ))
    OR p_expected_version IS NULL OR p_expected_version<0
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT definition.enabled INTO definition_enabled FROM saas.merchant_provider_definitions AS definition
  WHERE definition.provider_code=p_provider_code AND definition.capability=p_capability FOR SHARE;
  IF NOT FOUND THEN
    IF EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code=p_provider_code)
    THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'provider_not_found',NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF NOT definition_enabled THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
  IF p_capability='payment_processing' AND NOT saas.merchant_provider_execution_authority_matches(
    p_provider_code,p_capability,p_execution_environment,p_execution_adapter_version,p_execution_evidence_digest
  ) THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'save'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.profile:'||p_store_id::text||':'||p_provider_code||':'||p_capability,0
  ));
  PERFORM 1 FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO current_profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF FOUND THEN
    IF current_profile.provider_code<>p_provider_code OR current_profile.capability<>p_capability OR current_profile.status='revoked'
    THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF current_profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
    UPDATE saas.merchant_provider_profiles SET
      public_config=p_public_config,masked_account_reference=p_masked_reference,sealed_credentials=p_sealed_credentials,
      credential_digest=p_credential_digest,credential_key_id=p_credential_key_id,credential_schema_version=p_credential_schema_version,
      execution_environment=p_execution_environment,execution_adapter_version=p_execution_adapter_version,
      execution_evidence_digest=p_execution_evidence_digest,
      credential_version=credential_version+1,status='pending_validation',version=version+1,
      validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,revoked_at=NULL,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_profile_id;
    PERFORM saas.paytr_iframe_test_payment_method_disable(p_store_id,p_profile_id,p_now);
  ELSE
    IF p_expected_version<>0 THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND provider_code=p_provider_code AND capability=p_capability AND status<>'revoked')
    THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    BEGIN
      INSERT INTO saas.merchant_provider_profiles(
        id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
        credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,created_at,updated_at
        ,execution_environment,execution_adapter_version,execution_evidence_digest
      ) VALUES(
        p_profile_id,p_store_id,p_provider_code,p_capability,p_public_config,p_masked_reference,p_sealed_credentials,
        p_credential_digest,p_credential_key_id,p_credential_schema_version,1,'pending_validation',1,p_now,p_now
        ,p_execution_environment,p_execution_adapter_version,p_execution_evidence_digest
      );
    EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END;
  END IF;
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'saved',result;
END
$f$;

DROP FUNCTION saas.merchant_provider_profile_claim_validation(text,timestamptz,timestamptz,uuid);
CREATE FUNCTION saas.merchant_provider_profile_claim_validation(
  p_worker_id text,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text,
  p_now timestamptz,p_lease_expires_at timestamptz,p_lease_id uuid
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
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_now IS NULL OR p_lease_expires_at IS NULL OR p_lease_id IS NULL
    OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest
  ) THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.merchant.provider.validation.lease:'||p_lease_id::text,0
  ));
  IF EXISTS(SELECT 1 FROM saas.merchant_provider_profile_operations WHERE operation_id=p_lease_id)
    OR EXISTS(SELECT 1 FROM saas.merchant_provider_profiles WHERE validation_lease_id=p_lease_id)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT candidate.* INTO profile
  FROM saas.merchant_provider_profiles AS candidate
  JOIN saas.merchant_provider_definitions AS definition
    ON definition.provider_code=candidate.provider_code
   AND definition.capability=candidate.capability
   AND definition.enabled
  WHERE candidate.status='pending_validation'
    AND (candidate.validation_lease_id IS NULL OR candidate.validation_lease_expires_at<=p_now)
    AND candidate.provider_code=p_provider_code AND candidate.capability=p_capability
    AND candidate.execution_environment=p_environment
    AND candidate.execution_adapter_version=p_adapter_version
    AND candidate.execution_evidence_digest=p_evidence_digest
  ORDER BY candidate.created_at,candidate.id
  FOR UPDATE OF candidate SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'empty',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET
    validation_lease_id=p_lease_id,validation_lease_owner=p_worker_id,
    validation_lease_expires_at=p_lease_expires_at
  WHERE id=profile.id;
  RETURN QUERY SELECT 'claimed',pg_catalog.jsonb_build_object(
    'profileId',profile.id,'storeId',profile.store_id,'providerCode',profile.provider_code,
    'capability',profile.capability,'publicConfig',profile.public_config,
    'executionAuthority',pg_catalog.jsonb_build_object(
      'environment',profile.execution_environment,
      'adapterVersion',profile.execution_adapter_version,
      'evidenceDigest',profile.execution_evidence_digest
    ),
    'sealedCredentials',profile.sealed_credentials,'credentialVersion',profile.credential_version,
    'profileVersion',profile.version,'leaseId',p_lease_id,'leaseOwner',p_worker_id,
    'leaseExpiresAt',saas.merchant_admin_timestamp(p_lease_expires_at)
  );
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'disable' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  PERFORM 1 FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.status NOT IN('active','pending_validation','rotation_required') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status='disabled',version=version+1,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE store_id=p_store_id AND id=p_profile_id;
  PERFORM saas.paytr_iframe_test_payment_method_disable(p_store_id,p_profile_id,p_now);
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations VALUES(p_operation_id,p_store_id,'disable',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'disabled',result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_revoke(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'revoke' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  PERFORM 1 FROM saas.payment_methods
  WHERE store_id=p_store_id AND profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.status='revoked' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status='revoked',version=version+1,revoked_at=p_now,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE store_id=p_store_id AND id=p_profile_id;
  PERFORM saas.paytr_iframe_test_payment_method_disable(p_store_id,p_profile_id,p_now);
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations VALUES(p_operation_id,p_store_id,'revoke',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'revoked',result;
END
$f$;

DROP FUNCTION saas.merchant_provider_profile_mark_validation(
  uuid,text,timestamptz,uuid,bigint,bigint,text,text
);
CREATE FUNCTION saas.merchant_provider_profile_mark_validation(
  p_profile_id uuid,p_provider_code text,p_capability text,p_environment text,
  p_adapter_version integer,p_evidence_digest text,p_worker_id text,p_now timestamptz,
  p_lease_id uuid,p_credential_version bigint,p_profile_version bigint,
  p_validation_outcome text,p_outcome_code text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE; operation saas.merchant_provider_profile_operations%ROWTYPE; result jsonb; fingerprint_source text; fingerprint text;
BEGIN
  IF p_profile_id IS NULL OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability<>'payment_processing' OR p_environment NOT IN('test','live')
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_evidence_digest IS NULL OR p_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_now IS NULL OR p_lease_id IS NULL OR p_credential_version IS NULL OR p_credential_version<1
    OR p_profile_version IS NULL OR p_profile_version<1 OR p_validation_outcome IS NULL
    OR p_validation_outcome NOT IN('validated','rejected') OR p_outcome_code IS NULL
    OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT saas.merchant_provider_execution_authority_matches(
    p_provider_code,p_capability,p_environment,p_adapter_version,p_evidence_digest
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.payment_methods WHERE profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.provider_code<>p_provider_code OR profile.capability<>p_capability
    OR profile.execution_environment<>p_environment
    OR profile.execution_adapter_version<>p_adapter_version
    OR profile.execution_evidence_digest<>p_evidence_digest
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  fingerprint_source:=p_profile_id::text||':'||p_provider_code||':'||p_capability||':'||p_environment||':'||
    p_adapter_version::text||':'||p_evidence_digest||':'||p_worker_id||':'||p_credential_version::text||':'||
    p_profile_version::text||':'||p_validation_outcome||':'||p_outcome_code;
  fingerprint:=pg_catalog.md5(fingerprint_source)||pg_catalog.md5('v1:'||fingerprint_source);
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_lease_id;
  IF FOUND THEN IF operation.operation_kind<>'validate' OR operation.payload_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  IF profile.status<>'pending_validation' OR profile.validation_lease_id IS NULL OR profile.validation_lease_owner IS NULL OR profile.validation_lease_expires_at IS NULL OR profile.validation_lease_id<>p_lease_id OR profile.validation_lease_owner<>p_worker_id OR profile.validation_lease_expires_at<=p_now OR profile.credential_version<>p_credential_version OR profile.version<>p_profile_version THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status=CASE WHEN p_validation_outcome='validated' THEN 'active' ELSE 'rotation_required' END,version=version+1,last_validated_at=CASE WHEN p_validation_outcome='validated' THEN p_now ELSE last_validated_at END,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE id=p_profile_id;
  IF p_validation_outcome='validated' AND profile.provider_code='paytr_iframe'
    AND profile.capability='payment_processing' AND profile.public_config->>'environment'='test'
  THEN
    PERFORM saas.paytr_iframe_test_payment_method_activate(profile.store_id,profile.id,p_now);
  ELSE
    PERFORM saas.paytr_iframe_test_payment_method_disable(profile.store_id,profile.id,p_now);
  END IF;
  result:=saas.merchant_provider_profile_projection(profile.store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_lease_id,profile.store_id,'validate',fingerprint,result,p_now);
  RETURN QUERY SELECT p_validation_outcome,result;
END
$f$;

ALTER FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) RENAME TO payment_method_set_state_without_execution_authority;
REVOKE ALL ON FUNCTION saas.payment_method_set_state_without_execution_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.payment_method_set_state(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
  p_state text,p_emergency_reason text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; method saas.payment_methods%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
  snapshot_method saas.payment_methods%ROWTYPE;
  snapshot_profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_method_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_state IS NULL OR p_state NOT IN('active','disabled','emergency_disabled')
    OR (p_state='emergency_disabled' AND (
      p_emergency_reason IS NULL OR p_emergency_reason<>pg_catalog.btrim(p_emergency_reason)
      OR pg_catalog.char_length(p_emergency_reason) NOT BETWEEN 3 AND 240
      OR p_emergency_reason~'[[:cntrl:]]'
    ))
    OR (p_state<>'emergency_disabled' AND p_emergency_reason IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_state='active' THEN
    SELECT * INTO snapshot_method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_method_id;
    IF FOUND AND snapshot_method.kind='provider' THEN
      SELECT * INTO snapshot_profile FROM saas.merchant_provider_profiles
      WHERE store_id=p_store_id AND id=snapshot_method.profile_id;
      IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
      IF snapshot_profile.provider_code<>snapshot_method.provider_code OR snapshot_profile.capability<>'payment_processing'
      THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN; END IF;
      IF NOT saas.merchant_provider_execution_authority_matches(
        snapshot_profile.provider_code,snapshot_profile.capability,snapshot_profile.execution_environment,
        snapshot_profile.execution_adapter_version,snapshot_profile.execution_evidence_digest
      ) THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
      SELECT * INTO method FROM saas.payment_methods
      WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
      IF NOT FOUND OR method.kind<>'provider' OR method.profile_id<>snapshot_method.profile_id
        OR method.provider_code<>snapshot_method.provider_code
      THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
      IF method.state='emergency_disabled' THEN
        RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
      END IF;
      SELECT * INTO profile FROM saas.merchant_provider_profiles
      WHERE store_id=p_store_id AND id=method.profile_id FOR SHARE;
      IF NOT FOUND OR profile.provider_code<>snapshot_profile.provider_code
        OR profile.capability<>snapshot_profile.capability
        OR profile.execution_environment<>snapshot_profile.execution_environment
        OR profile.execution_adapter_version<>snapshot_profile.execution_adapter_version
        OR profile.execution_evidence_digest<>snapshot_profile.execution_evidence_digest
      THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
    END IF;
  ELSE
    SELECT * INTO method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_method_id FOR UPDATE;
    IF FOUND AND method.state='emergency_disabled' AND p_state<>'emergency_disabled' THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.payment_method_set_state_without_execution_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_operation_id,p_fingerprint,p_method_id,p_expected_version,p_state,p_emergency_reason
  );
END
$f$;

ALTER FUNCTION saas.payment_attempt_begin(
  uuid,timestamptz,uuid,text,uuid,text,bigint,text,text
) RENAME TO payment_attempt_begin_without_execution_authority;
REVOKE ALL ON FUNCTION saas.payment_attempt_begin_without_execution_authority(
  uuid,timestamptz,uuid,text,uuid,text,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.payment_attempt_begin(
  p_store_id uuid,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
  p_payment_method_id uuid,p_order_reference text,p_amount_minor bigint,
  p_currency text,p_callback_binding_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE operation saas.payment_attempt_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  snapshot_method saas.payment_methods%ROWTYPE;
  snapshot_profile saas.merchant_provider_profiles%ROWTYPE;
  is_replay boolean;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_operation_id IS NULL OR p_payment_method_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  is_replay:=FOUND;
  IF is_replay THEN
    SELECT profile_row.* INTO snapshot_profile
    FROM saas.payment_attempts AS attempt
    JOIN saas.merchant_provider_profiles AS profile_row
      ON profile_row.store_id=attempt.store_id AND profile_row.id=attempt.profile_id
    WHERE attempt.id=operation.attempt_id;
  ELSE
    SELECT * INTO snapshot_method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_payment_method_id;
    IF FOUND AND snapshot_method.kind='provider' THEN
      SELECT * INTO snapshot_profile FROM saas.merchant_provider_profiles
      WHERE store_id=p_store_id AND id=snapshot_method.profile_id
        AND provider_code=snapshot_method.provider_code;
    END IF;
  END IF;
  IF snapshot_profile.id IS NOT NULL AND snapshot_profile.capability='payment_processing'
    AND NOT saas.merchant_provider_execution_authority_matches(
    snapshot_profile.provider_code,snapshot_profile.capability,snapshot_profile.execution_environment,
    snapshot_profile.execution_adapter_version,snapshot_profile.execution_evidence_digest
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF NOT is_replay AND snapshot_method.id IS NOT NULL AND snapshot_method.kind='provider' THEN
    SELECT * INTO method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_payment_method_id FOR SHARE;
    IF NOT FOUND OR method.kind<>'provider' OR method.profile_id<>snapshot_method.profile_id
      OR method.provider_code<>snapshot_method.provider_code
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
    SELECT * INTO profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=method.profile_id
      AND provider_code=method.provider_code FOR SHARE;
    IF NOT FOUND OR profile.execution_environment<>snapshot_profile.execution_environment
      OR profile.execution_adapter_version<>snapshot_profile.execution_adapter_version
      OR profile.execution_evidence_digest<>snapshot_profile.execution_evidence_digest
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.payment_attempt_begin_without_execution_authority(
    p_store_id,p_now,p_operation_id,p_fingerprint,p_payment_method_id,p_order_reference,
    p_amount_minor,p_currency,p_callback_binding_digest
  );
END
$f$;

CREATE FUNCTION saas.paytr_iframe_activation_preflight()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE signature text; expected_hash text; allowed_role text; function_oid oid;
  allowed_oid oid; owner_oid oid:='celebix_saas_owner'::regrole;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code='paytr_iframe' AND capability='payment_processing' AND enabled) THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_SEED_INVALID';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND relation.relowner=owner_oid AND relation.relrowsecurity AND relation.relforcerowsecurity
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
    ) AS privilege
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND privilege.grantee<>owner_oid
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_RELATION_INVALID'; END IF;
  FOR signature,expected_hash,allowed_role IN SELECT * FROM (VALUES
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)','c89a8ab0d23d470a1603e6ceebf11b68',NULL::text),
    ('saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamp with time zone)','63fff1fd8ae86ce49a93907c4691f0c4',NULL::text),
    ('saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamp with time zone)','ba897c60b87da7da38ba3bdba5fd70c4',NULL::text),
    ('saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamp with time zone)','ec0c71ee813e7e09c9cf099896f06ada',NULL::text),
    ('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)','842a1aca1b8a6e7fd21c3931fea8403f','celebix_saas_app'),
    ('saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','055fe95458610ea1b303a17378c4cdbb','celebix_saas_app'),
    ('saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','2ece1621c3c3e4f328be7ba8aff0b417','celebix_saas_app'),
    ('saas.merchant_provider_profile_claim_validation(text,text,text,text,integer,text,timestamp with time zone,timestamp with time zone,uuid)','91f745428286afb832d3d4dbdb958ceb','celebix_saas_workflow'),
    ('saas.merchant_provider_profile_mark_validation(uuid,text,text,text,integer,text,text,timestamp with time zone,uuid,bigint,bigint,text,text)','df7af69139c4d91d03827bfa540a52fb','celebix_saas_workflow'),
    ('saas.paytr_iframe_test_payment_method_activate(uuid,uuid,timestamp with time zone)','30e26c27e400a13a7bf342af5e524d82',NULL::text),
    ('saas.paytr_iframe_test_payment_method_stage(uuid,uuid,timestamp with time zone)','3fd4bd200149045eeb5c8bb8a0e85b10',NULL::text),
    ('saas.paytr_iframe_test_payment_method_disable(uuid,uuid,timestamp with time zone)','53b634d4f85a99fa63defe229e5865f8',NULL::text),
    ('saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','3cf9d59ea9baeed367aa63c9545650e6','celebix_saas_app'),
    ('saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','4e9eb9b14d0bb0bd12e40d520d38ce74',NULL::text),
    ('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','27bc9a3e5ad2996e4aff04140a9ddf3f','celebix_saas_workflow'),
    ('saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','e5439203d385e21cecf9a49826229d3c',NULL::text)
  ) AS expected(signature,expected_hash,allowed_role) LOOP
    function_oid:=signature::regprocedure;
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_INVALID: %',signature; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR (
          privilege.grantee<>owner_oid
          AND (allowed_oid IS NULL OR privilege.grantee<>allowed_oid)
        )
      )
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
      OR (allowed_oid IS NULL AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=function_oid AND privilege.grantee<>owner_oid
      ))
      OR (allowed_oid IS NOT NULL AND NOT pg_catalog.has_function_privilege(allowed_oid,function_oid,'EXECUTE'))
    THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_ACL_INVALID: %',signature; END IF;
  END LOOP;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.paytr_iframe_activation_preflight(),
  saas.paytr_iframe_test_payment_method_disable(uuid,uuid,timestamptz),
  saas.paytr_iframe_test_payment_method_stage(uuid,uuid,timestamptz),
  saas.paytr_iframe_test_payment_method_activate(uuid,uuid,timestamptz),
  saas.merchant_provider_execution_authority_matches(text,text,text,integer,text),
  saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamptz),
  saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamptz),
  saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamptz),
  saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint),
  saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_provider_profile_claim_validation(text,text,text,text,integer,text,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_validation(uuid,text,text,text,integer,text,text,timestamptz,uuid,bigint,bigint,text,text),
  saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),
  saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),
  saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text),
  saas.payment_attempt_begin_without_execution_authority(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint),
  saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION
  saas.merchant_provider_profile_claim_validation(text,text,text,text,integer,text,timestamptz,timestamptz,uuid),
  saas.merchant_provider_profile_mark_validation(uuid,text,text,text,integer,text,text,timestamptz,uuid,bigint,bigint,text,text),
  saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text)
TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.paytr_iframe_activation_preflight()
TO celebix_saas_app,celebix_saas_workflow;
COMMIT;
