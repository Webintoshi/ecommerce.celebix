-- Returning to the pre-reference public projections would misstate active prices.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $fn$ BEGIN
  IF EXISTS (
    SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
    WHERE policy.method<>'fixed_try'
  ) THEN RAISE EXCEPTION 'REFERENCE_PRICING_PUBLIC_ROLLBACK_REQUIRES_NO_DYNAMIC_POLICIES'; END IF;
END $fn$;

DO $restore_quick_pricing$
DECLARE target regprocedure; definition text; patched text;
  old_fragment text; new_fragment text;
BEGIN
  target:='saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );

  IF p_link_id IS NULL OR p_link_id::text!~uuid_pattern OR p_payment_method_id IS NULL$old$;
  new_fragment:=$new$
  IF p_link_id IS NULL OR p_link_id::text!~uuid_pattern OR p_payment_method_id IS NULL$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_QUICK_CREATOR_DOWN_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,p_customer_email
    ) resolved
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active' AND resolved.outcome='found';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_QUICK_CREATOR_DOWN_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);

  target:='saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||resolved_store_id::text,0)
  );
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;$old$;
  new_fragment:=$new$
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_GENERIC_ATTEMPT_DOWN_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
  IF saas.quick_link_current_prices_match(current_link.store_id,current_link.id,p_now)
    IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'price_changed'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN$old$;
  new_fragment:=$new$
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_GENERIC_ATTEMPT_DOWN_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);

  target:='saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  IF saas.quick_link_current_prices_match(selected.store_id,selected.id,p_now)
    IS DISTINCT FROM true THEN RETURN NULL; END IF;
  SELECT pg_catalog.count(*) INTO total_item_count
  FROM saas.quick_order_link_items item$old$;
  new_fragment:=$new$
  SELECT pg_catalog.count(*) INTO total_item_count
  FROM saas.quick_order_link_items item$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_PROJECTION_DOWN_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(definition,old_fragment,new_fragment);

  target:='saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$DECLARE authority jsonb; v_link_id uuid; v_store_id uuid; v_session_id uuid; item_record record;
  replay_attempt saas.payment_attempts%ROWTYPE;$old$;
  new_fragment:=$new$DECLARE authority jsonb; v_link_id uuid; v_store_id uuid; v_session_id uuid; item_record record;$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_DOWN_DECLARE_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||v_store_id::text,0)
  );
  PERFORM link.id FROM saas.quick_order_links link
    WHERE link.store_id=v_store_id AND link.id=v_link_id FOR UPDATE OF link;$old$;
  new_fragment:=$new$
  PERFORM link.id FROM saas.quick_order_links link
    WHERE link.store_id=v_store_id AND link.id=v_link_id FOR UPDATE OF link;$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_DOWN_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(patched,old_fragment,new_fragment);
  old_fragment:=$old$
  IF EXISTS(SELECT 1 FROM saas.payment_attempt_operations operation
    WHERE operation.operation_id=p_operation_id) THEN
    SELECT attempt.* INTO replay_attempt
    FROM saas.payment_attempt_operations operation
    JOIN saas.payment_attempts attempt ON attempt.store_id=operation.store_id
      AND attempt.id=operation.attempt_id
    JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.store_id=attempt.store_id
      AND bridge.attempt_id=attempt.id
    JOIN saas.payment_callback_bindings binding ON binding.store_id=attempt.store_id
      AND binding.attempt_id=attempt.id
    WHERE operation.operation_id=p_operation_id AND operation.operation_kind='begin'
      AND operation.store_id=v_store_id AND operation.payload_fingerprint=p_fingerprint
      AND bridge.quick_order_link_id=v_link_id AND bridge.redemption_session_id=v_session_id
      AND bridge.authority_digest=p_expected_authority_digest
      AND binding.callback_binding_digest=p_callback_binding_digest;
    IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    SELECT begun.outcome,begun.result_payload INTO begin_outcome,begin_result
    FROM saas.payment_attempt_begin(
      v_store_id,p_now,p_operation_id,p_fingerprint,replay_attempt.payment_method_id,
      replay_attempt.order_reference,replay_attempt.amount_minor,replay_attempt.currency,
      p_callback_binding_digest
    ) begun;
    RETURN QUERY SELECT begin_outcome,begin_result; RETURN;
  END IF;
  IF saas.quick_link_current_prices_match(v_store_id,v_link_id,p_now)
    IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'price_changed',NULL::jsonb; RETURN;
  END IF;
  authority:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);$old$;
  new_fragment:=$new$
  authority:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_DOWN_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);
END $restore_quick_pricing$;

DROP FUNCTION saas.quick_link_current_prices_match(uuid,uuid,timestamptz);

DROP FUNCTION saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer),
  saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_category_product_projection(uuid,uuid,timestamptz),
  saas.public_effective_product_projection(uuid,uuid,timestamptz),
  saas.public_campaign_product_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.public_list_products_without_reference_pricing(uuid,text,timestamptz,integer)
  RENAME TO public_list_products;
ALTER FUNCTION saas.public_category_product_projection_without_reference_pricing(uuid,uuid,timestamptz)
  RENAME TO public_category_product_projection;
ALTER FUNCTION saas.public_effective_product_projection_without_reference_pricing(uuid,uuid,timestamptz)
  RENAME TO public_effective_product_projection;
ALTER FUNCTION saas.public_campaign_product_projection_without_reference_pricing(uuid,uuid,timestamptz)
  RENAME TO public_campaign_product_projection;
GRANT EXECUTE ON FUNCTION saas.public_list_products(uuid,text,timestamptz,integer)
  TO celebix_saas_host_resolver;
DROP FUNCTION saas.public_reference_pricing_safe_product(jsonb);
COMMIT;
