BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.price_lists)
     OR EXISTS(SELECT 1 FROM saas.price_list_items)
     OR EXISTS(SELECT 1 FROM saas.price_list_rules)
     OR EXISTS(SELECT 1 FROM saas.price_list_operations) THEN
    RAISE EXCEPTION 'PRICE_LISTS_ROLLBACK_BLOCKED';
  END IF;
END
$f$;

DO $quick_reader_restore$
DECLARE
  create_target regprocedure:=
    'saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure;
  duplicate_target regprocedure:=
    'saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'::regprocedure;
  definition text;
  restored text;
  old_fragment text;
  new_fragment text;
  old_lock_fragment text;
  new_lock_fragment text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(create_target) INTO definition;
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,p_customer_email
    ) AS resolved
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active'
      AND resolved.outcome='found';$new$;
  IF (
    pg_catalog.length(definition)-pg_catalog.length(
      pg_catalog.replace(definition,new_fragment,'')
    )
  )/pg_catalog.length(new_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_RESTORE_DRIFT';
  END IF;
  restored:=pg_catalog.replace(definition,new_fragment,old_fragment);
  old_lock_fragment:=$old$
    RETURN;
  END IF;

  IF p_link_id IS NULL OR p_link_id::text !~ uuid_pattern$old$;
  new_lock_fragment:=$new$
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );

  IF p_link_id IS NULL OR p_link_id::text !~ uuid_pattern$new$;
  IF (
    pg_catalog.length(restored)-pg_catalog.length(
      pg_catalog.replace(restored,new_lock_fragment,'')
    )
  )/pg_catalog.length(new_lock_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_RESTORE_DRIFT';
  END IF;
  restored:=pg_catalog.replace(restored,new_lock_fragment,old_lock_fragment);
  EXECUTE restored;

  SELECT pg_catalog.pg_get_functiondef(duplicate_target) INTO definition;
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=source_item.variant_id
      AND product.id=source_item.product_id AND variant.status='active' AND product.status='active';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,source_link.customer_email
    ) AS resolved
    WHERE variant.store_id=p_store_id AND variant.id=source_item.variant_id
      AND product.id=source_item.product_id AND variant.status='active' AND product.status='active'
      AND resolved.outcome='found';$new$;
  IF (
    pg_catalog.length(definition)-pg_catalog.length(
      pg_catalog.replace(definition,new_fragment,'')
    )
  )/pg_catalog.length(new_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_RESTORE_DRIFT';
  END IF;
  restored:=pg_catalog.replace(definition,new_fragment,old_fragment);
  old_lock_fragment:=$old$
    RETURN;
  END IF;
  IF p_source_link_id IS NULL OR p_link_id IS NULL OR p_link_id::text !~ uuid_pattern$old$;
  new_lock_fragment:=$new$
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  IF p_source_link_id IS NULL OR p_link_id IS NULL OR p_link_id::text !~ uuid_pattern$new$;
  IF (
    pg_catalog.length(restored)-pg_catalog.length(
      pg_catalog.replace(restored,new_lock_fragment,'')
    )
  )/pg_catalog.length(new_lock_fragment)<>1 THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_RESTORE_DRIFT';
  END IF;
  restored:=pg_catalog.replace(restored,new_lock_fragment,old_lock_fragment);
  EXECUTE restored;
END
$quick_reader_restore$;

CREATE OR REPLACE FUNCTION saas.public_list_products(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 THEN RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN; END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found'::text, NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text, COALESCE(pg_catalog.jsonb_agg(item.payload ORDER BY item.created_at DESC, item.id DESC), '[]'::jsonb)
  FROM (
    SELECT product.id, product.created_at, saas.public_product_projection(p_store_id, product.id) AS payload
    FROM saas.products AS product WHERE product.store_id = p_store_id AND product.status = 'active'
      AND EXISTS (SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active')
    ORDER BY product.created_at DESC, product.id DESC LIMIT p_limit
  ) AS item;
END
$function$;

CREATE OR REPLACE FUNCTION saas.public_get_product_by_slug(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF p_slug IS NULL OR p_slug <> lower(p_slug) OR char_length(p_slug) NOT BETWEEN 3 AND 100 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT saas.public_product_projection(p_store_id, product.id) INTO projection FROM saas.products AS product
  WHERE product.store_id=p_store_id AND product.slug=p_slug AND product.status='active';
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END, projection;
END
$function$;

CREATE OR REPLACE FUNCTION saas.quick_links_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_link_id uuid,p_item_ids uuid[],p_variant_ids uuid[],p_quantities bigint[],p_provider_config_id uuid,
  p_customer_name text,p_customer_email text,p_customer_phone text,
  p_shipping_address jsonb,p_billing_address jsonb,p_customer_note text,p_internal_label text,
  p_shipping_cents bigint,p_discount_cents bigint,p_expiry_hours bigint,
  p_token_digest text,p_token_key_id text,p_sealed_token jsonb,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.stores AS store
    WHERE store.id=p_store_id AND store.status='active' AND store.currency='TRY'
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_create_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_link_id,p_item_ids,p_variant_ids,p_quantities,p_provider_config_id,
    p_customer_name,p_customer_email,p_customer_phone,p_shipping_address,p_billing_address,
    p_customer_note,p_internal_label,p_shipping_cents,p_discount_cents,p_expiry_hours,
    p_token_digest,p_token_key_id,p_sealed_token,p_operation_id,p_fingerprint
  ) AS delegated;
END
$function$;

CREATE OR REPLACE FUNCTION saas.quick_links_duplicate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_source_link_id uuid,p_link_id uuid,p_item_ids uuid[],p_token_digest text,
  p_token_key_id text,p_sealed_token jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.quick_order_links AS link
    WHERE link.store_id=p_store_id AND link.id=p_source_link_id AND link.currency='TRY'
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_duplicate_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_source_link_id,p_link_id,p_item_ids,p_token_digest,p_token_key_id,p_sealed_token,
    p_operation_id,p_fingerprint
  ) AS delegated;
END
$function$;

CREATE OR REPLACE FUNCTION saas.abandoned_carts_capture(
  p_hostname text,p_cart_id uuid,p_credential_digest text,p_now timestamptz,p_customer jsonb,p_items jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
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

DO $f$
DECLARE definition text;
BEGIN
  SELECT pg_catalog.string_agg(pg_catalog.pg_get_functiondef(signature::regprocedure),E'\n')
  INTO definition
  FROM pg_catalog.unnest(ARRAY[
    'saas.public_list_products(uuid,text,timestamp with time zone,integer)',
    'saas.public_get_product_by_slug(uuid,text,timestamp with time zone,text)',
    'saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)',
    'saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)',
    'saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'
  ]) signature;
  IF definition LIKE '%resolve_effective_variant_price%' THEN
    RAISE EXCEPTION 'PRICE_LIST_READER_RESTORE_DRIFT';
  END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_get_product_by_slug(uuid,text,timestamptz,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION
  saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_get_product_by_slug(uuid,text,timestamptz,text)
TO celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION
  saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text),
  saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
FROM PUBLIC,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
  saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text),
  saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
TO celebix_saas_app;
REVOKE ALL ON FUNCTION
  saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
  saas.abandoned_carts_capture(text,uuid,text,timestamptz,jsonb,jsonb)
TO celebix_saas_workflow;

DROP FUNCTION saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text);
DROP FUNCTION saas.pricing_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.pricing_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.pricing_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.pricing_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb,jsonb);
DROP FUNCTION saas.pricing_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.pricing_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.pricing_projection(uuid,uuid);
DROP FUNCTION saas.pricing_rules_valid(uuid,jsonb,timestamptz);
DROP FUNCTION saas.pricing_items_valid(uuid,jsonb);
DROP FUNCTION saas.pricing_json_timestamp(timestamptz);
DROP TRIGGER price_list_operations_immutable ON saas.price_list_operations;
DROP FUNCTION saas.guard_price_list_operation_mutation();
DROP TABLE saas.price_list_operations;
DROP TABLE saas.price_list_rules;
DROP TABLE saas.price_list_items;
DROP TABLE saas.price_lists;

COMMIT;
