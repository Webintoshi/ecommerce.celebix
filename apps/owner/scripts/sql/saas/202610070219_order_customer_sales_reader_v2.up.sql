-- Additive orders reader V2. Depends on manual sales v4 migration 218.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.orders_normalized_phone_v2(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN length(digits)=12 AND left(digits,2)='90' THEN substr(digits,3)
             WHEN length(digits)=11 AND left(digits,1)='0' THEN substr(digits,2)
             ELSE digits END
 FROM (SELECT regexp_replace(coalesce(p_value,''),'[^0-9]','','g') digits) normalized
$f$;

CREATE FUNCTION saas.orders_search_matches_v2(p_search text,p_number text,p_name text,p_email text,p_phone text,p_current_name text,p_current_email text,p_current_phone text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT p_search IS NULL OR strpos(lower(concat_ws(' ',p_number,p_name,p_email,p_phone,p_current_name,p_current_email,p_current_phone)),lower(p_search))>0
 OR (p_search ~ '^[+()0-9 .-]+$' AND length(saas.orders_normalized_phone_v2(p_search))>=3 AND
     (strpos(saas.orders_normalized_phone_v2(p_phone),saas.orders_normalized_phone_v2(p_search))>0
      OR strpos(saas.orders_normalized_phone_v2(p_current_phone),saas.orders_normalized_phone_v2(p_search))>0))
$f$;

CREATE FUNCTION saas.orders_reader_metadata_v2(p_store uuid,p_order uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object(
   'customerId',o.customer_id,
   'currentCustomer',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'name',c.first_name||' '||c.last_name,'email',c.email,'phone',c.phone,'archived',c.status='archived') END,
   'salesChannel',CASE WHEN o.source IN('in_store','manual') THEN coalesce(s.sales_channel,'manual') ELSE NULL END,
   'socialPlatform',s.social_platform,'socialReference',s.social_reference,
   'fulfillmentMethod',CASE WHEN o.source='in_store' THEN coalesce(s.fulfillment_method,'pickup') WHEN o.source='manual' THEN 'shipping' ELSE NULL END)
 FROM saas.orders o
 LEFT JOIN saas.customers c ON c.store_id=o.store_id AND c.id=o.customer_id
 LEFT JOIN saas.in_store_sales s ON s.store_id=o.store_id AND s.order_id=o.id
 WHERE o.store_id=p_store AND o.id=p_order
$f$;

CREATE FUNCTION saas.orders_list_scope_v2(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_search text, p_sort text, p_page_size bigint,
  p_cursor_total_cents bigint, p_cursor_created_at timestamptz, p_cursor_id uuid, p_archived boolean
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
  last_total_cents bigint;
  last_created_at timestamptz;
  last_id uuid;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_archived THEN
    authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
    IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']))
     OR p_sort IS NULL OR p_sort <> ALL (ARRAY['newest','oldest','highest','lowest'])
     OR (p_search IS NOT NULL AND (p_search <> pg_catalog.btrim(p_search) OR pg_catalog.char_length(p_search) NOT BETWEEN 1 AND 200 OR p_search ~ '[[:cntrl:]]'))
     OR (pg_catalog.num_nulls(p_cursor_total_cents,p_cursor_created_at,p_cursor_id) NOT IN (0,3))
     OR (p_cursor_total_cents IS NOT NULL AND p_cursor_total_cents < 0) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  WITH candidates AS (
    SELECT order_row.*
    FROM saas.orders AS order_row
    LEFT JOIN saas.customers AS customer ON customer.store_id=order_row.store_id AND customer.id=order_row.customer_id
    WHERE order_row.store_id=p_store_id
      AND EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=order_row.store_id AND a.order_id=order_row.id AND a.archived)=p_archived
      AND (p_status IS NULL OR order_row.status=p_status)
      AND saas.orders_search_matches_v2(p_search,order_row.order_number,order_row.customer_name,order_row.customer_email,order_row.customer_phone,customer.first_name||' '||customer.last_name,customer.email,customer.phone)
      AND (
        p_cursor_created_at IS NULL
        OR (p_sort='newest' AND (order_row.created_at,order_row.id) < (p_cursor_created_at,p_cursor_id))
        OR (p_sort='oldest' AND (order_row.created_at,order_row.id) > (p_cursor_created_at,p_cursor_id))
        OR (p_sort='highest' AND (order_row.total_cents,order_row.created_at,order_row.id) < (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
        OR (p_sort='lowest' AND (order_row.total_cents,order_row.created_at,order_row.id) > (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
      )
    ORDER BY
      CASE WHEN p_sort='highest' THEN order_row.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN order_row.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.id END ASC
    LIMIT p_page_size+1
  ), page AS (
    SELECT candidates.*, pg_catalog.row_number() OVER (ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    ) AS page_position
    FROM candidates
    ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    LIMIT p_page_size
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',page.id,'orderNumber',page.order_number,'source',page.source,
      'customerName',page.customer_name,'customerEmail',page.customer_email,
      'currency',page.currency,'totalCents',page.total_cents,'status',page.status,
      'paymentStatus',page.payment_status,
      'itemCount',(SELECT pg_catalog.count(*) FROM saas.order_items AS item WHERE item.store_id=p_store_id AND item.order_id=page.id),
      'createdAt',saas.orders_cursor_timestamp(page.created_at),'updatedAt',saas.orders_cursor_timestamp(page.updated_at),'version',page.version
    ) || saas.orders_reader_metadata_v2(p_store_id,page.id) ORDER BY page.page_position),'[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_page_size FROM candidates),
    (SELECT tail.total_cents FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.created_at FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position=p_page_size)
  INTO page_items,has_more,last_total_cents,last_created_at,last_id
  FROM page;
  result_payload := pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN
    result_payload := result_payload || pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('totalCents',last_total_cents,'createdAt',saas.orders_cursor_timestamp(last_created_at),'id',last_id));
  END IF;
  RETURN QUERY SELECT 'listed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.orders_list_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_created_at timestamptz,p_cursor_id uuid) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.orders_list_scope_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_created_at,p_cursor_id,false)
$f$;

CREATE FUNCTION saas.orders_list_archived_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_created_at timestamptz,p_cursor_id uuid) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.orders_list_scope_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_created_at,p_cursor_id,true)
$f$;

CREATE FUNCTION saas.orders_detail_projection_v2(p_store uuid,p_order uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.orders_detail_projection(p_store,p_order) || saas.orders_reader_metadata_v2(p_store,p_order)
 || jsonb_build_object('shippingAddress',CASE WHEN o.source='in_store' THEN o.shipping_address ELSE saas.orders_detail_projection(p_store,p_order)->'shippingAddress' END,'billingAddress',coalesce(s.billing_address,o.billing_address))
 || CASE WHEN o.source='in_store' THEN jsonb_build_object('inStorePaymentMethod',s.payment_method) ELSE '{}'::jsonb END
 FROM saas.orders o LEFT JOIN saas.in_store_sales s ON s.store_id=o.store_id AND s.order_id=o.id
 WHERE o.store_id=p_store AND o.id=p_order
$f$;

CREATE FUNCTION saas.orders_get_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE prior record;
BEGIN
 SELECT * INTO prior FROM saas.orders_get_with_archive(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_order_id);
 IF prior.outcome='found' THEN
   prior.result_payload:=saas.orders_detail_projection_v2(p_store_id,p_order_id)
      || CASE WHEN prior.result_payload?'archive' THEN jsonb_build_object('archive',prior.result_payload->'archive') ELSE '{}'::jsonb END;
 END IF;
 RETURN QUERY SELECT prior.outcome::text,prior.result_payload::jsonb;
END $f$;

REVOKE ALL ON FUNCTION saas.orders_normalized_phone_v2(text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_search_matches_v2(text,text,text,text,text,text,text,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_reader_metadata_v2(uuid,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_scope_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_archived_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_detail_projection_v2(uuid,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_get_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_list_archived_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_get_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
