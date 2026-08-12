-- Guarded rollback for Phase 4U abandoned-cart product/customer identity.

DO $guard$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_abandoned_cart_product_customer_identity_down',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_DOWN_GUARD_REQUIRED';
  END IF;
END
$guard$;

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
);
DROP FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer,jsonb
);
ALTER FUNCTION saas.public_cart_mutate_without_customer_identity_v103(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) RENAME TO public_cart_mutate;
GRANT EXECUTE ON FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) TO celebix_saas_host_resolver;

CREATE OR REPLACE FUNCTION saas.abandoned_carts_projection(p_store_id uuid,p_cart_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',cart.id,'status',cart.status,'customerName',cart.customer_name,
    'customerEmail',cart.customer_email,'customerPhone',cart.customer_phone,
    'currency',cart.currency,'subtotalCents',cart.subtotal_cents,
    'discountCents',cart.discount_cents,'totalCents',cart.total_cents,
    'itemCount',(SELECT pg_catalog.count(*) FROM saas.abandoned_cart_items counted WHERE counted.store_id=p_store_id AND counted.cart_id=p_cart_id),
    'checkoutStartedAt',saas.abandoned_carts_json_timestamp(cart.checkout_started_at),
    'lastActivityAt',saas.abandoned_carts_json_timestamp(cart.last_activity_at),
    'abandonedAt',CASE WHEN cart.abandoned_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.abandoned_at) END,
    'recoveredAt',CASE WHEN cart.recovered_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.recovered_at) END,
    'archivedAt',CASE WHEN cart.archived_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.archived_at) END,
    'version',cart.version,'createdAt',saas.abandoned_carts_json_timestamp(cart.created_at),
    'updatedAt',saas.abandoned_carts_json_timestamp(cart.updated_at)
  )) FROM saas.abandoned_carts cart WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$function$;

CREATE OR REPLACE FUNCTION saas.abandoned_carts_list_without_durable_reconciliation_v101(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_last_activity_at timestamptz,p_cursor_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF (p_status IS NOT NULL AND p_status NOT IN ('active','abandoned','recovered','archived'))
     OR p_sort NOT IN ('newest','oldest','highest','lowest') OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_search IS NOT NULL AND (p_search<>pg_catalog.btrim(p_search) OR pg_catalog.char_length(p_search) NOT BETWEEN 1 AND 200 OR p_search~'[[:cntrl:]]'))
     OR ((p_cursor_total_cents IS NULL)::integer+(p_cursor_last_activity_at IS NULL)::integer+(p_cursor_id IS NULL)::integer NOT IN (0,3)) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT cart.*
    FROM saas.abandoned_carts cart
    WHERE cart.store_id=p_store_id
      AND (p_status IS NOT NULL OR cart.status<>'archived')
      AND (p_status IS NULL OR cart.status=p_status)
      AND (p_search IS NULL
        OR COALESCE(cart.customer_name,'') ILIKE '%'||p_search||'%'
        OR COALESCE(cart.customer_email,'') ILIKE '%'||p_search||'%'
        OR COALESCE(cart.customer_phone,'') ILIKE '%'||p_search||'%')
      AND (
        p_cursor_id IS NULL
        OR (p_sort='newest' AND (cart.last_activity_at,cart.id)<(p_cursor_last_activity_at,p_cursor_id))
        OR (p_sort='oldest' AND (cart.last_activity_at,cart.id)>(p_cursor_last_activity_at,p_cursor_id))
        OR (p_sort='highest' AND (cart.total_cents,cart.last_activity_at,cart.id)<(p_cursor_total_cents,p_cursor_last_activity_at,p_cursor_id))
        OR (p_sort='lowest' AND (cart.total_cents,cart.last_activity_at,cart.id)>(p_cursor_total_cents,p_cursor_last_activity_at,p_cursor_id))
      )
  ), ordered AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort='lowest' THEN total_cents END ASC NULLS LAST,
      CASE WHEN p_sort='highest' THEN total_cents END DESC NULLS LAST,
      CASE WHEN p_sort IN ('oldest','lowest') THEN last_activity_at END ASC NULLS LAST,
      CASE WHEN p_sort IN ('newest','highest') THEN last_activity_at END DESC NULLS LAST,
      CASE WHEN p_sort IN ('oldest','lowest') THEN id END ASC NULLS LAST,
      CASE WHEN p_sort IN ('newest','highest') THEN id END DESC NULLS LAST
    LIMIT p_page_size+1
  ), numbered AS (
    SELECT ordered.*,pg_catalog.row_number() OVER () AS ordinal FROM ordered
  ), page AS (
    SELECT * FROM numbered WHERE ordinal<=p_page_size
  ), last_page AS (
    SELECT * FROM page ORDER BY ordinal DESC LIMIT 1
  )
  SELECT 'listed'::text,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.abandoned_carts_projection(p_store_id,page.id) ORDER BY page.ordinal) FROM page),'[]'::jsonb),
    'nextCursor',CASE WHEN (SELECT pg_catalog.count(*) FROM numbered)>p_page_size THEN (
      SELECT pg_catalog.jsonb_build_object('totalCents',last_page.total_cents,'lastActivityAt',
        pg_catalog.to_char(last_page.last_activity_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',last_page.id) FROM last_page
    ) ELSE NULL END
  ));
END
$function$;

DROP FUNCTION saas.storefront_verified_customer_from_candidates(uuid,timestamptz,jsonb);
DROP INDEX saas.abandoned_carts_store_customer_activity_idx;
ALTER TABLE saas.abandoned_carts
  DROP CONSTRAINT abandoned_carts_customer_store_fk,
  DROP COLUMN customer_id;

COMMIT;
