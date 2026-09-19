BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
  IF EXISTS (
    SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
    WHERE policy.method='gold_gram'
  ) THEN RAISE EXCEPTION 'REFERENCE_PRICING_PROMOTION_ROLLBACK_REQUIRES_NO_GOLD_POLICIES'; END IF;
END $guard$;
DROP FUNCTION saas.promotion_evaluator_candidate_facts(uuid,jsonb,timestamptz,jsonb);
ALTER FUNCTION saas.promotion_evaluator_candidate_facts_unfiltered_v1(uuid,jsonb,timestamptz,jsonb)
  RENAME TO promotion_evaluator_candidate_facts;
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_catalog_line_matches(
  p_store_id uuid,p_currency text,p_targets jsonb,p_line jsonb
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $fn$
  SELECT saas.promotion_evaluator_line_matches(p_targets,p_line)
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_bundle_facts_v1(p_benefit jsonb,p_lines jsonb)
RETURNS TABLE(bundle_count bigint,complete_value bigint,floor_capacity bigint,unknown_cost boolean)
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $fn$
  WITH items AS MATERIALIZED (
    SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity
    FROM pg_catalog.jsonb_array_elements(p_benefit->'items') item
  ), availability AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,COALESCE(sum((line->>'quantity')::bigint),0)::bigint available_quantity
    FROM items LEFT JOIN pg_catalog.jsonb_array_elements(p_lines) line ON line->>'variantId'=items.variant_id
    GROUP BY items.variant_id,items.required_quantity
  ), complete AS MATERIALIZED (
    SELECT COALESCE(min(available_quantity/required_quantity),0)::bigint bundle_count FROM availability
  ), ordered AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
      CASE WHEN line->>'unitCostMinor' IS NULL THEN NULL ELSE (line->>'unitCostMinor')::bigint END cost,
      sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
    FROM items JOIN pg_catalog.jsonb_array_elements(p_lines) line ON line->>'variantId'=items.variant_id
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
DROP FUNCTION saas.pricing_variant_discount_allowed(uuid,uuid);
COMMIT;
