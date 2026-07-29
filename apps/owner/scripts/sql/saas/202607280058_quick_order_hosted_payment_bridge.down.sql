BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
LOCK TABLE saas.quick_order_links,saas.checkout_payment_attempts,
  saas.checkout_inventory_reservations,saas.payment_attempts,
  saas.quick_order_hosted_payment_bridges IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.quick_order_hosted_payment_bridges)
    OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations
      WHERE payment_attempt_id IS NOT NULL)
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_PAYMENT_BRIDGE_ROLLBACK_REQUIRES_DRAIN'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.quick_order_hosted_payment_authority(text,text,timestamptz),
  saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamptz),
  saas.quick_order_hosted_payment_expire_created(timestamptz,integer),
  saas.quick_order_hosted_payment_reconciliation_candidates(timestamptz,integer),
  saas.quick_order_hosted_payment_bridge_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

DROP FUNCTION saas.quick_order_hosted_payment_bridge_preflight();
DROP FUNCTION saas.quick_order_hosted_payment_reconciliation_candidates(timestamptz,integer);
DROP FUNCTION saas.quick_order_hosted_payment_expire_created(timestamptz,integer);

DROP TRIGGER payment_attempt_quick_order_terminal ON saas.payment_attempts;
DROP FUNCTION saas.quick_order_hosted_payment_terminal_transition();

DROP TRIGGER checkout_payment_attempts_no_generic_parallel ON saas.checkout_payment_attempts;
DROP FUNCTION saas.guard_checkout_generic_parallel_attempt();

DROP TRIGGER quick_order_hosted_payment_bridges_immutable
  ON saas.quick_order_hosted_payment_bridges;
DROP FUNCTION saas.guard_quick_order_hosted_payment_bridge();

CREATE OR REPLACE FUNCTION saas.guard_checkout_quick_link_live_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF (NEW.status IN('cancelled','expired') AND OLD.status IS DISTINCT FROM NEW.status)
    OR NEW.expires_at<OLD.expires_at THEN
    IF EXISTS(
      SELECT 1 FROM saas.checkout_payment_attempts attempt
      WHERE attempt.store_id=OLD.store_id AND attempt.quick_order_link_id=OLD.id
        AND attempt.status IN('reserved','provider_ready','initiation_unknown')
        AND EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations reservation
          WHERE reservation.store_id=attempt.store_id AND reservation.attempt_id=attempt.id
            AND reservation.status='held')
    ) THEN RAISE EXCEPTION 'QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT'; END IF;
  END IF;
  RETURN NEW;
END
$f$;

CREATE OR REPLACE FUNCTION saas.guard_checkout_reservation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_DELETE_DENIED'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.stock_tracked IS DISTINCT FROM NEW.stock_tracked OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.variant_id IS DISTINCT FROM NEW.variant_id
    OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id OR OLD.held_at IS DISTINCT FROM NEW.held_at
    OR NEW.updated_at<OLD.updated_at OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_AUTHORITY_IMMUTABLE'; END IF;
  IF OLD.status IN('consumed','released','expired')
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TERMINAL'; END IF;
  IF OLD.status='held' AND NEW.status NOT IN('held','consumed','released','expired')
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TRANSITION_DENIED'; END IF;
  RETURN NEW;
END
$f$;

DROP FUNCTION saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamptz);
DROP FUNCTION saas.quick_order_hosted_payment_authority(text,text,timestamptz);
DROP FUNCTION saas.quick_order_hosted_payment_projection(text,text,timestamptz);
DROP FUNCTION saas.quick_order_hosted_payment_uuid(text,uuid,integer);
DROP TABLE saas.quick_order_hosted_payment_bridges;

DROP INDEX saas.checkout_inventory_reservations_payment_attempt_variant_key;
ALTER TABLE saas.checkout_inventory_reservations
  DROP CONSTRAINT checkout_inventory_reservations_payment_attempt_store_fk,
  DROP CONSTRAINT checkout_inventory_reservations_one_attempt_owner_check,
  DROP COLUMN payment_attempt_id,
  ALTER COLUMN attempt_id SET NOT NULL;

COMMIT;
