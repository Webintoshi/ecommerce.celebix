-- Legacy manual drafts snapshot the cached variant cents. Until manual draft
-- confirmation can use the versioned effective price, dynamic variants are
-- deliberately unavailable through this channel; fixed orders are unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.pricing_manual_order_dynamic_variant(p_store_id uuid,p_variant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
    WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id
      AND policy.method IN ('usd','eur','gold_gram')
  )
$fn$;
REVOKE ALL ON FUNCTION saas.pricing_manual_order_dynamic_variant(uuid,uuid)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE OR REPLACE FUNCTION saas.order_drafts_replace_lines(p_store_id uuid,p_draft_id uuid,p_intent jsonb,p_now timestamptz)
RETURNS TABLE(outcome text,subtotal_cents bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE expected_count integer:=pg_catalog.jsonb_array_length(p_intent->'lines'); catalog_count integer; computed_subtotal numeric;
BEGIN
  -- Policy writes and draft creation both serialize on the catalog-store lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_intent->'lines') line
    WHERE saas.pricing_manual_order_dynamic_variant(p_store_id,(line->>'variantId')::uuid)
  ) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::bigint; RETURN; END IF;
  PERFORM variant.id
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id AND product.status='active'
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active'
  ORDER BY variant.id FOR SHARE OF product,variant;
  SELECT pg_catalog.count(*),pg_catalog.sum(variant.price_cents::numeric*(requested.value->>'quantity')::integer-(requested.value->>'discountCents')::numeric)
  INTO catalog_count,computed_subtotal
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id AND product.status='active'
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active'
  WHERE (requested.value->>'discountCents')::numeric<=variant.price_cents::numeric*(requested.value->>'quantity')::integer;
  IF catalog_count<>expected_count THEN RETURN QUERY SELECT 'catalog_conflict',NULL::bigint; RETURN; END IF;
  IF computed_subtotal<0 OR computed_subtotal>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::bigint; RETURN; END IF;
  DELETE FROM saas.order_draft_lines AS draft_line WHERE draft_line.store_id=p_store_id AND draft_line.draft_id=p_draft_id;
  INSERT INTO saas.order_draft_lines(id,store_id,draft_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
  SELECT (requested.value->>'lineId')::uuid,p_store_id,p_draft_id,product.id,variant.id,(requested.ordinality-1)::integer,product.title,variant.title,variant.sku,variant.price_cents,(requested.value->>'quantity')::integer,(requested.value->>'discountCents')::bigint,variant.price_cents*(requested.value->>'quantity')::integer-(requested.value->>'discountCents')::bigint,p_now
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id
  ORDER BY requested.ordinality;
  RETURN QUERY SELECT 'saved',computed_subtotal::bigint;
END
$function$;

CREATE FUNCTION saas.pricing_manual_order_item_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.orders order_row WHERE order_row.store_id=NEW.store_id
      AND order_row.id=NEW.order_id AND order_row.source='manual') THEN
    -- Legacy conversion locked this variant FOR UPDATE before inserting the
    -- item. The policy save updates the same row, so a later conversion sees
    -- the newly committed policy without reversing the legacy lock order.
    IF saas.pricing_manual_order_dynamic_variant(NEW.store_id,NEW.variant_id) THEN
      RAISE EXCEPTION 'REFERENCE_PRICING_MANUAL_ORDER_REQUIRES_RECONFIRMATION' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION saas.pricing_manual_order_item_guard()
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
CREATE TRIGGER pricing_manual_order_item_guard BEFORE INSERT ON saas.order_items
FOR EACH ROW EXECUTE FUNCTION saas.pricing_manual_order_item_guard();
COMMIT;
