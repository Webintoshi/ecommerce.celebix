-- Atomic stock counts and balanced location transfers.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $checkout_store_lock_patch$
DECLARE
  target regprocedure:=
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;
  definition text;
  patched text;
  definition_after text;
  old_fragment text:=$old$
  IF NOT FOUND THEN RETURN QUERY SELECT 'conflict'::text,NULL::jsonb; RETURN; END IF;
  -- Shared success settlement lock order is exact: attempt -> link -> persisted products by id -> variants by id -> reservations by variant_id.
$old$;
  new_fragment text:=$new$
  IF NOT FOUND THEN RETURN QUERY SELECT 'conflict'::text,NULL::jsonb; RETURN; END IF;
  -- inventory checkout store lock begin
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.catalog.store:'||current_attempt.store_id::text,0
    )
  );
  -- inventory checkout store lock end
  -- Shared success settlement lock order is exact: attempt -> link -> persisted products by id -> variants by id -> reservations by variant_id.
$new$;
  owner_before oid;
  owner_after oid;
  acl_before aclitem[];
  acl_after aclitem[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner,proc.proacl
  INTO definition,owner_before,acl_before
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid=target;
  IF definition IS NULL
     OR definition LIKE '%inventory checkout store lock begin%'
     OR definition LIKE '%saas.catalog.store:%'
     OR (
       pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,old_fragment,'')
       )
     )/pg_catalog.length(old_fragment)<>1 THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_PATCH_DRIFT';
  END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  EXECUTE patched;
  SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner,proc.proacl
  INTO definition_after,owner_after,acl_after
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid=target;
  IF owner_after IS DISTINCT FROM owner_before
     OR acl_after IS DISTINCT FROM acl_before
     OR definition_after NOT LIKE '%inventory checkout store lock begin%'
     OR definition_after NOT LIKE '%inventory checkout store lock end%'
     OR definition_after NOT LIKE '%saas.catalog.store:%' THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_PATCH_DRIFT';
  END IF;
END
$checkout_store_lock_patch$;

CREATE TABLE saas.inventory_counts (
  id uuid,
  store_id uuid NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT inventory_counts_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_counts_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_counts_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_counts_location_store_fk FOREIGN KEY (store_id,location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_counts_status_check CHECK (
    status IN('draft','counting','committed','cancelled')
  ),
  CONSTRAINT inventory_counts_version_check CHECK (
    version BETWEEN 1 AND 9007199254740991
  ),
  CONSTRAINT inventory_counts_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
  )
);

CREATE INDEX inventory_counts_store_list_idx
  ON saas.inventory_counts(store_id,updated_at DESC,id DESC);

CREATE TABLE saas.inventory_count_lines (
  id uuid,
  store_id uuid NOT NULL,
  inventory_count_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  expected_quantity bigint NOT NULL,
  counted_quantity bigint,
  CONSTRAINT inventory_count_lines_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_count_lines_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_count_lines_count_variant_key
    UNIQUE (store_id,inventory_count_id,variant_id),
  CONSTRAINT inventory_count_lines_count_store_fk
    FOREIGN KEY (store_id,inventory_count_id)
    REFERENCES saas.inventory_counts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_count_lines_variant_store_fk
    FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_count_lines_expected_check CHECK (
    expected_quantity BETWEEN 0 AND 2147483647
  ),
  CONSTRAINT inventory_count_lines_counted_check CHECK (
    counted_quantity IS NULL OR counted_quantity BETWEEN 0 AND 2147483647
  )
);

CREATE INDEX inventory_count_lines_count_idx
  ON saas.inventory_count_lines(store_id,inventory_count_id,variant_id);

CREATE TABLE saas.inventory_transfers (
  id uuid,
  store_id uuid NOT NULL,
  source_location_id uuid NOT NULL,
  destination_location_id uuid NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT inventory_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_transfers_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_transfers_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_source_store_fk
    FOREIGN KEY (store_id,source_location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_destination_store_fk
    FOREIGN KEY (store_id,destination_location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_distinct_locations_check CHECK (
    source_location_id<>destination_location_id
  ),
  CONSTRAINT inventory_transfers_status_check CHECK (
    status IN('draft','in_transit','received','cancelled')
  ),
  CONSTRAINT inventory_transfers_version_check CHECK (
    version BETWEEN 1 AND 9007199254740991
  ),
  CONSTRAINT inventory_transfers_time_check CHECK (
    pg_catalog.isfinite(created_at)
    AND pg_catalog.isfinite(updated_at)
    AND updated_at>=created_at
  )
);

CREATE INDEX inventory_transfers_store_list_idx
  ON saas.inventory_transfers(store_id,updated_at DESC,id DESC);

CREATE TABLE saas.inventory_transfer_lines (
  id uuid,
  store_id uuid NOT NULL,
  inventory_transfer_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity bigint NOT NULL,
  CONSTRAINT inventory_transfer_lines_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_transfer_lines_store_id_key UNIQUE (store_id,id),
  CONSTRAINT inventory_transfer_lines_transfer_variant_key
    UNIQUE (store_id,inventory_transfer_id,variant_id),
  CONSTRAINT inventory_transfer_lines_transfer_store_fk
    FOREIGN KEY (store_id,inventory_transfer_id)
    REFERENCES saas.inventory_transfers(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_transfer_lines_variant_store_fk
    FOREIGN KEY (store_id,variant_id)
    REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_transfer_lines_quantity_check CHECK (
    quantity BETWEEN 1 AND 2147483647
  )
);

CREATE INDEX inventory_transfer_lines_transfer_idx
  ON saas.inventory_transfer_lines(store_id,inventory_transfer_id,variant_id);

ALTER TABLE saas.inventory_operations
  DROP CONSTRAINT inventory_operations_purchase_store_fk,
  DROP CONSTRAINT inventory_operations_kind_check;

ALTER TABLE saas.inventory_operations
  ADD COLUMN result_purchase_id uuid GENERATED ALWAYS AS (
    CASE WHEN operation_kind IN(
      'purchase_save','purchase_transition','purchase_receive'
    ) THEN result_entity_id END
  ) STORED,
  ADD COLUMN result_count_id uuid GENERATED ALWAYS AS (
    CASE WHEN operation_kind IN(
      'count_save','count_start','count_commit','count_cancel'
    ) THEN result_entity_id END
  ) STORED,
  ADD COLUMN result_transfer_id uuid GENERATED ALWAYS AS (
    CASE WHEN operation_kind IN(
      'transfer_save','transfer_dispatch','transfer_receive','transfer_cancel'
    ) THEN result_entity_id END
  ) STORED;

ALTER TABLE saas.inventory_operations
  ADD CONSTRAINT inventory_operations_kind_check CHECK (
    operation_kind IN(
      'purchase_save','purchase_transition','purchase_receive',
      'count_save','count_start','count_commit','count_cancel',
      'transfer_save','transfer_dispatch','transfer_receive','transfer_cancel'
    )
  ),
  ADD CONSTRAINT inventory_operations_purchase_entity_fk
    FOREIGN KEY (store_id,result_purchase_id)
    REFERENCES saas.purchase_orders(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_operations_count_entity_fk
    FOREIGN KEY (store_id,result_count_id)
    REFERENCES saas.inventory_counts(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_operations_transfer_entity_fk
    FOREIGN KEY (store_id,result_transfer_id)
    REFERENCES saas.inventory_transfers(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_operations_entity_check CHECK (
    (
      operation_kind IN('purchase_save','purchase_transition','purchase_receive')
      AND result_purchase_id=result_entity_id
      AND result_count_id IS NULL
      AND result_transfer_id IS NULL
    ) OR (
      operation_kind IN('count_save','count_start','count_commit','count_cancel')
      AND result_purchase_id IS NULL
      AND result_count_id=result_entity_id
      AND result_transfer_id IS NULL
    ) OR (
      operation_kind IN(
        'transfer_save','transfer_dispatch','transfer_receive','transfer_cancel'
      )
      AND result_purchase_id IS NULL
      AND result_count_id IS NULL
      AND result_transfer_id=result_entity_id
    )
  );

ALTER TABLE saas.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_counts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_count_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_transfer_lines FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.inventory_counts,saas.inventory_count_lines,
  saas.inventory_transfers,saas.inventory_transfer_lines
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.inventory_count_lines_valid(p_lines jsonb)
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
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(line))
        NOT BETWEEN 2 AND 3
      OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(line) AS key
        WHERE key NOT IN('lineId','variantId','countedQuantity')
      )
      OR line->>'lineId' IS NULL
      OR line->>'lineId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR line->>'variantId' IS NULL
      OR line->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (
        line ? 'countedQuantity'
        AND (
          pg_catalog.jsonb_typeof(line->'countedQuantity')<>'number'
          OR (line->>'countedQuantity')!~'^[0-9]+$'
          OR (line->>'countedQuantity')::numeric NOT BETWEEN 0 AND 2147483647
        )
      )
  ) THEN RETURN false; END IF;
  IF (
    SELECT pg_catalog.count(DISTINCT line->>'lineId')
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
  )<>line_count OR (
    SELECT pg_catalog.count(DISTINCT line->>'variantId')
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
  )<>line_count THEN RETURN false; END IF;
  RETURN true;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.inventory_transfer_lines_valid(p_lines jsonb)
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
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(line))<>3
      OR EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_object_keys(line) AS key
        WHERE key NOT IN('lineId','variantId','quantity')
      )
      OR line->>'lineId' IS NULL
      OR line->>'lineId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR line->>'variantId' IS NULL
      OR line->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(line->'quantity')<>'number'
      OR (line->>'quantity')!~'^[0-9]+$'
      OR (line->>'quantity')::numeric NOT BETWEEN 1 AND 2147483647
  ) THEN RETURN false; END IF;
  IF (
    SELECT pg_catalog.count(DISTINCT line->>'lineId')
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
  )<>line_count OR (
    SELECT pg_catalog.count(DISTINCT line->>'variantId')
    FROM pg_catalog.jsonb_array_elements(p_lines) AS line
  )<>line_count THEN RETURN false; END IF;
  RETURN true;
EXCEPTION
  WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN false;
END
$f$;

CREATE FUNCTION saas.inventory_count_projection(p_store_id uuid,p_count_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',inventory_count.id,
    'locationId',inventory_count.location_id,
    'status',inventory_count.status,
    'lines',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'id',line.id,
          'variantId',line.variant_id,
          'expectedQuantity',line.expected_quantity,
          'countedQuantity',line.counted_quantity
        ))
        ORDER BY line.variant_id
      )
      FROM saas.inventory_count_lines AS line
      WHERE line.store_id=inventory_count.store_id
        AND line.inventory_count_id=inventory_count.id
    ),'[]'::jsonb),
    'version',inventory_count.version,
    'createdAt',saas.merchant_admin_timestamp(inventory_count.created_at),
    'updatedAt',saas.merchant_admin_timestamp(inventory_count.updated_at)
  )
  FROM saas.inventory_counts AS inventory_count
  WHERE inventory_count.store_id=p_store_id AND inventory_count.id=p_count_id
$f$;

CREATE FUNCTION saas.inventory_transfer_projection(
  p_store_id uuid,p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',transfer.id,
    'sourceLocationId',transfer.source_location_id,
    'destinationLocationId',transfer.destination_location_id,
    'status',transfer.status,
    'lines',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',line.id,
          'variantId',line.variant_id,
          'quantity',line.quantity
        )
        ORDER BY line.variant_id
      )
      FROM saas.inventory_transfer_lines AS line
      WHERE line.store_id=transfer.store_id
        AND line.inventory_transfer_id=transfer.id
    ),'[]'::jsonb),
    'version',transfer.version,
    'createdAt',saas.merchant_admin_timestamp(transfer.created_at),
    'updatedAt',saas.merchant_admin_timestamp(transfer.updated_at)
  )
  FROM saas.inventory_transfers AS transfer
  WHERE transfer.store_id=p_store_id AND transfer.id=p_transfer_id
$f$;

CREATE FUNCTION saas.inventory_count_mutation_projection(
  p_store_id uuid,p_count_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',inventory_count.id,
    'status',inventory_count.status,
    'version',inventory_count.version,
    'updatedAt',saas.merchant_admin_timestamp(inventory_count.updated_at),
    'replayed',p_replayed
  )
  FROM saas.inventory_counts AS inventory_count
  WHERE inventory_count.store_id=p_store_id AND inventory_count.id=p_count_id
$f$;

CREATE FUNCTION saas.inventory_transfer_mutation_projection(
  p_store_id uuid,p_transfer_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',transfer.id,
    'status',transfer.status,
    'version',transfer.version,
    'updatedAt',saas.merchant_admin_timestamp(transfer.updated_at),
    'replayed',p_replayed
  )
  FROM saas.inventory_transfers AS transfer
  WHERE transfer.store_id=p_store_id AND transfer.id=p_transfer_id
$f$;

CREATE FUNCTION saas.inventory_counts_list(
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
        saas.inventory_count_projection(p_store_id,listed.id)
        ORDER BY listed.updated_at DESC,listed.id DESC
      )
      FROM (
        SELECT id,updated_at
        FROM saas.inventory_counts
        WHERE store_id=p_store_id
        ORDER BY updated_at DESC,id DESC
        LIMIT 200
      ) AS listed
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.inventory_counts_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_count_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_count_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  projection:=saas.inventory_count_projection(p_store_id,p_count_id);
  IF projection IS NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'found',projection;
  END IF;
END
$f$;

CREATE FUNCTION saas.inventory_transfers_list(
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
        saas.inventory_transfer_projection(p_store_id,listed.id)
        ORDER BY listed.updated_at DESC,listed.id DESC
      )
      FROM (
        SELECT id,updated_at
        FROM saas.inventory_transfers
        WHERE store_id=p_store_id
        ORDER BY updated_at DESC,id DESC
        LIMIT 200
      ) AS listed
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.inventory_transfers_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_transfer_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_transfer_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  projection:=saas.inventory_transfer_projection(p_store_id,p_transfer_id);
  IF projection IS NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'found',projection;
  END IF;
END
$f$;

CREATE FUNCTION saas.inventory_counts_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_count_id uuid,p_expected_version bigint,
  p_location_id uuid,p_lines jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_count saas.inventory_counts%ROWTYPE;
  requested_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_count_id IS NULL OR p_location_id IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.inventory_count_lines_valid(p_lines) IS DISTINCT FROM true THEN
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
       AND operation.operation_kind='count_save'
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
  requested_count:=pg_catalog.jsonb_array_length(p_lines);
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
    JOIN saas.product_variants AS variant
      ON variant.store_id=p_store_id
     AND variant.id=(requested->>'variantId')::uuid
     AND variant.status='active'
     AND variant.stock_tracking
    JOIN saas.inventory_balances AS balance
      ON balance.store_id=variant.store_id
     AND balance.location_id=p_location_id
     AND balance.variant_id=variant.id
  )<>requested_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO current_count
  FROM saas.inventory_counts
  WHERE store_id=p_store_id AND id=p_count_id
  FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS NULL OR current_count.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF current_count.status NOT IN('draft','counting') THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    IF p_now<current_count.updated_at OR current_count.version=9007199254740991 THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    IF current_count.status='counting' THEN
      IF current_count.location_id<>p_location_id OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
        JOIN saas.inventory_count_lines AS line
          ON line.store_id=p_store_id
         AND line.inventory_count_id=p_count_id
         AND line.id=(requested->>'lineId')::uuid
         AND line.variant_id=(requested->>'variantId')::uuid
      )<>requested_count OR requested_count<>(
        SELECT pg_catalog.count(*)
        FROM saas.inventory_count_lines
        WHERE store_id=p_store_id AND inventory_count_id=p_count_id
      ) THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
      END IF;
    END IF;
  ELSIF p_expected_version IS NOT NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;

  BEGIN
    IF current_count.id IS NULL THEN
      INSERT INTO saas.inventory_counts(
        id,store_id,location_id,status,version,created_at,updated_at
      ) VALUES(
        p_count_id,p_store_id,p_location_id,'draft',1,p_now,p_now
      );
      INSERT INTO saas.inventory_count_lines(
        id,store_id,inventory_count_id,variant_id,
        expected_quantity,counted_quantity
      )
      SELECT
        (requested->>'lineId')::uuid,p_store_id,p_count_id,
        (requested->>'variantId')::uuid,balance.quantity,
        CASE WHEN requested ? 'countedQuantity'
          THEN (requested->>'countedQuantity')::bigint END
      FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
      JOIN saas.inventory_balances AS balance
        ON balance.store_id=p_store_id
       AND balance.location_id=p_location_id
       AND balance.variant_id=(requested->>'variantId')::uuid
      ORDER BY (requested->>'variantId')::uuid;
    ELSIF current_count.status='draft' THEN
      UPDATE saas.inventory_counts
      SET location_id=p_location_id,version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_count_id;
      DELETE FROM saas.inventory_count_lines
      WHERE store_id=p_store_id AND inventory_count_id=p_count_id;
      INSERT INTO saas.inventory_count_lines(
        id,store_id,inventory_count_id,variant_id,
        expected_quantity,counted_quantity
      )
      SELECT
        (requested->>'lineId')::uuid,p_store_id,p_count_id,
        (requested->>'variantId')::uuid,balance.quantity,
        CASE WHEN requested ? 'countedQuantity'
          THEN (requested->>'countedQuantity')::bigint END
      FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
      JOIN saas.inventory_balances AS balance
        ON balance.store_id=p_store_id
       AND balance.location_id=p_location_id
       AND balance.variant_id=(requested->>'variantId')::uuid
      ORDER BY (requested->>'variantId')::uuid;
    ELSE
      UPDATE saas.inventory_count_lines AS line
      SET counted_quantity=CASE WHEN requested ? 'countedQuantity'
        THEN (requested->>'countedQuantity')::bigint END
      FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
      WHERE line.store_id=p_store_id
        AND line.inventory_count_id=p_count_id
        AND line.id=(requested->>'lineId')::uuid
        AND line.variant_id=(requested->>'variantId')::uuid;
      UPDATE saas.inventory_counts
      SET version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_count_id;
    END IF;
  EXCEPTION
    WHEN unique_violation OR foreign_key_violation OR check_violation
      OR numeric_value_out_of_range OR datetime_field_overflow THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;

  projection:=saas.inventory_count_mutation_projection(
    p_store_id,p_count_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'count_save',p_fingerprint,
    p_count_id,projection,p_now
  );
  RETURN QUERY SELECT 'saved',projection;
END
$f$;

CREATE FUNCTION saas.inventory_counts_start(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_count_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_count saas.inventory_counts%ROWTYPE;
  variant_ids uuid[];
  line_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_count_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
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
       AND operation.operation_kind='count_start'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_count
  FROM saas.inventory_counts
  WHERE store_id=p_store_id AND id=p_count_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_count.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_count.status<>'draft' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_count.updated_at OR current_count.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.id=current_count.location_id
  ORDER BY location.id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM saas.inventory_locations
    WHERE store_id=p_store_id AND id=current_count.location_id AND status='active'
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id),
         pg_catalog.count(*)
  INTO variant_ids,line_count
  FROM saas.inventory_count_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_count_id=p_count_id;
  IF line_count NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
  ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
      AND variant.status='active' AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.inventory_balances AS balance
  WHERE balance.store_id=p_store_id
    AND balance.location_id=current_count.location_id
    AND balance.variant_id=ANY(variant_ids)
  ORDER BY balance.variant_id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.inventory_balances AS balance
    WHERE balance.store_id=p_store_id
      AND balance.location_id=current_count.location_id
      AND balance.variant_id=ANY(variant_ids)
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.inventory_count_lines AS line
  SET expected_quantity=balance.quantity,counted_quantity=NULL
  FROM saas.inventory_balances AS balance
  WHERE line.store_id=p_store_id
    AND line.inventory_count_id=p_count_id
    AND balance.store_id=line.store_id
    AND balance.location_id=current_count.location_id
    AND balance.variant_id=line.variant_id;
  UPDATE saas.inventory_counts
  SET status='counting',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_count_id;

  projection:=saas.inventory_count_mutation_projection(
    p_store_id,p_count_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'count_start',p_fingerprint,
    p_count_id,projection,p_now
  );
  RETURN QUERY SELECT 'started',projection;
END
$f$;

CREATE FUNCTION saas.inventory_counts_commit(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_count_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_count saas.inventory_counts%ROWTYPE;
  variant_ids uuid[];
  line_count integer;
  updated_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_count_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
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
       AND operation.operation_kind='count_commit'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_count
  FROM saas.inventory_counts
  WHERE store_id=p_store_id AND id=p_count_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_count.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_count.status<>'counting' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_count.updated_at OR current_count.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.id=current_count.location_id
  ORDER BY location.id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM saas.inventory_locations
    WHERE store_id=p_store_id AND id=current_count.location_id AND status='active'
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id),
         pg_catalog.count(*)
  INTO variant_ids,line_count
  FROM saas.inventory_count_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_count_id=p_count_id;
  IF line_count NOT BETWEEN 1 AND 500 OR EXISTS(
    SELECT 1 FROM saas.inventory_count_lines
    WHERE store_id=p_store_id AND inventory_count_id=p_count_id
      AND counted_quantity IS NULL
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
  ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
      AND variant.status='active' AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_balances AS balance
  WHERE balance.store_id=p_store_id
    AND balance.location_id=current_count.location_id
    AND balance.variant_id=ANY(variant_ids)
  ORDER BY balance.variant_id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.inventory_balances AS balance
    WHERE balance.store_id=p_store_id
      AND balance.location_id=current_count.location_id
      AND balance.variant_id=ANY(variant_ids)
  )<>line_count THEN
    RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1
    FROM saas.inventory_count_lines AS line
    JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_count.location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_count_id=p_count_id
      AND balance.quantity<>line.expected_quantity
  ) THEN
    RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.inventory_count_lines AS line
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_count_id=p_count_id
      AND (
        variant.version=9007199254740991
        OR variant.stock_quantity::numeric+
          line.counted_quantity::numeric-line.expected_quantity::numeric
          NOT BETWEEN 0 AND 2147483647
      )
  ) OR EXISTS(
    SELECT 1
    FROM saas.inventory_count_lines AS line
    JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_count.location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_count_id=p_count_id
      AND balance.version=9007199254740991
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.inventory_count_lines AS line
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_count_id=p_count_id
      AND variant.stock_quantity::numeric+
          line.counted_quantity::numeric-line.expected_quantity::numeric<
        COALESCE((
          SELECT pg_catalog.sum(reservation.quantity::numeric)
          FROM saas.checkout_inventory_reservations AS reservation
          WHERE reservation.store_id=variant.store_id
            AND reservation.variant_id=variant.id
            AND reservation.stock_tracked
            AND reservation.status='held'
        ),0)
  ) THEN
    RETURN QUERY SELECT 'active_hold_conflict',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.inventory_balances AS balance
  SET quantity=line.counted_quantity,
      version=balance.version+1,
      updated_at=p_now
  FROM saas.inventory_count_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_count_id=p_count_id
    AND balance.store_id=line.store_id
    AND balance.location_id=current_count.location_id
    AND balance.variant_id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled count balance transition';
  END IF;

  INSERT INTO saas.inventory_movements(
    id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
    source_kind,source_id,occurred_at,created_at
  )
  SELECT
    saas.inventory_deterministic_uuid(
      'inventory-source-movement',
      'count_adjustment:'||p_count_id::text||':'||line.variant_id::text||':'||
        current_count.location_id::text||':'||
        CASE WHEN line.counted_quantity>line.expected_quantity THEN 'in' ELSE 'out' END
    ),
    p_store_id,current_count.location_id,line.variant_id,'count_adjustment',
    CASE WHEN line.counted_quantity>line.expected_quantity THEN 'in' ELSE 'out' END,
    line.counted_quantity-line.expected_quantity,
    'count_adjustment',p_count_id,p_now,p_now
  FROM saas.inventory_count_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_count_id=p_count_id
    AND line.counted_quantity<>line.expected_quantity
  ORDER BY line.variant_id;

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
  UPDATE saas.product_variants AS variant
  SET stock_quantity=variant.stock_quantity+
        line.counted_quantity-line.expected_quantity,
      version=variant.version+1,
      updated_at=p_now
  FROM saas.inventory_count_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_count_id=p_count_id
    AND variant.store_id=line.store_id
    AND variant.id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled count aggregate transition';
  END IF;

  UPDATE saas.inventory_counts
  SET status='committed',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_count_id;
  projection:=saas.inventory_count_mutation_projection(
    p_store_id,p_count_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'count_commit',p_fingerprint,
    p_count_id,projection,p_now
  );
  RETURN QUERY SELECT 'committed',projection;
END
$f$;

CREATE FUNCTION saas.inventory_counts_cancel(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_count_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_count saas.inventory_counts%ROWTYPE;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_count_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='count_cancel'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO current_count
  FROM saas.inventory_counts
  WHERE store_id=p_store_id AND id=p_count_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_count.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_count.status NOT IN('draft','counting') THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_count.updated_at OR current_count.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.inventory_counts
  SET status='cancelled',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_count_id;
  projection:=saas.inventory_count_mutation_projection(
    p_store_id,p_count_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'count_cancel',p_fingerprint,
    p_count_id,projection,p_now
  );
  RETURN QUERY SELECT 'cancelled',projection;
END
$f$;

CREATE FUNCTION saas.inventory_transfers_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_transfer_id uuid,
  p_expected_version bigint,p_source_location_id uuid,
  p_destination_location_id uuid,p_lines jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_transfer saas.inventory_transfers%ROWTYPE;
  requested_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_transfer_id IS NULL
     OR p_source_location_id IS NULL OR p_destination_location_id IS NULL
     OR p_source_location_id=p_destination_location_id
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.inventory_transfer_lines_valid(p_lines) IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='transfer_save'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM saas.inventory_locations
    WHERE store_id=p_store_id
      AND id IN(p_source_location_id,p_destination_location_id)
      AND status='active'
  )<>2 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  requested_count:=pg_catalog.jsonb_array_length(p_lines);
  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
    JOIN saas.product_variants AS variant
      ON variant.store_id=p_store_id
     AND variant.id=(requested->>'variantId')::uuid
     AND variant.status='active'
     AND variant.stock_tracking
  )<>requested_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO current_transfer
  FROM saas.inventory_transfers
  WHERE store_id=p_store_id AND id=p_transfer_id
  FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS NULL OR current_transfer.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF current_transfer.status<>'draft' THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    IF p_now<current_transfer.updated_at
       OR current_transfer.version=9007199254740991 THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
  ELSIF p_expected_version IS NOT NULL THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;

  BEGIN
    IF current_transfer.id IS NULL THEN
      INSERT INTO saas.inventory_transfers(
        id,store_id,source_location_id,destination_location_id,
        status,version,created_at,updated_at
      ) VALUES(
        p_transfer_id,p_store_id,p_source_location_id,p_destination_location_id,
        'draft',1,p_now,p_now
      );
    ELSE
      UPDATE saas.inventory_transfers
      SET source_location_id=p_source_location_id,
          destination_location_id=p_destination_location_id,
          version=version+1,
          updated_at=p_now
      WHERE store_id=p_store_id AND id=p_transfer_id;
      DELETE FROM saas.inventory_transfer_lines
      WHERE store_id=p_store_id AND inventory_transfer_id=p_transfer_id;
    END IF;
    INSERT INTO saas.inventory_transfer_lines(
      id,store_id,inventory_transfer_id,variant_id,quantity
    )
    SELECT
      (requested->>'lineId')::uuid,p_store_id,p_transfer_id,
      (requested->>'variantId')::uuid,(requested->>'quantity')::bigint
    FROM pg_catalog.jsonb_array_elements(p_lines) AS requested
    ORDER BY (requested->>'variantId')::uuid;
  EXCEPTION
    WHEN unique_violation OR foreign_key_violation OR check_violation
      OR numeric_value_out_of_range OR datetime_field_overflow THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;

  projection:=saas.inventory_transfer_mutation_projection(
    p_store_id,p_transfer_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'transfer_save',p_fingerprint,
    p_transfer_id,projection,p_now
  );
  RETURN QUERY SELECT 'saved',projection;
END
$f$;

CREATE FUNCTION saas.inventory_transfers_dispatch(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_transfer_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_transfer saas.inventory_transfers%ROWTYPE;
  variant_ids uuid[];
  line_count integer;
  updated_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_transfer_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='transfer_dispatch'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_transfer
  FROM saas.inventory_transfers
  WHERE store_id=p_store_id AND id=p_transfer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.status<>'draft' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_transfer.updated_at
     OR current_transfer.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
  ORDER BY location.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.inventory_locations
    WHERE store_id=p_store_id
      AND id IN(
        current_transfer.source_location_id,
        current_transfer.destination_location_id
      )
      AND status='active'
  )<>2 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id),
         pg_catalog.count(*)
  INTO variant_ids,line_count
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id;
  IF line_count NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
  ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
      AND variant.status='active' AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.inventory_balances AS balance
  WHERE balance.store_id=p_store_id
    AND balance.location_id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
    AND balance.variant_id=ANY(variant_ids)
  ORDER BY balance.location_id,balance.variant_id FOR UPDATE;

  IF EXISTS(
    SELECT 1
    FROM saas.inventory_transfer_lines AS line
    LEFT JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_transfer.source_location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND COALESCE(balance.quantity,0)<line.quantity
  ) THEN
    RETURN QUERY SELECT 'insufficient_stock',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1
    FROM saas.inventory_transfer_lines AS line
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_transfer.source_location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND (
        variant.version=9007199254740991
        OR balance.version=9007199254740991
        OR variant.stock_quantity::numeric-line.quantity::numeric<0
      )
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1
    FROM saas.inventory_transfer_lines AS line
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND variant.stock_quantity::numeric-line.quantity::numeric<
        COALESCE((
          SELECT pg_catalog.sum(reservation.quantity::numeric)
          FROM saas.checkout_inventory_reservations AS reservation
          WHERE reservation.store_id=variant.store_id
            AND reservation.variant_id=variant.id
            AND reservation.stock_tracked
            AND reservation.status='held'
        ),0)
  ) THEN
    RETURN QUERY SELECT 'active_hold_conflict',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.inventory_balances AS balance
  SET quantity=balance.quantity-line.quantity,
      version=balance.version+1,
      updated_at=p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_transfer_id=p_transfer_id
    AND balance.store_id=line.store_id
    AND balance.location_id=current_transfer.source_location_id
    AND balance.variant_id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled transfer source transition';
  END IF;

  INSERT INTO saas.inventory_movements(
    id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
    source_kind,source_id,occurred_at,created_at
  )
  SELECT
    saas.inventory_deterministic_uuid(
      'inventory-source-movement',
      'transfer_out:'||p_transfer_id::text||':'||line.variant_id::text||':'||
        current_transfer.source_location_id::text||':out'
    ),
    p_store_id,current_transfer.source_location_id,line.variant_id,
    'transfer_out','out',-line.quantity,
    'transfer',p_transfer_id,p_now,p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id
  ORDER BY line.variant_id;

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
  UPDATE saas.product_variants AS variant
  SET stock_quantity=variant.stock_quantity-line.quantity,
      version=variant.version+1,
      updated_at=p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_transfer_id=p_transfer_id
    AND variant.store_id=line.store_id
    AND variant.id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled transfer dispatch aggregate';
  END IF;

  UPDATE saas.inventory_transfers
  SET status='in_transit',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_transfer_id;
  projection:=saas.inventory_transfer_mutation_projection(
    p_store_id,p_transfer_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'transfer_dispatch',p_fingerprint,
    p_transfer_id,projection,p_now
  );
  RETURN QUERY SELECT 'dispatched',projection;
END
$f$;

CREATE FUNCTION saas.inventory_transfers_receive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_transfer_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_transfer saas.inventory_transfers%ROWTYPE;
  variant_ids uuid[];
  line_count integer;
  updated_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_transfer_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='transfer_receive'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_transfer
  FROM saas.inventory_transfers
  WHERE store_id=p_store_id AND id=p_transfer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.status<>'in_transit' THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_transfer.updated_at
     OR current_transfer.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
  ORDER BY location.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.inventory_locations
    WHERE store_id=p_store_id
      AND id IN(
        current_transfer.source_location_id,
        current_transfer.destination_location_id
      )
      AND status='active'
  )<>2 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id),
         pg_catalog.count(*)
  INTO variant_ids,line_count
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id;
  IF line_count NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
  ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
      AND variant.status='active' AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.inventory_balances AS balance
  WHERE balance.store_id=p_store_id
    AND balance.location_id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
    AND balance.variant_id=ANY(variant_ids)
  ORDER BY balance.location_id,balance.variant_id FOR UPDATE;

  IF EXISTS(
    SELECT 1
    FROM saas.inventory_transfer_lines AS line
    JOIN saas.product_variants AS variant
      ON variant.store_id=line.store_id AND variant.id=line.variant_id
    LEFT JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_transfer.destination_location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND (
        variant.version=9007199254740991
        OR variant.stock_quantity::numeric+line.quantity::numeric>2147483647
        OR COALESCE(balance.quantity,0)::numeric+line.quantity::numeric>2147483647
        OR balance.version=9007199254740991
      )
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  INSERT INTO saas.inventory_balances(
    store_id,location_id,variant_id,quantity,version,updated_at
  )
  SELECT p_store_id,current_transfer.destination_location_id,variant_id,0,1,p_now
  FROM pg_catalog.unnest(variant_ids) AS requested(variant_id)
  ORDER BY variant_id
  ON CONFLICT (store_id,location_id,variant_id) DO NOTHING;

  UPDATE saas.inventory_balances AS balance
  SET quantity=balance.quantity+line.quantity,
      version=balance.version+1,
      updated_at=p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_transfer_id=p_transfer_id
    AND balance.store_id=line.store_id
    AND balance.location_id=current_transfer.destination_location_id
    AND balance.variant_id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled transfer destination transition';
  END IF;

  INSERT INTO saas.inventory_movements(
    id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
    source_kind,source_id,occurred_at,created_at
  )
  SELECT
    saas.inventory_deterministic_uuid(
      'inventory-source-movement',
      'transfer_in:'||p_transfer_id::text||':'||line.variant_id::text||':'||
        current_transfer.destination_location_id::text||':in'
    ),
    p_store_id,current_transfer.destination_location_id,line.variant_id,
    'transfer_in','in',line.quantity,
    'transfer',p_transfer_id,p_now,p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id
  ORDER BY line.variant_id;

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
  UPDATE saas.product_variants AS variant
  SET stock_quantity=variant.stock_quantity+line.quantity,
      version=variant.version+1,
      updated_at=p_now
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id
    AND line.inventory_transfer_id=p_transfer_id
    AND variant.store_id=line.store_id
    AND variant.id=line.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  IF updated_count<>line_count THEN
    RAISE check_violation USING MESSAGE='controlled transfer receive aggregate';
  END IF;

  UPDATE saas.inventory_transfers
  SET status='received',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_transfer_id;
  projection:=saas.inventory_transfer_mutation_projection(
    p_store_id,p_transfer_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'transfer_receive',p_fingerprint,
    p_transfer_id,projection,p_now
  );
  RETURN QUERY SELECT 'received',projection;
END
$f$;

CREATE FUNCTION saas.inventory_transfers_cancel(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_transfer_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_operations%ROWTYPE;
  current_transfer saas.inventory_transfers%ROWTYPE;
  variant_ids uuid[];
  line_count integer;
  updated_count integer;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_transfer_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id
       AND operation.operation_kind='transfer_cancel'
       AND operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_transfer
  FROM saas.inventory_transfers
  WHERE store_id=p_store_id AND id=p_transfer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_transfer.status NOT IN('draft','in_transit') THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_transfer.updated_at
     OR current_transfer.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id
    AND location.id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
  ORDER BY location.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.inventory_locations
    WHERE store_id=p_store_id
      AND id IN(
        current_transfer.source_location_id,
        current_transfer.destination_location_id
      )
      AND status='active'
  )<>2 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.array_agg(line.variant_id ORDER BY line.variant_id),
         pg_catalog.count(*)
  INTO variant_ids,line_count
  FROM saas.inventory_transfer_lines AS line
  WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id;
  IF line_count NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
  ORDER BY variant.id FOR UPDATE;
  IF (
    SELECT pg_catalog.count(*) FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.id=ANY(variant_ids)
      AND variant.status='active' AND variant.stock_tracking
  )<>line_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.inventory_balances AS balance
  WHERE balance.store_id=p_store_id
    AND balance.location_id IN(
      current_transfer.source_location_id,
      current_transfer.destination_location_id
    )
    AND balance.variant_id=ANY(variant_ids)
  ORDER BY balance.location_id,balance.variant_id FOR UPDATE;

  IF current_transfer.status='in_transit' THEN
    IF EXISTS(
      SELECT 1
      FROM saas.inventory_transfer_lines AS line
      JOIN saas.product_variants AS variant
        ON variant.store_id=line.store_id AND variant.id=line.variant_id
      LEFT JOIN saas.inventory_balances AS balance
        ON balance.store_id=line.store_id
       AND balance.location_id=current_transfer.source_location_id
       AND balance.variant_id=line.variant_id
      WHERE line.store_id=p_store_id
        AND line.inventory_transfer_id=p_transfer_id
        AND (
          variant.version=9007199254740991
          OR variant.stock_quantity::numeric+line.quantity::numeric>2147483647
          OR COALESCE(balance.quantity,0)::numeric+line.quantity::numeric>2147483647
          OR balance.version=9007199254740991
        )
    ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    INSERT INTO saas.inventory_balances(
      store_id,location_id,variant_id,quantity,version,updated_at
    )
    SELECT p_store_id,current_transfer.source_location_id,variant_id,0,1,p_now
    FROM pg_catalog.unnest(variant_ids) AS requested(variant_id)
    ORDER BY variant_id
    ON CONFLICT (store_id,location_id,variant_id) DO NOTHING;
    UPDATE saas.inventory_balances AS balance
    SET quantity=balance.quantity+line.quantity,
        version=balance.version+1,
        updated_at=p_now
    FROM saas.inventory_transfer_lines AS line
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND balance.store_id=line.store_id
      AND balance.location_id=current_transfer.source_location_id
      AND balance.variant_id=line.variant_id;
    GET DIAGNOSTICS updated_count=ROW_COUNT;
    IF updated_count<>line_count THEN
      RAISE check_violation USING MESSAGE='controlled transfer return transition';
    END IF;

    INSERT INTO saas.inventory_movements(
      id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
      source_kind,source_id,occurred_at,created_at
    )
    SELECT
      saas.inventory_deterministic_uuid(
        'inventory-source-movement',
        'transfer_return:'||p_transfer_id::text||':'||line.variant_id::text||':'||
          current_transfer.source_location_id::text||':in'
      ),
      p_store_id,current_transfer.source_location_id,line.variant_id,
      'transfer_return','in',line.quantity,
      'transfer',p_transfer_id,p_now,p_now
    FROM saas.inventory_transfer_lines AS line
    WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id
    ORDER BY line.variant_id;

    PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
    UPDATE saas.product_variants AS variant
    SET stock_quantity=variant.stock_quantity+line.quantity,
        version=variant.version+1,
        updated_at=p_now
    FROM saas.inventory_transfer_lines AS line
    WHERE line.store_id=p_store_id
      AND line.inventory_transfer_id=p_transfer_id
      AND variant.store_id=line.store_id
      AND variant.id=line.variant_id;
    GET DIAGNOSTICS updated_count=ROW_COUNT;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    IF updated_count<>line_count THEN
      RAISE check_violation USING MESSAGE='controlled transfer return aggregate';
    END IF;
  ELSE
    -- Keep the aggregate marker finite in every lifecycle implementation.
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','inventory_managed',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  END IF;

  UPDATE saas.inventory_transfers
  SET status='cancelled',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_transfer_id;
  projection:=saas.inventory_transfer_mutation_projection(
    p_store_id,p_transfer_id,false
  );
  INSERT INTO saas.inventory_operations(
    operation_id,store_id,operation_kind,payload_fingerprint,
    result_entity_id,result_payload,committed_at
  ) VALUES(
    p_operation_id,p_store_id,'transfer_cancel',p_fingerprint,
    p_transfer_id,projection,p_now
  );
  RETURN QUERY SELECT 'cancelled',projection;
END
$f$;

DO $immutability$
DECLARE movement_guard text; operation_guard text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'saas.guard_inventory_movement_mutation()'::regprocedure
  ) INTO movement_guard;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.guard_inventory_operation_mutation()'::regprocedure
  ) INTO operation_guard;
  IF movement_guard NOT LIKE '%INVENTORY_MOVEMENT_IMMUTABLE%'
     OR operation_guard NOT LIKE '%INVENTORY_OPERATION_IMMUTABLE%'
     OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='saas.inventory_movements'::regclass
         AND tgname='inventory_movements_immutable'
         AND tgenabled='O' AND NOT tgisinternal
     ) OR NOT EXISTS(
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid='saas.inventory_operations'::regclass
         AND tgname='inventory_operations_immutable'
         AND tgenabled='O' AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'INVENTORY_LEDGER_IMMUTABILITY_REQUIRED';
  END IF;
END
$immutability$;

REVOKE ALL ON FUNCTION
  saas.inventory_count_lines_valid(jsonb),
  saas.inventory_transfer_lines_valid(jsonb),
  saas.inventory_count_projection(uuid,uuid),
  saas.inventory_transfer_projection(uuid,uuid),
  saas.inventory_count_mutation_projection(uuid,uuid,boolean),
  saas.inventory_transfer_mutation_projection(uuid,uuid,boolean)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

REVOKE ALL ON FUNCTION
  saas.inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb),
  saas.inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,uuid,jsonb),
  saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb),
  saas.inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,uuid,jsonb),
  saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)
TO celebix_saas_app;

COMMIT;
