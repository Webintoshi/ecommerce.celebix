BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
DO $verify$
DECLARE value jsonb;
BEGIN
 IF pg_catalog.to_regclass('saas.checkout_delivery_days_backup') IS NULL
  OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_ARTIFACT_MISSING';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc
  WHERE oid='saas.merchant_admin_config_valid(text,jsonb)'::regprocedure
   AND provolatile='v' AND proisstrict AND NOT prosecdef) THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_VALIDATION_FENCE_INVALID';
 END IF;
 IF saas.merchant_admin_config_valid('shipping_setting','{"shippingPriceCents":1489,"estimatedDays":1}') IS NOT TRUE
  OR saas.merchant_admin_config_valid('shipping_setting','{"shippingPriceCents":0,"estimatedDays":365}') IS NOT TRUE
  OR saas.merchant_admin_config_valid('shipping_setting','{"shippingPriceCents":100000000}') IS NOT TRUE THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_VALID_CONFIG_REJECTED';
 END IF;
 FOREACH value IN ARRAY ARRAY[
  '{"shippingPriceCents":1489,"estimatedDays":0}'::jsonb,
  '{"shippingPriceCents":1489,"estimatedDays":366}'::jsonb,
  '{"shippingPriceCents":1489,"estimatedDays":1.5}'::jsonb,
  '{"shippingPriceCents":1489,"estimatedDays":"2"}'::jsonb,
  '{"shippingPriceCents":1489,"estimatedDays":null}'::jsonb,
  '{"shippingPriceCents":-1}'::jsonb,
  '{"shippingPriceCents":100000001}'::jsonb,
  '{"shippingPriceCents":"1489"}'::jsonb,
  '{"unexpected":true}'::jsonb,
  '[]'::jsonb,'null'::jsonb
 ] LOOP
  IF saas.merchant_admin_config_valid('shipping_setting',value) IS NOT FALSE THEN
   RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_INVALID_CONFIG_ACCEPTED';
  END IF;
 END LOOP;
 IF pg_catalog.has_table_privilege('celebix_saas_app','saas.checkout_delivery_days_backup','SELECT')
  OR pg_catalog.has_function_privilege('celebix_saas_app','saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)','EXECUTE')
  OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.merchant_admin_config_valid_without_delivery_days(text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'CHECKOUT_DELIVERY_DAYS_AUTHORITY_INVALID';
 END IF;
END $verify$;
COMMIT;
