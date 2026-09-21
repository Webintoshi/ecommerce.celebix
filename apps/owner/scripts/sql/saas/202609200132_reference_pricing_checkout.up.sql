-- Price lineage at the checkout boundary. No tenant policy or reference is seeded.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- The private, immutable lineage is bound in the same transaction as the
-- offline order or hosted attempt. Existing attempts never consult new rates.
CREATE TABLE saas.pricing_checkout_bindings (
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('offline','hosted')),
  order_id uuid NOT NULL,
  -- Hosted rows retain the original customer quote seal for replay; offline
  -- rows retain the source digest. The private trace stores exact versions.
  price_digest char(64) NOT NULL CHECK (price_digest~'^[a-f0-9]{64}$'),
  private_trace jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(private_trace)='object'
    AND pg_catalog.pg_column_size(private_trace)<=131072),
  bound_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(bound_at)),
  PRIMARY KEY (store_id,operation_id),
  UNIQUE (operation_id)
);
CREATE TRIGGER pricing_checkout_bindings_immutable BEFORE UPDATE OR DELETE
ON saas.pricing_checkout_bindings FOR EACH ROW
EXECUTE FUNCTION saas.pricing_reference_immutable_guard();
ALTER TABLE saas.pricing_checkout_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.pricing_checkout_bindings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.pricing_checkout_bindings
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

-- This helper is private to security-definer checkout entrypoints. It captures
-- one source and the exact versions used by each effective unit price. A fixed
-- cart deliberately has no dependency on an unrelated merchant rate update.
CREATE FUNCTION saas.pricing_checkout_source_context(
  p_store_id uuid,p_kind text,p_credentials jsonb,p_now timestamptz
) RETURNS TABLE(digest text,requires_quote_confirmation boolean,trace jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_source_id uuid;
  v_source_version bigint;
  v_lines jsonb;
  v_dynamic boolean;
  v_count integer;
  v_context jsonb;
BEGIN
  IF p_store_id IS NULL OR p_kind NOT IN ('cart','buy_now') OR p_now IS NULL
    OR pg_catalog.isfinite(p_now) IS NOT TRUE
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS NOT TRUE
  THEN RETURN; END IF;

  IF p_kind='cart' THEN
    SELECT cart.id,cart.version INTO v_source_id,v_source_version
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=p_store_id AND cart.status='active'
      AND cart.expires_at>p_now AND credential.expires_at>p_now
    ORDER BY cart.created_at DESC,cart.id LIMIT 1;
  ELSE
    SELECT intent.id,1::bigint INTO v_source_id,v_source_version
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=p_store_id AND intent.status='active' AND intent.expires_at>p_now
    ORDER BY intent.created_at DESC,intent.id LIMIT 1;
  END IF;
  IF v_source_id IS NULL THEN RETURN; END IF;

  WITH source_lines AS (
    SELECT item.variant_id,item.quantity,item.unit_price_cents
    FROM saas.storefront_cart_items item
    WHERE p_kind='cart' AND item.store_id=p_store_id AND item.cart_id=v_source_id
    UNION ALL
    SELECT intent.variant_id,intent.quantity,intent.unit_price_cents
    FROM saas.storefront_checkout_intents intent
    WHERE p_kind='buy_now' AND intent.store_id=p_store_id AND intent.id=v_source_id
  ), priced AS (
    SELECT line.variant_id,line.quantity,line.unit_price_cents AS displayed_cents,
      variant.version AS variant_version,policy.current_version AS policy_version,
      definition.method AS policy_method,
      effective.outcome,effective.price_cents,effective.source_kind,effective.price_list_id,
      list.version AS list_version,
      CASE WHEN definition.method IS NOT NULL AND definition.method<>'fixed_try'
        AND effective.source_kind='base' THEN state.active_set_id ELSE NULL END AS active_set_id,
      CASE WHEN definition.method IS NOT NULL AND definition.method<>'fixed_try'
        AND effective.source_kind='base' THEN state.version ELSE NULL END AS active_set_version
    FROM source_lines line
    JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=line.variant_id
    LEFT JOIN saas.pricing_variant_policy_state policy
      ON policy.store_id=p_store_id AND policy.variant_id=line.variant_id
    LEFT JOIN saas.pricing_variant_policy_versions definition
      ON definition.store_id=policy.store_id AND definition.variant_id=policy.variant_id
      AND definition.version=policy.current_version
    LEFT JOIN saas.pricing_reference_state state ON state.store_id=p_store_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,line.variant_id,'storefront',p_now,NULL) effective
    LEFT JOIN saas.price_lists list ON list.store_id=p_store_id AND list.id=effective.price_list_id
  )
  SELECT pg_catalog.count(*)::integer,
    COALESCE(pg_catalog.bool_or(policy_method IN ('usd','eur','gold_gram')),false),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'variantId',variant_id,'quantity',quantity,'displayedCents',displayed_cents,
      'variantVersion',variant_version,'policyVersion',policy_version,
      'policyMethod',policy_method,'outcome',outcome,'unitCents',price_cents,
      'sourceKind',source_kind,'priceListId',price_list_id,'priceListVersion',list_version,
      'activeSetId',active_set_id,'activeSetVersion',active_set_version
    ) ORDER BY variant_id)
  INTO v_count,v_dynamic,v_lines FROM priced;
  IF v_count NOT BETWEEN 1 AND 100 OR v_lines IS NULL
  THEN RETURN; END IF;
  v_context:=pg_catalog.jsonb_build_object('schemaVersion',1,'storeId',p_store_id,
    'sourceKind',p_kind,'sourceId',v_source_id,'sourceVersion',v_source_version,
    'items',v_lines);
  digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_context::text,'UTF8')),'hex');
  requires_quote_confirmation:=v_dynamic;
  trace:=v_context;
  RETURN NEXT;
END $fn$;

-- A checkout confirmation binds the complete customer-visible quote as well
-- as the private price lineage. The V2 authority digest is deliberately not
-- used: its evaluator clock changes even when the displayed quote does not.
CREATE FUNCTION saas.pricing_checkout_quote_digest(p_price_digest text,p_quote jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT CASE WHEN p_price_digest~'^[a-f0-9]{64}$'
    AND pg_catalog.jsonb_typeof(p_quote)='object'
    THEN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object('schemaVersion',2,'priceDigest',p_price_digest,
        'publicQuote',p_quote)::text,'UTF8')),'hex') END
$fn$;
REVOKE ALL ON FUNCTION saas.pricing_checkout_quote_digest(text,jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE FUNCTION saas.public_checkout_complete_v3(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
  p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_delivery jsonb,p_payment_kind text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
  p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,
  p_normalized_codes text[],p_expected_quote_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_store_id uuid;
  v_operation saas.storefront_checkout_operations%ROWTYPE;
  v_context record;
  v_outcome text;
  v_payload jsonb;
  v_projection jsonb;
  v_quote_outcome text;
  v_quote_payload jsonb;
  v_confirmed_digest text;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR (p_expected_quote_digest IS NOT NULL AND p_expected_quote_digest!~'^[a-f0-9]{64}$')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  -- Existing committed operation wins over today's rates and source status.
  -- Use the exact lock ordering of V2 before the catalog-store lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.checkout.operation:'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.storefront_checkout_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
    FROM saas.public_checkout_complete_v2(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,
      p_operation_id,p_fingerprint,p_expected_version,p_delivery,p_payment_kind,
      p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_receipt_key_id,
      p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,
      p_customer_digest,p_customer_expires_at,p_normalized_codes) selected;
    RETURN QUERY SELECT v_outcome,v_payload; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||v_store_id::text,0));
  SELECT * INTO v_context FROM saas.pricing_checkout_source_context(
    v_store_id,p_kind,p_credentials,p_now);
  IF NOT FOUND THEN
    SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
    FROM saas.public_checkout_complete_v2(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,
      p_operation_id,p_fingerprint,p_expected_version,p_delivery,p_payment_kind,
      p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_receipt_key_id,
      p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,
      p_customer_digest,p_customer_expires_at,p_normalized_codes) selected;
    RETURN QUERY SELECT v_outcome,v_payload; RETURN;
  END IF;
  SELECT selected.outcome,selected.result_payload INTO v_quote_outcome,v_quote_payload
  FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,
    p_customer_credentials,p_normalized_codes,
    '{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'::jsonb) selected;
  v_confirmed_digest:=saas.pricing_checkout_quote_digest(v_context.digest,v_quote_payload->'quote');
  IF v_quote_outcome IS DISTINCT FROM 'quoted'
    OR p_expected_quote_digest IS DISTINCT FROM v_confirmed_digest
  THEN
    v_projection:=CASE WHEN p_kind='cart' THEN saas.storefront_cart_projection(
      v_store_id,(v_context.trace->>'sourceId')::uuid,p_now)
      ELSE saas.storefront_intent_projection(
        v_store_id,(v_context.trace->>'sourceId')::uuid,p_now) END;
    RETURN QUERY SELECT 'price_changed',v_projection; RETURN;
  END IF;
  -- V2 can resolve shipping/customer/payment from the submitted delivery. A
  -- successful write whose actual receipt differs must roll back atomically.
  BEGIN
    SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
    FROM saas.public_checkout_complete_v2(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,
      p_operation_id,p_fingerprint,p_expected_version,p_delivery,p_payment_kind,
      p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_receipt_key_id,
      p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,
      p_customer_digest,p_customer_expires_at,p_normalized_codes) selected;
    IF v_outcome='committed' AND (
      (v_payload->'receipt'->>'subtotalCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'subtotalCents')::bigint
      OR (v_payload->'receipt'->>'shippingCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'shippingCents')::bigint
      OR (v_payload->'receipt'->>'discountCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'discountCents')::bigint
      OR (v_payload->'receipt'->>'lineDiscountCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'lineDiscountCents')::bigint
      OR (v_payload->'receipt'->>'shippingDiscountCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'shippingDiscountCents')::bigint
      OR (v_payload->'receipt'->>'totalCents')::bigint IS DISTINCT FROM
        (v_quote_payload->'quote'->'cart'->>'totalCents')::bigint
      OR v_payload->'receipt'->'items' IS DISTINCT FROM
        v_quote_payload->'quote'->'cart'->'items'
      OR v_payload->'receipt'->'appliedPromotions' IS DISTINCT FROM
        v_quote_payload->'quote'->'appliedPromotions'
      OR v_payload->'receipt'->'gifts' IS DISTINCT FROM
        v_quote_payload->'quote'->'gifts'
      OR v_payload->'receipt'->'promotionStatus' IS DISTINCT FROM
        v_quote_payload->'quote'->'promotionStatus'
    ) THEN
      RAISE EXCEPTION 'REFERENCE_PRICING_RECEIPT_DRIFT' USING ERRCODE='PZ001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    v_outcome:='price_changed';
    v_payload:=CASE WHEN p_kind='cart' THEN saas.storefront_cart_projection(
      v_store_id,(v_context.trace->>'sourceId')::uuid,p_now)
      ELSE saas.storefront_intent_projection(
        v_store_id,(v_context.trace->>'sourceId')::uuid,p_now) END;
  END;
  IF v_outcome='committed' THEN
    INSERT INTO saas.pricing_checkout_bindings(store_id,operation_id,operation_kind,order_id,
      price_digest,private_trace,bound_at)
    VALUES(v_store_id,p_operation_id,'offline',p_order_id,v_context.digest,v_context.trace,p_now);
  END IF;
  RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.pricing_checkout_source_context(uuid,text,jsonb,timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE FUNCTION saas.public_checkout_quote_v3(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_customer_credentials jsonb,p_normalized_codes text[],p_attribution jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_store_id uuid;
  v_outcome text;
  v_payload jsonb;
  v_context record;
BEGIN
  -- A single catalog-store lock spans both the quote calculation and its
  -- opaque version seal, so activation cannot interleave the two snapshots.
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||v_store_id::text,0));
  SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
  FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,
    p_customer_credentials,p_normalized_codes,p_attribution) selected;
  IF v_outcome IS DISTINCT FROM 'quoted' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload; RETURN;
  END IF;
  SELECT * INTO v_context FROM saas.pricing_checkout_source_context(
    v_store_id,p_kind,p_credentials,p_now);
  IF NOT FOUND OR v_context.digest IS NULL THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'quoted',v_payload||pg_catalog.jsonb_build_object(
    'quoteDigest',saas.pricing_checkout_quote_digest(v_context.digest,v_payload->'quote'));
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_authority_v3(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,
  p_prospective_customer_id uuid,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_store_id uuid;
  v_existing saas.storefront_hosted_checkout_operations%ROWTYPE;
  v_bound saas.pricing_checkout_bindings%ROWTYPE;
  v_context record;
  v_outcome text;
  v_payload jsonb;
  v_legacy_digest text;
  v_quote_outcome text;
  v_quote_payload jsonb;
  v_codes text[];
  v_price_confirmation text;
  v_requires_quote_confirmation boolean:=false;
BEGIN
  IF p_operation_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT * INTO v_existing FROM saas.storefront_hosted_checkout_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF v_existing.store_id IS DISTINCT FROM v_store_id
      OR v_existing.operation_kind IS DISTINCT FROM 'start'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    SELECT * INTO v_bound FROM saas.pricing_checkout_bindings
    WHERE store_id=v_store_id AND operation_id=p_operation_id AND operation_kind='hosted';
    IF NOT FOUND THEN
      -- An attempt committed before V3 has no new binding. Preserve its
      -- original durable V2 authority instead of consulting today's rates.
      v_legacy_digest:=pg_catalog.encode(pg_catalog.sha256(
        pg_catalog.convert_to(v_existing.result_payload::text,'UTF8')),'hex');
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.catalog.store:'||v_store_id::text,0));
    SELECT * INTO v_context FROM saas.pricing_checkout_source_context(
      v_store_id,p_kind,p_credentials,p_now);
    IF NOT FOUND THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;
    v_requires_quote_confirmation:=v_context.requires_quote_confirmation;
    SELECT COALESCE(pg_catalog.array_agg(code.value ORDER BY code.ordinality),ARRAY[]::text[])
      INTO v_codes FROM pg_catalog.jsonb_array_elements_text(p_normalized_codes)
      WITH ORDINALITY code(value,ordinality);
    SELECT selected.outcome,selected.result_payload INTO v_quote_outcome,v_quote_payload
    FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,
      p_customer_candidates,v_codes,
      '{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'::jsonb) selected;
    IF v_quote_outcome IS DISTINCT FROM 'quoted'
    THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;
    v_price_confirmation:=saas.pricing_checkout_quote_digest(v_context.digest,v_quote_payload->'quote');
  END IF;
  SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
  FROM saas.public_storefront_hosted_checkout_authority_v2(p_hostname,p_now,p_kind,p_credentials,
    p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,
    p_order_id,p_prospective_customer_id,p_operation_id) selected;
  IF v_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT COALESCE(v_outcome,'authority_unavailable'),v_payload; RETURN;
  END IF;
  IF v_existing.operation_id IS NULL AND (
    v_price_confirmation IS NULL
    OR (v_payload->>'subtotalMinor')::bigint IS DISTINCT FROM
      (v_quote_payload->'quote'->'cart'->>'subtotalCents')::bigint
    OR (v_payload->>'shippingMinor')::bigint IS DISTINCT FROM
      (v_quote_payload->'quote'->'cart'->>'shippingCents')::bigint
    OR (v_payload->>'discountMinor')::bigint IS DISTINCT FROM
      (v_quote_payload->'quote'->'cart'->>'discountCents')::bigint
    OR (v_payload->>'totalMinor')::bigint IS DISTINCT FROM
      (v_quote_payload->'quote'->'cart'->>'totalCents')::bigint
  ) THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',v_payload||pg_catalog.jsonb_build_object(
    'pricingDigest',CASE WHEN v_existing.operation_id IS NULL THEN v_price_confirmation
      ELSE COALESCE(v_bound.price_digest,v_legacy_digest) END,
    'requiresQuoteConfirmation',CASE WHEN v_existing.operation_id IS NULL
      THEN v_requires_quote_confirmation
      ELSE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(v_bound.private_trace->'items','[]'::jsonb)) line
        WHERE line->>'policyMethod' IN ('usd','eur','gold_gram')) END);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb;
END $fn$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_begin_v3(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,
  p_session_id uuid,p_callback_binding_digest text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_customer_credential_id uuid,
  p_payment_session_key_id text,p_payment_session_digest text,
  p_receipt_key_id text,p_receipt_digest text,
  p_customer_key_id text,p_customer_digest text,
  p_customer_candidates jsonb,p_normalized_codes jsonb,
  p_expected_evaluator_authority_digest text,p_expected_pricing_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  v_store_id uuid;
  v_existing saas.storefront_hosted_checkout_operations%ROWTYPE;
  v_context record;
  v_outcome text;
  v_payload jsonb;
  v_quote_outcome text;
  v_quote_payload jsonb;
  v_codes text[];
  v_confirmed_digest text;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_pricing_digest IS NULL OR p_expected_pricing_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT * INTO v_existing FROM saas.storefront_hosted_checkout_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
    FROM saas.public_storefront_hosted_checkout_begin_v2(p_hostname,p_now,p_kind,p_credentials,
      p_expected_version,p_delivery,p_payment_method_id,p_expected_authority_digest,p_operation_id,
      p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,
      p_event_id,p_receipt_id,p_customer_credential_id,p_payment_session_key_id,p_payment_session_digest,
      p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,p_customer_candidates,
      p_normalized_codes,p_expected_evaluator_authority_digest) selected;
    RETURN QUERY SELECT v_outcome,v_payload; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||v_store_id::text,0));
  SELECT * INTO v_context FROM saas.pricing_checkout_source_context(
    v_store_id,p_kind,p_credentials,p_now);
  IF NOT FOUND THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.array_agg(code.value ORDER BY code.ordinality),ARRAY[]::text[])
    INTO v_codes FROM pg_catalog.jsonb_array_elements_text(p_normalized_codes)
    WITH ORDINALITY code(value,ordinality);
  SELECT selected.outcome,selected.result_payload INTO v_quote_outcome,v_quote_payload
  FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,
    p_customer_candidates,v_codes,
    '{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}'::jsonb) selected;
  v_confirmed_digest:=saas.pricing_checkout_quote_digest(v_context.digest,v_quote_payload->'quote');
  IF v_quote_outcome IS DISTINCT FROM 'quoted'
    OR v_confirmed_digest IS DISTINCT FROM p_expected_pricing_digest
  THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb; RETURN; END IF;
  SELECT selected.outcome,selected.result_payload INTO v_outcome,v_payload
  FROM saas.public_storefront_hosted_checkout_begin_v2(p_hostname,p_now,p_kind,p_credentials,
    p_expected_version,p_delivery,p_payment_method_id,p_expected_authority_digest,p_operation_id,
    p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,
    p_event_id,p_receipt_id,p_customer_credential_id,p_payment_session_key_id,p_payment_session_digest,
    p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,p_customer_candidates,
    p_normalized_codes,p_expected_evaluator_authority_digest) selected;
  IF v_outcome='created' THEN
    INSERT INTO saas.pricing_checkout_bindings(store_id,operation_id,operation_kind,order_id,
      price_digest,private_trace,bound_at)
    VALUES(v_store_id,p_operation_id,'hosted',p_order_id,v_confirmed_digest,v_context.trace,p_now);
  END IF;
  RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),v_payload;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

-- Old Storefront replicas still use V2 while the additive schema is installed.
-- Keep their fixed-price checkout available with the activation gate closed.
-- A later, separately authorized cutover must revoke all four V2 grants before
-- the owner can enable dynamic pricing for any store.
CREATE OR REPLACE FUNCTION saas.pricing_dynamic_activation_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_store_id:=OLD.store_id;
  ELSE v_store_id:=NEW.store_id; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||v_store_id::text,0));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.enabled AND (
    pg_catalog.has_function_privilege('celebix_saas_host_resolver',
      'saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',
      'saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[])','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',
      'saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',
      'saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)','EXECUTE')
  ) THEN RAISE EXCEPTION 'PRICING_LEGACY_CHECKOUT_STILL_EXECUTABLE'; END IF;
  RETURN NEW;
END $fn$;

DO $preflight$ BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_dynamic_activation WHERE enabled) THEN
    RAISE EXCEPTION 'PRICING_LEGACY_CHECKOUT_STILL_EXECUTABLE';
  END IF;
END $preflight$;

-- Route new consumers through V3. Unversioned entrypoints remain retired;
-- V2 retains only its existing host-resolver grant for the closed-gate overlap.
REVOKE ALL ON FUNCTION
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz),
  saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)
FROM celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION
  saas.public_checkout_complete_v3(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text),
  saas.public_checkout_quote_v3(text,timestamptz,text,jsonb,jsonb,text[],jsonb),
  saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),
  saas.public_storefront_hosted_checkout_begin_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION
  saas.public_checkout_complete_v3(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text),
  saas.public_checkout_quote_v3(text,timestamptz,text,jsonb,jsonb,text[],jsonb),
  saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),
  saas.public_storefront_hosted_checkout_begin_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)
TO celebix_saas_host_resolver;
COMMIT;
