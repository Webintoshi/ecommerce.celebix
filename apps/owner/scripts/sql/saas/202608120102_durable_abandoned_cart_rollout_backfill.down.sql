-- The rollout backfill creates ordinary durable projections from authoritative carts.
-- Rollback deliberately retains those records; deleting merchant history is unsafe.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF pg_catalog.current_setting(
    'celebix.allow_durable_abandoned_cart_rollout_backfill_down',
    true
  ) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'DURABLE_ABANDONED_CART_ROLLOUT_BACKFILL_DOWN_REQUIRES_EXPLICIT_GUARD';
  END IF;
END
$guard$;

COMMIT;
