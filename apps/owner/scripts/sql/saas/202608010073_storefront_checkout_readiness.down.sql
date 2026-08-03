-- Roll back Phase 4C by restoring the exact migration-072 cart projections.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH lines AS (
    SELECT item.position,item.quantity,product.id product_id,variant.id variant_id,
      product.slug,product.title,variant.title variant_title,
      item.unit_price_cents price_cents,primary_media.projection media,
      product.status='active' AND variant.status='active'
        AND resolved.outcome='found' AND resolved.price_cents=item.unit_price_cents
        AND (NOT variant.stock_tracking OR variant.stock_quantity>=item.quantity) available
    FROM saas.storefront_cart_items item
    JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
    JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
    LEFT JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved ON true
    LEFT JOIN LATERAL (
      SELECT saas.public_media_projection(media.id) projection FROM saas.product_media media
      WHERE media.store_id=item.store_id AND media.product_id=item.product_id AND media.status='active'
      ORDER BY media.sort_order,media.id LIMIT 1
    ) primary_media ON true
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
  ), aggregate AS (
    SELECT COALESCE(pg_catalog.sum(quantity),0)::bigint item_count,
      COALESCE(pg_catalog.sum(price_cents*quantity),0)::bigint subtotal,
      COALESCE(pg_catalog.bool_and(available),false) all_available,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'productId',product_id,'variantId',variant_id,'slug',slug,'title',title,
        'variantTitle',variant_title,'media',media,'quantity',quantity,'unitPriceCents',price_cents,
        'lineTotalCents',price_cents*quantity,'available',available
      )) ORDER BY position,variant_id),'[]'::jsonb) items
    FROM lines
  ), shipping AS (
    SELECT saas.storefront_shipping_projection(p_store_id) projection
  ), payments AS (
    SELECT saas.storefront_payment_methods_projection(p_store_id) methods
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',cart.version,'currency','TRY','itemCount',aggregate.item_count,
    'subtotalCents',aggregate.subtotal,'shippingCents',CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'totalCents',aggregate.subtotal+CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'checkoutReady',aggregate.item_count>0 AND aggregate.all_available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'items',aggregate.items
  )
  FROM saas.storefront_carts cart CROSS JOIN aggregate CROSS JOIN shipping CROSS JOIN payments
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_intent_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH selected AS (
    SELECT intent.quantity,product.id product_id,variant.id variant_id,product.slug,
      product.title,variant.title variant_title,intent.unit_price_cents price_cents,primary_media.projection media,
      product.status='active' AND variant.status='active'
        AND resolved.outcome='found' AND resolved.price_cents=intent.unit_price_cents
        AND (NOT variant.stock_tracking OR variant.stock_quantity>=intent.quantity) available
    FROM saas.storefront_checkout_intents intent
    JOIN saas.products product ON product.store_id=intent.store_id AND product.id=intent.product_id
    JOIN saas.product_variants variant ON variant.store_id=intent.store_id AND variant.id=intent.variant_id AND variant.product_id=intent.product_id
    LEFT JOIN LATERAL saas.resolve_effective_variant_price(intent.store_id,intent.variant_id,'storefront',p_now,NULL) resolved ON true
    LEFT JOIN LATERAL (
      SELECT saas.public_media_projection(media.id) projection FROM saas.product_media media
      WHERE media.store_id=intent.store_id AND media.product_id=intent.product_id AND media.status='active'
      ORDER BY media.sort_order,media.id LIMIT 1
    ) primary_media ON true
    WHERE intent.store_id=p_store_id AND intent.id=p_intent_id
  ), shipping AS (
    SELECT saas.storefront_shipping_projection(p_store_id) projection
  ), payments AS (
    SELECT saas.storefront_payment_methods_projection(p_store_id) methods
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',1,'currency','TRY','itemCount',selected.quantity,
    'subtotalCents',selected.price_cents*selected.quantity,'shippingCents',COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'totalCents',selected.price_cents*selected.quantity+COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'checkoutReady',selected.available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'productId',selected.product_id,'variantId',selected.variant_id,'slug',selected.slug,
      'title',selected.title,'variantTitle',selected.variant_title,'media',selected.media,'quantity',selected.quantity,
      'unitPriceCents',selected.price_cents,'lineTotalCents',selected.price_cents*selected.quantity,
      'available',selected.available
    )))
  ) FROM selected CROSS JOIN shipping CROSS JOIN payments
$f$;

CREATE OR REPLACE FUNCTION saas.public_checkout_quote(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  selected_intent saas.storefront_checkout_intents%ROWTYPE; cart_payload jsonb;
  payments jsonb; shipping jsonb; drift boolean:=false;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN('cart','buy_now') OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  shipping:=saas.storefront_shipping_projection(selected_store);
  IF shipping IS NULL THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  payments:=saas.storefront_payment_methods_projection(selected_store);
  IF pg_catalog.jsonb_array_length(payments)=0 THEN RETURN QUERY SELECT 'payment_unavailable',NULL::jsonb; RETURN; END IF;
  IF p_kind='cart' THEN
    SELECT cart.* INTO selected_cart FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_cart.status<>'active' OR selected_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items WHERE store_id=selected_store AND cart_id=selected_cart.id) THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; RETURN; END IF;
    SELECT EXISTS(
      SELECT 1 FROM saas.storefront_cart_items item
      CROSS JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved
      WHERE item.store_id=selected_store AND item.cart_id=selected_cart.id
        AND (resolved.outcome<>'found' OR resolved.price_cents<>item.unit_price_cents)
    ) INTO drift;
    IF drift THEN RETURN QUERY SELECT 'price_changed',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now); RETURN; END IF;
    cart_payload:=saas.storefront_cart_projection(selected_store,selected_cart.id,p_now);
  ELSE
    SELECT intent.* INTO selected_intent FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store ORDER BY intent.created_at DESC,intent.id LIMIT 1 FOR UPDATE OF intent;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_intent.status<>'active' OR selected_intent.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    SELECT resolved.outcome<>'found' OR resolved.price_cents<>selected_intent.unit_price_cents INTO drift
    FROM saas.resolve_effective_variant_price(selected_store,selected_intent.variant_id,'storefront',p_now,NULL) resolved;
    IF drift THEN RETURN QUERY SELECT 'price_changed',saas.storefront_intent_projection(selected_store,selected_intent.id,p_now); RETURN; END IF;
    cart_payload:=saas.storefront_intent_projection(selected_store,selected_intent.id,p_now);
  END IF;
  IF NOT COALESCE((cart_payload->>'checkoutReady')::boolean,false) THEN RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN; END IF;
  RETURN QUERY SELECT 'quoted',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'cart',cart_payload,'paymentMethods',payments,
    'estimatedDays',shipping->'estimatedDays'
  ));
END
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_cart_projection(uuid,uuid,timestamptz),
  saas.storefront_intent_projection(uuid,uuid,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

REVOKE ALL ON FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb)
TO celebix_saas_host_resolver;

COMMIT;
