-- Phase 3B3 rollback removes only migration-030 objects and refuses persisted history.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $abandoned_cart_down_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.abandoned_carts)
     OR EXISTS (SELECT 1 FROM saas.abandoned_cart_items)
     OR EXISTS (SELECT 1 FROM saas.abandoned_cart_operations) THEN
    RAISE EXCEPTION 'ABANDONED_CART_DOWN_HISTORY_CONFLICT';
  END IF;
END
$abandoned_cart_down_guard$;

DROP TABLE saas.abandoned_cart_operations;
DROP FUNCTION saas.guard_abandoned_cart_operation_mutation();
DROP TABLE saas.abandoned_cart_items;
DROP TABLE saas.abandoned_carts;

COMMIT;
