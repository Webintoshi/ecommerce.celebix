-- Phase 3C1A fixes tag and segment assignment on already-migrated databases.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.customer_set_taxonomy(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_customer_id uuid,
  p_kind text,
  p_ids uuid[]
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  result jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'customers','customers.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_kind NOT IN('tag','segment')
    OR COALESCE(pg_catalog.array_length(p_ids,1),0)>50
    OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.customer_operations
    WHERE store_id=p_store_id AND operation_id=p_operation_id
  ) THEN
    RETURN QUERY
      SELECT
        CASE WHEN operation.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
        CASE WHEN operation.payload_fingerprint=p_fingerprint THEN operation.result_payload ELSE NULL END
      FROM saas.customer_operations AS operation
      WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
    RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.customers
    WHERE store_id=p_store_id AND id=p_customer_id AND status='active'
  ) OR COALESCE(pg_catalog.array_length(p_ids,1),0)<>COALESCE((
    SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_ids) AS id
  ),0) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  IF p_kind='tag' THEN
    IF EXISTS(
      SELECT 1 FROM pg_catalog.unnest(p_ids) AS id
      WHERE NOT EXISTS(
        SELECT 1 FROM saas.customer_tags AS tag
        WHERE tag.store_id=p_store_id AND tag.id=id AND tag.archived_at IS NULL
      )
    ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;
    DELETE FROM saas.customer_tag_assignments
    WHERE store_id=p_store_id AND customer_id=p_customer_id;
    INSERT INTO saas.customer_tag_assignments
      SELECT p_store_id,p_customer_id,id,p_now FROM pg_catalog.unnest(p_ids) AS id;
  ELSE
    IF EXISTS(
      SELECT 1 FROM pg_catalog.unnest(p_ids) AS id
      WHERE NOT EXISTS(
        SELECT 1 FROM saas.customer_segments AS segment
        WHERE segment.store_id=p_store_id AND segment.id=id AND segment.archived_at IS NULL
      )
    ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;
    DELETE FROM saas.customer_segment_memberships
    WHERE store_id=p_store_id AND customer_id=p_customer_id;
    INSERT INTO saas.customer_segment_memberships
      SELECT p_store_id,p_customer_id,id,p_now FROM pg_catalog.unnest(p_ids) AS id;
  END IF;
  UPDATE saas.customers
  SET version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_customer_id;
  result:=saas.customer_mutation_projection(p_store_id,p_customer_id);
  INSERT INTO saas.customer_operations
    VALUES(
      p_operation_id,p_store_id,p_customer_id,
      CASE WHEN p_kind='tag' THEN 'set_tags' ELSE 'set_segments' END,
      p_fingerprint,result,p_now
    );
  RETURN QUERY SELECT 'committed',result;
END
$function$;

ALTER FUNCTION saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,uuid[])
  OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,uuid[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,uuid[])
  TO celebix_saas_app;

COMMIT;
