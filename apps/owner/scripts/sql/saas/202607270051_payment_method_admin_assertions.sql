-- Phase 3J catalog and privilege assertions. Read-only and fail-closed.
DO $f$
DECLARE
  signature text;
  app_functions text[] := ARRAY[
    'saas.payment_method_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.payment_method_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid,text,text,jsonb)',
    'saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)',
    'saas.payment_method_reorder(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,jsonb)',
    'saas.payment_method_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ];
BEGIN
  IF pg_catalog.to_regclass('saas.payment_methods') IS NULL
    OR pg_catalog.to_regclass('saas.payment_method_operations') IS NULL
  THEN RAISE EXCEPTION 'payment method tables missing'; END IF;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname IN('payment_methods','payment_method_operations')
        AND relation.relrowsecurity AND relation.relforcerowsecurity)<>2
  THEN RAISE EXCEPTION 'payment method RLS invalid'; END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.payment_methods','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.payment_method_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.payment_methods','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.payment_method_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.payment_methods','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'payment method direct table privilege invalid'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.merchant_provider_definitions'::regclass
      AND conname='merchant_provider_definitions_capability_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%payment_processing%'
  ) THEN RAISE EXCEPTION 'payment_processing capability missing'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.payment_method_operations'::regclass
      AND tgname='payment_method_operations_immutable' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'payment method operation trigger missing'; END IF;

  FOREACH signature IN ARRAY app_functions LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL
      OR NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_workflow',signature,'EXECUTE')
      OR NOT (SELECT procedure.prosecdef FROM pg_catalog.pg_proc AS procedure
              WHERE procedure.oid=pg_catalog.to_regprocedure(signature))
    THEN RAISE EXCEPTION 'payment method function privilege invalid: %',signature; END IF;
  END LOOP;

  IF saas.merchant_provider_public_config_valid('{"checkoutLabel":"Kart ile ödeme"}'::jsonb) IS NOT TRUE
    OR saas.merchant_provider_public_config_valid('{"api_secret":"forbidden"}'::jsonb) IS NOT FALSE
  THEN RAISE EXCEPTION 'payment method public config guard invalid'; END IF;
END
$f$;
