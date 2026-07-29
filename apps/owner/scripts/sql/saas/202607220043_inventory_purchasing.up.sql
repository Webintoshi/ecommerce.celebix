-- Store-scoped inventory ledger and atomic purchasing authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM saas.product_variants
    WHERE stock_quantity NOT BETWEEN 0 AND 2147483647
  ) THEN
    RAISE EXCEPTION 'INVENTORY_OPENING_QUANTITY_OUT_OF_RANGE';
  END IF;
END
$precondition$;

CREATE FUNCTION saas.inventory_deterministic_uuid(p_namespace text,p_value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $f$
  SELECT (
    pg_catalog.substr(hash_value,1,8)||'-'||
    pg_catalog.substr(hash_value,9,4)||'-5'||
    pg_catalog.substr(hash_value,14,3)||'-8'||
    pg_catalog.substr(hash_value,18,3)||'-'||
    pg_catalog.substr(hash_value,21,12)
  )::uuid
  FROM (SELECT pg_catalog.md5(p_namespace||':'||p_value) AS hash_value) hashed
$f$;

CREATE TABLE saas.inventory_locations (
  id uuid,
  store_id uuid NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT inventory_locations_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_locations_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_locations_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_locations_name_check CHECK (
    name=pg_catalog.btrim(name)
    AND pg_catalog.char_length(name) BETWEEN 1 AND 200
    AND name!~'[[:cntrl:]]'
  ),
  CONSTRAINT inventory_locations_status_check CHECK (status IN('active','archived')),
  CONSTRAINT inventory_locations_default_state_check CHECK (NOT is_default OR status='active'),
  CONSTRAINT inventory_locations_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT inventory_locations_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
  )
);

CREATE UNIQUE INDEX inventory_locations_one_default_per_store_idx
  ON saas.inventory_locations(store_id)
  WHERE is_default AND status='active';
CREATE INDEX inventory_locations_store_list_idx
  ON saas.inventory_locations(store_id,is_default DESC,id);

CREATE TABLE saas.inventory_balances (
  store_id uuid NOT NULL,
  location_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL,
  CONSTRAINT inventory_balances_pkey PRIMARY KEY (store_id,location_id,variant_id),
  CONSTRAINT inventory_balances_location_store_fk FOREIGN KEY (store_id,location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_variant_store_fk FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_quantity_check CHECK (quantity BETWEEN 0 AND 2147483647),
  CONSTRAINT inventory_balances_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT inventory_balances_time_check CHECK (pg_catalog.isfinite(updated_at))
);

CREATE INDEX inventory_balances_variant_location_idx
  ON saas.inventory_balances(store_id,variant_id,location_id);

CREATE TABLE saas.inventory_movements (
  id uuid,
  store_id uuid NOT NULL,
  location_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  movement_kind text NOT NULL,
  direction text NOT NULL,
  quantity_delta bigint NOT NULL,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movements_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_movements_location_store_fk FOREIGN KEY (store_id,location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_movements_variant_store_fk FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_movements_kind_check CHECK (
    movement_kind IN(
      'opening','catalog_adjustment','purchase_receipt','count_adjustment',
      'transfer_out','transfer_in','transfer_return','checkout_sale'
    )
  ),
  CONSTRAINT inventory_movements_direction_check CHECK (
    direction IN('in','out')
    AND (
      (direction='in' AND quantity_delta>=0)
      OR (direction='out' AND quantity_delta<0)
    )
  ),
  CONSTRAINT inventory_movements_delta_check CHECK (
    quantity_delta BETWEEN -2147483647 AND 2147483647
    AND (quantity_delta<>0 OR movement_kind='opening')
  ),
  CONSTRAINT inventory_movements_source_check CHECK (
    source_kind IN(
      'opening','catalog_adjustment','purchase_receipt','count_adjustment',
      'transfer','checkout_sale'
    )
  ),
  CONSTRAINT inventory_movements_time_check CHECK (
    pg_catalog.isfinite(occurred_at)
    AND pg_catalog.isfinite(created_at)
    AND created_at>=occurred_at
  ),
  CONSTRAINT inventory_movements_source_key
    UNIQUE (store_id,source_kind,source_id,variant_id,location_id,direction)
);

CREATE INDEX inventory_movements_store_time_idx
  ON saas.inventory_movements(store_id,occurred_at DESC,id DESC);
CREATE INDEX inventory_movements_variant_time_idx
  ON saas.inventory_movements(store_id,variant_id,occurred_at DESC,id DESC);

CREATE TABLE saas.purchase_orders (
  id uuid,
  store_id uuid NOT NULL,
  location_id uuid NOT NULL,
  supplier_name text NOT NULL,
  status text NOT NULL,
  total_cost_cents bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_store_id_key UNIQUE (store_id,id),
  CONSTRAINT purchase_orders_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT purchase_orders_location_store_fk FOREIGN KEY (store_id,location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT purchase_orders_supplier_check CHECK (
    supplier_name=pg_catalog.btrim(supplier_name)
    AND pg_catalog.char_length(supplier_name) BETWEEN 1 AND 200
    AND supplier_name!~'[[:cntrl:]]'
  ),
  CONSTRAINT purchase_orders_status_check CHECK (
    status IN('draft','ordered','partially_received','received','cancelled')
  ),
  CONSTRAINT purchase_orders_total_check CHECK (total_cost_cents BETWEEN 0 AND 8000000000),
  CONSTRAINT purchase_orders_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT purchase_orders_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
  )
);

CREATE INDEX purchase_orders_store_list_idx
  ON saas.purchase_orders(store_id,updated_at DESC,id DESC);

CREATE TABLE saas.purchase_order_lines (
  id uuid,
  store_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  ordered_quantity bigint NOT NULL,
  received_quantity bigint NOT NULL DEFAULT 0,
  unit_cost_cents bigint NOT NULL,
  line_cost_cents bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_order_lines_store_id_key UNIQUE (store_id,id),
  CONSTRAINT purchase_order_lines_order_variant_key UNIQUE (store_id,purchase_order_id,variant_id),
  CONSTRAINT purchase_order_lines_order_store_fk FOREIGN KEY (store_id,purchase_order_id)
    REFERENCES saas.purchase_orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_variant_store_fk FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_quantity_check CHECK (
    ordered_quantity BETWEEN 1 AND 2147483647
    AND received_quantity BETWEEN 0 AND ordered_quantity
  ),
  CONSTRAINT purchase_order_lines_money_check CHECK (
    unit_cost_cents BETWEEN 0 AND 8000000000
    AND line_cost_cents BETWEEN 0 AND 8000000000
    AND line_cost_cents=ordered_quantity*unit_cost_cents
  ),
  CONSTRAINT purchase_order_lines_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT purchase_order_lines_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
  )
);

CREATE INDEX purchase_order_lines_order_idx
  ON saas.purchase_order_lines(store_id,purchase_order_id,id);

CREATE TABLE saas.inventory_operations (
  operation_id uuid,
  store_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_entity_id uuid NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT inventory_operations_pkey PRIMARY KEY (operation_id),
  CONSTRAINT inventory_operations_store_operation_key UNIQUE (store_id,operation_id),
  CONSTRAINT inventory_operations_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_operations_purchase_store_fk
    FOREIGN KEY (store_id,result_entity_id)
    REFERENCES saas.purchase_orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_operations_kind_check CHECK (
    operation_kind IN('purchase_save','purchase_transition','purchase_receive')
  ),
  CONSTRAINT inventory_operations_fingerprint_check CHECK (
    payload_fingerprint~'^[a-f0-9]{64}$'
  ),
  CONSTRAINT inventory_operations_result_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768
  ),
  CONSTRAINT inventory_operations_time_check CHECK (pg_catalog.isfinite(committed_at))
);

CREATE INDEX inventory_operations_store_time_idx
  ON saas.inventory_operations(store_id,committed_at DESC,operation_id DESC);

CREATE FUNCTION saas.guard_inventory_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  RAISE EXCEPTION 'INVENTORY_MOVEMENT_IMMUTABLE';
END
$f$;

CREATE FUNCTION saas.guard_inventory_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  RAISE EXCEPTION 'INVENTORY_OPERATION_IMMUTABLE';
END
$f$;

CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON saas.inventory_movements
FOR EACH ROW EXECUTE FUNCTION saas.guard_inventory_movement_mutation();

CREATE TRIGGER inventory_operations_immutable
BEFORE UPDATE OR DELETE ON saas.inventory_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_inventory_operation_mutation();

ALTER TABLE saas.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.purchase_order_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.inventory_locations,saas.inventory_balances,saas.inventory_movements,
  saas.purchase_orders,saas.purchase_order_lines,saas.inventory_operations
  FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

INSERT INTO saas.inventory_locations(
  id,store_id,name,is_default,status,version,created_at,updated_at
)
SELECT
  saas.inventory_deterministic_uuid('inventory-default-location',store.id::text),
  store.id,
  'Ana Depo',
  true,
  'active',
  1,
  store.created_at,
  store.updated_at
FROM saas.stores AS store
ORDER BY store.id;

INSERT INTO saas.inventory_balances(
  store_id,location_id,variant_id,quantity,version,updated_at
)
SELECT
  variant.store_id,
  saas.inventory_deterministic_uuid('inventory-default-location',variant.store_id::text),
  variant.id,
  variant.stock_quantity,
  1,
  variant.updated_at
FROM saas.product_variants AS variant
WHERE variant.status='active'
ORDER BY variant.store_id,variant.id;

INSERT INTO saas.inventory_movements(
  id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
  source_kind,source_id,occurred_at,created_at
)
SELECT
  saas.inventory_deterministic_uuid(
    'inventory-opening-movement',
    variant.store_id::text||':'||variant.id::text
  ),
  variant.store_id,
  saas.inventory_deterministic_uuid('inventory-default-location',variant.store_id::text),
  variant.id,
  'opening',
  'in',
  variant.stock_quantity,
  'opening',
  variant.id,
  variant.updated_at,
  variant.updated_at
FROM saas.product_variants AS variant
WHERE variant.status='active'
ORDER BY variant.store_id,variant.id;

CREATE FUNCTION saas.inventory_active_balance_total(p_store_id uuid,p_variant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT COALESCE(pg_catalog.sum(balance.quantity::numeric),0)::bigint
  FROM saas.inventory_balances AS balance
  JOIN saas.inventory_locations AS location
    ON location.store_id=balance.store_id
   AND location.id=balance.location_id
   AND location.status='active'
  WHERE balance.store_id=p_store_id AND balance.variant_id=p_variant_id
$f$;

CREATE FUNCTION saas.inventory_reconcile_variant_delta(
  p_store_id uuid,
  p_variant_id uuid,
  p_old_quantity bigint,
  p_new_quantity bigint,
  p_is_insert boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  source_marker text:=pg_catalog.current_setting('saas.inventory.source_marker',true);
  source_id uuid;
  source_time timestamptz;
  default_location uuid;
  delta_quantity bigint;
  remaining bigint;
  consumed bigint;
  balance_record record;
  held_quantity numeric;
BEGIN
  IF source_marker IS NULL OR source_marker=''
     OR source_marker NOT IN('catalog_adjustment','checkout_sale','inventory_managed') THEN
    RAISE EXCEPTION 'INVENTORY_STOCK_SOURCE_REQUIRED';
  END IF;
  IF p_store_id IS NULL OR p_variant_id IS NULL OR p_old_quantity IS NULL
     OR p_new_quantity NOT BETWEEN 0 AND 2147483647 THEN
    RAISE EXCEPTION 'INVENTORY_STOCK_QUANTITY_INVALID';
  END IF;

  IF source_marker='inventory_managed' THEN
    IF saas.inventory_active_balance_total(p_store_id,p_variant_id)<>p_new_quantity THEN
      RAISE EXCEPTION 'INVENTORY_BALANCE_AGGREGATE_MISMATCH';
    END IF;
    RETURN;
  END IF;

  BEGIN
    source_id:=pg_catalog.current_setting('saas.inventory.source_id',true)::uuid;
    source_time:=pg_catalog.current_setting('saas.inventory.source_time',true)::timestamptz;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'INVENTORY_STOCK_SOURCE_REQUIRED';
  END;
  IF source_id IS NULL OR source_time IS NULL OR NOT pg_catalog.isfinite(source_time) THEN
    RAISE EXCEPTION 'INVENTORY_STOCK_SOURCE_REQUIRED';
  END IF;

  SELECT location.id INTO default_location
  FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.is_default
    AND location.status='active'
  ORDER BY location.id
  LIMIT 1
  FOR UPDATE;
  IF default_location IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_REQUIRED';
  END IF;

  IF p_is_insert THEN
    IF source_marker<>'catalog_adjustment' THEN
      RAISE EXCEPTION 'INVENTORY_STOCK_SOURCE_REQUIRED';
    END IF;
    INSERT INTO saas.inventory_balances(
      store_id,location_id,variant_id,quantity,version,updated_at
    ) VALUES(
      p_store_id,default_location,p_variant_id,p_new_quantity,1,source_time
    );
    INSERT INTO saas.inventory_movements(
      id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
      source_kind,source_id,occurred_at,created_at
    ) VALUES(
      saas.inventory_deterministic_uuid(
        'inventory-opening-movement',
        p_store_id::text||':'||p_variant_id::text
      ),
      p_store_id,default_location,p_variant_id,'opening','in',p_new_quantity,
      'opening',p_variant_id,source_time,source_time
    );
    RETURN;
  END IF;

  delta_quantity:=p_new_quantity-p_old_quantity;
  IF delta_quantity=0 THEN
    IF saas.inventory_active_balance_total(p_store_id,p_variant_id)<>p_new_quantity THEN
      RAISE EXCEPTION 'INVENTORY_BALANCE_AGGREGATE_MISMATCH';
    END IF;
    RETURN;
  END IF;
  IF source_marker='checkout_sale' AND delta_quantity>=0 THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_DELTA_INVALID';
  END IF;

  SELECT COALESCE(pg_catalog.sum(reservation.quantity::numeric),0)
  INTO held_quantity
  FROM saas.checkout_inventory_reservations AS reservation
  WHERE reservation.store_id=p_store_id
    AND reservation.variant_id=p_variant_id
    AND reservation.stock_tracked
    AND reservation.status='held';
  IF p_new_quantity::numeric<held_quantity THEN
    RAISE EXCEPTION 'INVENTORY_ACTIVE_HOLD_VIOLATION';
  END IF;

  IF delta_quantity>0 THEN
    UPDATE saas.inventory_balances
    SET
      quantity=quantity+delta_quantity,
      version=version+1,
      updated_at=source_time
    WHERE store_id=p_store_id
      AND location_id=default_location
      AND variant_id=p_variant_id
      AND quantity::numeric+delta_quantity::numeric<=2147483647;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_BALANCE_OVERFLOW';
    END IF;
    INSERT INTO saas.inventory_movements(
      id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
      source_kind,source_id,occurred_at,created_at
    ) VALUES(
      saas.inventory_deterministic_uuid(
        'inventory-source-movement',
        source_marker||':'||source_id::text||':'||p_variant_id::text||':'||
          default_location::text||':in'
      ),
      p_store_id,default_location,p_variant_id,'catalog_adjustment','in',
      delta_quantity,'catalog_adjustment',source_id,source_time,source_time
    );
  ELSE
    remaining:=-delta_quantity;
    FOR balance_record IN
      SELECT
        balance.location_id,
        balance.quantity
      FROM saas.inventory_balances AS balance
      JOIN saas.inventory_locations AS location
        ON location.store_id=balance.store_id
       AND location.id=balance.location_id
       AND location.status='active'
      WHERE balance.store_id=p_store_id
        AND balance.variant_id=p_variant_id
      ORDER BY location.is_default DESC,balance.location_id
      FOR UPDATE OF balance
    LOOP
      EXIT WHEN remaining=0;
      consumed:=LEAST(remaining,balance_record.quantity);
      IF consumed=0 THEN
        CONTINUE;
      END IF;
      UPDATE saas.inventory_balances
      SET
        quantity=quantity-consumed,
        version=version+1,
        updated_at=source_time
      WHERE store_id=p_store_id
        AND location_id=balance_record.location_id
        AND variant_id=p_variant_id;
      INSERT INTO saas.inventory_movements(
        id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
        source_kind,source_id,occurred_at,created_at
      ) VALUES(
        saas.inventory_deterministic_uuid(
          'inventory-source-movement',
          source_marker||':'||source_id::text||':'||p_variant_id::text||':'||
            balance_record.location_id::text||':out'
        ),
        p_store_id,balance_record.location_id,p_variant_id,
        CASE source_marker
          WHEN 'checkout_sale' THEN 'checkout_sale'
          ELSE 'catalog_adjustment'
        END,
        'out',-consumed,
        CASE source_marker
          WHEN 'checkout_sale' THEN 'checkout_sale'
          ELSE 'catalog_adjustment'
        END,
        source_id,source_time,source_time
      );
      remaining:=remaining-consumed;
    END LOOP;
    IF remaining<>0 THEN
      RAISE EXCEPTION 'INVENTORY_INSUFFICIENT_BALANCE';
    END IF;
  END IF;

  IF saas.inventory_active_balance_total(p_store_id,p_variant_id)<>p_new_quantity THEN
    RAISE EXCEPTION 'INVENTORY_BALANCE_AGGREGATE_MISMATCH';
  END IF;
END
$f$;

CREATE FUNCTION saas.inventory_reconcile_variant_stock_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  PERFORM saas.inventory_reconcile_variant_delta(
    NEW.store_id,
    NEW.id,
    CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.stock_quantity END,
    NEW.stock_quantity,
    TG_OP='INSERT'
  );
  RETURN NEW;
END
$f$;

CREATE TRIGGER product_variants_inventory_reconcile
AFTER INSERT OR UPDATE OF stock_quantity ON saas.product_variants
FOR EACH ROW EXECUTE FUNCTION saas.inventory_reconcile_variant_stock_trigger();

CREATE FUNCTION saas.inventory_replace_function_fragment(
  p_signature text,
  p_old_fragment text,
  p_new_fragment text
)
RETURNS void
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  definition text;
  first_position integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p_signature::regprocedure) INTO definition;
  first_position:=pg_catalog.strpos(definition,p_old_fragment);
  IF first_position=0
     OR pg_catalog.strpos(
       pg_catalog.substr(definition,first_position+pg_catalog.char_length(p_old_fragment)),
       p_old_fragment
     )<>0 THEN
    RAISE EXCEPTION 'INVENTORY_WRITER_PATCH_DRIFT: %',p_signature;
  END IF;
  EXECUTE pg_catalog.replace(definition,p_old_fragment,p_new_fragment);
END
$f$;

SELECT saas.inventory_replace_function_fragment(
  'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
$old$
  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_variant_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );
$old$,
$new$
  -- inventory marker begin
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_variant_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  -- inventory marker end
$new$
);

SELECT saas.inventory_replace_function_fragment(
  'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
$old$
  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );
$old$,
$new$
  -- inventory marker begin
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  -- inventory marker end
$new$
);

SELECT saas.inventory_replace_function_fragment(
  'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
$old$
  UPDATE saas.product_variants
  SET title = p_title,
      sku = p_sku,
      barcode = p_barcode,
      price_cents = p_price_cents,
      compare_at_cents = p_compare_at_cents,
      cost_cents = p_cost_cents,
      stock_tracking = p_stock_tracking,
      stock_quantity = p_stock_quantity,
      attributes = p_attributes,
      version = version + 1,
      updated_at = p_now
  WHERE id = p_variant_id AND product_id = p_product_id AND store_id = p_store_id;
$old$,
$new$
  -- inventory marker begin
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  UPDATE saas.product_variants
  SET title = p_title,
      sku = p_sku,
      barcode = p_barcode,
      price_cents = p_price_cents,
      compare_at_cents = p_compare_at_cents,
      cost_cents = p_cost_cents,
      stock_tracking = p_stock_tracking,
      stock_quantity = p_stock_quantity,
      attributes = p_attributes,
      version = version + 1,
      updated_at = p_now
  WHERE id = p_variant_id AND product_id = p_product_id AND store_id = p_store_id;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  -- inventory marker end
$new$
);

SELECT saas.inventory_replace_function_fragment(
  'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)',
$old$
  UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity-reservation.quantity,
    version=variant.version+1,updated_at=p_now
    FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;
$old$,
$new$
  -- inventory marker begin
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',current_attempt.id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity-reservation.quantity,
    version=variant.version+1,updated_at=p_now
    FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  -- inventory marker end
$new$
);

SELECT saas.inventory_replace_function_fragment(
  'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',
$old$   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES((row_value->>'variantId')::uuid,(row_value->>'productId')::uuid,p_store_id,'Varsayılan',NULLIF(row_value->>'sku',''),(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);$old$,
$new$   -- inventory marker begin
   PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true); PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true); PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES((row_value->>'variantId')::uuid,(row_value->>'productId')::uuid,p_store_id,'Varsayılan',NULLIF(row_value->>'sku',''),(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);
   PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true); PERFORM pg_catalog.set_config('saas.inventory.source_id','',true); PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
   -- inventory marker end$new$
);

SELECT saas.inventory_replace_function_fragment(
  'saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)',
$old$     INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
     VALUES(saas.catalog_import_preview_uuid(p_preview_id,position,'variant'),saas.catalog_import_preview_uuid(p_preview_id,position,'product'),p_store_id,'Varsayılan',CASE WHEN row_value ? 'sku' THEN row_value->>'sku' ELSE NULL END,(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);$old$,
$new$     -- inventory marker begin
     PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true); PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true); PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
     INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
     VALUES(saas.catalog_import_preview_uuid(p_preview_id,position,'variant'),saas.catalog_import_preview_uuid(p_preview_id,position,'product'),p_store_id,'Varsayılan',CASE WHEN row_value ? 'sku' THEN row_value->>'sku' ELSE NULL END,(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);
     PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true); PERFORM pg_catalog.set_config('saas.inventory.source_id','',true); PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
     -- inventory marker end$new$
);

DROP FUNCTION saas.inventory_replace_function_fragment(text,text,text);

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage','customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate','promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive','marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive','integrations.read','integrations.manage','analytics.read','inventory.read','inventory.manage','purchasing.read','purchasing.manage','pricing.read','pricing.manage') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage','marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','inventory.manage','purchasing.read','purchasing.manage','pricing.read')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read','marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','purchasing.read','pricing.read'))) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END $f$;

CREATE FUNCTION saas.inventory_purchase_lines_valid(p_lines jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE line_count integer;
BEGIN
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.pg_column_size(p_lines)>131072 THEN
    RETURN false;
  END IF;
  line_count:=pg_catalog.jsonb_array_length(p_lines);
  IF line_count NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line)<>'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(line))<>4
      OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(line) AS key
        WHERE key NOT IN('lineId','variantId','orderedQuantity','unitCostCents')
      )
      OR line->>'lineId' IS NULL
      OR line->>'lineId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR line->>'variantId' IS NULL
      OR line->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(line->'orderedQuantity')<>'number'
      OR (line->>'orderedQuantity')!~'^[0-9]+$'
      OR (line->>'orderedQuantity')::numeric NOT BETWEEN 1 AND 2147483647
      OR pg_catalog.jsonb_typeof(line->'unitCostCents')<>'number'
      OR (line->>'unitCostCents')!~'^[0-9]+$'
      OR (line->>'unitCostCents')::numeric NOT BETWEEN 0 AND 8000000000
      OR (line->>'orderedQuantity')::numeric*(line->>'unitCostCents')::numeric>8000000000
  ) THEN RETURN false; END IF;
  IF (SELECT pg_catalog.count(DISTINCT line->>'lineId') FROM pg_catalog.jsonb_array_elements(p_lines) AS line)<>line_count
     OR (SELECT pg_catalog.count(DISTINCT line->>'variantId') FROM pg_catalog.jsonb_array_elements(p_lines) AS line)<>line_count
     OR (SELECT pg_catalog.sum((line->>'orderedQuantity')::numeric*(line->>'unitCostCents')::numeric) FROM pg_catalog.jsonb_array_elements(p_lines) AS line)>8000000000 THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.inventory_receipt_lines_valid(p_lines jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE line_count integer;
BEGIN
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.pg_column_size(p_lines)>65536 THEN
    RETURN false;
  END IF;
  line_count:=pg_catalog.jsonb_array_length(p_lines);
  IF line_count NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
    WHERE pg_catalog.jsonb_typeof(line)<>'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(line))<>2
      OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(line) AS key
        WHERE key NOT IN('lineId','quantity')
      )
      OR line->>'lineId' IS NULL
      OR line->>'lineId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(line->'quantity')<>'number'
      OR (line->>'quantity')!~'^[0-9]+$'
      OR (line->>'quantity')::numeric NOT BETWEEN 1 AND 2147483647
  ) THEN RETURN false; END IF;
  RETURN (
    SELECT pg_catalog.count(DISTINCT line->>'lineId')
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
  )=line_count;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.inventory_location_projection(p_store_id uuid,p_location_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',location.id,
    'name',location.name,
    'isDefault',location.is_default,
    'status',location.status,
    'version',location.version,
    'createdAt',saas.merchant_admin_timestamp(location.created_at),
    'updatedAt',saas.merchant_admin_timestamp(location.updated_at)
  )
  FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id AND location.id=p_location_id
$f$;

CREATE FUNCTION saas.inventory_purchase_projection(p_store_id uuid,p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',purchase.id,
    'locationId',purchase.location_id,
    'supplierName',purchase.supplier_name,
    'status',purchase.status,
    'lines',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',line.id,
          'variantId',line.variant_id,
          'orderedQuantity',line.ordered_quantity,
          'receivedQuantity',line.received_quantity,
          'unitCostCents',line.unit_cost_cents,
          'lineCostCents',line.line_cost_cents
        )
        ORDER BY line.id
      )
      FROM saas.purchase_order_lines AS line
      WHERE line.store_id=purchase.store_id
        AND line.purchase_order_id=purchase.id
    ),'[]'::jsonb),
    'totalCostCents',purchase.total_cost_cents,
    'version',purchase.version,
    'createdAt',saas.merchant_admin_timestamp(purchase.created_at),
    'updatedAt',saas.merchant_admin_timestamp(purchase.updated_at)
  )
  FROM saas.purchase_orders AS purchase
  WHERE purchase.store_id=p_store_id AND purchase.id=p_order_id
$f$;

CREATE FUNCTION saas.inventory_mutation_projection(
  p_store_id uuid,
  p_order_id uuid,
  p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',purchase.id,
    'status',purchase.status,
    'version',purchase.version,
    'updatedAt',saas.merchant_admin_timestamp(purchase.updated_at),
    'replayed',p_replayed
  )
  FROM saas.purchase_orders AS purchase
  WHERE purchase.store_id=p_store_id AND purchase.id=p_order_id
$f$;

CREATE FUNCTION saas.inventory_list_locations(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY
  SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        saas.inventory_location_projection(p_store_id,location.id)
        ORDER BY location.is_default DESC,location.id
      )
      FROM saas.inventory_locations AS location
      WHERE location.store_id=p_store_id
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.inventory_list_balances(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_location_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_location_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.inventory_locations
    WHERE store_id=p_store_id AND id=p_location_id
  ) THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY
  SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'locationId',balance.location_id,
          'variantId',balance.variant_id,
          'quantity',balance.quantity,
          'version',balance.version,
          'updatedAt',saas.merchant_admin_timestamp(balance.updated_at)
        )
        ORDER BY balance.variant_id
      )
      FROM saas.inventory_balances AS balance
      WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.purchasing_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','purchasing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY
  SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        saas.inventory_purchase_projection(p_store_id,purchase.id)
        ORDER BY purchase.updated_at DESC,purchase.id DESC
      )
      FROM (
        SELECT id,updated_at
        FROM saas.purchase_orders
        WHERE store_id=p_store_id
        ORDER BY updated_at DESC,id DESC
        LIMIT 200
      ) AS purchase
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.purchasing_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_order_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','purchasing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  projection:=saas.inventory_purchase_projection(p_store_id,p_order_id);
  IF projection IS NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'found',projection;
  END IF;
END
$f$;

CREATE FUNCTION saas.purchasing_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_order_id uuid,p_expected_version bigint,
  p_location_id uuid,p_supplier_name text,p_lines jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  purchase saas.purchase_orders%ROWTYPE;
  line_count integer;
  total_cost bigint;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','purchasing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_location_id IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_supplier_name IS NULL OR p_supplier_name<>pg_catalog.btrim(p_supplier_name)
     OR pg_catalog.char_length(p_supplier_name) NOT BETWEEN 1 AND 200
     OR p_supplier_name~'[[:cntrl:]]'
     OR saas.inventory_purchase_lines_valid(p_lines) IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation
  FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='purchase_save'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM saas.inventory_locations
    WHERE store_id=p_store_id AND id=p_location_id AND status='active'
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  line_count:=pg_catalog.jsonb_array_length(p_lines);
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
    JOIN saas.product_variants AS variant
      ON variant.store_id=p_store_id
     AND variant.id=(requested->>'variantId')::uuid
     AND variant.status='active'
     AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO purchase
  FROM saas.purchase_orders
  WHERE store_id=p_store_id AND id=p_order_id
  FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS NULL OR purchase.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF purchase.status<>'draft' THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    IF p_now<purchase.updated_at OR purchase.version=9007199254740991 THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
  ELSIF p_expected_version IS NOT NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.sum(
    (requested->>'orderedQuantity')::numeric*
    (requested->>'unitCostCents')::numeric
  )::bigint
  INTO total_cost
  FROM pg_catalog.jsonb_array_elements(p_lines) AS requested;

  BEGIN
    IF purchase.id IS NULL THEN
      INSERT INTO saas.purchase_orders(
        id,store_id,location_id,supplier_name,status,total_cost_cents,
        version,created_at,updated_at
      ) VALUES(
        p_order_id,p_store_id,p_location_id,p_supplier_name,'draft',total_cost,
        1,p_now,p_now
      );
    ELSE
      UPDATE saas.purchase_orders
      SET
        location_id=p_location_id,
        supplier_name=p_supplier_name,
        total_cost_cents=total_cost,
        version=version+1,
        updated_at=p_now
      WHERE store_id=p_store_id AND id=p_order_id;
      DELETE FROM saas.purchase_order_lines
      WHERE store_id=p_store_id AND purchase_order_id=p_order_id;
    END IF;
    INSERT INTO saas.purchase_order_lines(
      id,store_id,purchase_order_id,variant_id,ordered_quantity,
      received_quantity,unit_cost_cents,line_cost_cents,version,created_at,updated_at
    )
    SELECT
      (requested->>'lineId')::uuid,
      p_store_id,
      p_order_id,
      (requested->>'variantId')::uuid,
      (requested->>'orderedQuantity')::bigint,
      0,
      (requested->>'unitCostCents')::bigint,
      (
        (requested->>'orderedQuantity')::numeric*
        (requested->>'unitCostCents')::numeric
      )::bigint,
      1,
      p_now,
      p_now
    FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
    ORDER BY (requested->>'lineId')::uuid;
  EXCEPTION
    WHEN unique_violation OR foreign_key_violation OR check_violation
      OR numeric_value_out_of_range OR datetime_field_overflow THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;

  projection:=saas.inventory_mutation_projection(p_store_id,p_order_id,false);
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'purchase_save',p_fingerprint,
    p_order_id,projection,p_now
  );
  RETURN QUERY SELECT 'saved',projection;
END
$f$;

CREATE FUNCTION saas.purchasing_transition(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_order_id uuid,p_expected_version bigint,
  p_transition text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  purchase saas.purchase_orders%ROWTYPE;
  projection jsonb;
  next_status text;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','purchasing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_transition NOT IN('order','cancel') THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation
  FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='purchase_transition'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO purchase
  FROM saas.purchase_orders
  WHERE store_id=p_store_id AND id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF purchase.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF p_now<purchase.updated_at OR purchase.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF p_transition='order' AND purchase.status='draft' THEN
    next_status:='ordered';
  ELSIF p_transition='cancel' AND purchase.status IN('draft','ordered') THEN
    next_status:='cancelled';
  ELSE
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.purchase_orders
  SET status=next_status,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_order_id;
  projection:=saas.inventory_mutation_projection(p_store_id,p_order_id,false);
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'purchase_transition',p_fingerprint,
    p_order_id,projection,p_now
  );
  RETURN QUERY SELECT 'transitioned',projection;
END
$f$;

CREATE FUNCTION saas.purchasing_receive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_order_id uuid,p_expected_version bigint,
  p_location_id uuid,p_receipts jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_purchase saas.purchase_orders%ROWTYPE;
  p_variant_ids uuid[];
  receipt_count integer;
  matched_count integer;
  updated_count integer;
  next_status text;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','purchasing.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_location_id IS NULL
     OR p_expected_version IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.inventory_receipt_lines_valid(p_receipts) IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation
  FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='purchase_receive'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  PERFORM 1 FROM saas.purchase_orders AS purchase
    WHERE purchase.store_id=p_store_id AND purchase.id=p_order_id FOR UPDATE;
  SELECT * INTO current_purchase
  FROM saas.purchase_orders
  WHERE store_id=p_store_id AND id=p_order_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_purchase.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_purchase.status NOT IN('ordered','partially_received') THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF current_purchase.location_id<>p_location_id
     OR NOT EXISTS(
       SELECT 1 FROM saas.inventory_locations
       WHERE store_id=p_store_id AND id=p_location_id AND status='active'
     ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_purchase.updated_at
     OR current_purchase.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  receipt_count:=pg_catalog.jsonb_array_length(p_receipts);
  SELECT
    pg_catalog.count(*),
    pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id)
  INTO matched_count,p_variant_ids
  FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
  JOIN saas.purchase_order_lines AS line
    ON line.store_id=p_store_id
   AND line.purchase_order_id=p_order_id
   AND line.id=(receipt->>'lineId')::uuid;
  IF matched_count<>receipt_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(p_variant_ids)
    ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*)
    FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id
      AND variant.id=ANY(p_variant_ids)
      AND variant.status='active'
      AND variant.stock_tracking
  )<>receipt_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_balances AS balance
    WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id
      AND balance.variant_id=ANY(p_variant_ids)
    ORDER BY balance.variant_id FOR UPDATE;

  IF EXISTS(
    SELECT 1
    FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id
      AND variant.id=ANY(p_variant_ids)
      AND variant.version=9007199254740991
  ) OR EXISTS(
    SELECT 1
    FROM saas.inventory_balances AS balance
    WHERE balance.store_id=p_store_id
      AND balance.location_id=p_location_id
      AND balance.variant_id=ANY(p_variant_ids)
      AND balance.version=9007199254740991
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
    JOIN saas.purchase_order_lines AS line
      ON line.store_id=p_store_id
     AND line.purchase_order_id=p_order_id
     AND line.id=(receipt->>'lineId')::uuid
    WHERE line.version=9007199254740991
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
    JOIN saas.purchase_order_lines AS line
      ON line.store_id=p_store_id
     AND line.purchase_order_id=p_order_id
     AND line.id=(receipt->>'lineId')::uuid
    WHERE (receipt->>'quantity')::numeric>
      line.ordered_quantity::numeric-line.received_quantity::numeric
  ) THEN
    RETURN QUERY SELECT 'over_receipt',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
    JOIN saas.purchase_order_lines AS line
      ON line.store_id=p_store_id
     AND line.purchase_order_id=p_order_id
     AND line.id=(receipt->>'lineId')::uuid
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    LEFT JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=p_location_id
     AND balance.variant_id=line.variant_id
    WHERE variant.stock_quantity::numeric+(receipt->>'quantity')::numeric>2147483647
       OR COALESCE(balance.quantity,0)::numeric+(receipt->>'quantity')::numeric>2147483647
       OR variant.stock_quantity::numeric+(receipt->>'quantity')::numeric<
          COALESCE((
            SELECT pg_catalog.sum(reservation.quantity::numeric)
            FROM saas.checkout_inventory_reservations AS reservation
            WHERE reservation.store_id=variant.store_id
              AND reservation.variant_id=variant.id
              AND reservation.stock_tracked
              AND reservation.status='held'
          ),0)
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  INSERT INTO saas.inventory_balances(
    store_id,location_id,variant_id,quantity,version,updated_at
  )
  SELECT p_store_id,p_location_id,variant_id,0,1,p_now
  FROM pg_catalog.unnest(p_variant_ids) AS requested(variant_id)
  ORDER BY variant_id
  ON CONFLICT (store_id,location_id,variant_id) DO NOTHING;

  UPDATE saas.inventory_balances AS balance
  SET
    quantity=balance.quantity+received.quantity,
    version=balance.version+1,
    updated_at=p_now
  FROM (
    SELECT line.variant_id,pg_catalog.sum((receipt->>'quantity')::bigint)::bigint AS quantity
    FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
    JOIN saas.purchase_order_lines AS line
      ON line.store_id=p_store_id
     AND line.purchase_order_id=p_order_id
     AND line.id=(receipt->>'lineId')::uuid
    GROUP BY line.variant_id
  ) AS received
  WHERE balance.store_id=p_store_id
    AND balance.location_id=p_location_id
    AND balance.variant_id=received.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count<>receipt_count THEN
    RAISE check_violation USING MESSAGE='controlled inventory balance transition';
  END IF;

  INSERT INTO saas.inventory_movements(
    id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
    source_kind,source_id,occurred_at,created_at
  )
  SELECT
    saas.inventory_deterministic_uuid(
      'inventory-source-movement',
      'purchase_receipt:'||p_operation_id::text||':'||line.variant_id::text||':'||
        p_location_id::text||':in'
    ),
    p_store_id,p_location_id,line.variant_id,'purchase_receipt','in',
    (receipt->>'quantity')::bigint,'purchase_receipt',p_operation_id,p_now,p_now
  FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
  JOIN saas.purchase_order_lines AS line
    ON line.store_id=p_store_id
   AND line.purchase_order_id=p_order_id
   AND line.id=(receipt->>'lineId')::uuid
  ORDER BY line.variant_id;

  UPDATE saas.purchase_order_lines AS line
  SET
    received_quantity=line.received_quantity+(receipt->>'quantity')::bigint,
    version=line.version+1,
    updated_at=p_now
  FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
  WHERE line.store_id=p_store_id
    AND line.purchase_order_id=p_order_id
    AND line.id=(receipt->>'lineId')::uuid;

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
  UPDATE saas.product_variants AS variant
  SET
    stock_quantity=variant.stock_quantity+received.quantity,
    version=variant.version+1,
    updated_at=p_now
  FROM (
    SELECT line.variant_id,pg_catalog.sum((receipt->>'quantity')::bigint)::bigint AS quantity
    FROM pg_catalog.jsonb_array_elements(p_receipts) AS receipt
    JOIN saas.purchase_order_lines AS line
      ON line.store_id=p_store_id
     AND line.purchase_order_id=p_order_id
     AND line.id=(receipt->>'lineId')::uuid
    GROUP BY line.variant_id
  ) AS received
  WHERE variant.store_id=p_store_id AND variant.id=received.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  IF updated_count<>receipt_count THEN
    RAISE check_violation USING MESSAGE='controlled inventory aggregate transition';
  END IF;

  IF EXISTS(
    SELECT 1 FROM saas.purchase_order_lines
    WHERE store_id=p_store_id
      AND purchase_order_id=p_order_id
      AND received_quantity<ordered_quantity
  ) THEN
    next_status:='partially_received';
  ELSE
    next_status:='received';
  END IF;
  UPDATE saas.purchase_orders
  SET status=next_status,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_order_id;

  projection:=saas.inventory_mutation_projection(p_store_id,p_order_id,false);
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'purchase_receive',p_fingerprint,
    p_order_id,projection,p_now
  );
  RETURN QUERY SELECT 'received',projection;
END
$f$;

CREATE FUNCTION saas.inventory_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; operation saas.inventory_operations%ROWTYPE;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR p_operation_id IS NULL OR p_fingerprint IS NULL
     OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO operation
  FROM saas.inventory_operations
  WHERE operation_id=p_operation_id AND store_id=p_store_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.inventory_deterministic_uuid(text,text),
  saas.guard_inventory_movement_mutation(),
  saas.guard_inventory_operation_mutation(),
  saas.inventory_active_balance_total(uuid,uuid),
  saas.inventory_reconcile_variant_delta(uuid,uuid,bigint,bigint,boolean),
  saas.inventory_reconcile_variant_stock_trigger(),
  saas.inventory_purchase_lines_valid(jsonb),
  saas.inventory_receipt_lines_valid(jsonb),
  saas.inventory_location_projection(uuid,uuid),
  saas.inventory_purchase_projection(uuid,uuid),
  saas.inventory_mutation_projection(uuid,uuid,boolean)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

REVOKE ALL ON FUNCTION
  saas.inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,text,jsonb),
  saas.purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb),
  saas.inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,text,jsonb),
  saas.purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb),
  saas.inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

COMMIT;
