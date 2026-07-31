BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $order_neighbors_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.orders') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NULL THEN
    RAISE EXCEPTION 'ORDER_NEIGHBORS_PRECONDITION_FAILED';
  END IF;
END
$order_neighbors_precondition$;

CREATE FUNCTION saas.orders_get_neighbors(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_order_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $order_neighbors$
DECLARE
  authority_error text;
  current_order saas.orders%ROWTYPE;
  previous_id uuid;
  previous_number text;
  next_id uuid;
  next_number text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'orders','orders.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  IF p_order_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT selected.*
    INTO current_order
  FROM saas.orders AS selected
  WHERE selected.store_id = p_store_id
    AND selected.id = p_order_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.id,candidate.order_number
    INTO previous_id,previous_number
  FROM saas.orders AS candidate
  WHERE candidate.store_id = p_store_id
    AND (candidate.created_at,candidate.id) > (current_order.created_at,current_order.id)
  ORDER BY candidate.created_at ASC,candidate.id ASC
  LIMIT 1;

  SELECT candidate.id,candidate.order_number
    INTO next_id,next_number
  FROM saas.orders AS candidate
  WHERE candidate.store_id = p_store_id
    AND (candidate.created_at,candidate.id) < (current_order.created_at,current_order.id)
  ORDER BY candidate.created_at DESC,candidate.id DESC
  LIMIT 1;

  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'previous',CASE WHEN previous_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',previous_id,'orderNumber',previous_number
    ) END,
    'next',CASE WHEN next_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',next_id,'orderNumber',next_number
    ) END
  ));
END
$order_neighbors$;

ALTER FUNCTION saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;

COMMIT;
