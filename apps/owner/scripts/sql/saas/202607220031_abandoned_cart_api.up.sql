-- Phase 3B3 least-privilege abandoned-cart merchant API.
-- Authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_required_feature text,
  p_required_action text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
     OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
     OR p_required_action IS NULL OR p_required_action NOT IN (
       'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage'
     ) THEN
    RETURN 'durable_authority_invalid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active') THEN
    RETURN 'store_inactive';
  END IF;

  SELECT membership.role INTO membership_role
  FROM saas.memberships AS membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
    AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan ON plan.id=subscription.plan_id
      AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now
      AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (
      SELECT feature.feature_key FROM saas.plan_features AS feature
      WHERE feature.plan_id=p_plan_id AND feature.enabled ORDER BY feature.feature_ordinal
    ) AS enabled_feature WHERE enabled_feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;

  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read'))
    OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read'))
  ) THEN RETURN 'membership_denied'; END IF;

  RETURN NULL;
END
$function$;

CREATE FUNCTION saas.abandoned_carts_json_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.abandoned_carts_projection(p_store_id uuid, p_cart_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',cart.id,
    'status',cart.status,
    'customerName',cart.customer_name,
    'customerEmail',cart.customer_email,
    'customerPhone',cart.customer_phone,
    'currency',cart.currency,
    'subtotalCents',cart.subtotal_cents,
    'discountCents',cart.discount_cents,
    'totalCents',cart.total_cents,
    'itemCount',(SELECT pg_catalog.count(*) FROM saas.abandoned_cart_items AS counted WHERE counted.store_id=p_store_id AND counted.cart_id=p_cart_id),
    'checkoutStartedAt',saas.abandoned_carts_json_timestamp(cart.checkout_started_at),
    'lastActivityAt',saas.abandoned_carts_json_timestamp(cart.last_activity_at),
    'abandonedAt',CASE WHEN cart.abandoned_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.abandoned_at) END,
    'recoveredAt',CASE WHEN cart.recovered_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.recovered_at) END,
    'archivedAt',CASE WHEN cart.archived_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.archived_at) END,
    'version',cart.version,
    'createdAt',saas.abandoned_carts_json_timestamp(cart.created_at),
    'updatedAt',saas.abandoned_carts_json_timestamp(cart.updated_at)
  ))
  FROM saas.abandoned_carts AS cart
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$function$;

CREATE FUNCTION saas.abandoned_carts_detail_projection(p_store_id uuid, p_cart_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT base_projection || pg_catalog.jsonb_build_object(
    'items',(
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id',item.id,'position',item.position,'productName',item.product_name,'variantName',item.variant_name,
        'sku',item.sku,'imageUrl',item.image_url,'unitPriceCents',item.unit_price_cents,'quantity',item.quantity,
        'discountCents',item.discount_cents,'lineTotalCents',item.line_total_cents
      )) ORDER BY item.position,item.id),'[]'::jsonb)
      FROM (SELECT * FROM saas.abandoned_cart_items WHERE store_id=p_store_id AND cart_id=p_cart_id ORDER BY position,id LIMIT 100) AS item
    )
  )
  FROM (SELECT saas.abandoned_carts_projection(p_store_id,p_cart_id) AS base_projection) AS projected
  WHERE base_projection IS NOT NULL
$function$;

CREATE FUNCTION saas.abandoned_carts_mutation_projection(p_store_id uuid, p_cart_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',cart.id,'status',cart.status,'version',cart.version,
    'updatedAt',saas.abandoned_carts_json_timestamp(cart.updated_at)
  ) FROM saas.abandoned_carts AS cart WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$function$;

CREATE FUNCTION saas.abandoned_carts_summary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY
  SELECT 'summarized'::text,pg_catalog.jsonb_build_object(
    'abandoned',pg_catalog.count(*) FILTER (WHERE cart.status='abandoned'),
    'recovered',pg_catalog.count(*) FILTER (WHERE cart.status='recovered'),
    'lostValueCents',COALESCE(pg_catalog.sum(cart.total_cents) FILTER (WHERE cart.status='abandoned'),0),
    'recoveredValueCents',COALESCE(pg_catalog.sum(cart.total_cents) FILTER (WHERE cart.status='recovered'),0),
    'currency',store.currency,'asOf',saas.abandoned_carts_json_timestamp(p_now)
  )
  FROM saas.stores AS store
  LEFT JOIN saas.abandoned_carts AS cart ON cart.store_id=store.id
  WHERE store.id=p_store_id
  GROUP BY store.currency;
END
$function$;

CREATE FUNCTION saas.abandoned_carts_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_status text,p_search text,p_sort text,p_page_size bigint,p_cursor_total_cents bigint,p_cursor_last_activity_at timestamptz,p_cursor_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
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
    FROM saas.abandoned_carts AS cart
    WHERE cart.store_id=p_store_id
      AND (p_status IS NOT NULL OR cart.status<>'archived')
      AND (p_status IS NULL OR cart.status=p_status)
      AND (p_search IS NULL OR COALESCE(cart.customer_name,'') ILIKE '%'||p_search||'%' OR COALESCE(cart.customer_email,'') ILIKE '%'||p_search||'%' OR COALESCE(cart.customer_phone,'') ILIKE '%'||p_search||'%')
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
  ), page AS (SELECT * FROM numbered WHERE ordinal<=p_page_size), last_page AS (SELECT * FROM page ORDER BY ordinal DESC LIMIT 1)
  SELECT 'listed'::text,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.abandoned_carts_projection(p_store_id,page.id) ORDER BY page.ordinal) FROM page),'[]'::jsonb),
    'nextCursor',CASE WHEN (SELECT pg_catalog.count(*) FROM numbered)>p_page_size THEN (
      SELECT pg_catalog.jsonb_build_object('totalCents',last_page.total_cents,'lastActivityAt',
        pg_catalog.to_char(last_page.last_activity_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',last_page.id) FROM last_page
    ) ELSE NULL END
  ));
END
$function$;

CREATE FUNCTION saas.abandoned_carts_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_cart_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  projection := saas.abandoned_carts_detail_projection(p_store_id,p_cart_id);
  IF projection IS NULL THEN RETURN QUERY SELECT 'cart_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.abandoned_carts_mutate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint,p_kind text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.abandoned_cart_operations%ROWTYPE; selected saas.abandoned_carts%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_cart_id IS NULL OR p_expected_version<1 OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_kind NOT IN ('mark_recovered','archive') THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  SELECT * INTO existing FROM saas.abandoned_cart_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.cart_id<>p_cart_id OR existing.operation_kind<>p_kind OR existing.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; RETURN;
  END IF;
  SELECT * INTO selected FROM saas.abandoned_carts WHERE store_id=p_store_id AND id=p_cart_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'cart_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF (p_kind='mark_recovered' AND selected.status<>'abandoned')
     OR (p_kind='archive' AND selected.status NOT IN ('active','abandoned','recovered')) THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_kind='mark_recovered' THEN
    UPDATE saas.abandoned_carts SET status='recovered',recovered_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_cart_id;
  ELSE
    UPDATE saas.abandoned_carts SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_cart_id;
  END IF;
  projection := saas.abandoned_carts_mutation_projection(p_store_id,p_cart_id);
  INSERT INTO saas.abandoned_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES (p_operation_id,p_store_id,p_cart_id,p_kind,p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.abandoned_carts_mark_recovered(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
  SELECT * FROM saas.abandoned_carts_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_cart_id,p_expected_version,'mark_recovered')
$function$;

CREATE FUNCTION saas.abandoned_carts_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
  SELECT * FROM saas.abandoned_carts_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_cart_id,p_expected_version,'archive')
$function$;

CREATE FUNCTION saas.abandoned_carts_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.abandoned_cart_operations%ROWTYPE;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.abandoned_cart_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'cart_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing.store_id<>p_store_id OR existing.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
END
$function$;

REVOKE ALL ON FUNCTION saas.abandoned_carts_json_timestamp(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_detail_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_mutation_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
