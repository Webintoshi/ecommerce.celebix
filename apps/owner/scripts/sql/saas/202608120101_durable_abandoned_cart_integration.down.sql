-- Guarded rollback for Phase 4T durable abandoned-cart integration.

DO $guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_durable_abandoned_cart_integration_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_DOWN_GUARD_REQUIRED';
  END IF;
END
$guard$;

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);

ALTER FUNCTION saas.abandoned_carts_summary_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
  RENAME TO abandoned_carts_summary;
ALTER FUNCTION saas.abandoned_carts_list_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)
  RENAME TO abandoned_carts_list;
ALTER FUNCTION saas.abandoned_carts_get_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
  RENAME TO abandoned_carts_get;

GRANT EXECUTE ON FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;

DROP TRIGGER durable_abandoned_cart_sync ON saas.storefront_carts;
DROP TRIGGER durable_abandoned_cart_item_sync ON saas.storefront_cart_items;
DROP FUNCTION saas.durable_abandoned_cart_item_sync_trigger();
DROP FUNCTION saas.durable_abandoned_cart_sync_trigger();
DROP FUNCTION saas.reconcile_durable_abandoned_carts(uuid,timestamptz);
DROP FUNCTION saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz);

DROP INDEX saas.abandoned_carts_store_source_activity_idx;
ALTER TABLE saas.abandoned_carts
  DROP CONSTRAINT abandoned_carts_source_cart_store_fk,
  DROP CONSTRAINT abandoned_carts_source_cart_store_key,
  DROP COLUMN source_cart_id;

COMMIT;
