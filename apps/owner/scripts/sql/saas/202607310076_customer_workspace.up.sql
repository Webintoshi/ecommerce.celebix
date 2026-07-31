BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $customer_workspace_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.customers') IS NULL
     OR pg_catalog.to_regclass('saas.orders') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_WORKSPACE_PRECONDITION_FAILED';
  END IF;
END
$customer_workspace_precondition$;

CREATE FUNCTION saas.customers_get_workspace(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_customer_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $customer_workspace$
DECLARE
  authority_error text;
  current_customer saas.customers%ROWTYPE;
  previous_id uuid;
  previous_name text;
  next_id uuid;
  next_name text;
  linked_orders jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'customers','customers.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT selected.*
    INTO current_customer
  FROM saas.customers AS selected
  WHERE selected.store_id = p_store_id
    AND selected.id = p_customer_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'customer_not_found'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.id,candidate.first_name || ' ' || candidate.last_name
    INTO previous_id,previous_name
  FROM saas.customers AS candidate
  WHERE candidate.store_id = p_store_id
    AND (candidate.created_at,candidate.id) > (current_customer.created_at,current_customer.id)
  ORDER BY candidate.created_at ASC,candidate.id ASC
  LIMIT 1;

  SELECT candidate.id,candidate.first_name || ' ' || candidate.last_name
    INTO next_id,next_name
  FROM saas.customers AS candidate
  WHERE candidate.store_id = p_store_id
    AND (candidate.created_at,candidate.id) < (current_customer.created_at,current_customer.id)
  ORDER BY candidate.created_at DESC,candidate.id DESC
  LIMIT 1;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',linked_order.id,
    'orderNumber',linked_order.order_number,
    'status',linked_order.status,
    'paymentStatus',linked_order.payment_status,
    'totalCents',linked_order.total_cents,
    'currency',linked_order.currency,
    'createdAt',saas.customer_json_timestamp(linked_order.created_at)
  ) ORDER BY linked_order.created_at DESC,linked_order.id DESC),'[]'::jsonb)
    INTO linked_orders
  FROM (
    SELECT linked_order.id,linked_order.order_number,linked_order.status,
           linked_order.payment_status,linked_order.total_cents,linked_order.currency,
           linked_order.created_at
    FROM saas.orders AS linked_order
    WHERE linked_order.store_id = p_store_id
      AND linked_order.customer_id = p_customer_id
    ORDER BY linked_order.created_at DESC,linked_order.id DESC
    LIMIT 50
  ) AS linked_order;

  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'neighbors',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'previous',CASE WHEN previous_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
        'id',previous_id,'displayName',previous_name
      ) END,
      'next',CASE WHEN next_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
        'id',next_id,'displayName',next_name
      ) END
    )),
    'orders',linked_orders
  );
END
$customer_workspace$;

ALTER FUNCTION saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;

COMMIT;
