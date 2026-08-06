BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

LOCK TABLE saas.storefront_hosted_checkout_sessions,saas.storefront_hosted_checkout_operations,
  saas.checkout_inventory_reservations IN ACCESS EXCLUSIVE MODE;
DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions)
    OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations WHERE storefront_hosted_session_id IS NOT NULL)
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_DOWN_BLOCKED'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DROP FUNCTION saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer);
ALTER FUNCTION saas.public_cart_mutate_without_available_stock_v090(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) RENAME TO public_cart_mutate;

DROP FUNCTION saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer);
ALTER FUNCTION saas.public_buy_now_create_without_available_stock_v090(
  text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer
) RENAME TO public_buy_now_create;

DROP FUNCTION saas.public_checkout_complete(
  text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,
  uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz
);
ALTER FUNCTION saas.public_checkout_complete_without_available_stock_v090(
  text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,
  uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz
) RENAME TO public_checkout_complete;

CREATE OR REPLACE FUNCTION saas.storefront_payment_methods_projection(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',method.kind,'label',method.label,'instructions',method.config->>'instructions',
      'bankName',CASE WHEN method.kind='bank_transfer' THEN method.config->>'bankName' END,
      'accountHolder',CASE WHEN method.kind='bank_transfer' THEN method.config->>'accountHolder' END,
      'iban',CASE WHEN method.kind='bank_transfer' THEN method.config->>'iban' END
    )) ORDER BY method.position,method.id
  ),'[]'::jsonb)
  FROM saas.payment_methods method
  WHERE method.store_id=p_store_id AND method.kind IN('bank_transfer','cash_on_delivery')
    AND method.state='active' AND saas.built_in_payment_method_config_valid(method.kind,method.config)
$f$;

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
  ), shipping AS (SELECT saas.storefront_shipping_projection(p_store_id) projection),
  payments AS (SELECT saas.storefront_payment_methods_projection(p_store_id) methods)
  SELECT pg_catalog.jsonb_build_object(
    'version',cart.version,'currency','TRY','itemCount',aggregate.item_count,
    'subtotalCents',aggregate.subtotal,'shippingCents',CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'totalCents',aggregate.subtotal+CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'checkoutReady',aggregate.item_count>0 AND aggregate.all_available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'checkoutBlocker',CASE WHEN aggregate.item_count=0 THEN 'empty_cart' WHEN NOT aggregate.all_available THEN 'stock_unavailable'
      WHEN shipping.projection IS NULL THEN 'shipping_unavailable' WHEN pg_catalog.jsonb_array_length(payments.methods)=0 THEN 'payment_unavailable' ELSE NULL END,
    'items',aggregate.items
  ) FROM saas.storefront_carts cart CROSS JOIN aggregate CROSS JOIN shipping CROSS JOIN payments
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
  ), shipping AS (SELECT saas.storefront_shipping_projection(p_store_id) projection),
  payments AS (SELECT saas.storefront_payment_methods_projection(p_store_id) methods)
  SELECT pg_catalog.jsonb_build_object(
    'version',1,'currency','TRY','itemCount',selected.quantity,
    'subtotalCents',selected.price_cents*selected.quantity,'shippingCents',COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'totalCents',selected.price_cents*selected.quantity+COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'checkoutReady',selected.available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'checkoutBlocker',CASE WHEN NOT selected.available THEN 'stock_unavailable' WHEN shipping.projection IS NULL THEN 'shipping_unavailable'
      WHEN pg_catalog.jsonb_array_length(payments.methods)=0 THEN 'payment_unavailable' ELSE NULL END,
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'productId',selected.product_id,'variantId',selected.variant_id,'slug',selected.slug,'title',selected.title,
      'variantTitle',selected.variant_title,'media',selected.media,'quantity',selected.quantity,'unitPriceCents',selected.price_cents,
      'lineTotalCents',selected.price_cents*selected.quantity,'available',selected.available
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
    SELECT EXISTS(SELECT 1 FROM saas.storefront_cart_items item
      CROSS JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved
      WHERE item.store_id=selected_store AND item.cart_id=selected_cart.id
        AND (resolved.outcome<>'found' OR resolved.price_cents<>item.unit_price_cents)) INTO drift;
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
  RETURN QUERY SELECT 'quoted',pg_catalog.jsonb_build_object('cart',cart_payload,'paymentMethods',payments,'estimatedDays',shipping->'estimatedDays');
END
$f$;

DROP FUNCTION saas.storefront_available_stock(uuid,uuid,timestamptz,uuid);

DROP INDEX saas.checkout_inventory_reservations_standard_session_variant_key;
ALTER TABLE saas.checkout_inventory_reservations
  DROP CONSTRAINT checkout_inventory_reservations_standard_session_store_fk,
  DROP CONSTRAINT checkout_inventory_reservations_commerce_owner_check,
  DROP COLUMN storefront_hosted_session_id,
  ALTER COLUMN quick_order_link_id SET NOT NULL;

CREATE OR REPLACE FUNCTION saas.guard_checkout_reservation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_DELETE_DENIED'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.stock_tracked IS DISTINCT FROM NEW.stock_tracked OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.variant_id IS DISTINCT FROM NEW.variant_id
    OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
    OR OLD.payment_attempt_id IS DISTINCT FROM NEW.payment_attempt_id
    OR OLD.held_at IS DISTINCT FROM NEW.held_at OR NEW.updated_at<OLD.updated_at
    OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_AUTHORITY_IMMUTABLE'; END IF;
  IF OLD.status IN('consumed','released','expired') THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TERMINAL'; END IF;
  IF OLD.status='held' AND NEW.status NOT IN('held','consumed','released','expired')
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TRANSITION_DENIED'; END IF;
  RETURN NEW;
END
$f$;

DROP TRIGGER storefront_hosted_checkout_operations_immutable ON saas.storefront_hosted_checkout_operations;
DROP FUNCTION saas.guard_storefront_hosted_checkout_operation();
DROP TABLE saas.storefront_hosted_checkout_operations;
DROP TRIGGER storefront_hosted_checkout_sessions_guard ON saas.storefront_hosted_checkout_sessions;
DROP FUNCTION saas.guard_storefront_hosted_checkout_session();
DROP TABLE saas.storefront_hosted_checkout_sessions;

REVOKE ALL ON FUNCTION
  saas.storefront_payment_methods_projection(uuid),
  saas.storefront_cart_projection(uuid,uuid,timestamptz),
  saas.storefront_intent_projection(uuid,uuid,timestamptz),
  saas.public_checkout_quote(text,timestamptz,text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_quote(text,timestamptz,text,jsonb),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz)
TO celebix_saas_host_resolver;

COMMIT;
