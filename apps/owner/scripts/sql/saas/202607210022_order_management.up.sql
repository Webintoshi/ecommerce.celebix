-- Phase 3B1 additive store-scoped order schema and reusable merchant action authority.
-- This migration is authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.orders (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  order_number text NOT NULL,
  source text NOT NULL CHECK (source IN ('storefront','quick_link','marketplace','manual_import')),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents bigint NOT NULL CHECK (shipping_cents >= 0),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents = subtotal_cents + shipping_cents - discount_cents AND total_cents >= 0),
  status text NOT NULL CHECK (status IN ('pending','confirmed','preparing','shipped','delivered','cancelled','refunded')),
  payment_status text NOT NULL CHECK (payment_status IN ('pending','processing','completed','failed','refunded')),
  shipping_address jsonb NOT NULL,
  tracking jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, id),
  UNIQUE (store_id, order_number)
);

CREATE TABLE saas.order_items (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 99),
  product_name text NOT NULL,
  variant_name text,
  sku text,
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents = unit_price_cents * quantity - discount_cents AND line_total_cents >= 0),
  created_at timestamptz NOT NULL,
  UNIQUE (store_id, order_id, position),
  FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id),
  FOREIGN KEY (store_id, product_id) REFERENCES saas.products(store_id, id),
  FOREIGN KEY (store_id, variant_id) REFERENCES saas.product_variants(store_id, id)
);

CREATE TABLE saas.order_events (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  actor_membership_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'order_created','status_transition','payment_transition','shipping_updated','note_added','note_archived'
  )),
  from_value text,
  to_value text,
  message text NOT NULL CHECK (
    message = btrim(message)
    AND char_length(message) BETWEEN 1 AND 500
    AND message !~ '[[:cntrl:]]'
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    pg_catalog.jsonb_typeof(payload) = 'object'
    AND pg_catalog.pg_column_size(payload) <= 32768
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT order_events_store_id_key UNIQUE (store_id, id),
  CONSTRAINT order_events_order_store_fk FOREIGN KEY (store_id, order_id)
    REFERENCES saas.orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_events_actor_store_fk FOREIGN KEY (store_id, actor_membership_id)
    REFERENCES saas.memberships(store_id, id) ON DELETE RESTRICT
);

CREATE TABLE saas.order_notes (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  author_membership_id uuid NOT NULL,
  body text NOT NULL CHECK (
    body = btrim(body)
    AND char_length(body) BETWEEN 1 AND 2000
    AND body !~ '[[:cntrl:]]'
  ),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT order_notes_store_id_key UNIQUE (store_id, id),
  CONSTRAINT order_notes_order_store_fk FOREIGN KEY (store_id, order_id)
    REFERENCES saas.orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_notes_author_store_fk FOREIGN KEY (store_id, author_membership_id)
    REFERENCES saas.memberships(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_notes_timestamp_check CHECK (
    updated_at >= created_at
    AND (archived_at IS NULL OR (archived_at >= created_at AND updated_at >= archived_at))
  )
);

CREATE TABLE saas.order_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN (
    'transition_status','transition_payment','update_shipping','add_note','archive_note'
  )),
  payload_fingerprint char(64) NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    AND pg_catalog.pg_column_size(result_payload) <= 32768
  ),
  committed_at timestamptz NOT NULL,
  CONSTRAINT order_operations_store_id_key UNIQUE (store_id, operation_id),
  CONSTRAINT order_operations_order_store_fk FOREIGN KEY (store_id, order_id)
    REFERENCES saas.orders(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX orders_store_list_idx
  ON saas.orders (store_id, created_at DESC, id DESC);
CREATE INDEX orders_store_status_list_idx
  ON saas.orders (store_id, status, created_at DESC, id DESC);
CREATE INDEX order_items_order_list_idx
  ON saas.order_items (store_id, order_id, position);
CREATE INDEX order_events_order_list_idx
  ON saas.order_events (store_id, order_id, created_at, id);
CREATE INDEX order_notes_active_list_idx
  ON saas.order_notes (store_id, order_id, created_at, id)
  WHERE archived_at IS NULL;
CREATE INDEX order_operations_store_committed_idx
  ON saas.order_operations (store_id, committed_at DESC, operation_id);

CREATE FUNCTION saas.guard_order_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'ORDER_EVENT_IMMUTABLE';
END
$function$;

CREATE TRIGGER order_events_immutable
BEFORE UPDATE OR DELETE ON saas.order_events
FOR EACH ROW EXECUTE FUNCTION saas.guard_order_event_mutation();

CREATE FUNCTION saas.guard_order_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'ORDER_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER order_operations_immutable
BEFORE UPDATE OR DELETE ON saas.order_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_order_operation_mutation();

CREATE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_required_feature text,
  p_required_action text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  membership_role text;
BEGIN
  IF p_store_id IS NULL
     OR p_principal_id IS NULL
     OR p_membership_id IS NULL
     OR p_plan_id IS NULL
     OR p_plan_code IS NULL
     OR p_plan_version IS NULL
     OR p_now IS NULL
     OR p_required_feature IS NULL
     OR p_required_action IS NULL
     OR p_required_action NOT IN (
       'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note'
     ) THEN
    RETURN 'durable_authority_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.stores AS store
    WHERE store.id = p_store_id
      AND store.status = 'active'
  ) THEN
    RETURN 'store_inactive';
  END IF;

  SELECT membership.role
    INTO membership_role
  FROM saas.memberships AS membership
  WHERE membership.id = p_membership_id
    AND membership.store_id = p_store_id
    AND membership.principal_id = p_principal_id
    AND membership.status = 'active';

  IF membership_role IS NULL THEN
    RETURN 'membership_denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan
      ON plan.id = subscription.plan_id
     AND plan.plan_code = subscription.plan_code
     AND plan.version = subscription.plan_version
    WHERE subscription.store_id = p_store_id
      AND subscription.plan_id = p_plan_id
      AND subscription.plan_code = p_plan_code
      AND subscription.plan_version = p_plan_version
      AND subscription.status = 'active'
      AND subscription.valid_from <= p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until > p_now)
      AND plan.status = 'active'
      AND plan.valid_from <= p_now
      AND (plan.valid_until IS NULL OR plan.valid_until > p_now)
  ) THEN
    RETURN 'durable_authority_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT feature.feature_key
      FROM saas.plan_features AS feature
      WHERE feature.plan_id = p_plan_id
        AND feature.enabled
      ORDER BY feature.feature_ordinal
    ) AS enabled_feature
    WHERE enabled_feature.feature_key = p_required_feature
  ) THEN
    RETURN 'feature_not_enabled';
  END IF;

  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role = 'editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note'))
    OR (membership_role = 'analyst' AND p_required_action = 'orders.read')
  ) THEN
    RETURN 'membership_denied';
  END IF;

  RETURN NULL;
END
$function$;

ALTER TABLE saas.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_events FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.orders FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.order_items FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.order_events FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.order_notes FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.order_operations FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON FUNCTION saas.guard_order_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_order_operation_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) FROM PUBLIC;

COMMIT;
