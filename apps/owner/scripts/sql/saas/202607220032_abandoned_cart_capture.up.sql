-- Phase 3B3 trusted-host public abandoned-cart capture authority.
-- Authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.abandoned_carts ADD COLUMN recovered_order_id uuid;
ALTER TABLE saas.abandoned_carts ADD CONSTRAINT abandoned_carts_recovered_order_store_fk
  FOREIGN KEY (store_id,recovered_order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT;

CREATE FUNCTION saas.abandoned_cart_capture_store(p_hostname text,p_now timestamptz)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
  SELECT domain.store_id
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  WHERE p_now IS NOT NULL AND p_hostname IS NOT NULL AND p_hostname=pg_catalog.lower(p_hostname)
    AND pg_catalog.char_length(p_hostname) BETWEEN 3 AND 253
    AND p_hostname !~ '[*:/?#@[:space:][:cntrl:]]'
    AND domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now
    AND EXISTS (
      SELECT 1 FROM saas.store_domains AS primary_domain
      WHERE primary_domain.store_id=store.id AND primary_domain.status='active'
        AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
    )
$function$;

CREATE FUNCTION saas.abandoned_cart_capture_items_valid(p_store_id uuid,p_items jsonb)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  WITH requested AS (
    SELECT entry.value,entry.ordinality
    FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value,ordinality)
  ), parsed AS (
    SELECT
      value->>'productId' AS product_id,
      value->>'variantId' AS variant_id,
      value->>'quantity' AS quantity
    FROM requested
  )
  SELECT p_store_id IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_items)='array'
    AND pg_catalog.jsonb_array_length(p_items) BETWEEN 1 AND 100
    AND NOT EXISTS (
      SELECT 1 FROM requested
      WHERE pg_catalog.jsonb_typeof(value)<>'object'
        OR NOT value ?& ARRAY['productId','variantId','quantity']
        OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(value) AS supplied(key) WHERE supplied.key<>ALL(ARRAY['productId','variantId','quantity']))
        OR pg_catalog.jsonb_typeof(value->'productId')<>'string'
        OR pg_catalog.jsonb_typeof(value->'variantId')<>'string'
        OR pg_catalog.jsonb_typeof(value->'quantity')<>'number'
    )
    AND NOT EXISTS (
      SELECT 1 FROM parsed
      WHERE product_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR variant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR quantity !~ '^[1-9][0-9]{0,3}$' OR quantity::bigint NOT BETWEEN 1 AND 9999
    )
    AND (SELECT pg_catalog.count(DISTINCT variant_id) FROM parsed)=(SELECT pg_catalog.count(*) FROM parsed)
    AND NOT EXISTS (
      SELECT 1 FROM parsed
      LEFT JOIN saas.products AS product ON product.id=parsed.product_id::uuid AND product.store_id=p_store_id AND product.status='active'
      LEFT JOIN saas.product_variants AS variant ON variant.id=parsed.variant_id::uuid AND variant.product_id=product.id AND variant.store_id=p_store_id AND variant.status='active'
      WHERE product.id IS NULL OR variant.id IS NULL OR variant.price_cents>9007199254740991
        OR (variant.stock_tracking AND variant.stock_quantity<parsed.quantity::bigint)
    )
    AND COALESCE((
      SELECT pg_catalog.sum(variant.price_cents*parsed.quantity::bigint)
      FROM parsed JOIN saas.product_variants AS variant ON variant.id=parsed.variant_id::uuid AND variant.store_id=p_store_id
    ),0) <= 9007199254740991
$function$;

CREATE FUNCTION saas.abandoned_cart_capture_customer_valid(p_customer jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_typeof(p_customer)='object'
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_customer) AS supplied(key) WHERE supplied.key<>ALL(ARRAY['name','email','phone']))
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_customer) AS entry(key,value)
      WHERE pg_catalog.jsonb_typeof(entry.value)<>'string'
        OR entry.value#>>'{}'<>pg_catalog.btrim(entry.value#>>'{}')
        OR entry.value#>>'{}'~'[[:cntrl:]]'
        OR (entry.key='name' AND pg_catalog.char_length(entry.value#>>'{}') NOT BETWEEN 1 AND 200)
        OR (entry.key='email' AND (pg_catalog.char_length(entry.value#>>'{}') NOT BETWEEN 3 AND 320 OR entry.value#>>'{}'~'[[:space:]]'))
        OR (entry.key='phone' AND pg_catalog.char_length(entry.value#>>'{}') NOT BETWEEN 3 AND 32)
    )
$function$;

CREATE FUNCTION saas.abandoned_cart_capture_projection(p_store_id uuid,p_cart_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',cart.id,'status',cart.status,'currency',cart.currency,'totalCents',cart.total_cents,
    'itemCount',(SELECT pg_catalog.count(*) FROM saas.abandoned_cart_items AS item WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id),
    'version',cart.version,'updatedAt',saas.abandoned_carts_json_timestamp(cart.updated_at)
  ) FROM saas.abandoned_carts AS cart WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$function$;

CREATE FUNCTION saas.abandoned_carts_capture(
  p_hostname text,p_cart_id uuid,p_credential_digest text,p_now timestamptz,p_customer jsonb,p_items jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE selected_store uuid; selected_currency text; selected_cart saas.abandoned_carts%ROWTYPE; subtotal bigint; selected_outcome text;
BEGIN
  selected_store:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_cart_id IS NULL OR p_credential_digest !~ '^[a-f0-9]{64}$'
     OR NOT saas.abandoned_cart_capture_customer_valid(p_customer)
     OR NOT saas.abandoned_cart_capture_items_valid(selected_store,p_items) THEN
    RETURN QUERY SELECT CASE WHEN saas.abandoned_cart_capture_items_valid(selected_store,p_items) THEN 'invalid_input' ELSE 'catalog_item_unavailable' END,NULL::jsonb; RETURN;
  END IF;
  SELECT store.currency INTO selected_currency FROM saas.stores AS store WHERE store.id=selected_store;
  SELECT pg_catalog.sum(variant.price_cents*(entry.value->>'quantity')::bigint) INTO subtotal
  FROM pg_catalog.jsonb_array_elements(p_items) AS entry(value)
  JOIN saas.product_variants AS variant ON variant.id=(entry.value->>'variantId')::uuid AND variant.store_id=selected_store;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_store::text||':'||p_credential_digest,0));
  SELECT * INTO selected_cart FROM saas.abandoned_carts WHERE store_id=selected_store AND public_cart_digest=p_credential_digest FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO saas.abandoned_carts(
      id,store_id,public_cart_digest,status,customer_name,customer_email,customer_phone,currency,
      subtotal_cents,discount_cents,total_cents,checkout_started_at,last_activity_at,version,created_at,updated_at
    ) VALUES (
      p_cart_id,selected_store,p_credential_digest,'active',p_customer->>'name',p_customer->>'email',p_customer->>'phone',selected_currency,
      subtotal,0,subtotal,p_now,p_now,1,p_now,p_now
    );
    selected_outcome:='captured';
  ELSIF selected_cart.status='active' THEN
    UPDATE saas.abandoned_carts SET customer_name=p_customer->>'name',customer_email=p_customer->>'email',customer_phone=p_customer->>'phone',
      subtotal_cents=subtotal,discount_cents=0,total_cents=subtotal,last_activity_at=p_now,updated_at=p_now,version=version+1
    WHERE store_id=selected_store AND id=selected_cart.id;
    p_cart_id:=selected_cart.id; selected_outcome:='captured';
  ELSIF selected_cart.status='abandoned' THEN
    UPDATE saas.abandoned_carts SET status='recovered',recovered_at=p_now,customer_name=p_customer->>'name',customer_email=p_customer->>'email',customer_phone=p_customer->>'phone',
      subtotal_cents=subtotal,discount_cents=0,total_cents=subtotal,last_activity_at=p_now,updated_at=p_now,version=version+1
    WHERE store_id=selected_store AND id=selected_cart.id;
    p_cart_id:=selected_cart.id; selected_outcome:='recovered';
  ELSE
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;

  DELETE FROM saas.abandoned_cart_items WHERE store_id=selected_store AND cart_id=p_cart_id;
  INSERT INTO saas.abandoned_cart_items(
    id,store_id,cart_id,product_id,variant_id,position,product_name,variant_name,sku,image_url,
    unit_price_cents,quantity,discount_cents,line_total_cents,created_at
  )
  SELECT pg_catalog.gen_random_uuid(),selected_store,p_cart_id,product.id,variant.id,entry.ordinality-1,
    product.title,variant.title,variant.sku,(
      SELECT media.public_url FROM saas.product_media AS media
      WHERE media.store_id=selected_store AND media.product_id=product.id AND media.status='active'
        AND (media.variant_id=variant.id OR media.variant_id IS NULL)
      ORDER BY (media.variant_id=variant.id) DESC NULLS LAST,media.sort_order,media.id LIMIT 1
    ),variant.price_cents,(entry.value->>'quantity')::integer,0,variant.price_cents*(entry.value->>'quantity')::integer,p_now
  FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS entry(value,ordinality)
  JOIN saas.products AS product ON product.id=(entry.value->>'productId')::uuid AND product.store_id=selected_store
  JOIN saas.product_variants AS variant ON variant.id=(entry.value->>'variantId')::uuid AND variant.product_id=product.id AND variant.store_id=selected_store
  ORDER BY entry.ordinality;
  RETURN QUERY SELECT selected_outcome,saas.abandoned_cart_capture_projection(selected_store,p_cart_id);
END
$function$;

CREATE FUNCTION saas.abandoned_carts_mark_stale(p_now timestamptz,p_stale_before timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE affected bigint;
BEGIN
  IF p_now IS NULL OR p_stale_before IS NULL OR p_stale_before>p_now-interval '5 minutes' OR p_stale_before<p_now-interval '7 days' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.abandoned_carts SET status='abandoned',abandoned_at=p_now,updated_at=p_now,version=version+1
  WHERE status='active' AND last_activity_at<=p_stale_before;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN QUERY SELECT 'committed'::text,pg_catalog.jsonb_build_object('affected',affected,'asOf',saas.abandoned_carts_json_timestamp(p_now));
END
$function$;

CREATE FUNCTION saas.abandoned_carts_convert(p_hostname text,p_credential_digest text,p_order_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE selected_store uuid; selected_cart saas.abandoned_carts%ROWTYPE;
BEGIN
  selected_store:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_credential_digest !~ '^[a-f0-9]{64}$' OR p_order_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM saas.orders WHERE store_id=selected_store AND id=p_order_id) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_cart FROM saas.abandoned_carts WHERE store_id=selected_store AND public_cart_digest=p_credential_digest FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected_cart.status='abandoned' THEN
    UPDATE saas.abandoned_carts SET status='recovered',recovered_at=p_now,recovered_order_id=p_order_id,updated_at=p_now,version=version+1 WHERE id=selected_cart.id;
  ELSIF selected_cart.status='active' THEN
    UPDATE saas.abandoned_carts SET status='archived',archived_at=p_now,recovered_order_id=p_order_id,updated_at=p_now,version=version+1 WHERE id=selected_cart.id;
  ELSE RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'committed'::text,saas.abandoned_cart_capture_projection(selected_store,selected_cart.id);
END
$function$;

REVOKE ALL ON FUNCTION saas.abandoned_cart_capture_store(text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_cart_capture_items_valid(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_cart_capture_customer_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_cart_capture_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_mark_stale(timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.abandoned_carts_convert(text,text,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_mark_stale(timestamptz,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_convert(text,text,uuid,timestamptz) TO celebix_saas_workflow;

COMMIT;
