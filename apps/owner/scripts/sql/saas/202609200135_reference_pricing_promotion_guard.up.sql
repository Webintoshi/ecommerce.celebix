-- A gold price is excluded from whole-amount discounts unless the merchant
-- explicitly opts it in. Keep the existing promotion rules and fixed TRY
-- eligibility unchanged; decisions use durable tenant-bound policy, never
-- client-supplied flags.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.pricing_variant_discount_allowed(p_store_id uuid,p_variant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT COALESCE((
    SELECT CASE WHEN policy.method='gold_gram' THEN policy.allow_full_discount ELSE true END
    FROM saas.product_variants variant
    LEFT JOIN saas.pricing_variant_policy_state state
      ON state.store_id=variant.store_id AND state.variant_id=variant.id
    LEFT JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
  ),false)
$fn$;
REVOKE ALL ON FUNCTION saas.pricing_variant_discount_allowed(uuid,uuid)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_catalog_line_matches(
  p_store_id uuid,p_currency text,p_targets jsonb,p_line jsonb
) RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.pricing_variant_discount_allowed(p_store_id,(p_line->>'variantId')::uuid)
    AND saas.promotion_evaluator_line_matches(p_targets,p_line)
$fn$;

-- The bundle helper does not receive a tenant parameter. Its inputs are
-- catalog-materialized variant IDs; resolve the owner store from the durable
-- globally unique variant row and never trust line-carried tenant metadata.
CREATE OR REPLACE FUNCTION saas.promotion_bundle_facts_v1(p_benefit jsonb,p_lines jsonb)
RETURNS TABLE(bundle_count bigint,complete_value bigint,floor_capacity bigint,unknown_cost boolean)
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  WITH items AS MATERIALIZED (
    SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity
    FROM pg_catalog.jsonb_array_elements(p_benefit->'items') item
  ), eligible AS MATERIALIZED (
    SELECT line FROM pg_catalog.jsonb_array_elements(p_lines) line
    JOIN saas.product_variants variant ON variant.id=(line->>'variantId')::uuid
    WHERE saas.pricing_variant_discount_allowed(variant.store_id,variant.id)
  ), availability AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,COALESCE(sum((line->>'quantity')::bigint),0)::bigint available_quantity
    FROM items LEFT JOIN eligible line ON line->>'variantId'=items.variant_id
    GROUP BY items.variant_id,items.required_quantity
  ), complete AS MATERIALIZED (
    SELECT COALESCE(min(available_quantity/required_quantity),0)::bigint bundle_count FROM availability
  ), ordered AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
      CASE WHEN line->>'unitCostMinor' IS NULL THEN NULL ELSE (line->>'unitCostMinor')::bigint END cost,
      sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
    FROM items JOIN eligible line ON line->>'variantId'=items.variant_id
  ), consumed AS MATERIALIZED (
    SELECT ordered.*,LEAST(ordered.quantity,GREATEST(0,complete.bundle_count*ordered.required_quantity-ordered.prior_quantity))::bigint take_quantity
    FROM complete JOIN ordered ON ordered.prior_quantity<complete.bundle_count*ordered.required_quantity
  )
  SELECT complete.bundle_count,
    COALESCE(sum(consumed.price*consumed.take_quantity),0)::bigint,
    COALESCE(sum(CASE WHEN consumed.cost IS NULL THEN 0 ELSE GREATEST(0,(consumed.price-consumed.cost)*consumed.take_quantity) END),0)::bigint,
    COALESCE(bool_or(consumed.cost IS NULL) FILTER (WHERE consumed.take_quantity>0),false)
  FROM complete LEFT JOIN consumed ON consumed.take_quantity>0
  GROUP BY complete.bundle_count
$fn$;

-- Gift eligibility is calculated separately from cart-line matching. Wrap the
-- existing bounded fact relation to reject protected-gold gift rewards. A
-- bundle with a protected member is already zero-capacity above.
ALTER FUNCTION saas.promotion_evaluator_candidate_facts(uuid,jsonb,timestamptz,jsonb)
  RENAME TO promotion_evaluator_candidate_facts_unfiltered_v1;
CREATE FUNCTION saas.promotion_evaluator_candidate_facts(
  p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb
) RETURNS TABLE(id uuid,name text,version bigint,rule_document jsonb,created_at timestamptz,
  used bigint,budget bigint,customer_used bigint,eligible_value bigint,eligible_quantity bigint,
  gift_variant_valid boolean,gift_stock_tracking boolean,gift_available_quantity bigint,selected_override boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT candidate.id,candidate.name,candidate.version,candidate.rule_document,candidate.created_at,
    candidate.used,candidate.budget,candidate.customer_used,candidate.eligible_value,
    candidate.eligible_quantity,
    candidate.gift_variant_valid AND CASE WHEN candidate.rule_document->'benefit'->>'kind'='gift'
      THEN saas.pricing_variant_discount_allowed(p_store_id,
        (candidate.rule_document->'benefit'->>'giftVariantId')::uuid) ELSE true END,
    candidate.gift_stock_tracking,candidate.gift_available_quantity,candidate.selected_override
  FROM saas.promotion_evaluator_candidate_facts_unfiltered_v1(p_store_id,p_context,p_now,p_selected) candidate
$fn$;
REVOKE ALL ON FUNCTION saas.promotion_evaluator_candidate_facts(uuid,jsonb,timestamptz,jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.promotion_evaluator_candidate_facts_unfiltered_v1(uuid,jsonb,timestamptz,jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
COMMIT;
