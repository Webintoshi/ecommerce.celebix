BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

CREATE TABLE saas.record_deletion_operations (
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  operation_id uuid NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('order', 'product', 'category')),
  resource_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES saas.principals(id),
  membership_id uuid NOT NULL REFERENCES saas.memberships(id),
  committed_at timestamptz NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome = 'deleted'),
  replay_count bigint NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  PRIMARY KEY (store_id, operation_id)
);

CREATE INDEX record_deletion_operations_resource_idx
  ON saas.record_deletion_operations(store_id, resource_kind, resource_id, committed_at DESC);

ALTER TABLE saas.record_deletion_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.record_deletion_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY record_deletion_operations_owner
  ON saas.record_deletion_operations
  TO celebix_saas_owner
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE saas.record_deletion_operations FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;

CREATE FUNCTION saas.guard_record_deletion_operation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'RECORD_DELETION_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER record_deletion_operations_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON saas.record_deletion_operations
FOR EACH STATEMENT EXECUTE FUNCTION saas.guard_record_deletion_operation_immutable();

CREATE FUNCTION saas.record_deletion_operation_lock(
  p_store_id uuid,
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'RECORD_DELETION_OPERATION_IDENTITY_REQUIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.record-deletion:' || p_store_id::text || ':' || p_operation_id::text,
      0
    )
  );
END
$function$;

CREATE FUNCTION saas.record_deletion_operation_replay(
  p_store_id uuid,
  p_operation_id uuid,
  p_resource_kind text,
  p_resource_id uuid,
  p_request_fingerprint text
)
RETURNS TABLE(outcome text, audit_id uuid, replay_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  operation saas.record_deletion_operations%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_resource_id IS NULL
     OR p_resource_kind IS NULL OR p_resource_kind NOT IN ('order', 'product', 'category')
     OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::uuid, 0::bigint;
    RETURN;
  END IF;

  SELECT selected.*
  INTO operation
  FROM saas.record_deletion_operations AS selected
  WHERE selected.store_id = p_store_id
    AND selected.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_not_found'::text, NULL::uuid, 0::bigint;
    RETURN;
  END IF;

  IF operation.resource_kind <> p_resource_kind
     OR operation.resource_id <> p_resource_id
     OR operation.request_fingerprint <> p_request_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::uuid, operation.replay_count;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'operation_replayed'::text, operation.operation_id, operation.replay_count + 1;
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_record_deletion_operation_immutable() FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.record_deletion_operation_lock(uuid, uuid) FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.record_deletion_operation_replay(uuid, uuid, text, uuid, text) FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;

COMMIT;
