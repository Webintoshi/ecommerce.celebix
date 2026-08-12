-- Backfill active carts that existed before migration 101 installed durable triggers.
-- Only server-owned cart, credential and item authority is consulted.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $backfill$
DECLARE
  source_cart record;
BEGIN
  FOR source_cart IN
    SELECT cart.store_id,cart.id,cart.updated_at
    FROM saas.storefront_carts cart
    WHERE cart.status='active'
      AND EXISTS(
        SELECT 1 FROM saas.storefront_cart_items item
        WHERE item.store_id=cart.store_id AND item.cart_id=cart.id
      )
      AND EXISTS(
        SELECT 1 FROM saas.storefront_cart_credentials credential
        WHERE credential.store_id=cart.store_id AND credential.cart_id=cart.id
      )
      AND NOT EXISTS(
        SELECT 1 FROM saas.abandoned_carts projection
        WHERE projection.store_id=cart.store_id AND projection.source_cart_id=cart.id
      )
    ORDER BY cart.store_id,cart.id
  LOOP
    PERFORM saas.sync_durable_abandoned_cart(
      source_cart.store_id,
      source_cart.id,
      source_cart.updated_at
    );
  END LOOP;
END
$backfill$;

COMMIT;
