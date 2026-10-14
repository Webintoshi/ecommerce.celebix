-- A server-issued, ten-minute storefront retail quote survives a manual
-- reference-set activation. No tenant price, rate or payment data is rewritten.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE IF NOT EXISTS saas.merchant_checkout_price_233_backup(
 signature text PRIMARY KEY,engine_signature text NOT NULL,original_definition text NOT NULL,
 engine_sha256 text NOT NULL,published_sha256 text
);
ALTER TABLE saas.merchant_checkout_price_233_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_checkout_price_233_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_checkout_price_233_backup FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
DO $prepare$
DECLARE sig text;name text;engine text;definition text;saved saas.merchant_checkout_price_233_backup;
BEGIN
 FOREACH sig IN ARRAY ARRAY[
 'saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text)',
 'saas.pricing_checkout_source_context(uuid,text,jsonb,timestamptz)',
 'saas.public_checkout_quote_v3(text,timestamptz,text,jsonb,jsonb,text[],jsonb)',
 'saas.public_checkout_complete_v3(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)',
 'saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)',
 'saas.public_storefront_hosted_checkout_begin_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)'
 ] LOOP
  SELECT * INTO saved FROM saas.merchant_checkout_price_233_backup WHERE signature=sig;
  IF FOUND THEN
   IF saved.published_sha256 IS NULL OR pg_catalog.to_regprocedure(sig) IS NULL OR pg_catalog.to_regprocedure(saved.engine_signature) IS NULL
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(sig::regprocedure),'UTF8')),'hex')<>saved.published_sha256
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(saved.engine_signature::regprocedure),'UTF8')),'hex')<>saved.engine_sha256
   THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_SOURCE_DRIFT';END IF;
   CONTINUE;
  END IF;
  IF pg_catalog.to_regprocedure(sig) IS NULL THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_PREDECESSOR_MISSING: %',sig;END IF;
  name:=split_part(split_part(sig,'.',2),'(',1);
  definition:=pg_catalog.pg_get_functiondef(sig::regprocedure);
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=sig::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, saas']::text[])
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=sig::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog,saas']::text[])
  THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_AUTHORITY_DRIFT';END IF;
  engine:=replace(sig,'saas.'||name||'(','saas.'||name||'_unprotected_233(');
  IF pg_catalog.to_regprocedure(engine) IS NOT NULL THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_ENGINE_COLLISION';END IF;
  EXECUTE replace(definition,'FUNCTION saas.'||name||'(','FUNCTION saas.'||name||'_unprotected_233(');
  EXECUTE 'REVOKE ALL ON FUNCTION '||engine||' FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability';
  INSERT INTO saas.merchant_checkout_price_233_backup VALUES(sig,engine,definition,
   pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(engine::regprocedure),'UTF8')),'hex'),NULL);
 END LOOP;
END $prepare$;

CREATE TABLE IF NOT EXISTS saas.merchant_checkout_quotes_233(
 quote_digest char(64) PRIMARY KEY CHECK(quote_digest~'^[a-f0-9]{64}$'),
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
 source_kind text NOT NULL CHECK(source_kind IN('cart','buy_now')),
 source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
 structural_digest char(64) NOT NULL CHECK(structural_digest~'^[a-f0-9]{64}$'),
 customer_id uuid,normalized_codes text[] NOT NULL,
 price_digest char(64) NOT NULL CHECK(price_digest~'^[a-f0-9]{64}$'),
 price_trace jsonb NOT NULL CHECK(jsonb_typeof(price_trace)='object' AND pg_column_size(price_trace)<=131072),
 public_quote jsonb NOT NULL CHECK(jsonb_typeof(public_quote)='object' AND pg_column_size(public_quote)<=131072),
 legacy_quote_digest char(64) NOT NULL CHECK(legacy_quote_digest~'^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL CHECK(pg_catalog.isfinite(issued_at)),
 expires_at timestamptz NOT NULL CHECK(pg_catalog.isfinite(expires_at) AND expires_at>issued_at AND expires_at<=issued_at+interval '10 minutes')
);
CREATE INDEX IF NOT EXISTS merchant_checkout_quotes_scope_233 ON saas.merchant_checkout_quotes_233(store_id,source_kind,source_id,source_version,structural_digest,expires_at DESC);
CREATE INDEX IF NOT EXISTS merchant_checkout_quotes_expiry_233 ON saas.merchant_checkout_quotes_233(store_id,expires_at);
CREATE TABLE IF NOT EXISTS saas.merchant_checkout_quote_operations_233(
 store_id uuid NOT NULL REFERENCES saas.stores(id),operation_id uuid PRIMARY KEY,
 operation_kind text NOT NULL CHECK(operation_kind IN('offline','hosted')),
 quote_digest char(64) NOT NULL REFERENCES saas.merchant_checkout_quotes_233(quote_digest),
 bound_at timestamptz NOT NULL CHECK(pg_catalog.isfinite(bound_at))
);
CREATE INDEX IF NOT EXISTS merchant_checkout_quote_operations_quote_233 ON saas.merchant_checkout_quote_operations_233(quote_digest);
CREATE TABLE IF NOT EXISTS saas.merchant_checkout_price_context_233(
 backend_pid integer NOT NULL,transaction_id bigint NOT NULL,
 quote_digest char(64) NOT NULL REFERENCES saas.merchant_checkout_quotes_233(quote_digest) ON DELETE CASCADE,
 PRIMARY KEY(backend_pid,transaction_id)
);
DO $private_tables$
DECLARE tab text;
BEGIN FOREACH tab IN ARRAY ARRAY['merchant_checkout_quotes_233','merchant_checkout_quote_operations_233','merchant_checkout_price_context_233'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability',tab);
END LOOP;END $private_tables$;

CREATE OR REPLACE FUNCTION saas.merchant_checkout_quote_structural_digest_233(p_trace jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
  'storeId',p_trace->'storeId','sourceKind',p_trace->'sourceKind','sourceId',p_trace->'sourceId','sourceVersion',p_trace->'sourceVersion',
  'items',(SELECT jsonb_agg(line-ARRAY['activeSetId','activeSetVersion','unitCents','outcome'] ORDER BY line->>'variantId') FROM jsonb_array_elements(p_trace->'items') line))::text,'UTF8')),'hex')
$fn$;

-- This scope is derived from database-owned cart lines and live credentials.
-- The public caller never supplies an amount, price lineage or source identity.
CREATE OR REPLACE FUNCTION saas.merchant_checkout_quote_scope_233(
 p_store_id uuid,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,p_now timestamptz
) RETURNS TABLE(structural_digest text,customer_id uuid,price_digest text,price_trace jsonb,requires_quote_confirmation boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE context record;locked_source uuid;
BEGIN
 IF saas.storefront_credential_candidates_valid(p_credentials,false) IS NOT TRUE
  OR saas.storefront_credential_candidates_valid(p_customer_credentials,true) IS NOT TRUE
 THEN RETURN;END IF;
 SELECT * INTO context FROM saas.pricing_checkout_source_context_unprotected_233(p_store_id,p_kind,p_credentials,p_now);
 IF NOT FOUND THEN RETURN;END IF;
 -- Prevent cart edits between the quote snapshot and its delegated checkout.
 IF p_kind='cart' THEN
  SELECT id INTO locked_source FROM saas.storefront_carts WHERE store_id=p_store_id AND id=(context.trace->>'sourceId')::uuid FOR UPDATE;
 ELSE
  SELECT id INTO locked_source FROM saas.storefront_checkout_intents WHERE store_id=p_store_id AND id=(context.trace->>'sourceId')::uuid FOR UPDATE;
 END IF;
 SELECT * INTO context FROM saas.pricing_checkout_source_context_unprotected_233(p_store_id,p_kind,p_credentials,p_now);
 IF NOT FOUND OR locked_source IS DISTINCT FROM (context.trace->>'sourceId')::uuid THEN RETURN;END IF;
 SELECT credential.customer_id INTO customer_id
 FROM saas.storefront_customer_credentials credential
 JOIN jsonb_array_elements(p_customer_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
 JOIN saas.customers customer ON customer.store_id=credential.store_id AND customer.id=credential.customer_id AND customer.status='active' AND customer.archived_at IS NULL
 WHERE credential.store_id=p_store_id AND credential.expires_at>p_now
 ORDER BY credential.created_at DESC,credential.id LIMIT 1;
 structural_digest:=saas.merchant_checkout_quote_structural_digest_233(context.trace);
 price_digest:=context.digest;price_trace:=context.trace;requires_quote_confirmation:=context.requires_quote_confirmation;
 RETURN NEXT;
END $fn$;

CREATE OR REPLACE FUNCTION saas.public_checkout_complete_v3(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
 p_operation_id uuid,p_fingerprint text,p_expected_version bigint,p_delivery jsonb,p_payment_kind text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
 p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
 p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,
 p_normalized_codes text[],p_expected_quote_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;quote saas.merchant_checkout_quotes_233;response record;
BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  OR p_expected_quote_digest IS NOT NULL AND p_expected_quote_digest!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 v_store_id:=saas.storefront_public_store(p_hostname,p_now);
 IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.checkout.operation:'||p_operation_id::text,0));
 -- Durable V2 idempotency and source authentication remain authoritative.
 IF EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id)
  OR NOT EXISTS(SELECT 1 FROM saas.merchant_checkout_quotes_233 WHERE quote_digest=p_expected_quote_digest)
 THEN
  RETURN QUERY SELECT * FROM saas.public_checkout_complete_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,
   p_operation_id,p_fingerprint,p_expected_version,p_delivery,p_payment_kind,p_order_id,p_customer_id,p_address_id,p_event_id,
   p_receipt_id,p_receipt_key_id,p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,p_customer_digest,
   p_customer_expires_at,p_normalized_codes,p_expected_quote_digest);RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||v_store_id::text,0));
 SELECT * INTO quote FROM saas.merchant_checkout_quote_match_233(p_expected_quote_digest,v_store_id,p_kind,p_credentials,p_customer_credentials,p_normalized_codes,p_now);
 IF NOT FOUND THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
 PERFORM saas.merchant_checkout_price_enter_233(quote.quote_digest);
 SELECT * INTO response FROM saas.public_checkout_complete_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,
  p_operation_id,p_fingerprint,p_expected_version,p_delivery,p_payment_kind,p_order_id,p_customer_id,p_address_id,p_event_id,
  p_receipt_id,p_receipt_key_id,p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,p_customer_digest,
  p_customer_expires_at,p_normalized_codes,quote.legacy_quote_digest);
 PERFORM saas.merchant_checkout_price_leave_233();
 IF response.outcome='committed' THEN
  INSERT INTO saas.merchant_checkout_quote_operations_233 VALUES(v_store_id,p_operation_id,'offline',quote.quote_digest,p_now);
 END IF;
 RETURN QUERY SELECT response.outcome,response.result_payload;
EXCEPTION WHEN OTHERS THEN
 PERFORM saas.merchant_checkout_price_leave_233();RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

-- The original 12-argument contract always returns the original legacy seal.
-- Explicit client quote authority is additive; no default can silently select it.
CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_authority_v3(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,p_prospective_customer_id uuid,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 RETURN QUERY SELECT * FROM saas.public_storefront_hosted_checkout_authority_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id);
END $fn$;

DO $overload_guard$
DECLARE sig text:='saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text)';saved saas.merchant_checkout_price_233_backup;
BEGIN
 SELECT * INTO saved FROM saas.merchant_checkout_price_233_backup WHERE signature=sig;
 IF FOUND THEN
  IF saved.original_definition<>'' OR saved.published_sha256 IS NULL OR to_regprocedure(sig) IS NULL
   OR encode(sha256(convert_to(pg_get_functiondef(sig::regprocedure),'UTF8')),'hex')<>saved.published_sha256
  THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_OVERLOAD_DRIFT';END IF;
 ELSIF to_regprocedure(sig) IS NOT NULL THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_OVERLOAD_COLLISION';END IF;
END $overload_guard$;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_authority_v3(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,p_prospective_customer_id uuid,p_operation_id uuid,p_expected_quote_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;quote saas.merchant_checkout_quotes_233;response record;codes text[];bound_token text;
BEGIN
 IF p_operation_id IS NULL OR p_expected_quote_digest IS NOT NULL AND p_expected_quote_digest!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Fixed-price/no-confirmation callers can explicitly pass NULL. This keeps
 -- the original contract; the HTTP layer still requires dynamic confirmation.
 IF p_expected_quote_digest IS NULL THEN
  RETURN QUERY SELECT * FROM saas.public_storefront_hosted_checkout_authority_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id);RETURN;
 END IF;
 v_store_id:=saas.storefront_public_store(p_hostname,p_now);
 IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id) THEN
  SELECT binding.quote_digest INTO bound_token FROM saas.merchant_checkout_quote_operations_233 binding WHERE binding.store_id=v_store_id AND binding.operation_id=p_operation_id AND binding.operation_kind='hosted';
  IF bound_token IS NOT NULL AND p_expected_quote_digest IS DISTINCT FROM bound_token THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  SELECT * INTO response FROM saas.public_storefront_hosted_checkout_authority_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id);
  IF response.outcome='found' AND bound_token IS NULL AND response.result_payload->>'pricingDigest' IS DISTINCT FROM p_expected_quote_digest THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT response.outcome,CASE WHEN response.outcome='found' AND bound_token IS NOT NULL THEN response.result_payload||jsonb_build_object('pricingDigest',bound_token) ELSE response.result_payload END;RETURN;
 END IF;
 -- An unknown digest belongs to the backwards-compatible legacy contract.
 -- Its actual current server seal must still equal the explicitly supplied one.
 IF NOT EXISTS(SELECT 1 FROM saas.merchant_checkout_quotes_233 WHERE quote_digest=p_expected_quote_digest) THEN
  SELECT * INTO response FROM saas.public_storefront_hosted_checkout_authority_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id);
  IF response.outcome='found' AND response.result_payload->>'pricingDigest' IS DISTINCT FROM p_expected_quote_digest THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT response.outcome,response.result_payload;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||v_store_id::text,0));
 SELECT coalesce(array_agg(value ORDER BY ordinality),ARRAY[]::text[]) INTO codes FROM jsonb_array_elements_text(p_normalized_codes) WITH ORDINALITY code(value,ordinality);
 SELECT * INTO quote FROM saas.merchant_checkout_quote_match_233(p_expected_quote_digest,v_store_id,p_kind,p_credentials,p_customer_candidates,codes,p_now);
 IF NOT FOUND THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
 PERFORM saas.merchant_checkout_price_enter_233(quote.quote_digest);
 SELECT * INTO response FROM saas.public_storefront_hosted_checkout_authority_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,p_customer_candidates,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id);
 PERFORM saas.merchant_checkout_price_leave_233();
 -- Coupon/shipping changes must not be presented under a stale opaque seal.
 IF response.outcome='found' AND response.result_payload->>'pricingDigest' IS DISTINCT FROM quote.legacy_quote_digest THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT response.outcome,CASE WHEN response.outcome='found' THEN response.result_payload||jsonb_build_object('pricingDigest',quote.quote_digest) ELSE response.result_payload END;
EXCEPTION WHEN OTHERS THEN
 PERFORM saas.merchant_checkout_price_leave_233();RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb;
END $fn$;
REVOKE ALL ON FUNCTION saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text) FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text) TO celebix_saas_host_resolver;
INSERT INTO saas.merchant_checkout_price_233_backup(signature,engine_signature,original_definition,engine_sha256,published_sha256)
SELECT 'saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text)',engine_signature,'',engine_sha256,NULL
FROM saas.merchant_checkout_price_233_backup WHERE signature='saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)'
ON CONFLICT(signature) DO NOTHING;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_begin_v3(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,p_session_id uuid,p_callback_binding_digest text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,p_receipt_id uuid,p_customer_credential_id uuid,
 p_payment_session_key_id text,p_payment_session_digest text,p_receipt_key_id text,p_receipt_digest text,p_customer_key_id text,p_customer_digest text,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_expected_evaluator_authority_digest text,p_expected_pricing_digest text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;quote saas.merchant_checkout_quotes_233;response record;codes text[];
BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  OR p_expected_pricing_digest IS NULL OR p_expected_pricing_digest!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 v_store_id:=saas.storefront_public_store(p_hostname,p_now);
 IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id)
  OR NOT EXISTS(SELECT 1 FROM saas.merchant_checkout_quotes_233 WHERE quote_digest=p_expected_pricing_digest)
 THEN
  RETURN QUERY SELECT * FROM saas.public_storefront_hosted_checkout_begin_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
   p_expected_authority_digest,p_operation_id,p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,
   p_payment_session_key_id,p_payment_session_digest,p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,p_customer_candidates,p_normalized_codes,p_expected_evaluator_authority_digest,p_expected_pricing_digest);RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||v_store_id::text,0));
 SELECT coalesce(array_agg(value ORDER BY ordinality),ARRAY[]::text[]) INTO codes FROM jsonb_array_elements_text(p_normalized_codes) WITH ORDINALITY code(value,ordinality);
 SELECT * INTO quote FROM saas.merchant_checkout_quote_match_233(p_expected_pricing_digest,v_store_id,p_kind,p_credentials,p_customer_candidates,codes,p_now);
 IF NOT FOUND THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
 PERFORM saas.merchant_checkout_price_enter_233(quote.quote_digest);
 SELECT * INTO response FROM saas.public_storefront_hosted_checkout_begin_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
  p_expected_authority_digest,p_operation_id,p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,
  p_payment_session_key_id,p_payment_session_digest,p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,p_customer_candidates,p_normalized_codes,p_expected_evaluator_authority_digest,quote.legacy_quote_digest);
 PERFORM saas.merchant_checkout_price_leave_233();
 IF response.outcome='created' THEN INSERT INTO saas.merchant_checkout_quote_operations_233 VALUES(v_store_id,p_operation_id,'hosted',quote.quote_digest,p_now);END IF;
 RETURN QUERY SELECT response.outcome,response.result_payload;
EXCEPTION WHEN OTHERS THEN
 PERFORM saas.merchant_checkout_price_leave_233();RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.merchant_checkout_quote_match_233(
 p_digest text,p_store_id uuid,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,p_codes text[],p_now timestamptz
) RETURNS SETOF saas.merchant_checkout_quotes_233
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE scope record;
BEGIN
 IF p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$' OR p_codes IS NULL THEN RETURN;END IF;
 SELECT * INTO scope FROM saas.merchant_checkout_quote_scope_233(p_store_id,p_kind,p_credentials,p_customer_credentials,p_now);
 IF NOT FOUND THEN RETURN;END IF;
 RETURN QUERY SELECT quote.* FROM saas.merchant_checkout_quotes_233 quote
 WHERE quote.quote_digest=p_digest AND quote.store_id=p_store_id AND quote.source_kind=p_kind
  AND quote.source_id=(scope.price_trace->>'sourceId')::uuid AND quote.source_version=(scope.price_trace->>'sourceVersion')::bigint
  AND quote.structural_digest=scope.structural_digest AND quote.customer_id IS NOT DISTINCT FROM scope.customer_id
  AND quote.normalized_codes=p_codes AND quote.issued_at<=p_now AND quote.expires_at>p_now;
END $fn$;

CREATE OR REPLACE FUNCTION saas.merchant_checkout_price_enter_233(p_digest text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 INSERT INTO saas.merchant_checkout_price_context_233 VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),p_digest);
END $fn$;
CREATE OR REPLACE FUNCTION saas.merchant_checkout_price_leave_233()
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 DELETE FROM saas.merchant_checkout_price_context_233 WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current()
$fn$;

CREATE OR REPLACE FUNCTION saas.resolve_effective_variant_price(
 p_store_id uuid,p_variant_id uuid,p_channel text,p_now timestamptz,p_customer_email text DEFAULT NULL
) RETURNS TABLE(outcome text,price_cents bigint,source_kind text,price_list_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE line jsonb;
BEGIN
 IF p_channel='storefront' AND p_customer_email IS NULL THEN
  SELECT item INTO line FROM saas.merchant_checkout_price_context_233 context
  JOIN saas.merchant_checkout_quotes_233 quote ON quote.quote_digest=context.quote_digest
  CROSS JOIN jsonb_array_elements(quote.price_trace->'items') item
  JOIN saas.product_variants variant ON variant.store_id=quote.store_id AND variant.id=(item->>'variantId')::uuid AND variant.status='active'
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  WHERE context.backend_pid=pg_catalog.pg_backend_pid() AND context.transaction_id=pg_catalog.txid_current()
   AND quote.store_id=p_store_id AND quote.issued_at<=p_now AND quote.expires_at>p_now
   AND item->>'variantId'=p_variant_id::text AND item->>'outcome'='found'
   AND (item->>'unitCents')::bigint BETWEEN 1 AND 8000000000;
  IF FOUND THEN RETURN QUERY SELECT 'found',(line->>'unitCents')::bigint,line->>'sourceKind',(line->>'priceListId')::uuid;RETURN;END IF;
 END IF;
 RETURN QUERY SELECT * FROM saas.resolve_effective_variant_price_unprotected_233(p_store_id,p_variant_id,p_channel,p_now,p_customer_email);
END $fn$;

CREATE OR REPLACE FUNCTION saas.pricing_checkout_source_context(
 p_store_id uuid,p_kind text,p_credentials jsonb,p_now timestamptz
) RETURNS TABLE(digest text,requires_quote_confirmation boolean,trace jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 RETURN QUERY SELECT quote.price_digest::text,true,quote.price_trace
 FROM saas.merchant_checkout_price_context_233 context
 JOIN saas.merchant_checkout_quotes_233 quote ON quote.quote_digest=context.quote_digest
 WHERE context.backend_pid=pg_catalog.pg_backend_pid() AND context.transaction_id=pg_catalog.txid_current()
  AND quote.store_id=p_store_id AND quote.source_kind=p_kind AND quote.issued_at<=p_now AND quote.expires_at>p_now;
 IF FOUND THEN RETURN;END IF;
 RETURN QUERY SELECT * FROM saas.pricing_checkout_source_context_unprotected_233(p_store_id,p_kind,p_credentials,p_now);
END $fn$;

CREATE OR REPLACE FUNCTION saas.public_checkout_quote_v3(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
 p_customer_credentials jsonb,p_normalized_codes text[],p_attribution jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;scope record;quote saas.merchant_checkout_quotes_233;response record;token text;deadline timestamptz;trace jsonb;v_price_digest text;
BEGIN
 -- Native-first overlap: an old storefront quotes in a READ ONLY transaction.
 -- Preserve its existing V3 behavior until the narrow quote-writer rollout.
 -- This flag never supplies a price; the old engine still validates its seal.
 IF pg_catalog.current_setting('transaction_read_only')='on' THEN
  RETURN QUERY SELECT * FROM saas.public_checkout_quote_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_normalized_codes,p_attribution);RETURN;
 END IF;
 v_store_id:=saas.storefront_public_store(p_hostname,p_now);
 IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||v_store_id::text,0));
 SELECT * INTO scope FROM saas.merchant_checkout_quote_scope_233(v_store_id,p_kind,p_credentials,p_customer_credentials,p_now);
 IF NOT FOUND OR scope.requires_quote_confirmation IS NOT TRUE THEN
  RETURN QUERY SELECT * FROM saas.public_checkout_quote_v3_unprotected_233(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_normalized_codes,p_attribution);RETURN;
 END IF;
 SELECT saved.* INTO quote FROM saas.merchant_checkout_quotes_233 saved
 WHERE saved.store_id=v_store_id AND saved.source_kind=p_kind AND saved.source_id=(scope.price_trace->>'sourceId')::uuid
  AND saved.source_version=(scope.price_trace->>'sourceVersion')::bigint AND saved.structural_digest=scope.structural_digest
  AND saved.customer_id IS NOT DISTINCT FROM scope.customer_id AND saved.normalized_codes=p_normalized_codes
  AND saved.issued_at<=p_now AND saved.expires_at>p_now ORDER BY saved.issued_at DESC,saved.quote_digest LIMIT 1;
 IF FOUND THEN
  PERFORM saas.merchant_checkout_price_enter_233(quote.quote_digest);
  deadline:=quote.expires_at;trace:=quote.price_trace;v_price_digest:=quote.price_digest;
 ELSE
  deadline:=p_now+interval '10 minutes';trace:=scope.price_trace;v_price_digest:=scope.price_digest;
 END IF;
 SELECT * INTO response FROM saas.public_checkout_quote_v2(p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_normalized_codes,p_attribution);
 PERFORM saas.merchant_checkout_price_leave_233();
 IF response.outcome IS DISTINCT FROM 'quoted' THEN RETURN QUERY SELECT response.outcome,response.result_payload;RETURN;END IF;
 IF quote.quote_digest IS NOT NULL AND quote.public_quote=response.result_payload->'quote' THEN
  RETURN QUERY SELECT 'quoted',response.result_payload||jsonb_build_object('quoteDigest',quote.quote_digest);RETURN;
 END IF;
 -- Re-evaluated coupon/shipping changes get a new seal, never a longer lock.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(trace->'items') item WHERE item->>'outcome' IS DISTINCT FROM 'found' OR (item->>'unitCents')::bigint NOT BETWEEN 1 AND 8000000000) THEN
  RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;
 END IF;
 token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
 INSERT INTO saas.merchant_checkout_quotes_233 VALUES(token,v_store_id,p_kind,(trace->>'sourceId')::uuid,(trace->>'sourceVersion')::bigint,
  scope.structural_digest,scope.customer_id,p_normalized_codes,v_price_digest,trace,response.result_payload->'quote',
  saas.pricing_checkout_quote_digest(v_price_digest,response.result_payload->'quote'),p_now,deadline);
 -- Opportunistic bounded expiry cleanup; no browser polling or periodic job.
 DELETE FROM saas.merchant_checkout_quotes_233 expired WHERE expired.quote_digest IN(
  SELECT candidate.quote_digest FROM saas.merchant_checkout_quotes_233 candidate WHERE candidate.store_id=v_store_id AND candidate.expires_at<=p_now
   AND NOT EXISTS(SELECT 1 FROM saas.merchant_checkout_quote_operations_233 binding WHERE binding.quote_digest=candidate.quote_digest)
  ORDER BY candidate.expires_at LIMIT 100);
 RETURN QUERY SELECT 'quoted',response.result_payload||jsonb_build_object('quoteDigest',token);
EXCEPTION WHEN OTHERS THEN
 PERFORM saas.merchant_checkout_price_leave_233();RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.merchant_checkout_quote_immutable_233()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_IMMUTABLE';END $fn$;
DROP TRIGGER IF EXISTS merchant_checkout_quote_immutable_233 ON saas.merchant_checkout_quotes_233;
CREATE TRIGGER merchant_checkout_quote_immutable_233 BEFORE UPDATE ON saas.merchant_checkout_quotes_233 FOR EACH ROW EXECUTE FUNCTION saas.merchant_checkout_quote_immutable_233();
DROP TRIGGER IF EXISTS merchant_checkout_quote_operation_immutable_233 ON saas.merchant_checkout_quote_operations_233;
CREATE TRIGGER merchant_checkout_quote_operation_immutable_233 BEFORE UPDATE OR DELETE ON saas.merchant_checkout_quote_operations_233 FOR EACH ROW EXECUTE FUNCTION saas.merchant_checkout_quote_immutable_233();

REVOKE ALL ON FUNCTION
 saas.merchant_checkout_quote_structural_digest_233(jsonb),
 saas.merchant_checkout_quote_scope_233(uuid,text,jsonb,jsonb,timestamptz),
 saas.merchant_checkout_quote_match_233(text,uuid,text,jsonb,jsonb,text[],timestamptz),
 saas.merchant_checkout_price_enter_233(text),saas.merchant_checkout_price_leave_233(),saas.merchant_checkout_quote_immutable_233()
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
-- CREATE OR REPLACE preserves the six existing function OIDs, owners, grants
-- and argument/response contracts. Retired V2 entrypoint grants stay retired.
UPDATE saas.merchant_checkout_price_233_backup SET published_sha256=
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(signature::regprocedure),'UTF8')),'hex');
COMMIT;
