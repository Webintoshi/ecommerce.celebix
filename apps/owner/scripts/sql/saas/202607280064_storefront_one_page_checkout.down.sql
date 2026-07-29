-- Guarded rollback for Phase 3W storefront checkout authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_checkout_operations') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_discount_redemptions') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_payment_bridges') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_reserved_identities') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_checkout_preflight()') IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,text,uuid,text,timestamp with time zone)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)'
    ) IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

-- Block new hosted begins and terminal callbacks before taking relation locks.
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'saas.storefront.checkout.settlement-admission',0
));

-- A storefront callback can own its payment-attempt row before it waits on the
-- admission barrier. Refuse while its durable bridge is still visible, then the
-- payment-attempt table lock safely drains pre-064 quick-order callbacks before
-- any reservation/order relation is locked.
DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.storefront_checkout_payment_bridges) THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: durable checkout state exists';
  END IF;
END
$f$;

LOCK TABLE saas.payment_attempts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.checkout_payment_attempts IN ACCESS EXCLUSIVE MODE;

-- Lock order targets before the reserved-identity table, matching the order in
-- which ordinary DML enters the reservation guard. Payment callbacks and
-- storefront hosted begins have already been drained above.
LOCK TABLE saas.abandoned_carts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_checkout_operations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_checkout_discount_redemptions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_checkout_payment_bridges IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.orders IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.order_items IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.order_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_checkout_reserved_identities IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.checkout_inventory_reservations IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid='saas.storefront_checkout_preflight()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='ce60ba8b912cda1464b7194e8741557b'
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
    OR EXISTS(SELECT 1 FROM saas.storefront_checkout_discount_redemptions)
    OR EXISTS(SELECT 1 FROM saas.storefront_checkout_payment_bridges)
    OR EXISTS(SELECT 1 FROM saas.storefront_checkout_reserved_identities)
    OR EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations
      WHERE payment_attempt_id IS NOT NULL AND quick_order_link_id IS NULL
    )
    OR EXISTS(SELECT 1 FROM saas.orders WHERE storefront_cart_id IS NOT NULL)
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: durable checkout state exists'; END IF;

  IF pg_catalog.to_regclass('saas.storefront_checkout_bridges') IS NOT NULL THEN
    LOCK TABLE saas.storefront_checkout_bridges IN ACCESS EXCLUSIVE MODE;
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DOWN_GUARD: checkout bridge exists: saas.storefront_checkout_bridges';
  END IF;
END
$f$;

DROP FUNCTION saas.storefront_checkout_preflight();
DROP FUNCTION saas.storefront_checkout_submit_builtin(
  text,text,bigint,uuid,text,text,uuid,timestamptz
);
DROP FUNCTION saas.storefront_checkout_begin_hosted(
  text,text,bigint,uuid,text,text,uuid,text,uuid,text,timestamptz
);
DROP FUNCTION saas.storefront_checkout_get_policy(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_get_status(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_update_delivery(
  text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamptz
);
DROP FUNCTION saas.storefront_checkout_issue_nonce(text,text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_get_quote(text,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamptz);
DROP FUNCTION saas.storefront_checkout_uuid(text,uuid,integer);
DROP FUNCTION saas.storefront_checkout_builtin_method_projection(uuid,text,text,jsonb);
DROP FUNCTION saas.storefront_checkout_policy_effective_at(jsonb);
DROP FUNCTION saas.storefront_checkout_discount_value(jsonb,bigint,bigint);
DROP FUNCTION saas.storefront_checkout_hostname_valid(text);

DROP TRIGGER payment_attempt_storefront_checkout_terminal ON saas.payment_attempts;
DROP FUNCTION saas.storefront_checkout_payment_attempt_terminal();
DROP TRIGGER orders_storefront_checkout_reserved_identity ON saas.orders;
DROP TRIGGER order_items_storefront_checkout_reserved_identity ON saas.order_items;
DROP TRIGGER order_events_storefront_checkout_reserved_identity ON saas.order_events;
DROP FUNCTION saas.guard_storefront_checkout_reserved_identity_insert();
DROP TRIGGER storefront_checkout_reserved_identities_immutable
  ON saas.storefront_checkout_reserved_identities;
DROP TRIGGER storefront_checkout_payment_bridges_immutable
  ON saas.storefront_checkout_payment_bridges;
DROP FUNCTION saas.guard_storefront_checkout_payment_bridge_mutation();
DROP TRIGGER storefront_checkout_discount_redemptions_immutable
  ON saas.storefront_checkout_discount_redemptions;
DROP TABLE saas.storefront_checkout_reserved_identities;
DROP TABLE saas.storefront_checkout_payment_bridges;
DROP TABLE saas.storefront_checkout_discount_redemptions;

ALTER TABLE saas.checkout_inventory_reservations
  ALTER COLUMN quick_order_link_id SET NOT NULL;

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
