-- Explicit catalog-weight adoption into the existing immutable reference-price engine.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- A draft before the first activation must satisfy the existing boolean DTO.
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_projection(p_store_id uuid,p_set_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'setId',selected.id,'version',selected.version,'stateVersion',COALESCE(state.version,0),
    'isActive',COALESCE(state.active_set_id=selected.id,false),
    'createdAt',saas.pricing_json_timestamp(selected.created_at),
    'values',COALESCE((SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('referenceId',definition.id,'kind',definition.kind,
        'label',definition.label,'rateTry',CASE WHEN value.rate_try IS NULL THEN NULL ELSE value.rate_try::text END,
        'active',value.active)
        || CASE WHEN definition.reference_purity IS NULL THEN '{}'::jsonb
           ELSE pg_catalog.jsonb_build_object('referencePurity',definition.reference_purity::text) END
      ORDER BY definition.kind,definition.id)
      FROM saas.pricing_reference_set_values value JOIN saas.pricing_reference_definitions definition
        ON definition.store_id=value.store_id AND definition.id=value.reference_id
      WHERE value.store_id=selected.store_id AND value.set_id=selected.id),'[]'::jsonb))
  FROM saas.pricing_reference_sets selected
  LEFT JOIN saas.pricing_reference_state state ON state.store_id=selected.store_id
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id
$fn$;

CREATE OR REPLACE FUNCTION saas.pricing_reference_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_page_size integer,p_after_set_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_state saas.pricing_reference_state%ROWTYPE;
  items jsonb; has_more boolean; cursor_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_after_set_version IS NOT NULL AND p_after_set_version<1) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'setId',page.id,'version',page.version,
    'createdAt',saas.pricing_json_timestamp(page.created_at),
    'isActive',COALESCE(page.id=selected_state.active_set_id,false)) ORDER BY page.version DESC),'[]'::jsonb),
    MIN(page.version)
  INTO items,cursor_version
  FROM (SELECT selected.id,selected.version,selected.created_at
    FROM saas.pricing_reference_sets selected WHERE selected.store_id=p_store_id
      AND (p_after_set_version IS NULL OR selected.version<p_after_set_version)
    ORDER BY selected.version DESC LIMIT p_page_size) page;
  SELECT EXISTS(SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.version<cursor_version) INTO has_more;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'activeSetId',selected_state.active_set_id,'stateVersion',COALESCE(selected_state.version,0),
    'items',items,'nextCursor',CASE WHEN has_more THEN cursor_version ELSE NULL::bigint END);
END $fn$;

CREATE OR REPLACE FUNCTION saas.pricing_catalog_gram_candidates(p_store_id uuid,p_reference_id uuid)
RETURNS TABLE(variant_id uuid,product_id uuid,variant_version bigint,policy_version bigint,policy jsonb,scope jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT variant.id,variant.product_id,variant.version,COALESCE(state.current_version,0),
   pg_catalog.jsonb_build_object('method','gold_gram','referenceId',p_reference_id,
     'metalGrams',pg_catalog.trim_scale(CASE WHEN variant.measurements->'weight'->>'unit'='kg'
       THEN weight.value ELSE weight.value/1000 END)::text,
     'purityMode','direct','laborMode','none','upliftPercent','0','allowFullDiscount',false),
   pg_catalog.jsonb_build_object('variantId',variant.id,'variantVersion',variant.version,
     'productId',product.id,'productVersion',product.version,'productStatus',product.status,
     'variantStatus',variant.status,'currency',product.currency,'weight',variant.measurements->'weight',
     'policyVersion',COALESCE(state.current_version,0),'priceCents',variant.price_cents)
 FROM saas.product_variants variant
 JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
 LEFT JOIN saas.pricing_variant_policy_state state ON state.store_id=variant.store_id AND state.variant_id=variant.id
 LEFT JOIN saas.pricing_variant_policy_versions current_policy ON current_policy.store_id=state.store_id
   AND current_policy.variant_id=state.variant_id AND current_policy.version=state.current_version
 CROSS JOIN LATERAL (SELECT CASE WHEN pg_catalog.jsonb_typeof(variant.measurements->'weight'->'valueMilli')='number'
   THEN (variant.measurements->'weight'->>'valueMilli')::numeric ELSE NULL::numeric END AS value) weight
 WHERE variant.store_id=p_store_id AND variant.status='active' AND product.status='active' AND product.currency='TRY'
   AND (current_policy.method IS NULL OR current_policy.method='fixed_try')
   AND variant.measurements->'weight'->>'unit' IN ('g','kg')
   AND weight.value BETWEEN 1 AND 9007199254740991 AND weight.value=pg_catalog.trunc(weight.value)
$fn$;

CREATE OR REPLACE FUNCTION saas.pricing_catalog_gram_scope_digest(p_store_id uuid,p_set_id uuid,p_reference_id uuid,p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 WITH candidates AS MATERIALIZED (SELECT * FROM saas.pricing_catalog_gram_candidates(p_store_id,p_reference_id))
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
   'referenceScope',saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now),'catalogGramReferenceId',p_reference_id,
   'catalogGrams',COALESCE((SELECT pg_catalog.jsonb_agg(scope ORDER BY variant_id) FROM candidates),'[]'::jsonb),
   -- V1 covers dynamic lists; this additional scope covers the new fixed candidates.
   'catalogLists',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'variantId',item.variant_id,'list',pg_catalog.to_jsonb(list),'item',pg_catalog.to_jsonb(item),
     'rule',pg_catalog.to_jsonb(rule)) ORDER BY item.variant_id,list.id,rule.id)
     FROM saas.price_lists list JOIN saas.price_list_items item ON item.store_id=list.store_id AND item.price_list_id=list.id
     JOIN candidates candidate ON candidate.variant_id=item.variant_id
     LEFT JOIN saas.price_list_rules rule ON rule.store_id=list.store_id AND rule.price_list_id=list.id
     WHERE list.store_id=p_store_id),'[]'::jsonb))::text,'UTF8')),'hex')
$fn$;

CREATE OR REPLACE FUNCTION saas.pricing_reference_set_preview_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
 p_plan_version bigint,p_now timestamptz,p_set_id uuid,p_channel text,p_page_size integer,
 p_after_variant_id uuid,p_catalog_gram_reference_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected record; old_price record; candidate record; entries jsonb:='[]';
 seen_products uuid[]:='{}'; affected_count bigint:=0; override_count bigint:=0; unavailable_count bigint:=0;
 page_count integer:=0; last_id uuid; has_more boolean:=false; is_override boolean;
BEGIN
 IF p_catalog_gram_reference_id IS NULL THEN
   RETURN QUERY SELECT * FROM saas.pricing_reference_set_preview(p_store_id,p_principal_id,p_membership_id,p_plan_id,
     p_plan_code,p_plan_version,p_now,p_set_id,p_channel,p_page_size,p_after_variant_id); RETURN;
 END IF;
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,
   p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_set_id IS NULL OR p_channel IS NULL OR p_channel NOT IN('storefront','quick_order','in_store')
   OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.pricing_reference_sets WHERE store_id=p_store_id AND id=p_set_id) THEN
   RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.pricing_reference_definitions definition
   JOIN saas.pricing_reference_set_values value ON value.store_id=definition.store_id AND value.reference_id=definition.id
   WHERE definition.store_id=p_store_id AND definition.id=p_catalog_gram_reference_id AND definition.kind='gold_gram'
     AND value.set_id=p_set_id AND value.active AND value.rate_try>0) THEN
   RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
 END IF;
 FOR selected IN
   SELECT grams.variant_id AS id,grams.product_id,grams.policy FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id) grams
   UNION ALL
   SELECT variant.id,variant.product_id,NULL::jsonb FROM saas.pricing_variant_policy_state state
   JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
   JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id
   JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
   WHERE state.store_id=p_store_id AND policy.method<>'fixed_try' AND variant.status='active' AND product.status='active'
   ORDER BY id
 LOOP
   affected_count:=affected_count+1;
   IF NOT selected.product_id=ANY(seen_products) THEN seen_products:=pg_catalog.array_append(seen_products,selected.product_id); END IF;
   SELECT * INTO old_price FROM saas.resolve_effective_variant_price(p_store_id,selected.id,p_channel,p_now,NULL::text);
   IF selected.policy IS NULL THEN SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected.id,p_set_id);
   ELSE SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,selected.id,selected.policy,p_set_id); END IF;
   is_override:=COALESCE(old_price.source_kind='price_list',false);
   IF is_override THEN override_count:=override_count+1; END IF;
   IF candidate.outcome<>'found' THEN unavailable_count:=unavailable_count+1; END IF;
   IF p_after_variant_id IS NOT NULL AND selected.id<=p_after_variant_id THEN CONTINUE; END IF;
   IF page_count>=p_page_size THEN has_more:=true; CONTINUE; END IF;
   entries:=entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('variantId',selected.id,'productId',selected.product_id,
     'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
     'newPriceCents',CASE WHEN is_override THEN old_price.price_cents WHEN candidate.outcome='found'
       THEN candidate.price_cents ELSE NULL END,'overriddenByPriceList',is_override));
   page_count:=page_count+1; last_id:=selected.id;
 END LOOP;
 RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object('setId',p_set_id,
   'scopeDigest',saas.pricing_catalog_gram_scope_digest(p_store_id,p_set_id,p_catalog_gram_reference_id,p_now),
   'affectedProducts',pg_catalog.cardinality(seen_products),'affectedVariants',affected_count,
   'fixedOverrideVariants',override_count,'unavailableVariants',unavailable_count,'entries',entries,
   'nextCursor',CASE WHEN has_more THEN last_id ELSE NULL::uuid END);
END $fn$;

CREATE OR REPLACE FUNCTION saas.pricing_reference_set_activate_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
 p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_set_id uuid,p_expected_state_version bigint,
 p_expected_scope_digest text,p_catalog_gram_reference_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; previewed record; candidate record; selected record; activated record;
BEGIN
 IF p_catalog_gram_reference_id IS NULL THEN
   RETURN QUERY SELECT * FROM saas.pricing_reference_set_activate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
     p_plan_version,p_now,p_operation_id,p_fingerprint,p_set_id,p_expected_state_version,p_expected_scope_digest); RETURN;
 END IF;
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,
   p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
   OR p_expected_state_version IS NULL OR p_expected_state_version<0 OR p_expected_scope_digest IS NULL
   OR p_expected_scope_digest!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
   RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate' AND prior.payload_fingerprint=p_fingerprint
     THEN 'operation_replayed' ELSE 'operation_mismatch' END,
     CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate' AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN;
 END IF;
 PERFORM 1 FROM saas.pricing_reference_state WHERE store_id=p_store_id AND version=p_expected_state_version FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 -- Protect weights/statuses even against concurrent owner maintenance that omits the catalog lock.
 PERFORM variant.id FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
   WHERE variant.store_id=p_store_id ORDER BY variant.id FOR UPDATE OF variant FOR SHARE OF product;
 SELECT * INTO previewed FROM saas.pricing_reference_set_preview_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
   p_plan_version,p_now,p_set_id,'storefront',1,NULL::uuid,p_catalog_gram_reference_id);
 IF previewed.outcome<>'previewed' THEN RETURN QUERY SELECT previewed.outcome::text,NULL::jsonb; RETURN; END IF;
 IF previewed.result_payload->>'scopeDigest' IS DISTINCT FROM p_expected_scope_digest THEN
   RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
 END IF;
 FOR selected IN SELECT * FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id) LOOP
   IF selected.variant_version>=9007199254740991 OR selected.policy_version>=9007199254740991 THEN
     RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
   END IF;
   SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,selected.variant_id,selected.policy,p_set_id);
   IF candidate.outcome<>'found' OR candidate.price_cents IS NULL THEN
     RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
   END IF;
 END LOOP;
 SELECT * INTO activated FROM saas.pricing_reference_set_activate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
   p_now,p_operation_id,p_fingerprint,p_set_id,p_expected_state_version,saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now));
 IF activated.outcome<>'activated' THEN RETURN QUERY SELECT activated.outcome::text,activated.result_payload::jsonb; RETURN; END IF;
 -- Batch the canonical immutable policy rows; pricing arithmetic remains in SQL133's calculator.
 WITH candidates AS MATERIALIZED (SELECT * FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id)), inserted AS (
   INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,fixed_price_cents,source_amount,metal_grams,
     reference_id,purity_mode,product_purity,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
   SELECT p_store_id,variant_id,policy_version+1,'gold_gram',NULL,NULL,(policy->>'metalGrams')::numeric,p_catalog_gram_reference_id,
     'direct',NULL,'none',0,0,false,policy,p_principal_id,p_now FROM candidates RETURNING variant_id,version
 ), saved_state AS (
   INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version) SELECT p_store_id,variant_id,version FROM inserted
   ON CONFLICT(store_id,variant_id) DO UPDATE SET current_version=EXCLUDED.current_version RETURNING variant_id
 ) UPDATE saas.product_variants variant SET version=variant.version+1,updated_at=p_now
   FROM saved_state WHERE variant.store_id=p_store_id AND variant.id=saved_state.variant_id;
 RETURN QUERY SELECT 'activated',activated.result_payload::jsonb;
EXCEPTION WHEN OTHERS THEN
 -- The function's subtransaction rolls back the reference pointer, ledger and every policy on failure.
 RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.pricing_catalog_gram_candidates(uuid,uuid),
 saas.pricing_catalog_gram_scope_digest(uuid,uuid,uuid,timestamptz),
 saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid,uuid),
 saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid)
 FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,
 celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid,uuid),
 saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid) TO celebix_saas_app;
COMMIT;
