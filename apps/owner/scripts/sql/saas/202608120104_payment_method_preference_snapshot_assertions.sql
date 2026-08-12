-- Catalog authority proofs for Phase 4U payment-method preference snapshots.
DO $assertions$
DECLARE begin_definition text; authority_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid='saas.payment_attempts'::pg_catalog.regclass
      AND attribute.attname='method_config_snapshot'
      AND attribute.attnotnull AND NOT attribute.attisdropped
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.payment_attempts'::pg_catalog.regclass
      AND constraint_info.conname='payment_attempts_method_config_snapshot_check'
      AND constraint_info.contype='c' AND constraint_info.convalidated
  ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_COLUMN_INVALID'; END IF;

  IF pg_catalog.to_regprocedure('saas.provider_payment_method_config_valid(text,jsonb)') IS NULL
    OR saas.provider_payment_method_config_valid(
      'paytr_iframe','{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"limited","maxInstallment":6}'::jsonb
    ) IS NOT TRUE
    OR saas.provider_payment_method_config_valid(
      'iyzico_iframe','{"environment":"live","locale":"en","threeDSecure":"provider_managed","installmentMode":"single_payment","maxInstallment":0}'::jsonb
    ) IS NOT TRUE
    OR saas.provider_payment_method_config_valid(
      'paytr_iframe','{"environment":"test"}'::jsonb
    ) IS NOT FALSE
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_VALIDATOR_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.payment_attempts'::pg_catalog.regclass
      AND trigger_info.tgname='payment_attempt_bind_method_config'
      AND NOT trigger_info.tgisinternal
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.payment_attempts'::pg_catalog.regclass
      AND trigger_info.tgname='payment_attempt_method_config_immutable'
      AND NOT trigger_info.tgisinternal
  ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_TRIGGER_INVALID'; END IF;

  begin_definition:=pg_catalog.pg_get_functiondef(
    'saas.payment_attempt_begin_projection(uuid)'::pg_catalog.regprocedure
  );
  authority_definition:=pg_catalog.pg_get_functiondef(
    'saas.payment_attempt_authority_projection(uuid)'::pg_catalog.regprocedure
  );
  IF pg_catalog.strpos(begin_definition,'''methodConfig''')=0
    OR pg_catalog.strpos(begin_definition,'method_config_snapshot')=0
    OR pg_catalog.strpos(authority_definition,'''methodConfig''')=0
    OR pg_catalog.strpos(authority_definition,'method_config_snapshot')=0
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_PROJECTION_INVALID'; END IF;

  IF pg_catalog.has_function_privilege('celebix_saas_app','saas.provider_payment_method_config_valid(text,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_workflow','saas.payment_attempt_bind_method_config()','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.guard_payment_attempt_method_config_immutable()','EXECUTE')
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_PREFERENCE_SNAPSHOT_PRIVILEGE_INVALID'; END IF;
END
$assertions$;
