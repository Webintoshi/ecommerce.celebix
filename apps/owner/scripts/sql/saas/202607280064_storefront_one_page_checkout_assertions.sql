BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  signature text;
  expected_hash text;
  procedure_oid oid;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid='saas.storefront_checkout_preflight()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='c1dd4b6519a93a4f0fa4fa15eb67b892'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_FUNCTION_BODY_INVALID: preflight';
  END IF;
  IF saas.storefront_checkout_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_PREFLIGHT_INVALID';
  END IF;
  IF saas.merchant_admin_config_valid(
      'shipping_setting','{"regions":["TR"],"flatRateCents":2500,"freeShippingThresholdCents":50000,"estimatedDays":3}'::jsonb
    ) IS DISTINCT FROM true
    OR saas.merchant_admin_config_valid(
      'shipping_setting','{"regions":["TR"],"freeShippingThresholdCents":50000,"estimatedDays":3}'::jsonb
    ) IS DISTINCT FROM true
    OR saas.merchant_admin_config_valid('shipping_setting','{"flatRateCents":-1}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"flatRateCents":1.5}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"flatRateCents":"2500"}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"freeShippingThresholdCents":500000000000001}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"estimatedDays":0}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"estimatedDays":91}'::jsonb)
    OR saas.merchant_admin_config_valid('shipping_setting','{"unexpected":true}'::jsonb)
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_SHIPPING_VALIDATOR_INVALID'; END IF;

  IF saas.storefront_checkout_address_valid(
      '{"firstName":"Ada","lastName":"Yilmaz","line1":"Cadde 1","district":"Kadikoy","city":"Istanbul","countryCode":"TR","phone":"+905551112233"}'::jsonb
    ) IS DISTINCT FROM true
    OR saas.storefront_checkout_address_valid(
      '{"firstName":"Ada","lastName":"Yilmaz","line1":"Cadde 1","district":"Kadikoy","city":"Istanbul","countryCode":"TR","phone":"+905551112233","unexpected":"x"}'::jsonb
    ) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_ADDRESS_VALIDATOR_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=
      'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)'::regprocedure
      AND procedure.proowner=owner_oid AND procedure.prolang=(
        SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql'
      ) AND procedure.provolatile='i' AND procedure.proisstrict
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) OR pg_catalog.has_function_privilege(
    app_oid,
    'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    workflow_oid,
    'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_VALIDATOR_DONOR_INVALID'; END IF;

  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.storefront_checkout_operations'::regclass
      AND contype IN('p','u','f','c') AND convalidated
  )<>7 OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class relation
    WHERE relation.oid='saas.storefront_checkout_operations'::regclass
      AND relation.relkind='r' AND relation.relpersistence='p'
      AND relation.relowner=owner_oid AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.storefront_checkout_operations'::regclass
      AND trigger_info.tgname='storefront_checkout_operations_immutable'
      AND trigger_info.tgfoid=
        'saas.guard_storefront_checkout_operation_mutation()'::regprocedure
      AND trigger_info.tgtype=27 AND trigger_info.tgenabled='O'
      AND NOT trigger_info.tgisinternal AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_OPERATION_TABLE_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.storefront_checkout_discount_redemptions',4,4),
      ('saas.storefront_checkout_payment_bridges',10,8)
    ) expected(relation_name,column_count,constraint_count)
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=expected.relation_name::pg_catalog.regclass
    WHERE relation.oid IS NULL OR relation.relkind<>'r' OR relation.relpersistence<>'p'
      OR relation.relowner<>owner_oid OR NOT relation.relrowsecurity
      OR NOT relation.relforcerowsecurity
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute attribute
          WHERE attribute.attrelid=relation.oid AND attribute.attnum>0
            AND NOT attribute.attisdropped)<>expected.column_count
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint constraint_info
          WHERE constraint_info.conrelid=relation.oid
            AND constraint_info.contype IN('p','u','f','c')
            AND constraint_info.convalidated)<>expected.constraint_count
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid IN(
      'saas.storefront_checkout_discount_redemptions'::regclass,
      'saas.storefront_checkout_payment_bridges'::regclass
    )
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_SETTLEMENT_TABLE_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.storefront_checkout_discount_redemptions'::regclass
      AND trigger_info.tgname='storefront_checkout_discount_redemptions_immutable'
      AND trigger_info.tgfoid=
        'saas.guard_storefront_checkout_operation_mutation()'::regprocedure
      AND trigger_info.tgtype=27 AND trigger_info.tgenabled='O'
      AND NOT trigger_info.tgisinternal AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.storefront_checkout_payment_bridges'::regclass
      AND trigger_info.tgname='storefront_checkout_payment_bridges_immutable'
      AND trigger_info.tgfoid=
        'saas.guard_storefront_checkout_payment_bridge_mutation()'::regprocedure
      AND trigger_info.tgtype=27 AND trigger_info.tgenabled='O'
      AND NOT trigger_info.tgisinternal AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.payment_attempts'::regclass
      AND trigger_info.tgname='payment_attempt_storefront_checkout_terminal'
      AND trigger_info.tgfoid=
        'saas.storefront_checkout_payment_attempt_terminal()'::regprocedure
      AND trigger_info.tgtype=17 AND trigger_info.tgenabled='O'
      AND NOT trigger_info.tgisinternal AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
      AND trigger_info.tgattr::text=(
        SELECT attribute.attnum::text FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.payment_attempts'::regclass
          AND attribute.attname='status' AND attribute.attnum>0
          AND NOT attribute.attisdropped
      )
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_SETTLEMENT_TRIGGER_INVALID'; END IF;

  FOR signature,expected_hash IN SELECT * FROM (VALUES
    ('saas.storefront_checkout_uuid(text,uuid,integer)','3ac502c4599ddcc05bfccfa119a90fc7'),
    ('saas.guard_storefront_checkout_payment_bridge_mutation()','393409bd2288bb92ed6fd2c0a1033565'),
    ('saas.storefront_checkout_payment_attempt_terminal()','0f001a684da66c40395d7d4bf20b0f35')
  ) expected(signature,expected_hash) LOOP
    procedure_oid:=signature::regprocedure;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=procedure_oid AND procedure.proowner=owner_oid
        AND NOT procedure.proleakproof AND procedure.proparallel='u'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) OR pg_catalog.has_function_privilege(app_oid,procedure_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege(workflow_oid,procedure_oid,'EXECUTE')
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_HELPER_INVALID: %',signature; END IF;
  END LOOP;

  FOR signature,expected_hash IN SELECT * FROM (VALUES
    ('saas.storefront_checkout_get_quote(text,text,timestamp with time zone)','55a13b99a537cae6df50f09ca2994ebe'),
    ('saas.storefront_checkout_issue_nonce(text,text,text,timestamp with time zone)','75e8e2d7f00503fc5a35329acb90d7e1'),
    ('saas.storefront_checkout_update_delivery(text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamp with time zone)','fe56e71b3fdb8c694e3a0ea1650d33b3'),
    ('saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)','dd39a69adb7399f6e2a278c7a447683e'),
    ('saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)','757ceee2101dc776a3d64bdf723d26c9'),
    ('saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamp with time zone)','ea527e8fd871eeebd57ba7bd16f88121'),
    ('saas.storefront_checkout_get_status(text,text,timestamp with time zone)','3c1f0c4ac10435bd53275d6891df7362'),
    ('saas.storefront_checkout_get_policy(text,text,timestamp with time zone)','443b25ad8174205f9fbe4ed29030f2f1'),
    ('saas.storefront_checkout_preflight()','c1dd4b6519a93a4f0fa4fa15eb67b892')
  ) expected(signature,expected_hash) LOOP
    procedure_oid:=signature::regprocedure;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=procedure_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef AND NOT procedure.proleakproof
        AND procedure.proparallel='u'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) OR pg_catalog.has_function_privilege(app_oid,procedure_oid,'EXECUTE')
      OR NOT pg_catalog.has_function_privilege(workflow_oid,procedure_oid,'EXECUTE')
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_FUNCTION_INVALID: %',signature; END IF;
  END LOOP;

  IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid IN(
        'saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamp with time zone)'::regprocedure,
        'saas.storefront_checkout_get_status(text,text,timestamp with time zone)'::regprocedure,
        'saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure
      ) AND (
        procedure.prosrc~'sealed_credentials'
        OR procedure.prosrc~'profile[.]credential_digest'
        OR procedure.prosrc~'sealed_provider_token'
      )
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_SAFE_PROJECTION_INVALID'; END IF;
END
$f$;

ROLLBACK;
