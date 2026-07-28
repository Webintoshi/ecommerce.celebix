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
  procedure_oid oid;
BEGIN
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
      AND relation.relowner=owner_oid AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_OPERATION_TABLE_INVALID'; END IF;

  FOR signature IN SELECT pg_catalog.unnest(ARRAY[
    'saas.storefront_checkout_get_quote(text,text,timestamp with time zone)',
    'saas.storefront_checkout_issue_nonce(text,text,text,timestamp with time zone)',
    'saas.storefront_checkout_update_delivery(text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamp with time zone)',
    'saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamp with time zone)',
    'saas.storefront_checkout_get_status(text,text,timestamp with time zone)',
    'saas.storefront_checkout_get_policy(text,text,timestamp with time zone)',
    'saas.storefront_checkout_preflight()'
  ]) LOOP
    procedure_oid:=signature::regprocedure;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=procedure_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef AND NOT procedure.proleakproof
        AND procedure.proparallel='u'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    ) OR NOT pg_catalog.has_function_privilege(app_oid,procedure_oid,'EXECUTE')
      OR (signature<>'saas.storefront_checkout_preflight()'
        AND pg_catalog.has_function_privilege(workflow_oid,procedure_oid,'EXECUTE'))
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_FUNCTION_INVALID: %',signature; END IF;
  END LOOP;

  IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid IN(
        'saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamp with time zone)'::regprocedure,
        'saas.storefront_checkout_get_status(text,text,timestamp with time zone)'::regprocedure
      ) AND (
        procedure.prosrc~'sealed_credentials'
        OR procedure.prosrc~'profile[.]credential_digest'
        OR procedure.prosrc~'sealed_provider_token'
      )
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_ASSERT_SAFE_PROJECTION_INVALID'; END IF;
END
$f$;

ROLLBACK;
