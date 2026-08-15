BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $rollback$
DECLARE
  routine_signature text;
  upgraded_hash text;
  legacy_hash text;
  routine_oid oid;
  routine_definition text;
  legacy_definition text;
  preflight_oid oid;
  single_active_preflight_oid oid;
  evidence_preflight_oid oid;
  activation_preflight_oid oid;
  legacy_config constant text:='''{"environment":"test"}''::jsonb';
  upgraded_config constant text:='''{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}''::jsonb';
BEGIN
  IF pg_catalog.current_setting(
    'celebix.allow_paytr_payment_method_preference_compatibility_down',true
  )<>'on'
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_GUARD_REQUIRED'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_info
    WHERE constraint_info.conrelid='saas.payment_methods'::pg_catalog.regclass
      AND constraint_info.conname='payment_methods_provider_preference_check'
  )
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_CONSTRAINT_PRESENT'; END IF;

  preflight_oid:=pg_catalog.to_regprocedure('saas.paytr_iframe_activation_preflight()');
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=preflight_oid
      AND pg_catalog.md5(procedure.prosrc)='bb4800816726bbac405b5025403a2435'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(preflight_oid) INTO routine_definition;
  legacy_definition:=pg_catalog.replace(
    pg_catalog.replace(
      routine_definition,
      '01829110435e062c4913888205fa33a1','30e26c27e400a13a7bf342af5e524d82'
    ),
    '983bcbc4e737fa4b335fac93e7bf5188','3fd4bd200149045eeb5c8bb8a0e85b10'
  );
  IF legacy_definition=routine_definition
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  EXECUTE legacy_definition;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=pg_catalog.to_regprocedure('saas.paytr_iframe_activation_preflight()')
      AND pg_catalog.md5(procedure.prosrc)='e2fa7803e6d46741d33117e504436cf8'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;

  FOR routine_signature,upgraded_hash,legacy_hash IN SELECT * FROM (VALUES
    ('paytr_iframe_test_payment_method_stage(uuid,uuid,timestamp with time zone)',
      '983bcbc4e737fa4b335fac93e7bf5188','3fd4bd200149045eeb5c8bb8a0e85b10'),
    ('paytr_iframe_test_payment_method_activate_without_single_active_provider(uuid,uuid,timestamp with time zone)',
      '01829110435e062c4913888205fa33a1','30e26c27e400a13a7bf342af5e524d82')
  ) AS expected(signature,upgraded_body_hash,legacy_body_hash) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_signature);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND pg_catalog.md5(procedure.prosrc)=upgraded_hash
    ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
    SELECT pg_catalog.pg_get_functiondef(routine_oid) INTO routine_definition;
    legacy_definition:=pg_catalog.replace(routine_definition,upgraded_config,legacy_config);
    IF legacy_definition=routine_definition
    THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
    EXECUTE legacy_definition;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=pg_catalog.to_regprocedure('saas.'||routine_signature)
        AND pg_catalog.md5(procedure.prosrc)=legacy_hash
    ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  END LOOP;

  activation_preflight_oid:=pg_catalog.to_regprocedure(
    'saas.iyzico_iframe_tenant_activation_runtime_preflight()'
  );
  IF activation_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=activation_preflight_oid
      AND pg_catalog.md5(procedure.prosrc)='d8e63f02153e7eed8d18519f283b34d9'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(activation_preflight_oid) INTO routine_definition;
  legacy_definition:=pg_catalog.replace(
    pg_catalog.replace(
      routine_definition,
      '37d62c7b91d55757f9b53647569c450b','a37ea11ba2c517df0af952728ab2c7fb'
    ),
    '85a7339bdbcebd9c69ee5489f0481ce4','4d2e4b456b88573c83de9bd47ce05f62'
  );
  IF legacy_definition=routine_definition
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  EXECUTE legacy_definition;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_activation_runtime_preflight()')
      AND pg_catalog.md5(procedure.prosrc)='cfc6b606c5aadebff5b06420c57a250f'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;

  evidence_preflight_oid:=pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_evidence_preflight()');
  IF evidence_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=evidence_preflight_oid
      AND pg_catalog.md5(procedure.prosrc)='37d62c7b91d55757f9b53647569c450b'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(evidence_preflight_oid) INTO routine_definition;
  legacy_definition:=pg_catalog.replace(
    routine_definition,
    '85a7339bdbcebd9c69ee5489f0481ce4','4d2e4b456b88573c83de9bd47ce05f62'
  );
  IF legacy_definition=routine_definition
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  EXECUTE legacy_definition;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_evidence_preflight()')
      AND pg_catalog.md5(procedure.prosrc)='a37ea11ba2c517df0af952728ab2c7fb'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;

  single_active_preflight_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_single_active_provider_preflight()'
  );
  IF single_active_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=single_active_preflight_oid
      AND pg_catalog.md5(procedure.prosrc)='85a7339bdbcebd9c69ee5489f0481ce4'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  SELECT pg_catalog.pg_get_functiondef(single_active_preflight_oid) INTO routine_definition;
  legacy_definition:=pg_catalog.replace(
    routine_definition,
    'bb4800816726bbac405b5025403a2435','e2fa7803e6d46741d33117e504436cf8'
  );
  IF legacy_definition=routine_definition
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
  EXECUTE legacy_definition;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=pg_catalog.to_regprocedure('saas.payment_method_single_active_provider_preflight()')
      AND pg_catalog.md5(procedure.prosrc)='4d2e4b456b88573c83de9bd47ce05f62'
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_RUNTIME_CHANGED'; END IF;
END
$rollback$;

COMMIT;
