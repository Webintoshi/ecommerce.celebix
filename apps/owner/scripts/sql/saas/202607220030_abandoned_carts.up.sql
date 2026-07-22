-- Phase 3B3 additive store-scoped abandoned-cart persistence.
-- Authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.abandoned_carts (
  id uuid CONSTRAINT abandoned_carts_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  public_cart_digest char(64) NOT NULL CONSTRAINT abandoned_carts_public_digest_check CHECK (
    public_cart_digest ~ '^[a-f0-9]{64}$'
  ),
  status text NOT NULL CONSTRAINT abandoned_carts_status_check CHECK (
    status IN ('active','abandoned','recovered','archived')
  ),
  customer_name text CONSTRAINT abandoned_carts_customer_name_check CHECK (
    customer_name IS NULL OR (
      customer_name = pg_catalog.btrim(customer_name)
      AND pg_catalog.char_length(customer_name) BETWEEN 1 AND 200
      AND customer_name !~ '[[:cntrl:]]'
    )
  ),
  customer_email text CONSTRAINT abandoned_carts_customer_email_check CHECK (
    customer_email IS NULL OR (
      customer_email = pg_catalog.btrim(customer_email)
      AND pg_catalog.char_length(customer_email) BETWEEN 3 AND 320
      AND customer_email !~ '[[:cntrl:][:space:]]'
    )
  ),
  customer_phone text CONSTRAINT abandoned_carts_customer_phone_check CHECK (
    customer_phone IS NULL OR (
      customer_phone = pg_catalog.btrim(customer_phone)
      AND pg_catalog.char_length(customer_phone) BETWEEN 3 AND 32
      AND customer_phone !~ '[[:cntrl:]]'
    )
  ),
  currency text NOT NULL CONSTRAINT abandoned_carts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint NOT NULL CONSTRAINT abandoned_carts_subtotal_check CHECK (subtotal_cents >= 0),
  discount_cents bigint NOT NULL CONSTRAINT abandoned_carts_discount_check CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CONSTRAINT abandoned_carts_total_check CHECK (
    total_cents = subtotal_cents - discount_cents AND total_cents >= 0
  ),
  checkout_started_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  abandoned_at timestamptz,
  recovered_at timestamptz,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CONSTRAINT abandoned_carts_version_check CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT abandoned_carts_store_id_id_key UNIQUE (store_id, id),
  CONSTRAINT abandoned_carts_store_digest_key UNIQUE (store_id, public_cart_digest),
  CONSTRAINT abandoned_carts_store_currency_fk FOREIGN KEY (store_id, currency)
    REFERENCES saas.stores(id, currency) ON DELETE RESTRICT,
  CONSTRAINT abandoned_carts_timestamp_check CHECK (
    checkout_started_at >= created_at
    AND last_activity_at >= checkout_started_at
    AND updated_at >= created_at
    AND (abandoned_at IS NULL OR abandoned_at >= last_activity_at)
    AND (recovered_at IS NULL OR (abandoned_at IS NOT NULL AND recovered_at >= abandoned_at))
    AND (archived_at IS NULL OR archived_at >= COALESCE(recovered_at, abandoned_at, last_activity_at))
  ),
  CONSTRAINT abandoned_carts_lifecycle_check CHECK (
    (status = 'active' AND abandoned_at IS NULL AND recovered_at IS NULL AND archived_at IS NULL)
    OR (status = 'abandoned' AND abandoned_at IS NOT NULL AND recovered_at IS NULL AND archived_at IS NULL)
    OR (status = 'recovered' AND abandoned_at IS NOT NULL AND recovered_at IS NOT NULL AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL AND (recovered_at IS NULL OR abandoned_at IS NOT NULL))
  )
);

CREATE TABLE saas.abandoned_cart_items (
  id uuid CONSTRAINT abandoned_cart_items_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  position integer NOT NULL CONSTRAINT abandoned_cart_items_position_check CHECK (position BETWEEN 0 AND 99),
  product_name text NOT NULL CONSTRAINT abandoned_cart_items_product_name_check CHECK (
    product_name = pg_catalog.btrim(product_name)
    AND pg_catalog.char_length(product_name) BETWEEN 1 AND 200
    AND product_name !~ '[[:cntrl:]]'
  ),
  variant_name text CONSTRAINT abandoned_cart_items_variant_name_check CHECK (
    variant_name IS NULL OR (
      variant_name = pg_catalog.btrim(variant_name)
      AND pg_catalog.char_length(variant_name) BETWEEN 1 AND 200
      AND variant_name !~ '[[:cntrl:]]'
    )
  ),
  sku text CONSTRAINT abandoned_cart_items_sku_check CHECK (
    sku IS NULL OR (sku = pg_catalog.btrim(sku) AND pg_catalog.char_length(sku) BETWEEN 1 AND 128 AND sku !~ '[[:cntrl:]]')
  ),
  image_url text CONSTRAINT abandoned_cart_items_image_url_check CHECK (
    image_url IS NULL OR (
      image_url = pg_catalog.btrim(image_url)
      AND pg_catalog.char_length(image_url) BETWEEN 1 AND 2048
      AND image_url ~ '^https://[^/:?#[:space:]@]+(?:/[^#[:cntrl:]]*)?$'
    )
  ),
  unit_price_cents bigint NOT NULL CONSTRAINT abandoned_cart_items_unit_price_check CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CONSTRAINT abandoned_cart_items_quantity_check CHECK (quantity BETWEEN 1 AND 9999),
  discount_cents bigint NOT NULL CONSTRAINT abandoned_cart_items_discount_check CHECK (discount_cents >= 0),
  line_total_cents bigint NOT NULL CONSTRAINT abandoned_cart_items_line_total_check CHECK (
    line_total_cents = unit_price_cents * quantity - discount_cents AND line_total_cents >= 0
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT abandoned_cart_items_store_id_id_key UNIQUE (store_id, id),
  CONSTRAINT abandoned_cart_items_store_cart_position_key UNIQUE (store_id, cart_id, position),
  CONSTRAINT abandoned_cart_items_cart_store_fk FOREIGN KEY (store_id, cart_id)
    REFERENCES saas.abandoned_carts(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_items_product_store_fk FOREIGN KEY (store_id, product_id)
    REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_items_variant_store_fk FOREIGN KEY (store_id, variant_id)
    REFERENCES saas.product_variants(store_id, id) ON DELETE RESTRICT
);

CREATE TABLE saas.abandoned_cart_operations (
  operation_id uuid CONSTRAINT abandoned_cart_operations_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  operation_kind text NOT NULL CONSTRAINT abandoned_cart_operations_kind_check CHECK (
    operation_kind IN ('mark_recovered','archive')
  ),
  payload_fingerprint char(64) NOT NULL CONSTRAINT abandoned_cart_operations_fingerprint_check CHECK (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  result_payload jsonb NOT NULL CONSTRAINT abandoned_cart_operations_result_check CHECK (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    AND pg_catalog.pg_column_size(result_payload) <= 32768
  ),
  committed_at timestamptz NOT NULL,
  CONSTRAINT abandoned_cart_operations_store_id_key UNIQUE (store_id, operation_id),
  CONSTRAINT abandoned_cart_operations_cart_store_fk FOREIGN KEY (store_id, cart_id)
    REFERENCES saas.abandoned_carts(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX abandoned_carts_store_activity_idx
  ON saas.abandoned_carts (store_id, last_activity_at DESC, id DESC);
CREATE INDEX abandoned_carts_store_status_activity_idx
  ON saas.abandoned_carts (store_id, status, last_activity_at DESC, id DESC);
CREATE INDEX abandoned_carts_store_status_total_idx
  ON saas.abandoned_carts (store_id, status, total_cents DESC, last_activity_at DESC, id DESC);
CREATE INDEX abandoned_cart_items_cart_idx
  ON saas.abandoned_cart_items (store_id, cart_id, position, id);
CREATE INDEX abandoned_cart_operations_store_committed_idx
  ON saas.abandoned_cart_operations (store_id, committed_at DESC, operation_id);

CREATE FUNCTION saas.guard_abandoned_cart_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'ABANDONED_CART_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER abandoned_cart_operations_immutable
BEFORE UPDATE OR DELETE ON saas.abandoned_cart_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_abandoned_cart_operation_mutation();

ALTER TABLE saas.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_carts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.abandoned_carts FROM PUBLIC, celebix_saas_app, celebix_saas_workflow, celebix_saas_host_resolver;
REVOKE ALL ON saas.abandoned_cart_items FROM PUBLIC, celebix_saas_app, celebix_saas_workflow, celebix_saas_host_resolver;
REVOKE ALL ON saas.abandoned_cart_operations FROM PUBLIC, celebix_saas_app, celebix_saas_workflow, celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.guard_abandoned_cart_operation_mutation() FROM PUBLIC;

COMMIT;
