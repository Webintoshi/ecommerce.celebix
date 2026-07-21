-- Phase 3B1 additive tenant order read/mutation API.
-- This migration is authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.orders_json_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.orders_cursor_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$function$;

CREATE FUNCTION saas.orders_address_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  checked_key text;
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) <> 'object'
     OR NOT (p_value ?& ARRAY['recipientName','line1','city','country']) THEN
    RETURN false;
  END IF;
  FOR checked_key IN SELECT pg_catalog.jsonb_object_keys(p_value) LOOP
    IF checked_key <> ALL (ARRAY['recipientName','line1','line2','district','city','postalCode','country']) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
    WHERE pg_catalog.jsonb_typeof(entry.value) <> 'string'
       OR entry.value #>> '{}' <> pg_catalog.btrim(entry.value #>> '{}')
       OR (entry.value #>> '{}') ~ '[[:cntrl:]]'
  ) THEN
    RETURN false;
  END IF;
  RETURN pg_catalog.char_length(p_value->>'recipientName') BETWEEN 1 AND 200
     AND pg_catalog.char_length(p_value->>'line1') BETWEEN 1 AND 300
     AND pg_catalog.char_length(p_value->>'city') BETWEEN 1 AND 200
     AND (p_value->>'country') ~ '^[A-Z]{2}$'
     AND (NOT (p_value ? 'line2') OR pg_catalog.char_length(p_value->>'line2') BETWEEN 1 AND 300)
     AND (NOT (p_value ? 'district') OR pg_catalog.char_length(p_value->>'district') BETWEEN 1 AND 200)
     AND (NOT (p_value ? 'postalCode') OR pg_catalog.char_length(p_value->>'postalCode') BETWEEN 1 AND 32)
     AND pg_catalog.pg_column_size(p_value) <= 8192;
END
$function$;

CREATE FUNCTION saas.orders_tracking_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  checked_key text;
  checked_shipped_at timestamptz;
BEGIN
  IF p_value IS NULL THEN
    RETURN true;
  END IF;
  IF pg_catalog.jsonb_typeof(p_value) <> 'object'
     OR NOT (p_value ?& ARRAY['carrier','trackingNumber']) THEN
    RETURN false;
  END IF;
  FOR checked_key IN SELECT pg_catalog.jsonb_object_keys(p_value) LOOP
    IF checked_key <> ALL (ARRAY['carrier','trackingNumber','trackingUrl','shippedAt']) THEN
      RETURN false;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
    WHERE pg_catalog.jsonb_typeof(entry.value) <> 'string'
       OR entry.value #>> '{}' <> pg_catalog.btrim(entry.value #>> '{}')
       OR (entry.value #>> '{}') ~ '[[:cntrl:]]'
  ) THEN
    RETURN false;
  END IF;
  IF p_value ? 'shippedAt' THEN
    BEGIN
      checked_shipped_at := (p_value->>'shippedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    IF saas.orders_json_timestamp(checked_shipped_at) <> p_value->>'shippedAt' THEN
      RETURN false;
    END IF;
  END IF;
  RETURN pg_catalog.char_length(p_value->>'carrier') BETWEEN 1 AND 100
     AND pg_catalog.char_length(p_value->>'trackingNumber') BETWEEN 1 AND 200
     AND (NOT (p_value ? 'trackingUrl') OR pg_catalog.char_length(p_value->>'trackingUrl') BETWEEN 1 AND 2048)
     AND (NOT (p_value ? 'shippedAt') OR (p_value->>'shippedAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.]\d{3}Z$')
     AND pg_catalog.pg_column_size(p_value) <= 8192;
END
$function$;

CREATE FUNCTION saas.orders_mutation_projection(p_store_id uuid, p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',selected_order.id,
    'status',selected_order.status,
    'paymentStatus',selected_order.payment_status,
    'version',selected_order.version,
    'updatedAt',saas.orders_json_timestamp(selected_order.updated_at)
  )
  FROM saas.orders AS selected_order
  WHERE selected_order.store_id=p_store_id AND selected_order.id=p_order_id
$function$;

CREATE FUNCTION saas.orders_detail_projection(p_store_id uuid, p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', selected_order.id,
    'orderNumber', selected_order.order_number,
    'source', selected_order.source,
    'customerName', selected_order.customer_name,
    'customerEmail', selected_order.customer_email,
    'customerPhone', selected_order.customer_phone,
    'currency', selected_order.currency,
    'subtotalCents', selected_order.subtotal_cents,
    'shippingCents', selected_order.shipping_cents,
    'discountCents', selected_order.discount_cents,
    'totalCents', selected_order.total_cents,
    'status', selected_order.status,
    'paymentStatus', selected_order.payment_status,
    'shippingAddress', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_order.shipping_address->>'recipientName',
      'line1',selected_order.shipping_address->>'line1',
      'line2',selected_order.shipping_address->>'line2',
      'district',selected_order.shipping_address->>'district',
      'city',selected_order.shipping_address->>'city',
      'postalCode',selected_order.shipping_address->>'postalCode',
      'country',selected_order.shipping_address->>'country'
    )),
    'tracking', CASE WHEN selected_order.tracking IS NULL THEN NULL ELSE pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'carrier',selected_order.tracking->>'carrier',
      'trackingNumber',selected_order.tracking->>'trackingNumber',
      'trackingUrl',selected_order.tracking->>'trackingUrl',
      'shippedAt',selected_order.tracking->>'shippedAt'
    )) END,
    'version', selected_order.version,
    'createdAt', saas.orders_json_timestamp(selected_order.created_at),
    'updatedAt', saas.orders_json_timestamp(selected_order.updated_at),
    'itemCount', (SELECT pg_catalog.count(*) FROM saas.order_items AS item_count WHERE item_count.store_id=p_store_id AND item_count.order_id=p_order_id),
    'items', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', item.id, 'position', item.position, 'productName', item.product_name,
        'variantName', item.variant_name, 'sku', item.sku, 'unitPriceCents', item.unit_price_cents,
        'quantity', item.quantity, 'discountCents', item.discount_cents, 'lineTotalCents', item.line_total_cents
      )) ORDER BY item.position, item.id), '[]'::jsonb)
      FROM (SELECT * FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id ORDER BY position,id LIMIT 100) AS item
    ),
    'events', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', event.id,
        'type', CASE event.event_type WHEN 'status_transition' THEN 'status_changed' WHEN 'payment_transition' THEN 'payment_changed' ELSE event.event_type END,
        'message', event.message,
        'createdAt', saas.orders_json_timestamp(event.created_at)
      ) ORDER BY event.created_at, event.id), '[]'::jsonb)
      FROM (SELECT * FROM saas.order_events WHERE store_id=p_store_id AND order_id=p_order_id ORDER BY created_at,id LIMIT 200) AS event
    ),
    'notes', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', note.id, 'body', note.body,
        'createdAt', saas.orders_json_timestamp(note.created_at),
        'updatedAt', saas.orders_json_timestamp(note.updated_at)
      ) ORDER BY note.created_at, note.id), '[]'::jsonb)
      FROM (SELECT * FROM saas.order_notes WHERE store_id=p_store_id AND order_id=p_order_id AND archived_at IS NULL ORDER BY created_at,id LIMIT 100) AS note
    )
  ))
  FROM saas.orders AS selected_order
  WHERE selected_order.store_id=p_store_id AND selected_order.id=p_order_id
$function$;

CREATE FUNCTION saas.orders_get_dashboard_summary(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  store_currency text;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT store.currency INTO store_currency FROM saas.stores AS store WHERE store.id=p_store_id;
  RETURN QUERY
  SELECT 'summarized'::text, pg_catalog.jsonb_build_object(
    'totalOrders', pg_catalog.count(*),
    'pendingOrders', pg_catalog.count(*) FILTER (WHERE order_row.status='pending'),
    'fulfilledOrders', pg_catalog.count(*) FILTER (WHERE order_row.status='delivered'),
    'revenueCents', COALESCE(pg_catalog.sum(order_row.total_cents) FILTER (WHERE order_row.status='delivered' AND order_row.payment_status='completed'),0),
    'currency', store_currency,
    'asOf', saas.orders_json_timestamp(p_now)
  )
  FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id;
END
$function$;

CREATE FUNCTION saas.orders_list(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_search text, p_page_size bigint, p_cursor_created_at timestamptz, p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  page_items jsonb;
  has_more boolean;
  last_created_at timestamptz;
  last_id uuid;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']))
     OR (p_search IS NOT NULL AND (p_search <> pg_catalog.btrim(p_search) OR pg_catalog.char_length(p_search) NOT BETWEEN 1 AND 200 OR p_search ~ '[[:cntrl:]]'))
     OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  WITH candidates AS (
    SELECT order_row.*
    FROM saas.orders AS order_row
    WHERE order_row.store_id=p_store_id
      AND (p_status IS NULL OR order_row.status=p_status)
      AND (p_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',order_row.order_number,order_row.customer_name,order_row.customer_email,order_row.customer_phone)),pg_catalog.lower(p_search)) > 0)
      AND (p_cursor_created_at IS NULL OR (order_row.created_at,order_row.id) < (p_cursor_created_at,p_cursor_id))
    ORDER BY order_row.created_at DESC,order_row.id DESC
    LIMIT p_page_size+1
  ), page AS (
    SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT p_page_size
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',page.id,'orderNumber',page.order_number,'source',page.source,
      'customerName',page.customer_name,'customerEmail',page.customer_email,
      'currency',page.currency,'totalCents',page.total_cents,'status',page.status,
      'paymentStatus',page.payment_status,
      'itemCount',(SELECT pg_catalog.count(*) FROM saas.order_items AS item WHERE item.store_id=p_store_id AND item.order_id=page.id),
      'createdAt',saas.orders_json_timestamp(page.created_at),'updatedAt',saas.orders_json_timestamp(page.updated_at),'version',page.version
    ) ORDER BY page.created_at DESC,page.id DESC),'[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_page_size FROM candidates),
    (SELECT tail.created_at FROM page AS tail ORDER BY tail.created_at,tail.id LIMIT 1),
    (SELECT tail.id FROM page AS tail ORDER BY tail.created_at,tail.id LIMIT 1)
  INTO page_items,has_more,last_created_at,last_id
  FROM page;
  result_payload := pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN
    result_payload := result_payload || pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('createdAt',saas.orders_cursor_timestamp(last_created_at),'id',last_id));
  END IF;
  RETURN QUERY SELECT 'listed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.orders_get(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz, p_order_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  result_payload := saas.orders_detail_projection(p_store_id,p_order_id);
  IF result_payload IS NULL THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.orders_transition_status(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_expected_version bigint, p_next_status text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; required_action text; stored_action text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  required_action := CASE WHEN p_next_status IN ('cancelled','refunded') THEN 'orders.manage' ELSE 'orders.fulfill' END;
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',required_action);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_next_status IS NULL OR p_next_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN
    stored_action:=CASE
      WHEN existing.operation_kind='transition_status' AND existing.result_payload->>'status' IN ('cancelled','refunded') THEN 'orders.manage'
      WHEN existing.operation_kind='transition_status' THEN 'orders.fulfill'
      WHEN existing.operation_kind='transition_payment' THEN 'orders.payment'
      WHEN existing.operation_kind='update_shipping' THEN 'orders.fulfill'
      ELSE 'orders.note'
    END;
    authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',stored_action);
    IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
    IF existing.operation_kind='transition_status' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF NOT ((current_order.status='pending' AND p_next_status IN ('confirmed','cancelled')) OR (current_order.status='confirmed' AND p_next_status IN ('preparing','cancelled')) OR (current_order.status='preparing' AND p_next_status IN ('shipped','cancelled')) OR (current_order.status='shipped' AND p_next_status='delivered') OR (current_order.status='delivered' AND p_next_status='refunded')) THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.orders SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'status_transition',current_order.status,p_next_status,'Order status changed to '||p_next_status,pg_catalog.jsonb_build_object('from',current_order.status,'to',p_next_status),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'transition_status',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.orders_transition_payment(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_expected_version bigint, p_next_payment_status text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.payment');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_next_payment_status IS NULL OR p_next_payment_status <> ALL (ARRAY['pending','processing','completed','failed','refunded']) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='transition_payment' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF NOT ((current_order.payment_status='pending' AND p_next_payment_status IN ('processing','failed')) OR (current_order.payment_status='processing' AND p_next_payment_status IN ('completed','failed')) OR (current_order.payment_status='failed' AND p_next_payment_status='processing') OR (current_order.payment_status='completed' AND p_next_payment_status='refunded')) THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.orders SET payment_status=p_next_payment_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'payment_transition',current_order.payment_status,p_next_payment_status,'Order payment changed to '||p_next_payment_status,pg_catalog.jsonb_build_object('from',current_order.payment_status,'to',p_next_payment_status),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'transition_payment',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.orders_update_shipping(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_expected_version bigint, p_shipping_address jsonb, p_tracking jsonb
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.fulfill');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR NOT saas.orders_address_valid(p_shipping_address) OR NOT saas.orders_tracking_valid(p_tracking) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='update_shipping' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.orders SET shipping_address=p_shipping_address,tracking=p_tracking,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'shipping_updated','Order shipping updated',pg_catalog.jsonb_build_object('hasTracking',p_tracking IS NOT NULL),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'update_shipping',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.orders_add_note(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_note_id uuid, p_order_id uuid, p_body text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.note');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_note_id IS NULL OR p_order_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_body IS NULL OR p_body<>pg_catalog.btrim(p_body) OR pg_catalog.char_length(p_body) NOT BETWEEN 1 AND 2000 OR p_body ~ '[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='add_note' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM saas.order_notes AS note WHERE note.id=p_note_id) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    INSERT INTO saas.order_notes(id,store_id,order_id,author_membership_id,body,created_at,updated_at) VALUES (p_note_id,p_store_id,p_order_id,p_membership_id,p_body,p_now,p_now);
    UPDATE saas.orders SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'note_added','Order note added',pg_catalog.jsonb_build_object('noteId',p_note_id),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'add_note',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.orders_archive_note(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_note_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.note');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_note_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='archive_note' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.order_notes SET archived_at=p_now,updated_at=p_now WHERE store_id=p_store_id AND order_id=p_order_id AND id=p_note_id AND archived_at IS NULL;
    IF NOT FOUND THEN RETURN QUERY SELECT 'note_not_found'::text,NULL::jsonb; RETURN; END IF;
    UPDATE saas.orders SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'note_archived','Order note archived',pg_catalog.jsonb_build_object('noteId',p_note_id),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'archive_note',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.orders_recover_operation(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz, p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.order_operations%ROWTYPE; required_action text;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  required_action:=CASE
    WHEN existing.operation_kind='transition_status' AND existing.result_payload->>'status' IN ('cancelled','refunded') THEN 'orders.manage'
    WHEN existing.operation_kind='transition_status' THEN 'orders.fulfill'
    WHEN existing.operation_kind='transition_payment' THEN 'orders.payment'
    WHEN existing.operation_kind='update_shipping' THEN 'orders.fulfill'
    ELSE 'orders.note'
  END;
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',required_action);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF existing.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
END
$function$;

REVOKE ALL ON FUNCTION saas.orders_json_timestamp(timestamptz) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_cursor_timestamp(timestamptz) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_address_valid(jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_tracking_valid(jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_mutation_projection(uuid,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_detail_projection(uuid,uuid) FROM PUBLIC,celebix_saas_app;

REVOKE ALL ON FUNCTION saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
