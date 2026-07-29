-- Phase 3T: callable tenant Iyzico evidence queue, reload projection, and attested activation.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.payment_method_single_active_provider_preflight()') IS NULL
    OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
    OR pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_evidence_preflight()') IS NULL
    OR saas.iyzico_iframe_tenant_evidence_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_DONOR_REQUIRED'; END IF;
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_begin_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_run_id uuid,p_fingerprint text,p_profile_id uuid,p_expected_profile_version bigint,
  p_expected_credential_version bigint,p_candidate_evidence_digest text,p_adapter_version integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE staged_method saas.payment_methods%ROWTYPE;
  begin_outcome text;
  begin_payload jsonb;
  next_position integer;
BEGIN
  IF p_run_id IS NULL OR p_profile_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_profile_version IS NULL OR p_expected_profile_version<1
    OR p_expected_credential_version IS NULL OR p_expected_credential_version<1
    OR p_candidate_evidence_digest IS NULL
    OR p_candidate_evidence_digest!~'^sha256:[a-f0-9]{64}$'
    OR p_adapter_version IS NULL OR p_adapter_version<1
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.iyzico.tenant.evidence.profile:'||p_store_id::text||':'||p_profile_id::text,0
  ));
  SELECT * INTO staged_method FROM saas.payment_methods
  WHERE id=p_profile_id FOR UPDATE;
  IF FOUND AND (
    staged_method.store_id<>p_store_id OR staged_method.kind<>'provider'
    OR staged_method.profile_id<>p_profile_id OR staged_method.provider_code<>'iyzico_iframe'
    OR staged_method.label<>'Iyzico' OR staged_method.state<>'disabled'
    OR staged_method.emergency_reason IS NOT NULL
    OR staged_method.config<>'{"environment":"test"}'::jsonb
  ) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;

  SELECT donor.outcome,donor.result_payload INTO begin_outcome,begin_payload
  FROM saas.iyzico_iframe_tenant_evidence_begin(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_run_id,p_fingerprint,p_profile_id,p_expected_profile_version,
    p_expected_credential_version,p_candidate_evidence_digest,p_adapter_version
  ) AS donor;
  IF begin_outcome NOT IN('created','operation_replayed') THEN
    RETURN QUERY SELECT begin_outcome,begin_payload; RETURN;
  END IF;

  IF staged_method.id IS NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.payment.method.position:'||p_store_id::text,0
    ));
    SELECT COALESCE(pg_catalog.max(method.position)+1,0) INTO next_position
    FROM saas.payment_methods AS method WHERE method.store_id=p_store_id;
    IF next_position>9999 THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_METHOD_POSITION_EXHAUSTED'; END IF;
    INSERT INTO saas.payment_methods(
      id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,
      position,config,version,created_at,updated_at
    ) VALUES(
      p_profile_id,p_store_id,'provider',p_profile_id,'iyzico_iframe','Iyzico',
      'disabled',NULL,next_position,'{"environment":"test"}'::jsonb,1,p_now,p_now
    ) RETURNING * INTO staged_method;
  END IF;

  RETURN QUERY SELECT begin_outcome,begin_payload||pg_catalog.jsonb_build_object(
    'methodId',staged_method.id,
    'methodVersion',staged_method.version,
    'methodState',staged_method.state
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_profile_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
  profile saas.merchant_provider_profiles%ROWTYPE;
  staged_method saas.payment_methods%ROWTYPE;
  selected_run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  attestation saas.iyzico_iframe_tenant_evidence_attestations%ROWTYPE;
  activation_current boolean:=false;
  normal_outcome text;
BEGIN
  IF p_profile_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,false
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=p_store_id AND id=p_profile_id;
  IF NOT FOUND OR profile.provider_code<>'iyzico_iframe'
    OR profile.capability<>'payment_processing'
  THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;

  SELECT * INTO staged_method FROM saas.payment_methods
  WHERE store_id=p_store_id AND id=p_profile_id AND kind='provider'
    AND profile_id=p_profile_id AND provider_code='iyzico_iframe'
    AND config='{"environment":"test"}'::jsonb;
  SELECT * INTO selected_run FROM saas.iyzico_iframe_tenant_evidence_runs
  WHERE store_id=p_store_id AND profile_id=p_profile_id
  ORDER BY created_at DESC,id DESC LIMIT 1;
  IF selected_run.id IS NOT NULL THEN
    SELECT * INTO attestation FROM saas.iyzico_iframe_tenant_evidence_attestations
    WHERE store_id=p_store_id AND run_id=selected_run.id;
  END IF;

  activation_current:=selected_run.id IS NOT NULL AND selected_run.status='attested'
    AND attestation.id IS NOT NULL AND staged_method.id IS NOT NULL
    AND (attestation.store_id,attestation.run_id,attestation.profile_id,
      attestation.provider_code,attestation.capability,attestation.environment,
      attestation.adapter_version,attestation.candidate_evidence_digest,
      attestation.profile_version,attestation.credential_version)
      IS NOT DISTINCT FROM
      (selected_run.store_id,selected_run.id,selected_run.profile_id,
      selected_run.provider_code,selected_run.capability,selected_run.environment,
      selected_run.adapter_version,selected_run.candidate_evidence_digest,
      selected_run.profile_version,selected_run.credential_version)
    AND profile.status='active' AND profile.validation_environment='test'
    AND profile.validation_adapter_version=attestation.adapter_version
    AND profile.credential_version=attestation.credential_version
    AND saas.merchant_provider_execution_authority_matches(
      attestation.provider_code,attestation.capability,attestation.environment,
      attestation.adapter_version,attestation.candidate_evidence_digest
    )
    AND (
      (
        staged_method.state='disabled'
        AND profile.version=attestation.profile_version
        AND profile.execution_environment IS NULL
        AND profile.execution_adapter_version IS NULL
        AND profile.execution_evidence_digest IS NULL
      ) OR (
        staged_method.state='active'
        AND profile.version=attestation.profile_version+1
        AND profile.execution_environment=attestation.environment
        AND profile.execution_adapter_version=attestation.adapter_version
        AND profile.execution_evidence_digest=attestation.candidate_evidence_digest
        AND EXISTS(
          SELECT 1 FROM saas.payment_method_operations AS operation
          WHERE operation.store_id=p_store_id AND operation.operation_kind='set_state'
            AND operation.result_payload->>'id'=staged_method.id::text
            AND operation.result_payload->>'state'='active'
            AND operation.result_payload->>'activationAttestationId'=attestation.id::text
        )
      )
    );
  normal_outcome:=CASE WHEN selected_run.id IS NULL THEN 'not_started' ELSE 'current' END;
  RETURN QUERY SELECT normal_outcome,pg_catalog.jsonb_build_object(
    'profileId',profile.id,
    'runId',selected_run.id,
    'status',selected_run.status,
    'rejectionCode',selected_run.rejection_code,
    'methodId',staged_method.id,
    'methodVersion',staged_method.version,
    'methodState',staged_method.state,
    'profileVersion',profile.version,
    'credentialVersion',profile.credential_version,
    'attestationId',attestation.id,
    'activationCurrent',activation_current
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_claim_next(
  p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  claim_outcome text;
  claim_payload jsonb;
BEGIN
  IF p_lease_id IS NULL OR p_worker_id IS NULL
    OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.char_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id!~'^[A-Za-z0-9._:-]+$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_lease_expires_at IS NULL OR NOT pg_catalog.isfinite(p_lease_expires_at)
    OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT * INTO selected_run
  FROM saas.iyzico_iframe_tenant_evidence_runs AS run
  WHERE (
      run.status='leased' AND run.lease_id=p_lease_id AND run.lease_owner=p_worker_id
    ) OR (
      (run.status='pending' OR (run.status='leased' AND run.lease_expires_at<=p_now))
      AND saas.iyzico_iframe_tenant_evidence_run_current(run.id)
    )
  ORDER BY CASE WHEN run.status='leased' AND run.lease_id=p_lease_id
    AND run.lease_owner=p_worker_id THEN 0 ELSE 1 END,
    run.created_at,run.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN QUERY SELECT 'none',NULL::jsonb; RETURN; END IF;

  SELECT donor.outcome,donor.result_payload INTO claim_outcome,claim_payload
  FROM saas.iyzico_iframe_tenant_evidence_claim(
    selected_run.id,p_worker_id,p_lease_id,p_now,p_lease_expires_at
  ) AS donor;
  IF claim_outcome NOT IN('claimed','operation_replayed') THEN
    RETURN QUERY SELECT claim_outcome,claim_payload; RETURN;
  END IF;
  RETURN QUERY SELECT claim_outcome,pg_catalog.jsonb_build_object(
    'runId',selected_run.id,
    'storeId',selected_run.store_id,
    'profileId',selected_run.profile_id,
    'adapterVersion',selected_run.adapter_version,
    'candidateEvidenceDigest',selected_run.candidate_evidence_digest,
    'profileVersion',selected_run.profile_version,
    'credentialVersion',selected_run.credential_version,
    'leaseId',p_lease_id,
    'replayed',claim_outcome='operation_replayed'
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_claimed_profile(
  p_run_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_run saas.iyzico_iframe_tenant_evidence_runs%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_lease_id IS NULL OR p_worker_id IS NULL
    OR p_worker_id<>pg_catalog.btrim(p_worker_id)
    OR pg_catalog.char_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id!~'^[A-Za-z0-9._:-]+$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT * INTO selected_run FROM saas.iyzico_iframe_tenant_evidence_runs
  WHERE id=p_run_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'run_not_found',NULL::jsonb; RETURN; END IF;
  IF selected_run.status<>'leased' OR selected_run.lease_id<>p_lease_id
    OR selected_run.lease_owner<>p_worker_id OR selected_run.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;

  SELECT * INTO profile FROM saas.merchant_provider_profiles
  WHERE store_id=selected_run.store_id AND id=selected_run.profile_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
  IF profile.provider_code<>'iyzico_iframe' OR profile.capability<>'payment_processing'
    OR selected_run.provider_code<>'iyzico_iframe'
    OR selected_run.capability<>'payment_processing' OR selected_run.environment<>'test'
    OR profile.validation_environment<>'test'
    OR profile.validation_adapter_version<>selected_run.adapter_version
    OR profile.public_config->>'environment'<>'test'
  THEN RETURN QUERY SELECT 'profile_not_eligible',NULL::jsonb; RETURN; END IF;
  IF profile.status<>'active' THEN
    RETURN QUERY SELECT 'profile_not_active',NULL::jsonb; RETURN;
  END IF;
  IF profile.version<>selected_run.profile_version
    OR profile.credential_version<>selected_run.credential_version
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF profile.execution_environment IS NOT NULL
    OR profile.execution_adapter_version IS NOT NULL
    OR profile.execution_evidence_digest IS NOT NULL
    OR NOT saas.merchant_provider_execution_authority_matches(
      selected_run.provider_code,selected_run.capability,selected_run.environment,
      selected_run.adapter_version,selected_run.candidate_evidence_digest
    )
  THEN RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN; END IF;

  RETURN QUERY SELECT 'current',pg_catalog.jsonb_build_object(
    'storeId',selected_run.store_id,
    'profileId',profile.id,
    'providerCode',profile.provider_code,
    'capability',profile.capability,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials,
    'profileVersion',profile.version,
    'credentialVersion',profile.credential_version
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_evidence_activate_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_method_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
  operation saas.payment_method_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE;
  profile saas.merchant_provider_profiles%ROWTYPE;
  attestation saas.iyzico_iframe_tenant_evidence_attestations%ROWTYPE;
  selected_attestation_id uuid;
BEGIN
  IF p_operation_id IS NULL OR p_method_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_method_version IS NULL OR p_expected_method_version<1
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_provider_profile_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,true
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'payment_setting',true
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.payment.method.operation:'||p_operation_id::text,0
  ));
  SELECT * INTO operation FROM saas.payment_method_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.operation_kind<>'set_state'
      OR operation.payload_fingerprint<>p_fingerprint
      OR operation.result_payload->>'id'<>p_method_id::text
      OR operation.result_payload->>'activationAttestationId' IS NULL
      OR operation.result_payload->>'activationAttestationId'
        !~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    selected_attestation_id:=(operation.result_payload->>'activationAttestationId')::uuid;
    SELECT * INTO attestation FROM saas.iyzico_iframe_tenant_evidence_attestations
    WHERE store_id=p_store_id AND id=selected_attestation_id;
    IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  ELSE
    SELECT * INTO method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_method_id FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'method_not_found',NULL::jsonb; RETURN; END IF;
    IF method.kind<>'provider' OR method.provider_code<>'iyzico_iframe'
      OR method.profile_id IS NULL OR method.id<>method.profile_id
      OR method.config<>'{"environment":"test"}'::jsonb
    THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    IF method.state<>'disabled' THEN
      RETURN QUERY SELECT CASE WHEN method.state='active' THEN 'already_active'
        ELSE 'invalid_transition' END,NULL::jsonb; RETURN;
    END IF;
    SELECT * INTO profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=method.profile_id FOR SHARE;
    SELECT evidence_attestation.* INTO attestation
    FROM saas.iyzico_iframe_tenant_evidence_attestations AS evidence_attestation
    JOIN saas.iyzico_iframe_tenant_evidence_runs AS run
      ON run.store_id=evidence_attestation.store_id AND run.id=evidence_attestation.run_id
    WHERE evidence_attestation.store_id=p_store_id
      AND evidence_attestation.profile_id=method.profile_id AND run.status='attested'
      AND profile.status='active' AND profile.provider_code='iyzico_iframe'
      AND profile.capability='payment_processing' AND profile.validation_environment='test'
      AND profile.validation_adapter_version=evidence_attestation.adapter_version
      AND profile.version=evidence_attestation.profile_version
      AND profile.credential_version=evidence_attestation.credential_version
      AND profile.execution_environment IS NULL
      AND profile.execution_adapter_version IS NULL
      AND profile.execution_evidence_digest IS NULL
      AND (run.profile_id,run.provider_code,run.capability,run.environment,
        run.adapter_version,run.candidate_evidence_digest,run.profile_version,run.credential_version)
        IS NOT DISTINCT FROM
        (evidence_attestation.profile_id,evidence_attestation.provider_code,
        evidence_attestation.capability,evidence_attestation.environment,
        evidence_attestation.adapter_version,evidence_attestation.candidate_evidence_digest,
        evidence_attestation.profile_version,evidence_attestation.credential_version)
      AND saas.merchant_provider_execution_authority_matches(
        evidence_attestation.provider_code,evidence_attestation.capability,
        evidence_attestation.environment,evidence_attestation.adapter_version,
        evidence_attestation.candidate_evidence_digest
      )
    ORDER BY evidence_attestation.attested_at DESC,evidence_attestation.id DESC LIMIT 1;
    IF attestation.id IS NULL THEN RETURN QUERY SELECT 'stale_evidence',NULL::jsonb; RETURN; END IF;
    selected_attestation_id:=attestation.id;
  END IF;

  RETURN QUERY SELECT * FROM saas.iyzico_iframe_tenant_evidence_activate(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_operation_id,p_fingerprint,p_method_id,p_expected_method_version,
    selected_attestation_id,attestation.profile_version
  );
END
$f$;

CREATE FUNCTION saas.iyzico_iframe_tenant_activation_runtime_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  relation_name text;
  routine_name text;
  expected_hash text;
  expected_volatility "char";
  routine_oid oid;
BEGIN
  IF saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
    OR saas.iyzico_iframe_tenant_evidence_preflight() IS DISTINCT FROM true
    OR pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx') IS NULL
  THEN RETURN false; END IF;

  FOR routine_name,expected_hash,expected_volatility IN SELECT * FROM (VALUES
    ('payment_method_single_active_provider_preflight()',
      '4d2e4b456b88573c83de9bd47ce05f62','s'::"char"),
    ('iyzico_iframe_tenant_evidence_run_current(uuid)',
      '5fe4d9440ef1515177b9dc1b6a84ab6d','v'::"char"),
    ('iyzico_iframe_tenant_attestation_insert_guard()',
      '2afeaf8f1b7cd2dcec7ce0d331ffc579','v'::"char"),
    ('iyzico_iframe_tenant_profile_binding_guard()',
      'dfae8b1528dacd52223417e73e7c16b2','v'::"char"),
    ('iyzico_iframe_tenant_payment_method_active_guard()',
      'd0dc31eb01af4f223b4fbe480fa97af4','v'::"char"),
    ('iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
      'e69d443c49db87d21e600af5640a8978','v'::"char"),
    ('iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)',
      '6dc66159a4641740b1b845342e475fb0','v'::"char"),
    ('iyzico_iframe_tenant_evidence_record_event(uuid,uuid,text,uuid,text,text,uuid,text,text,timestamp with time zone)',
      'b864d8ecfeae0f0640fc0ca249645a72','v'::"char"),
    ('iyzico_iframe_tenant_evidence_finalize(uuid,uuid,text,uuid,text,timestamp with time zone)',
      '15ef290167f9cade90851583323f9295','v'::"char"),
    ('iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',
      '27b9164b08b7ea218858deda78f60f2a','v'::"char"),
    ('iyzico_iframe_tenant_evidence_preflight()',
      'a37ea11ba2c517df0af952728ab2c7fb','s'::"char")
  ) AS expected(signature,body_hash,volatility) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_name);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u'
        AND procedure.provolatile=expected_volatility
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) THEN RETURN false; END IF;
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'iyzico_iframe_tenant_evidence_runs','iyzico_iframe_tenant_evidence_cases',
    'iyzico_iframe_tenant_evidence_events','iyzico_iframe_tenant_evidence_attestations',
    'iyzico_iframe_tenant_activation_fences'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname=relation_name
        AND relation.relkind='r' AND relation.relowner=owner_oid
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) OR pg_catalog.has_table_privilege(app_oid,'saas.'||relation_name,'SELECT,INSERT,UPDATE,DELETE')
      OR pg_catalog.has_table_privilege(workflow_oid,'saas.'||relation_name,'SELECT,INSERT,UPDATE,DELETE')
    THEN RETURN false; END IF;
  END LOOP;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.merchant_provider_profiles'::regclass,'iyzico_iframe_tenant_profile_binding_guard',
        'saas.iyzico_iframe_tenant_profile_binding_guard()'::regprocedure,23::smallint),
      ('saas.payment_methods'::regclass,'iyzico_iframe_tenant_payment_method_active_guard',
        'saas.iyzico_iframe_tenant_payment_method_active_guard()'::regprocedure,23::smallint),
      ('saas.iyzico_iframe_tenant_evidence_attestations'::regclass,
        'iyzico_iframe_tenant_attestation_insert_guard',
        'saas.iyzico_iframe_tenant_attestation_insert_guard()'::regprocedure,7::smallint)
    ) AS expected(relation_oid,trigger_name,function_oid,trigger_type)
    LEFT JOIN pg_catalog.pg_trigger AS trigger
      ON trigger.tgrelid=expected.relation_oid AND trigger.tgname=expected.trigger_name
    WHERE trigger.oid IS NULL OR trigger.tgfoid<>expected.function_oid
      OR trigger.tgtype<>expected.trigger_type OR trigger.tgenabled<>'O'
      OR trigger.tgisinternal OR trigger.tgnargs<>0 OR trigger.tgqual IS NOT NULL
  ) THEN RETURN false; END IF;

  FOR routine_name,expected_hash,expected_volatility IN SELECT * FROM (VALUES
    ('iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
      'fa0657fcc802d3e61658858d533cdf99','v'::"char"),
    ('iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
      '1fb9069c782aadd6cc85c9084a58bf7f','s'::"char"),
    ('iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)',
      '30bac108a9939289c7b2273eddc7edc2','v'::"char"),
    ('iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)',
      'c2739b9c33d68e1c930f40d0263f041f','s'::"char"),
    ('iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
      '3e11a935ca294cfe281acfff0f04a448','v'::"char"),
    ('iyzico_iframe_tenant_activation_runtime_preflight()',NULL::text,'s'::"char")
  ) AS expected(signature,body_hash,volatility) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_name);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u'
        AND procedure.provolatile=expected_volatility
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND (expected_hash IS NULL OR pg_catalog.md5(procedure.prosrc)=expected_hash)
    ) THEN RETURN false; END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,
      'saas.iyzico_iframe_tenant_activation_runtime_preflight()'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,
      'saas.iyzico_iframe_tenant_activation_runtime_preflight()'::regprocedure,'EXECUTE')
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid IN(
      'saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)'::regprocedure,
      'saas.iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
      'saas.iyzico_iframe_tenant_activation_runtime_preflight()'::regprocedure
    ) AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(
        owner_oid,
        CASE WHEN procedure.proname IN(
          'iyzico_iframe_tenant_evidence_begin_current','iyzico_iframe_tenant_evidence_current',
          'iyzico_iframe_tenant_evidence_activate_current','iyzico_iframe_tenant_activation_runtime_preflight'
        ) THEN app_oid ELSE owner_oid END,
        CASE WHEN procedure.proname IN(
          'iyzico_iframe_tenant_evidence_claim_next','iyzico_iframe_tenant_evidence_claimed_profile',
          'iyzico_iframe_tenant_activation_runtime_preflight'
        ) THEN workflow_oid ELSE owner_oid END
      )
    )
  ) THEN RETURN false; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.iyzico_iframe_tenant_evidence_begin_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
  ),
  saas.iyzico_iframe_tenant_evidence_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
  ),
  saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamptz,timestamptz),
  saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamptz),
  saas.iyzico_iframe_tenant_evidence_activate_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
  ),
  saas.iyzico_iframe_tenant_activation_runtime_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.iyzico_iframe_tenant_evidence_begin_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
  ),
  saas.iyzico_iframe_tenant_evidence_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
  ),
  saas.iyzico_iframe_tenant_evidence_activate_current(
    uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
  )
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION
  saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamptz,timestamptz),
  saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamptz)
TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.iyzico_iframe_tenant_activation_runtime_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
