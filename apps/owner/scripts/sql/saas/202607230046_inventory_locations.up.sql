-- Durable merchant inventory-location authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.inventory_location_operations (
  store_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_location_id uuid NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT inventory_location_operations_pkey PRIMARY KEY (store_id,operation_id),
  CONSTRAINT inventory_location_operations_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT inventory_location_operations_location_fk
    FOREIGN KEY (store_id,result_location_id)
    REFERENCES saas.inventory_locations(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT inventory_location_operations_kind_check CHECK (
    operation_kind IN('location_save','location_archive')
  ),
  CONSTRAINT inventory_location_operations_fingerprint_check CHECK (
    payload_fingerprint~'^[a-f0-9]{64}$'
  ),
  CONSTRAINT inventory_location_operations_result_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=2048
    AND result_payload ?& ARRAY['id','status','version','updatedAt','replayed']
    AND result_payload->>'replayed'='false'
  ),
  CONSTRAINT inventory_location_operations_time_check CHECK (
    pg_catalog.isfinite(committed_at)
  )
);

CREATE TRIGGER inventory_location_operations_immutable
BEFORE UPDATE OR DELETE ON saas.inventory_location_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_inventory_operation_mutation();

ALTER TABLE saas.inventory_location_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.inventory_location_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.inventory_location_operations FROM PUBLIC,celebix_saas_app,
  celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.inventory_location_mutation_projection(
  p_store_id uuid,p_location_id uuid,p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'id',location.id,
    'status',location.status,
    'version',location.version,
    'updatedAt',saas.merchant_admin_timestamp(location.updated_at),
    'replayed',p_replayed
  )
  FROM saas.inventory_locations AS location
  WHERE location.store_id=p_store_id AND location.id=p_location_id
$f$;

CREATE FUNCTION saas.inventory_locations_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_location_id uuid,
  p_expected_version bigint,p_name text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_location_operations%ROWTYPE;
  current_location saas.inventory_locations%ROWTYPE;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR p_operation_id IS NULL OR p_location_id IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name)
     OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND 200
     OR p_name~'[[:cntrl:]]'
     OR (p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740990) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  -- Global operation identity first, then common store writer lock, then location row.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.location.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_location_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.operation_kind='location_save'
       AND operation.payload_fingerprint=p_fingerprint
       AND operation.result_location_id=p_location_id THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO current_location FROM saas.inventory_locations
  WHERE store_id=p_store_id AND id=p_location_id FOR UPDATE;
  IF p_expected_version IS NULL THEN
    IF FOUND THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    INSERT INTO saas.inventory_locations(
      id,store_id,name,is_default,status,version,created_at,updated_at
    ) VALUES(p_location_id,p_store_id,p_name,false,'active',1,p_now,p_now);
  ELSE
    IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
    IF current_location.version<>p_expected_version THEN
      RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
    END IF;
    IF current_location.status<>'active' OR current_location.is_default
       OR p_now<current_location.updated_at THEN
      RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
    END IF;
    UPDATE saas.inventory_locations
    SET name=p_name,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_location_id;
  END IF;
  projection:=saas.inventory_location_mutation_projection(p_store_id,p_location_id,false);
  INSERT INTO saas.inventory_location_operations(
    store_id,operation_id,operation_kind,payload_fingerprint,
    result_location_id,result_payload,committed_at
  ) VALUES(p_store_id,p_operation_id,'location_save',p_fingerprint,
    p_location_id,projection,p_now);
  RETURN QUERY SELECT 'saved',projection;
END
$f$;

CREATE FUNCTION saas.inventory_locations_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_location_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  operation saas.inventory_location_operations%ROWTYPE;
  current_location saas.inventory_locations%ROWTYPE;
  projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR p_operation_id IS NULL OR p_location_id IS NULL
     OR p_expected_version NOT BETWEEN 1 AND 9007199254740990
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.inventory.location.operation:'||p_operation_id::text,0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  SELECT * INTO operation FROM saas.inventory_location_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.operation_kind='location_archive'
       AND operation.payload_fingerprint=p_fingerprint
       AND operation.result_location_id=p_location_id THEN
      RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO current_location FROM saas.inventory_locations
  WHERE store_id=p_store_id AND id=p_location_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  IF current_location.version<>p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF current_location.status<>'active' OR current_location.is_default
     OR p_now<current_location.updated_at THEN
    RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.inventory_balances AS balance
    WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id
      AND balance.quantity<>0
  ) OR EXISTS(
    SELECT 1 FROM saas.inventory_balances AS balance
    JOIN saas.checkout_inventory_reservations AS reservation
      ON reservation.store_id=balance.store_id
     AND reservation.variant_id=balance.variant_id
     AND reservation.status='held'
    WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id
  ) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.purchase_orders
    WHERE store_id=p_store_id AND location_id=p_location_id
      AND status IN('draft','ordered','partially_received')
  ) OR EXISTS(
    SELECT 1 FROM saas.inventory_counts
    WHERE store_id=p_store_id AND location_id=p_location_id
      AND status IN('draft','counting')
  ) OR EXISTS(
    SELECT 1 FROM saas.inventory_transfers
    WHERE store_id=p_store_id
      AND (source_location_id=p_location_id OR destination_location_id=p_location_id)
      AND status IN('draft','in_transit')
  ) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.inventory_locations
  SET status='archived',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_location_id AND status='active';
  projection:=saas.inventory_location_mutation_projection(p_store_id,p_location_id,false);
  INSERT INTO saas.inventory_location_operations(
    store_id,operation_id,operation_kind,payload_fingerprint,
    result_location_id,result_payload,committed_at
  ) VALUES(p_store_id,p_operation_id,'location_archive',p_fingerprint,
    p_location_id,projection,p_now);
  RETURN QUERY SELECT 'archived',projection;
END
$f$;

CREATE FUNCTION saas.inventory_locations_recover(
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
DECLARE authority_error text; operation saas.inventory_location_operations%ROWTYPE;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_operation_id IS NULL
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.inventory_location_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.inventory_location_mutation_projection(uuid,uuid,boolean)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
REVOKE ALL ON FUNCTION
  saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
  saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

COMMIT;
