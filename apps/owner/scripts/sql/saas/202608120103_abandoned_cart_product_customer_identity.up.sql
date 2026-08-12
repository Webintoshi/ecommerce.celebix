-- Phase 4U verified customer identity and truthful product projection for durable abandoned carts.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.abandoned_carts
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT abandoned_carts_customer_store_fk
    FOREIGN KEY(store_id,customer_id)
    REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT;

CREATE INDEX abandoned_carts_store_customer_activity_idx
  ON saas.abandoned_carts(store_id,customer_id,last_activity_at DESC,id DESC)
  WHERE customer_id IS NOT NULL;

CREATE FUNCTION saas.storefront_verified_customer_from_candidates(
  p_store_id uuid,
  p_now timestamptz,
  p_candidates jsonb
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  SELECT credential.customer_id
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_candidates) candidate
    ON candidate->>'keyId'=credential.key_id
   AND candidate->>'digest'=credential.credential_digest
  JOIN saas.customers customer
    ON customer.store_id=credential.store_id
   AND customer.id=credential.customer_id
   AND customer.status='active'
  WHERE credential.store_id=p_store_id
    AND credential.expires_at>p_now
  ORDER BY credential.last_seen_at DESC,credential.id
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION saas.storefront_verified_customer_from_candidates(uuid,timestamptz,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) RENAME TO public_cart_mutate_without_customer_identity_v103;

REVOKE ALL ON FUNCTION saas.public_cart_mutate_without_customer_identity_v103(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.public_cart_mutate(
  p_hostname text,p_now timestamptz,p_credentials jsonb,
  p_cart_id uuid,p_cart_key_id text,p_cart_digest text,p_cart_expires_at timestamptz,
  p_operation_id uuid,p_fingerprint text,p_action text,p_expected_version bigint,
  p_product_id uuid,p_variant_id uuid,p_quantity integer,p_customer_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  selected_outcome text;
  selected_result jsonb;
  selected_store_id uuid;
  selected_cart_id uuid;
  selected_customer_id uuid;
  bound_customer_id uuid;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_customer_credentials,true) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  selected_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store_id IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_array_length(p_customer_credentials)>0 THEN
    selected_customer_id:=saas.storefront_verified_customer_from_candidates(
      selected_store_id,p_now,p_customer_credentials
    );
  END IF;

  IF pg_catalog.jsonb_array_length(p_credentials)>0 THEN
    SELECT cart.id INTO selected_cart_id
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id
     AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store_id
    ORDER BY cart.created_at DESC,cart.id
    LIMIT 1;
  ELSE
    selected_cart_id:=p_cart_id;
  END IF;

  IF selected_cart_id IS NOT NULL AND selected_customer_id IS NOT NULL THEN
    SELECT abandoned.customer_id INTO bound_customer_id
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=selected_store_id
      AND abandoned.source_cart_id=selected_cart_id
    FOR UPDATE;

    IF FOUND AND bound_customer_id IS NOT NULL AND bound_customer_id<>selected_customer_id THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
      RETURN;
    END IF;
  END IF;

  SELECT result.outcome,result.result_payload
    INTO selected_outcome,selected_result
  FROM saas.public_cart_mutate_without_customer_identity_v103(
    p_hostname,p_now,p_credentials,p_cart_id,p_cart_key_id,p_cart_digest,p_cart_expires_at,
    p_operation_id,p_fingerprint,p_action,p_expected_version,p_product_id,p_variant_id,p_quantity
  ) result;

  IF selected_outcome NOT IN ('committed','operation_replayed') THEN
    RETURN QUERY SELECT selected_outcome,selected_result;
    RETURN;
  END IF;

  IF selected_cart_id IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb;
    RETURN;
  END IF;

  PERFORM saas.sync_durable_abandoned_cart(selected_store_id,selected_cart_id,p_now);

  IF selected_customer_id IS NOT NULL THEN
      UPDATE saas.abandoned_carts abandoned
      SET customer_id=customer.id,
          customer_name=customer.first_name||' '||customer.last_name,
          customer_email=customer.email,
          customer_phone=customer.phone
      FROM saas.customers customer
      WHERE abandoned.store_id=selected_store_id
        AND abandoned.source_cart_id=selected_cart_id
        AND customer.store_id=selected_store_id
        AND customer.id=selected_customer_id
        AND customer.status='active'
        AND (abandoned.customer_id IS NULL OR abandoned.customer_id=selected_customer_id);
  END IF;

  RETURN QUERY SELECT selected_outcome,selected_result;
END
$function$;

REVOKE ALL ON FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer,jsonb
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer,jsonb
) TO celebix_saas_host_resolver;

-- Keep the previous storefront runtime deployable during a rolling release. The
-- compatibility signature cannot assert customer identity: it delegates with an
-- empty, server-owned candidate set and therefore persists an anonymous cart.
CREATE FUNCTION saas.public_cart_mutate(
  p_hostname text,p_now timestamptz,p_credentials jsonb,
  p_cart_id uuid,p_cart_key_id text,p_cart_digest text,p_cart_expires_at timestamptz,
  p_operation_id uuid,p_fingerprint text,p_action text,p_expected_version bigint,
  p_product_id uuid,p_variant_id uuid,p_quantity integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql
VOLATILE
SET search_path=pg_catalog,saas
AS $function$
  SELECT result.outcome,result.result_payload
  FROM saas.public_cart_mutate(
    p_hostname,p_now,p_credentials,p_cart_id,p_cart_key_id,p_cart_digest,p_cart_expires_at,
    p_operation_id,p_fingerprint,p_action,p_expected_version,p_product_id,p_variant_id,p_quantity,
    '[]'::jsonb
  ) result
$function$;

REVOKE ALL ON FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) TO celebix_saas_host_resolver;

CREATE OR REPLACE FUNCTION saas.abandoned_carts_projection(p_store_id uuid,p_cart_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',cart.id,
    'status',cart.status,
    'customerId',cart.customer_id,
    'customerName',cart.customer_name,
    'customerEmail',cart.customer_email,
    'customerPhone',cart.customer_phone,
    'currency',cart.currency,
    'subtotalCents',cart.subtotal_cents,
    'discountCents',cart.discount_cents,
    'totalCents',cart.total_cents,
    'itemCount',(SELECT pg_catalog.count(*) FROM saas.abandoned_cart_items counted WHERE counted.store_id=p_store_id AND counted.cart_id=p_cart_id),
    'firstProductName',(
      SELECT item.product_name
      FROM saas.abandoned_cart_items item
      WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
      ORDER BY item.position,item.id
      LIMIT 1
    ),
    'checkoutStartedAt',saas.abandoned_carts_json_timestamp(cart.checkout_started_at),
    'lastActivityAt',saas.abandoned_carts_json_timestamp(cart.last_activity_at),
    'abandonedAt',CASE WHEN cart.abandoned_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.abandoned_at) END,
    'recoveredAt',CASE WHEN cart.recovered_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.recovered_at) END,
    'archivedAt',CASE WHEN cart.archived_at IS NULL THEN NULL ELSE saas.abandoned_carts_json_timestamp(cart.archived_at) END,
    'version',cart.version,
    'createdAt',saas.abandoned_carts_json_timestamp(cart.created_at),
    'updatedAt',saas.abandoned_carts_json_timestamp(cart.updated_at)
  ))
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
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
        OR COALESCE(cart.customer_phone,'') ILIKE '%'||p_search||'%'
        OR EXISTS(
          SELECT 1 FROM saas.abandoned_cart_items item
          WHERE item.store_id=cart.store_id AND item.cart_id=cart.id
            AND item.product_name ILIKE '%'||p_search||'%'
        ))
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

REVOKE ALL ON FUNCTION saas.abandoned_carts_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_list_without_durable_reconciliation_v101(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

COMMIT;
