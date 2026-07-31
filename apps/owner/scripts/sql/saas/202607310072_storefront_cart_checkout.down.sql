-- Guarded rollback for Phase 4B public storefront commerce authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_carts') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_storefront_checkout(text,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CART_CHECKOUT_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

DROP FUNCTION saas.public_account_orders(text,timestamptz,jsonb,integer);
DROP FUNCTION saas.public_receipt_get(text,timestamptz,jsonb);
DROP FUNCTION saas.public_checkout_recover(text,timestamptz,uuid,text);
DROP FUNCTION saas.public_checkout_complete(text,timestamptz,text,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz);
DROP FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb);
DROP FUNCTION saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer);
DROP FUNCTION saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer);
DROP FUNCTION saas.public_cart_resolve(text,timestamptz,jsonb);

DROP FUNCTION saas.storefront_delivery_valid(jsonb);
DROP FUNCTION saas.storefront_intent_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.storefront_payment_methods_projection(uuid);
DROP FUNCTION saas.storefront_shipping_projection(uuid);
DROP FUNCTION saas.storefront_public_store(text,timestamptz);
DROP FUNCTION saas.storefront_credential_candidates_valid(jsonb,boolean);
DROP FUNCTION saas.storefront_commerce_timestamp(timestamptz);
DROP FUNCTION saas.storefront_commerce_uuid(text);

DROP TABLE saas.storefront_checkout_operations;
DROP TABLE saas.storefront_order_receipts;
DROP TABLE saas.storefront_customer_credentials;
DROP TABLE saas.storefront_checkout_intents;
DROP TABLE saas.storefront_cart_operations;
DROP TABLE saas.storefront_cart_items;
DROP TABLE saas.storefront_cart_credentials;
DROP TABLE saas.storefront_carts;

DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
ALTER FUNCTION saas.merchant_admin_config_valid_without_storefront_checkout(text,jsonb)
  RENAME TO merchant_admin_config_valid;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

COMMIT;
