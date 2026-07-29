BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.merchant_provider_profiles
    WHERE provider_code='paytr_iframe' AND capability='payment_processing'
  ) OR EXISTS(
    SELECT 1 FROM saas.payment_methods
    WHERE provider_code='paytr_iframe'
  ) OR EXISTS(
    SELECT 1 FROM saas.merchant_provider_execution_authorities
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_AUTHORITY_ROLLBACK_REQUIRES_DRAIN'; END IF;
END
$f$;

DROP FUNCTION saas.paytr_iframe_activation_preflight();
DROP FUNCTION saas.payment_attempt_begin(uuid,timestamptz,uuid,text,uuid,text,bigint,text,text);
ALTER FUNCTION saas.payment_attempt_begin_without_execution_authority(
  uuid,timestamptz,uuid,text,uuid,text,bigint,text,text
) RENAME TO payment_attempt_begin;
GRANT EXECUTE ON FUNCTION saas.payment_attempt_begin(
  uuid,timestamptz,uuid,text,uuid,text,bigint,text,text
) TO celebix_saas_workflow;
DROP FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
);
ALTER FUNCTION saas.payment_method_set_state_without_execution_authority(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) RENAME TO payment_method_set_state;
GRANT EXECUTE ON FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) TO celebix_saas_app;
DROP FUNCTION saas.merchant_provider_profile_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,
  jsonb,text,jsonb,text,text,integer,text,integer,text,bigint
);
DROP FUNCTION saas.merchant_provider_profile_claim_validation(
  text,text,text,text,integer,text,timestamptz,timestamptz,uuid
);
DROP FUNCTION saas.merchant_provider_profile_mark_validation(
  uuid,text,text,text,integer,text,text,timestamptz,uuid,bigint,bigint,text,text
);

CREATE FUNCTION saas.merchant_provider_profile_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_provider_code text,
  p_capability text,p_public_config jsonb,p_masked_reference text,p_sealed_credentials jsonb,
  p_credential_digest text,p_credential_key_id text,p_credential_schema_version integer,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE;
  current_profile saas.merchant_provider_profiles%ROWTYPE; result jsonb; definition_enabled boolean;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_provider_code IS NULL OR p_provider_code!~'^[a-z][a-z0-9_]{0,63}$'
    OR p_capability IS NULL OR p_capability NOT IN('marketplace_sync','invoice_reconciliation','email_delivery','phone_delivery','whatsapp_delivery','indexing')
    OR p_public_config IS NULL OR NOT saas.merchant_provider_public_config_valid(p_public_config)
    OR p_masked_reference IS NULL OR p_masked_reference<>pg_catalog.btrim(p_masked_reference)
    OR pg_catalog.char_length(p_masked_reference) NOT BETWEEN 1 AND 160 OR p_masked_reference~'[[:cntrl:]]'
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_credential_key_id IS NULL OR p_credential_key_id!~'^[A-Za-z0-9._-]{1,128}$'
    OR p_credential_schema_version IS NULL OR p_credential_schema_version<>1
    OR p_sealed_credentials IS NULL OR NOT saas.merchant_provider_sealed_envelope_valid(p_sealed_credentials,p_credential_key_id)
    OR p_expected_version IS NULL OR p_expected_version<0
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'save' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  SELECT definition.enabled INTO definition_enabled FROM saas.merchant_provider_definitions AS definition WHERE definition.provider_code=p_provider_code AND definition.capability=p_capability FOR SHARE;
  IF NOT FOUND THEN IF EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code=p_provider_code) THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'provider_not_found',NULL::jsonb; END IF; RETURN; END IF;
  IF NOT definition_enabled THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile:'||p_store_id::text||':'||p_provider_code||':'||p_capability,0));
  SELECT * INTO current_profile FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
  IF FOUND THEN
    IF current_profile.provider_code<>p_provider_code OR current_profile.capability<>p_capability OR current_profile.status='revoked' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF current_profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
    UPDATE saas.merchant_provider_profiles SET public_config=p_public_config,masked_account_reference=p_masked_reference,sealed_credentials=p_sealed_credentials,credential_digest=p_credential_digest,credential_key_id=p_credential_key_id,credential_schema_version=p_credential_schema_version,credential_version=credential_version+1,status='pending_validation',version=version+1,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,revoked_at=NULL,updated_at=p_now WHERE store_id=p_store_id AND id=p_profile_id;
  ELSE
    IF p_expected_version<>0 THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND provider_code=p_provider_code AND capability=p_capability AND status<>'revoked') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    BEGIN INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,created_at,updated_at) VALUES(p_profile_id,p_store_id,p_provider_code,p_capability,p_public_config,p_masked_reference,p_sealed_credentials,p_credential_digest,p_credential_key_id,p_credential_schema_version,1,'pending_validation',1,p_now,p_now); EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END;
  END IF;
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id);
  INSERT INTO saas.merchant_provider_profile_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'saved',result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile.operation:'||p_operation_id::text,0)); SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'disable' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.status NOT IN('active','pending_validation','rotation_required') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF; IF profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status='disabled',version=version+1,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE store_id=p_store_id AND id=p_profile_id;
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id); INSERT INTO saas.merchant_provider_profile_operations VALUES(p_operation_id,p_store_id,'disable',p_fingerprint,result,p_now); RETURN QUERY SELECT 'disabled',result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_revoke(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.merchant_provider_profile_operations%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE; result jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_now IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.profile.operation:'||p_operation_id::text,0)); SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint OR operation.operation_kind<>'revoke' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.status='revoked' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF; IF profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status='revoked',version=version+1,revoked_at=p_now,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE store_id=p_store_id AND id=p_profile_id;
  result:=saas.merchant_provider_profile_projection(p_store_id,p_profile_id); INSERT INTO saas.merchant_provider_profile_operations VALUES(p_operation_id,p_store_id,'revoke',p_fingerprint,result,p_now); RETURN QUERY SELECT 'revoked',result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_claim_validation(
  p_worker_id text,p_now timestamptz,p_lease_expires_at timestamptz,p_lease_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$'
    OR p_now IS NULL OR p_lease_expires_at IS NULL OR p_lease_id IS NULL
    OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
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
    'sealedCredentials',profile.sealed_credentials,'credentialVersion',profile.credential_version,
    'profileVersion',profile.version,'leaseId',p_lease_id,'leaseOwner',p_worker_id,
    'leaseExpiresAt',saas.merchant_admin_timestamp(p_lease_expires_at)
  );
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_provider_profile_mark_validation(
  p_profile_id uuid,p_worker_id text,p_now timestamptz,p_lease_id uuid,p_credential_version bigint,p_profile_version bigint,p_validation_outcome text,p_outcome_code text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE profile saas.merchant_provider_profiles%ROWTYPE; operation saas.merchant_provider_profile_operations%ROWTYPE; result jsonb; fingerprint_source text; fingerprint text;
BEGIN
  IF p_profile_id IS NULL OR p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9._:-]{1,128}$' OR p_now IS NULL OR p_lease_id IS NULL OR p_credential_version IS NULL OR p_credential_version<1 OR p_profile_version IS NULL OR p_profile_version<1 OR p_validation_outcome IS NULL OR p_validation_outcome NOT IN('validated','rejected') OR p_outcome_code IS NULL OR p_outcome_code!~'^[a-z][a-z0-9_]{0,63}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  fingerprint_source:=p_profile_id::text||':'||p_worker_id||':'||p_credential_version::text||':'||p_profile_version::text||':'||p_validation_outcome||':'||p_outcome_code; fingerprint:=pg_catalog.md5(fingerprint_source)||pg_catalog.md5('v1:'||fingerprint_source);
  SELECT * INTO operation FROM saas.merchant_provider_profile_operations WHERE operation_id=p_lease_id; IF FOUND THEN IF operation.operation_kind<>'validate' OR operation.payload_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN; END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles WHERE id=p_profile_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.status<>'pending_validation' OR profile.validation_lease_id IS NULL OR profile.validation_lease_owner IS NULL OR profile.validation_lease_expires_at IS NULL OR profile.validation_lease_id<>p_lease_id OR profile.validation_lease_owner<>p_worker_id OR profile.validation_lease_expires_at<=p_now OR profile.credential_version<>p_credential_version OR profile.version<>p_profile_version THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  UPDATE saas.merchant_provider_profiles SET status=CASE WHEN p_validation_outcome='validated' THEN 'active' ELSE 'rotation_required' END,version=version+1,last_validated_at=CASE WHEN p_validation_outcome='validated' THEN p_now ELSE last_validated_at END,validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL,updated_at=p_now WHERE id=p_profile_id;
  result:=saas.merchant_provider_profile_projection(profile.store_id,p_profile_id); INSERT INTO saas.merchant_provider_profile_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_lease_id,profile.store_id,'validate',fingerprint,result,p_now); RETURN QUERY SELECT p_validation_outcome,result;
END
$f$;

REVOKE ALL ON FUNCTION saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint),saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_provider_profile_claim_validation(text,timestamptz,timestamptz,uuid),saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint),saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_provider_profile_claim_validation(text,timestamptz,timestamptz,uuid),saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text) TO celebix_saas_workflow;

DROP FUNCTION saas.paytr_iframe_test_payment_method_activate(uuid,uuid,timestamptz);
DROP FUNCTION saas.paytr_iframe_test_payment_method_stage(uuid,uuid,timestamptz);
DROP FUNCTION saas.paytr_iframe_test_payment_method_disable(uuid,uuid,timestamptz);
DROP FUNCTION saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamptz);
DROP FUNCTION saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamptz);
DROP FUNCTION saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamptz);
DROP FUNCTION saas.merchant_provider_execution_authority_matches(text,text,text,integer,text);
ALTER TABLE saas.merchant_provider_profiles
  DROP CONSTRAINT merchant_provider_profiles_execution_authority_check,
  DROP COLUMN execution_environment,
  DROP COLUMN execution_adapter_version,
  DROP COLUMN execution_evidence_digest;
DROP TABLE saas.merchant_provider_execution_authorities;
ALTER TABLE saas.merchant_provider_definitions DISABLE TRIGGER merchant_provider_definitions_immutable;
DELETE FROM saas.merchant_provider_definitions WHERE provider_code='paytr_iframe' AND capability='payment_processing';
ALTER TABLE saas.merchant_provider_definitions ENABLE TRIGGER merchant_provider_definitions_immutable;
COMMIT;
