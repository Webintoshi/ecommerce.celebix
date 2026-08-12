-- Fail if an eligible pre-migration cart remains invisible to merchant cart reads.

DO $assertions$
BEGIN
  IF EXISTS(
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION 'DURABLE_ABANDONED_CART_ROLLOUT_BACKFILL_INCOMPLETE';
  END IF;
END
$assertions$;
