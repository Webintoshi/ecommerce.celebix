BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE
 candidate text;
 base_delivery jsonb := '{"contact":{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.test","phone":"+905551112233"},"shippingAddress":{"line1":"Cadde 1","city":"İstanbul","country":"TR"}}'::jsonb;
BEGIN
 FOREACH candidate IN ARRAY ARRAY['+905551112233','+14155552671','+447911123456','+4915112345678','+12345678','+123456789012345'] LOOP
  IF saas.storefront_delivery_valid(pg_catalog.jsonb_set(base_delivery,ARRAY['contact','phone'],pg_catalog.to_jsonb(candidate))) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PHONE_ACCEPTANCE_INVALID';
  END IF;
 END LOOP;
 FOREACH candidate IN ARRAY ARRAY['14155552671','+04155552671','+1 4155552671','+1-4155552671','+1234567','+1234567890123456'] LOOP
  IF saas.storefront_delivery_valid(pg_catalog.jsonb_set(base_delivery,ARRAY['contact','phone'],pg_catalog.to_jsonb(candidate))) IS TRUE THEN
   RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PHONE_REJECTION_INVALID';
  END IF;
 END LOOP;
 IF saas.storefront_delivery_valid(pg_catalog.jsonb_set(base_delivery,ARRAY['contact','email'],'"invalid"'::jsonb)) IS TRUE
 OR saas.storefront_delivery_valid(pg_catalog.jsonb_set(base_delivery,ARRAY['contact','firstName'],'""'::jsonb)) IS TRUE
 OR saas.storefront_delivery_valid(pg_catalog.jsonb_set(base_delivery,ARRAY['shippingAddress','line1'],'""'::jsonb)) IS TRUE
 OR saas.storefront_delivery_valid(base_delivery||'{"privateField":true}'::jsonb) IS TRUE THEN
  RAISE EXCEPTION 'STOREFRONT_CHECKOUT_OTHER_DELIVERY_VALIDATION_CHANGED';
 END IF;
END
$assertions$;
COMMIT;
