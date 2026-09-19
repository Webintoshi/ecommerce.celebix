-- Public reference pricing: preserve existing product shapes and one effective-price authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.public_reference_pricing_safe_product(p_product jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
DECLARE normalized jsonb; variants jsonb;
BEGIN
  IF p_product IS NULL THEN RETURN NULL; END IF;
  normalized:=p_product;
  IF normalized ? 'compareAtCents'
    AND (normalized->>'compareAtCents')::bigint<=(normalized->>'priceCents')::bigint THEN
    normalized:=normalized-'compareAtCents';
  END IF;
  IF normalized ? 'variants' THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(
      CASE WHEN entry.value ? 'compareAtCents'
        AND (entry.value->>'compareAtCents')::bigint<=(entry.value->>'priceCents')::bigint
        THEN entry.value-'compareAtCents' ELSE entry.value END
      ORDER BY entry.ordinality),'[]'::jsonb)
    INTO variants
    FROM pg_catalog.jsonb_array_elements(normalized->'variants') WITH ORDINALITY entry(value,ordinality);
    normalized:=pg_catalog.jsonb_set(normalized,'{variants}',variants);
  END IF;
  RETURN normalized;
END $fn$;

-- List has its own projection; category, search and campaign/detail have distinct
-- projection seams. Keep the old implementations private for a lossless down.
ALTER FUNCTION saas.public_list_products(uuid,text,timestamptz,integer)
  RENAME TO public_list_products_without_reference_pricing;
CREATE FUNCTION saas.public_list_products(
  p_store_id uuid,p_hostname text,p_now timestamptz,p_limit integer
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE original record;
BEGIN
  SELECT * INTO original FROM saas.public_list_products_without_reference_pricing(
    p_store_id,p_hostname,p_now,p_limit);
  IF original.outcome<>'found' THEN
    RETURN QUERY SELECT original.outcome::text,original.result_payload::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',COALESCE((SELECT pg_catalog.jsonb_agg(
    saas.public_reference_pricing_safe_product(entry.value) ORDER BY entry.ordinality)
    FROM pg_catalog.jsonb_array_elements(original.result_payload) WITH ORDINALITY entry(value,ordinality)),'[]'::jsonb);
END $fn$;

ALTER FUNCTION saas.public_category_product_projection(uuid,uuid,timestamptz)
  RENAME TO public_category_product_projection_without_reference_pricing;
CREATE FUNCTION saas.public_category_product_projection(
  p_store_id uuid,p_product_id uuid,p_now timestamptz
) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.public_reference_pricing_safe_product(
    saas.public_category_product_projection_without_reference_pricing(p_store_id,p_product_id,p_now))
$fn$;

ALTER FUNCTION saas.public_effective_product_projection(uuid,uuid,timestamptz)
  RENAME TO public_effective_product_projection_without_reference_pricing;
CREATE FUNCTION saas.public_effective_product_projection(
  p_store_id uuid,p_product_id uuid,p_now timestamptz
) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.public_reference_pricing_safe_product(
    saas.public_effective_product_projection_without_reference_pricing(p_store_id,p_product_id,p_now))
$fn$;

ALTER FUNCTION saas.public_campaign_product_projection(uuid,uuid,timestamptz)
  RENAME TO public_campaign_product_projection_without_reference_pricing;
CREATE FUNCTION saas.public_campaign_product_projection(
  p_store_id uuid,p_product_id uuid,p_now timestamptz
) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.public_reference_pricing_safe_product(
    saas.public_campaign_product_projection_without_reference_pricing(p_store_id,p_product_id,p_now))
$fn$;

-- Complete tenant catalog resolution precedes filtering, ordering and pagination.
-- The hostname is the only tenant selector; no browser-supplied store ID is trusted.
CREATE FUNCTION saas.public_catalog_query_v2(
  p_hostname text,p_now timestamptz,p_category_slug text,p_query text,
  p_filter text,p_order text,p_limit integer,p_offset integer
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_category uuid; items jsonb; total_count bigint; page_count bigint;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR (p_category_slug IS NOT NULL AND (
      p_category_slug<>pg_catalog.lower(p_category_slug)
      OR pg_catalog.char_length(p_category_slug) NOT BETWEEN 1 AND 100
      OR p_category_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'))
    OR p_query IS NULL OR p_query<>pg_catalog.btrim(p_query)
    OR pg_catalog.octet_length(p_query)>100 OR p_query~'[[:cntrl:]]'
    OR p_filter IS NULL OR p_filter NOT IN ('all','available','discounted')
    OR p_order IS NULL OR p_order NOT IN ('featured','title-asc','price-asc','price-desc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.store_policy_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF p_category_slug IS NOT NULL THEN
    SELECT category.id INTO selected_category FROM saas.catalog_categories category
    WHERE category.store_id=selected_store AND category.slug=p_category_slug AND category.status='active';
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT product.id,product.created_at,product.title,
      saas.public_effective_product_projection(selected_store,product.id,p_now) payload
    FROM saas.products product
    WHERE product.store_id=selected_store AND product.status='active'
      AND (selected_category IS NULL OR EXISTS (
        SELECT 1 FROM saas.catalog_product_categories assignment
        WHERE assignment.store_id=selected_store AND assignment.product_id=product.id
          AND assignment.category_id=selected_category))
      AND (p_query='' OR pg_catalog.strpos(pg_catalog.lower(product.title),pg_catalog.lower(p_query))>0)
  ), eligible AS MATERIALIZED (
    SELECT candidate.id,candidate.created_at,candidate.title,candidate.payload,
      (candidate.payload->>'available')::boolean available,
      (candidate.payload->>'priceCents')::bigint price_cents
    FROM candidates candidate WHERE candidate.payload IS NOT NULL
      AND (p_filter='all'
        OR (p_filter='available' AND (candidate.payload->>'available')::boolean)
        OR (p_filter='discounted' AND candidate.payload ? 'compareAtCents'
          AND (candidate.payload->>'compareAtCents')::bigint>(candidate.payload->>'priceCents')::bigint))
  ), page AS (
    SELECT eligible.* FROM eligible
    ORDER BY CASE WHEN p_order='featured' THEN eligible.available END DESC,
      CASE WHEN p_order='featured' THEN eligible.created_at END DESC,
      CASE WHEN p_order='title-asc' THEN pg_catalog.lower(eligible.title) END ASC,
      CASE WHEN p_order='price-asc' THEN eligible.price_cents END ASC,
      CASE WHEN p_order='price-desc' THEN eligible.price_cents END DESC,
      CASE WHEN p_order='featured' THEN eligible.id END DESC,
      eligible.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE((SELECT pg_catalog.jsonb_agg(page.payload ORDER BY
    CASE WHEN p_order='featured' THEN page.available END DESC,
    CASE WHEN p_order='featured' THEN page.created_at END DESC,
    CASE WHEN p_order='title-asc' THEN pg_catalog.lower(page.title) END ASC,
    CASE WHEN p_order='price-asc' THEN page.price_cents END ASC,
    CASE WHEN p_order='price-desc' THEN page.price_cents END DESC,
    CASE WHEN p_order='featured' THEN page.id END DESC,page.id ASC) FROM page),'[]'::jsonb),
    (SELECT pg_catalog.count(*) FROM eligible),(SELECT pg_catalog.count(*) FROM page)
  INTO items,total_count,page_count;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'items',items,'total',total_count,
    'nextOffset',CASE WHEN p_offset+page_count<total_count THEN p_offset+page_count ELSE NULL::bigint END);
END $fn$;

-- An existing quick link is an immutable quote, not a perpetual right to sell
-- at its old amount. Only a new attempt is gated; bound attempts retain their
-- original payment snapshot and idempotent replay semantics.
CREATE FUNCTION saas.quick_link_current_prices_match(
  p_store_id uuid,p_link_id uuid,p_now timestamptz
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_link saas.quick_order_links%ROWTYPE;
  item_count bigint; matched_count bigint; current_subtotal numeric;
BEGIN
  IF p_store_id IS NULL OR p_link_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN false; END IF;
  SELECT link.* INTO selected_link FROM saas.quick_order_links link
  WHERE link.store_id=p_store_id AND link.id=p_link_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT pg_catalog.count(*),pg_catalog.count(*) FILTER (WHERE
    product.status='active' AND product.archived_at IS NULL
    AND variant.status='active' AND variant.archived_at IS NULL
    AND resolved.outcome='found' AND resolved.price_cents=item.unit_price_cents
    AND item.unit_price_cents BETWEEN 1 AND 8000000000
    AND item.quantity BETWEEN 1 AND 9999
    AND item.line_total_cents::numeric=item.unit_price_cents::numeric*item.quantity::numeric
  ),COALESCE(pg_catalog.sum(item.line_total_cents::numeric),0)
  INTO item_count,matched_count,current_subtotal
  FROM saas.quick_order_link_items item
  LEFT JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
  LEFT JOIN saas.product_variants variant ON variant.store_id=item.store_id
    AND variant.id=item.variant_id AND variant.product_id=item.product_id
  LEFT JOIN LATERAL saas.resolve_effective_variant_price(
    p_store_id,item.variant_id,'quick_order',p_now,selected_link.customer_email
  ) resolved ON true
  WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_link_id;
  RETURN item_count BETWEEN 1 AND 100 AND matched_count=item_count
    AND current_subtotal=selected_link.subtotal_cents::numeric
    AND selected_link.total_cents::numeric=current_subtotal
      +selected_link.shipping_cents::numeric-selected_link.discount_cents::numeric;
END $fn$;

-- The old hosted creator predates price lists; patch its two narrow seams
-- under source-drift guards rather than copying its long authorization body.
DO $quick_creator_patch$
DECLARE target regprocedure:='saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure;
  definition text; patched text; old_fragment text; new_fragment text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  IF p_link_id IS NULL OR p_link_id::text!~uuid_pattern OR p_payment_method_id IS NULL$old$;
  new_fragment:=$new$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );

  IF p_link_id IS NULL OR p_link_id::text!~uuid_pattern OR p_payment_method_id IS NULL$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_QUICK_CREATOR_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';$old$;
  new_fragment:=$new$
    SELECT product.id,product.title,variant.title,variant.sku,resolved.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,'quick_order',p_now,p_customer_email
    ) resolved
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active' AND resolved.outcome='found';$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_QUICK_CREATOR_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);
END $quick_creator_patch$;

DO $quick_attempt_patch$
DECLARE target regprocedure; definition text; patched text;
  old_fragment text; new_fragment text;
BEGIN
  target:='saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;$old$;
  new_fragment:=$new$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||resolved_store_id::text,0)
  );
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_GENERIC_ATTEMPT_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN$old$;
  new_fragment:=$new$
  IF saas.quick_link_current_prices_match(current_link.store_id,current_link.id,p_now)
    IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'price_changed'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_GENERIC_ATTEMPT_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);

  target:='saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$
  SELECT pg_catalog.count(*) INTO total_item_count
  FROM saas.quick_order_link_items item$old$;
  new_fragment:=$new$
  IF saas.quick_link_current_prices_match(selected.store_id,selected.id,p_now)
    IS DISTINCT FROM true THEN RETURN NULL; END IF;
  SELECT pg_catalog.count(*) INTO total_item_count
  FROM saas.quick_order_link_items item$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_PROJECTION_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(definition,old_fragment,new_fragment);

  target:='saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)'::regprocedure;
  SELECT pg_catalog.pg_get_functiondef(target) INTO definition;
  old_fragment:=$old$DECLARE authority jsonb; v_link_id uuid; v_store_id uuid; v_session_id uuid; item_record record;$old$;
  new_fragment:=$new$DECLARE authority jsonb; v_link_id uuid; v_store_id uuid; v_session_id uuid; item_record record;
  replay_attempt saas.payment_attempts%ROWTYPE;$new$;
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_DECLARE_DRIFT'; END IF;
  patched:=pg_catalog.replace(definition,old_fragment,new_fragment);
  old_fragment:=$old$
  PERFORM link.id FROM saas.quick_order_links link
    WHERE link.store_id=v_store_id AND link.id=v_link_id FOR UPDATE OF link;$old$;
  new_fragment:=$new$
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||v_store_id::text,0)
  );
  PERFORM link.id FROM saas.quick_order_links link
    WHERE link.store_id=v_store_id AND link.id=v_link_id FOR UPDATE OF link;$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_LOCK_DRIFT'; END IF;
  patched:=pg_catalog.replace(patched,old_fragment,new_fragment);
  old_fragment:=$old$
  authority:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);$old$;
  new_fragment:=$new$
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
  authority:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);$new$;
  IF (pg_catalog.length(patched)-pg_catalog.length(pg_catalog.replace(patched,old_fragment,'')))
    /pg_catalog.length(old_fragment)<>1 THEN RAISE EXCEPTION 'REFERENCE_HOSTED_BEGIN_PRICE_DRIFT'; END IF;
  EXECUTE pg_catalog.replace(patched,old_fragment,new_fragment);
END $quick_attempt_patch$;

REVOKE ALL ON FUNCTION saas.public_reference_pricing_safe_product(jsonb),
  saas.quick_link_current_prices_match(uuid,uuid,timestamptz),
  saas.public_list_products_without_reference_pricing(uuid,text,timestamptz,integer),
  saas.public_category_product_projection_without_reference_pricing(uuid,uuid,timestamptz),
  saas.public_effective_product_projection_without_reference_pricing(uuid,uuid,timestamptz),
  saas.public_campaign_product_projection_without_reference_pricing(uuid,uuid,timestamptz),
  saas.public_category_product_projection(uuid,uuid,timestamptz),
  saas.public_effective_product_projection(uuid,uuid,timestamptz),
  saas.public_campaign_product_projection(uuid,uuid,timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,
  celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,
  celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_list_products(uuid,text,timestamptz,integer),
  saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)
TO celebix_saas_host_resolver;

COMMIT;
