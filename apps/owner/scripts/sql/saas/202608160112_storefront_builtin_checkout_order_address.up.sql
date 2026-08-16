-- Phase 5C: keep built-in storefront checkout orders compatible with the admin order-detail contract.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $upgrade$
DECLARE
  completion_oid oid:=pg_catalog.to_regprocedure(
    'saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'
  );
  routine_definition text;
  upgraded_definition text;
  normalized_order_address constant text:=$normalized$pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'line1',p_delivery->'shippingAddress'->>'line1',
      'line2',p_delivery->'shippingAddress'->>'line2',
      'district',p_delivery->'shippingAddress'->>'district',
      'city',p_delivery->'shippingAddress'->>'city',
      'postalCode',p_delivery->'shippingAddress'->>'postalCode',
      'country',p_delivery->'shippingAddress'->>'country'
    ))$normalized$;
BEGIN
  IF completion_oid IS NULL
     OR pg_catalog.to_regprocedure('saas.orders_detail_projection(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_PREREQUISITE_MISSING';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(completion_oid) INTO routine_definition;
  IF pg_catalog.strpos(routine_definition,normalized_order_address)>0 THEN
    upgraded_definition:=routine_definition;
  ELSIF pg_catalog.strpos(
      routine_definition,
      $$p_delivery->'shippingAddress',NULL,1,p_now,p_now,selected_customer.id$$
    )>0 THEN
    upgraded_definition:=pg_catalog.replace(
      routine_definition,
      $$p_delivery->'shippingAddress',NULL,1,p_now,p_now,selected_customer.id$$,
      normalized_order_address||$$,NULL,1,p_now,p_now,selected_customer.id$$
    );
  ELSE
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_SOURCE_CHANGED';
  END IF;

  IF upgraded_definition<>routine_definition THEN
    EXECUTE upgraded_definition;
  END IF;
END
$upgrade$;

CREATE OR REPLACE FUNCTION saas.orders_detail_projection(p_store_id uuid, p_order_id uuid)
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
      'recipientName',COALESCE(NULLIF(pg_catalog.btrim(selected_order.shipping_address->>'recipientName'), ''), selected_order.customer_name),
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
      FROM (SELECT * FROM saas.order_events WHERE store_id=p_store_id AND order_id=p_order_id ORDER BY created_at DESC,id DESC LIMIT 200) AS event
    ),
    'notes', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', note.id, 'body', note.body,
        'createdAt', saas.orders_json_timestamp(note.created_at),
        'updatedAt', saas.orders_json_timestamp(note.updated_at)
      ) ORDER BY note.created_at, note.id), '[]'::jsonb)
      FROM (SELECT * FROM saas.order_notes WHERE store_id=p_store_id AND order_id=p_order_id AND archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100) AS note
    )
  ))
  FROM saas.orders AS selected_order
  WHERE selected_order.store_id=p_store_id AND selected_order.id=p_order_id
$function$;

REVOKE ALL ON FUNCTION saas.orders_detail_projection(uuid,uuid)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

UPDATE saas.orders AS order_row
SET shipping_address=pg_catalog.jsonb_set(
      order_row.shipping_address,
      '{recipientName}'::text[],
      pg_catalog.to_jsonb(order_row.customer_name),
      true
    ),
    version=order_row.version+1,
    updated_at=pg_catalog.clock_timestamp()
WHERE order_row.source='storefront'
  AND pg_catalog.jsonb_typeof(order_row.shipping_address)='object'
  AND pg_catalog.char_length(pg_catalog.btrim(order_row.customer_name)) BETWEEN 1 AND 200
  AND order_row.shipping_address ? 'line1'
  AND order_row.shipping_address ? 'city'
  AND order_row.shipping_address ? 'country'
  AND (
    NOT order_row.shipping_address ? 'recipientName'
    OR pg_catalog.btrim(order_row.shipping_address->>'recipientName')=''
  );

COMMIT;
