-- Additive sales-channel/platform filters for the V2 order reader (depends on 219).
-- Existing readers, historical orders and sales remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $preflight$
BEGIN
 IF to_regprocedure('saas.orders_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)') IS NULL
 OR to_regprocedure('saas.orders_reader_metadata_v2(uuid,uuid)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.in_store_sales'::regclass AND attname='sales_channel' AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.in_store_sales'::regclass AND attname='social_platform' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'ORDERS227_PREDECESSOR_MISSING';END IF;
END $preflight$;

CREATE FUNCTION saas.orders_list_scope_filtered_v2(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_search text, p_sort text, p_page_size bigint,
  p_cursor_total_cents bigint, p_cursor_created_at timestamptz, p_cursor_id uuid, p_archived boolean,
  p_sales_channel text, p_social_platform text
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
     OR (p_cursor_total_cents IS NOT NULL AND p_cursor_total_cents < 0)
     OR (p_sales_channel IS NOT NULL AND p_sales_channel <> ALL (ARRAY['manual','social','storefront','quick_link','marketplace','manual_import']))
     OR (p_social_platform IS NOT NULL AND (p_sales_channel IS DISTINCT FROM 'social' OR p_social_platform <> ALL (ARRAY['instagram','facebook','x','pinterest','tiktok','whatsapp','other']))) THEN
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
      -- Semi-joins keep a single order row even if legacy sale references repeat.
      -- The exact store/order boundary is required for both classification and platform.
      AND (
        p_sales_channel IS NULL
        OR (p_sales_channel='manual' AND order_row.source IN('manual','in_store')
            AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales s WHERE s.store_id=order_row.store_id AND s.order_id=order_row.id AND s.sales_channel='social'))
        OR (p_sales_channel='social' AND order_row.source IN('manual','in_store')
            AND EXISTS(SELECT 1 FROM saas.in_store_sales s WHERE s.store_id=order_row.store_id AND s.order_id=order_row.id AND s.sales_channel='social' AND (p_social_platform IS NULL OR s.social_platform=p_social_platform)))
        OR (p_sales_channel IN('storefront','quick_link','marketplace','manual_import') AND order_row.source=p_sales_channel)
      )
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

CREATE FUNCTION saas.orders_list_filtered_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_created_at timestamptz,p_cursor_id uuid,p_sales_channel text,p_social_platform text) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.orders_list_scope_filtered_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_created_at,p_cursor_id,false,p_sales_channel,p_social_platform)
$f$;

CREATE FUNCTION saas.orders_list_archived_filtered_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_created_at timestamptz,p_cursor_id uuid,p_sales_channel text,p_social_platform text) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.orders_list_scope_filtered_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_created_at,p_cursor_id,true,p_sales_channel,p_social_platform)
$f$;

REVOKE ALL ON FUNCTION saas.orders_list_scope_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,boolean,text,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_list_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_archived_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_list_archived_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;
COMMIT;
