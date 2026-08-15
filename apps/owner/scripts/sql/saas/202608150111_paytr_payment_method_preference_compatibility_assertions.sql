BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  routine_signature text;
  expected_hash text;
  routine_oid oid;
  preflight_oid oid;
  single_active_preflight_oid oid;
  evidence_preflight_oid oid;
  activation_preflight_oid oid;
BEGIN
  IF pg_catalog.to_regprocedure('saas.provider_payment_method_config_valid(text,jsonb)') IS NULL
    OR NOT saas.provider_payment_method_config_valid(
      'paytr_iframe',
      '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}'::jsonb
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_info
      WHERE constraint_info.conrelid='saas.payment_methods'::pg_catalog.regclass
        AND constraint_info.conname='payment_methods_provider_preference_check'
        AND constraint_info.convalidated
    )
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;

  FOR routine_signature,expected_hash IN SELECT * FROM (VALUES
    ('paytr_iframe_test_payment_method_stage(uuid,uuid,timestamp with time zone)',
      '983bcbc4e737fa4b335fac93e7bf5188'),
    ('paytr_iframe_test_payment_method_activate_without_single_active_provider(uuid,uuid,timestamp with time zone)',
      '01829110435e062c4913888205fa33a1')
  ) AS expected(signature,body_hash) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_signature);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid
        AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
        AND procedure.prosecdef AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
        AND pg_catalog.strpos(
          procedure.prosrc,
          '''{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}''::jsonb'
        )>0
        AND pg_catalog.strpos(procedure.prosrc,'''{"environment":"test"}''::jsonb')=0
    ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;
  END LOOP;

  preflight_oid:=pg_catalog.to_regprocedure('saas.paytr_iframe_activation_preflight()');
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=preflight_oid
      AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
      AND procedure.prosecdef AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='bb4800816726bbac405b5025403a2435'
      AND pg_catalog.strpos(procedure.prosrc,'01829110435e062c4913888205fa33a1')>0
      AND pg_catalog.strpos(procedure.prosrc,'983bcbc4e737fa4b335fac93e7bf5188')>0
  ) OR saas.paytr_iframe_activation_preflight() IS DISTINCT FROM true
    OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;

  single_active_preflight_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_single_active_provider_preflight()'
  );
  IF single_active_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=single_active_preflight_oid
      AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
      AND procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='85a7339bdbcebd9c69ee5489f0481ce4'
      AND pg_catalog.strpos(procedure.prosrc,'bb4800816726bbac405b5025403a2435')>0
      AND pg_catalog.strpos(procedure.prosrc,'e2fa7803e6d46741d33117e504436cf8')=0
  ) OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;

  evidence_preflight_oid:=pg_catalog.to_regprocedure('saas.iyzico_iframe_tenant_evidence_preflight()');
  IF evidence_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=evidence_preflight_oid
      AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
      AND procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='37d62c7b91d55757f9b53647569c450b'
      AND pg_catalog.strpos(procedure.prosrc,'85a7339bdbcebd9c69ee5489f0481ce4')>0
      AND pg_catalog.strpos(procedure.prosrc,'4d2e4b456b88573c83de9bd47ce05f62')=0
  ) OR saas.iyzico_iframe_tenant_evidence_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;

  activation_preflight_oid:=pg_catalog.to_regprocedure(
    'saas.iyzico_iframe_tenant_activation_runtime_preflight()'
  );
  IF activation_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=activation_preflight_oid
      AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
      AND procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='d8e63f02153e7eed8d18519f283b34d9'
      AND pg_catalog.strpos(procedure.prosrc,'85a7339bdbcebd9c69ee5489f0481ce4')>0
      AND pg_catalog.strpos(procedure.prosrc,'37d62c7b91d55757f9b53647569c450b')>0
      AND pg_catalog.strpos(procedure.prosrc,'4d2e4b456b88573c83de9bd47ce05f62')=0
      AND pg_catalog.strpos(procedure.prosrc,'a37ea11ba2c517df0af952728ab2c7fb')=0
  ) OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
    OR saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM saas.payment_methods AS method
    WHERE method.kind='provider' AND method.provider_code='paytr_iframe'
      AND NOT saas.provider_payment_method_config_valid(method.provider_code,method.config)
  ) THEN RAISE EXCEPTION 'PAYTR_PAYMENT_METHOD_PREFERENCE_DATA_INVALID'; END IF;
END
$assertions$;

COMMIT;
