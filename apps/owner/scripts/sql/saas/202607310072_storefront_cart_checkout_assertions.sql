-- Catalog and privilege assertions for Phase 4B storefront commerce authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE table_name text; signature text; account_body text; cart_body text; checkout_body text; receipt_body text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'storefront_carts','storefront_cart_credentials','storefront_cart_items',
    'storefront_cart_operations','storefront_checkout_intents',
    'storefront_customer_credentials','storefront_order_receipts',
    'storefront_checkout_operations'
  ] LOOP
    IF pg_catalog.to_regclass('saas.'||table_name) IS NULL THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_TABLE_MISSING: %',table_name; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=('saas.'||table_name)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_RLS_MISSING: %',table_name; END IF;
    IF pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT')
      OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.'||table_name,'SELECT')
      OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.'||table_name,'INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_TABLE_PRIVILEGE_LEAK: %',table_name; END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'saas.public_cart_resolve(text,timestamp with time zone,jsonb)',
    'saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)',
    'saas.public_buy_now_create(text,timestamp with time zone,uuid,text,text,timestamp with time zone,uuid,uuid,integer)',
    'saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)',
    'saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)',
    'saas.public_checkout_recover(text,timestamp with time zone,uuid,text)',
    'saas.public_receipt_get(text,timestamp with time zone,jsonb,jsonb)',
    'saas.public_account_orders(text,timestamp with time zone,jsonb,integer)'
  ] LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_FUNCTION_MISSING: %',signature; END IF;
    IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
      OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) privilege
        WHERE procedure.oid=signature::regprocedure
          AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
      )
    THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_FUNCTION_ACL_INVALID: %',signature; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.storefront_cart_operations'::regclass AND tgname='storefront_cart_operations_immutable' AND tgenabled='O')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.storefront_checkout_operations'::regclass AND tgname='storefront_checkout_operations_immutable' AND tgenabled='O')
  THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_IMMUTABILITY_MISSING'; END IF;
  IF saas.merchant_admin_config_valid('shipping_setting','{"shippingPriceCents":100000001}'::jsonb)
    OR NOT saas.merchant_admin_config_valid('shipping_setting','{"shippingPriceCents":9900}'::jsonb)
  THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_SHIPPING_VALIDATOR_INVALID'; END IF;
  SELECT pg_catalog.pg_get_functiondef('saas.public_account_orders(text,timestamp with time zone,jsonb,integer)'::regprocedure),
    pg_catalog.pg_get_functiondef('saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)'::regprocedure),
    pg_catalog.pg_get_functiondef('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'::regprocedure),
    pg_catalog.pg_get_functiondef('saas.public_receipt_get(text,timestamp with time zone,jsonb,jsonb)'::regprocedure)
    INTO account_body,cart_body,checkout_body,receipt_body;
  IF pg_catalog.strpos(account_body,'receipt.customer_credential_id=selected_credential.id')=0
    OR pg_catalog.strpos(account_body,'orders.customer_id=selected_credential.customer_id')>0
    OR pg_catalog.strpos(cart_body,'LEFT JOIN LATERAL')=0
    OR pg_catalog.strpos(cart_body,'shipping.projection IS NOT NULL')=0
    OR pg_catalog.strpos(cart_body,'jsonb_array_length(payments.methods)>0')=0
    OR pg_catalog.strpos(cart_body,'public_media_projection')=0
    OR pg_catalog.strpos(checkout_body,'''delivery''')=0
    OR pg_catalog.strpos(checkout_body,'''credentialPersistence''')=0
    OR pg_catalog.strpos(checkout_body,'''receiptKeyId''')=0
    OR pg_catalog.strpos(checkout_body,'''customerKeyId''')=0
    OR pg_catalog.strpos(checkout_body,'selected_customer_credential.customer_id')=0
    OR pg_catalog.strpos(checkout_body,'customer.email=p_delivery->''contact''->>''email'' OR customer.phone=p_delivery->''contact''->>''phone''')=0
    OR pg_catalog.strpos(checkout_body,'selected_customer.phone IS DISTINCT FROM p_delivery->''contact''->>''phone''')=0
    OR pg_catalog.strpos(receipt_body,'customer_credential.id=receipt.customer_credential_id')=0
    OR pg_catalog.strpos(receipt_body,'customer_credential.expires_at>p_now')=0
  THEN RAISE EXCEPTION 'STOREFRONT_COMMERCE_AUTHORITY_BODY_INVALID'; END IF;
END
$f$;

ROLLBACK;
