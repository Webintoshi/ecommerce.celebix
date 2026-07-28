-- Guarded rollback for Phase 3W storefront checkout authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE bridge_name text;
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_checkout_operations') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_checkout_preflight()') IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)'
    ) IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_SOURCE_INVALID'; END IF;

  -- Match checkout's cart-first mutation order and take every write-excluding
  -- relation lock before evaluating any durable-state rollback guard.
  LOCK TABLE saas.abandoned_carts IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE saas.storefront_checkout_operations IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE saas.orders IN ACCESS EXCLUSIVE MODE;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid='saas.storefront_checkout_preflight()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='51526d94f3b6d083368e581ba91bc2fb'
  ) OR saas.storefront_checkout_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_SOURCE_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.merchant_admin_records setting
    WHERE setting.record_kind='shipping_setting'
      AND setting.config?'flatRateCents'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: flatRateCents shipping configuration exists';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.abandoned_carts cart
    WHERE cart.marketing_opt_in
      OR cart.shipping_address IS NOT NULL OR cart.billing_address IS NOT NULL
      OR cart.shipping_method_code IS NOT NULL OR cart.shipping_cents<>0
      OR cart.discount_record_id IS NOT NULL OR cart.discount_code IS NOT NULL
      OR cart.checkout_nonce_digest IS NOT NULL
      OR cart.selected_payment_method_id IS NOT NULL
  ) OR EXISTS(SELECT 1 FROM saas.storefront_checkout_operations)
    OR EXISTS(SELECT 1 FROM saas.orders WHERE storefront_cart_id IS NOT NULL)
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: durable checkout state exists'; END IF;

  FOREACH bridge_name IN ARRAY ARRAY[
    'saas.storefront_checkout_bridges',
    'saas.storefront_checkout_payment_bridges'
  ] LOOP
    IF pg_catalog.to_regclass(bridge_name) IS NOT NULL THEN
      EXECUTE pg_catalog.format(
        'LOCK TABLE %s IN ACCESS EXCLUSIVE MODE',bridge_name
      );
      RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: checkout bridge exists: %',bridge_name;
    END IF;
  END LOOP;
END
$f$;

DROP FUNCTION saas.storefront_checkout_preflight();
DROP FUNCTION saas.storefront_checkout_get_policy(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_get_status(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_update_delivery(
  text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamptz
);
DROP FUNCTION saas.storefront_checkout_issue_nonce(text,text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_get_quote(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_builtin_method_projection(uuid,text,text,jsonb);
DROP FUNCTION saas.storefront_checkout_policy_effective_at(jsonb);
DROP FUNCTION saas.storefront_checkout_discount_value(jsonb,bigint,bigint);
DROP FUNCTION saas.storefront_checkout_hostname_valid(text);

DROP TRIGGER storefront_checkout_operations_immutable
  ON saas.storefront_checkout_operations;
DROP FUNCTION saas.guard_storefront_checkout_operation_mutation();
DROP TABLE saas.storefront_checkout_operations;

ALTER TABLE saas.orders
  DROP CONSTRAINT orders_storefront_cart_key,
  DROP CONSTRAINT orders_storefront_cart_store_fk,
  DROP CONSTRAINT orders_storefront_cart_source_check,
  DROP COLUMN storefront_cart_id;

ALTER TABLE saas.abandoned_carts
  DROP CONSTRAINT abandoned_carts_selected_payment_method_store_fk,
  DROP CONSTRAINT abandoned_carts_discount_record_store_fk,
  DROP CONSTRAINT abandoned_carts_checkout_nonce_digest_check,
  DROP CONSTRAINT abandoned_carts_discount_code_check,
  DROP CONSTRAINT abandoned_carts_discount_authority_check,
  DROP CONSTRAINT abandoned_carts_shipping_method_code_check,
  DROP CONSTRAINT abandoned_carts_billing_address_check,
  DROP CONSTRAINT abandoned_carts_shipping_address_check,
  DROP CONSTRAINT abandoned_carts_checkout_money_check,
  DROP CONSTRAINT abandoned_carts_total_check,
  ADD CONSTRAINT abandoned_carts_total_check CHECK (
    total_cents = subtotal_cents - discount_cents AND total_cents >= 0
  );

ALTER TABLE saas.abandoned_carts
  DROP COLUMN selected_payment_method_id,
  DROP COLUMN checkout_nonce_digest,
  DROP COLUMN discount_code,
  DROP COLUMN discount_record_id,
  DROP COLUMN shipping_cents,
  DROP COLUMN shipping_method_code,
  DROP COLUMN billing_address,
  DROP COLUMN shipping_address,
  DROP COLUMN marketing_opt_in;

DROP FUNCTION saas.storefront_checkout_address_valid(jsonb);
DROP FUNCTION saas.storefront_checkout_text_valid(text,integer,integer);

DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
ALTER FUNCTION saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)
  RENAME TO merchant_admin_config_valid;

COMMIT;
