-- Contact-aware prices belong to one authenticated source and one immutable
-- checkout operation. Browser-wide guest credentials never select this scope.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.checkout-pricing-contexts.release280',0));
DO $preflight$BEGIN
 IF to_regclass('saas.storefront_checkout_contexts279')IS NULL
  OR to_regclass('saas.storefront_checkout_pricing_contexts280')IS NOT NULL
  OR to_regclass('saas.checkout_pricing_context280_predecessors')IS NOT NULL
  OR to_regprocedure('saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)')IS NULL
 THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_PREDECESSOR_INVALID';END IF;
END $preflight$;
CREATE TABLE saas.checkout_pricing_context280_predecessors(
 signature text PRIMARY KEY,definition_sha256 char(64)NOT NULL,owner_name text NOT NULL,
 acl text,config text[],security_definer boolean NOT NULL,volatility char NOT NULL
);
INSERT INTO saas.checkout_pricing_context280_predecessors
SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile
FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;
CREATE TABLE saas.storefront_checkout_pricing_contexts280(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,hostname text NOT NULL,source_kind text NOT NULL,
 source_cart_id uuid,source_intent_id uuid,source_version bigint NOT NULL,
 delivery_digest char(64)NOT NULL,attribution_digest char(64)NOT NULL,normalized_codes jsonb NOT NULL,
 customer_id uuid,customer_credential_id uuid,quote_payload jsonb NOT NULL,
 quote_expires_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
 UNIQUE(store_id,operation_id),
 FOREIGN KEY(store_id)REFERENCES saas.stores(id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,source_cart_id)REFERENCES saas.storefront_carts(store_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,source_intent_id)REFERENCES saas.storefront_checkout_intents(store_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,customer_credential_id)REFERENCES saas.storefront_customer_credentials(store_id,id)ON DELETE RESTRICT,
 CHECK((source_kind='cart'AND source_cart_id IS NOT NULL AND source_intent_id IS NULL)
  OR(source_kind='buy_now'AND source_cart_id IS NULL AND source_intent_id IS NOT NULL)),
 CHECK(source_version BETWEEN 1 AND 9007199254740991),
 CHECK((customer_id IS NULL)=(customer_credential_id IS NULL)),
 CHECK(delivery_digest~'^[a-f0-9]{64}$'AND attribution_digest~'^[a-f0-9]{64}$'),
 CHECK(saas.storefront_hosted_checkout_promotion_codes_valid_v2(normalized_codes)),
 CHECK(jsonb_typeof(quote_payload)='object'AND pg_column_size(quote_payload)<=262144),
 CHECK(isfinite(created_at)AND isfinite(expires_at)AND isfinite(quote_expires_at)
  AND created_at<quote_expires_at AND quote_expires_at<=expires_at
  AND expires_at<=created_at+interval '35 minutes')
);
ALTER TABLE saas.checkout_pricing_context280_predecessors ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_pricing_context280_predecessors FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_pricing_contexts280 ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_pricing_contexts280 FORCE ROW LEVEL SECURITY;
CREATE INDEX storefront_checkout_pricing_contexts280_expiry_idx ON saas.storefront_checkout_pricing_contexts280(expires_at,operation_id);

CREATE FUNCTION saas.storefront_checkout_pricing_context280_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_IMMUTABLE';END $function$;
CREATE TRIGGER storefront_checkout_pricing_contexts280_immutable BEFORE UPDATE OR DELETE ON saas.storefront_checkout_pricing_contexts280
FOR EACH ROW EXECUTE FUNCTION saas.storefront_checkout_pricing_context280_immutable();

-- This helper is private and read-only. Callers acquire operation locks before
-- entering old financial code; source ownership is never replaced by an UUID.
CREATE FUNCTION saas.storefront_checkout_pricing_source280(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb
)RETURNS TABLE(store_id uuid,source_id uuid,source_version bigint,source_status text,deadline timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid;BEGIN
 IF p_hostname IS NULL OR p_now IS NULL OR NOT isfinite(p_now)OR date_trunc('milliseconds',p_now)<>p_now
  OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
  OR saas.storefront_credential_candidates_valid(p_credentials,false)IS DISTINCT FROM true THEN RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN;END IF;
 IF p_kind='cart'THEN
  RETURN QUERY SELECT cart.store_id,cart.id,cart.version,cart.status,least(cart.expires_at,max(credential.expires_at))
  FROM saas.storefront_carts cart JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
  JOIN jsonb_array_elements(p_credentials)candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE cart.store_id=selected_store AND cart.status IN('active','converted')AND cart.created_at<=p_now AND cart.expires_at>p_now AND credential.expires_at>p_now
  GROUP BY cart.store_id,cart.id,cart.version,cart.status,cart.expires_at;
 ELSE
  RETURN QUERY SELECT intent.store_id,intent.id,1::bigint,intent.status,intent.expires_at
  FROM saas.storefront_checkout_intents intent JOIN jsonb_array_elements(p_credentials)candidate
  ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
  WHERE intent.store_id=selected_store AND intent.kind='buy_now'AND intent.status IN('active','converted')AND intent.created_at<=p_now AND intent.expires_at>p_now
  GROUP BY intent.store_id,intent.id,intent.status,intent.expires_at;
 END IF;
END $function$;

CREATE FUNCTION saas.storefront_checkout_pricing_candidate280(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,
 p_delivery jsonb,p_operation_id uuid,p_normalized_codes jsonb,p_expected_quote_digest text
)RETURNS TABLE(outcome text,customer_candidates jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE context saas.storefront_checkout_pricing_contexts280%ROWTYPE;scope record;scope_count integer;candidate jsonb;BEGIN
 SELECT *INTO context FROM saas.storefront_checkout_pricing_contexts280 WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'absent','[]'::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now)OR date_trunc('milliseconds',p_now)<>p_now
  OR p_expected_version IS NULL OR saas.storefront_delivery_valid(p_delivery)IS DISTINCT FROM true
  OR saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_normalized_codes)IS DISTINCT FROM true
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT count(*)INTO scope_count FROM saas.storefront_checkout_pricing_source280(p_hostname,p_now,p_kind,p_credentials);
 IF scope_count<>1 THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT *INTO scope FROM saas.storefront_checkout_pricing_source280(p_hostname,p_now,p_kind,p_credentials);
 IF context.store_id<>scope.store_id OR context.hostname<>p_hostname OR context.source_kind<>p_kind
  OR coalesce(context.source_cart_id,context.source_intent_id)<>scope.source_id OR context.source_version<>p_expected_version
  OR context.delivery_digest<>encode(sha256(convert_to(p_delivery::text,'UTF8')),'hex')OR context.normalized_codes<>p_normalized_codes
  OR context.created_at>p_now OR context.quote_payload->>'quoteDigest'IS DISTINCT FROM p_expected_quote_digest
 THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF context.expires_at<=p_now AND NOT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id AND store_id=context.store_id)
  AND NOT EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id AND store_id=context.store_id)
 THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
 IF context.customer_credential_id IS NULL THEN candidate:='[]'::jsonb;
 ELSE
  SELECT jsonb_build_array(jsonb_build_object('keyId',credential.key_id,'digest',credential.credential_digest))INTO candidate
  FROM saas.storefront_customer_credentials credential WHERE credential.store_id=context.store_id AND credential.id=context.customer_credential_id
   AND credential.customer_id=context.customer_id AND credential.key_id='checkout_ctx280'AND credential.created_at=context.created_at AND credential.expires_at=context.expires_at;
  IF candidate IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 END IF;
 RETURN QUERY SELECT 'found',candidate;
END $function$;

CREATE FUNCTION saas.public_storefront_checkout_prepare_quote_v4(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,
 p_operation_id uuid,p_normalized_codes jsonb,p_attribution jsonb
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE context saas.storefront_checkout_pricing_contexts280%ROWTYPE;scope record;scope_count integer;source_status text;source_version bigint;
 prepared record;response record;candidate jsonb:='[]'::jsonb;codes text[];credential_id uuid;credential_digest text;candidate_deadline timestamptz;quote_deadline timestamptz;
 selected_customer uuid;selected_outcome text;selected_result jsonb;BEGIN
 IF p_hostname IS NULL OR p_now IS NULL OR NOT isfinite(p_now)OR date_trunc('milliseconds',p_now)<>p_now
  OR p_operation_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
  OR saas.storefront_delivery_valid(p_delivery)IS DISTINCT FROM true
  OR saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_normalized_codes)IS DISTINCT FROM true
  OR p_attribution IS NULL OR jsonb_typeof(p_attribution)<>'object'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.pricing.context280:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.checkout.operation:'||p_operation_id::text,0));
 SELECT count(*)INTO scope_count FROM saas.storefront_checkout_pricing_source280(p_hostname,p_now,p_kind,p_credentials);
 IF scope_count<>1 THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT *INTO scope FROM saas.storefront_checkout_pricing_source280(p_hostname,p_now,p_kind,p_credentials);
 SELECT *INTO context FROM saas.storefront_checkout_pricing_contexts280 WHERE operation_id=p_operation_id;
 IF FOUND THEN
  SELECT *INTO prepared FROM saas.storefront_checkout_pricing_candidate280(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,p_normalized_codes,context.quote_payload->>'quoteDigest');
  IF prepared.outcome<>'found'THEN RETURN QUERY SELECT prepared.outcome,NULL::jsonb;RETURN;END IF;
  IF context.attribution_digest<>encode(sha256(convert_to(p_attribution::text,'UTF8')),'hex')THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF scope.source_version<>context.source_version OR scope.source_status<>'active'THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF context.quote_expires_at<=p_now THEN RETURN QUERY SELECT 'price_changed',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'quoted',context.quote_payload;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id)
  OR EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id)
 THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||scope.store_id::text,0));
 IF p_kind='cart'THEN SELECT cart.status,cart.version INTO source_status,source_version FROM saas.storefront_carts cart
  WHERE cart.store_id=scope.store_id AND cart.id=scope.source_id FOR UPDATE;
 ELSE SELECT intent.status,1::bigint INTO source_status,source_version FROM saas.storefront_checkout_intents intent
  WHERE intent.store_id=scope.store_id AND intent.id=scope.source_id FOR UPDATE;END IF;
 IF source_status<>'active'OR source_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT *INTO prepared FROM saas.storefront_hosted_checkout_customer_prepare_v2(scope.store_id,p_now,'[]'::jsonb,p_delivery,gen_random_uuid(),false);
 IF prepared.outcome NOT IN('found','not_found')OR prepared.outcome IS NULL THEN RETURN QUERY SELECT coalesce(prepared.outcome,'unavailable'),NULL::jsonb;RETURN;END IF;
 selected_customer:=prepared.customer_id;candidate_deadline:=least(scope.deadline,p_now+interval '35 minutes');quote_deadline:=least(candidate_deadline,p_now+interval '10 minutes');
 SELECT coalesce(array_agg(value ORDER BY ordinality),ARRAY[]::text[])INTO codes FROM jsonb_array_elements_text(p_normalized_codes)WITH ORDINALITY code(value,ordinality);
 BEGIN
  IF selected_customer IS NOT NULL THEN
   credential_id:=gen_random_uuid();credential_digest:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
   INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at)
   VALUES(credential_id,scope.store_id,selected_customer,'checkout_ctx280',credential_digest,candidate_deadline,p_now,p_now);
   candidate:=jsonb_build_array(jsonb_build_object('keyId','checkout_ctx280','digest',credential_digest));
  END IF;
  SELECT *INTO response FROM saas.public_checkout_quote_v3(p_hostname,p_now,p_kind,p_credentials,candidate,codes,p_attribution);
  selected_outcome:=response.outcome;selected_result:=response.result_payload;
  IF selected_outcome IS DISTINCT FROM 'quoted'THEN RAISE EXCEPTION USING ERRCODE='P2801',MESSAGE='CHECKOUT_PRICING_CONTEXT280_NOT_QUOTED';END IF;
  IF EXISTS(SELECT 1 FROM saas.merchant_checkout_quotes_233 WHERE quote_digest=selected_result->>'quoteDigest')THEN
   SELECT least(quote_deadline,quote.expires_at)INTO quote_deadline FROM saas.merchant_checkout_quotes_233 quote
   WHERE quote.quote_digest=selected_result->>'quoteDigest';
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P2801',MESSAGE='CHECKOUT_PRICING_CONTEXT280_QUOTE_MISSING';END IF;
  END IF;
  INSERT INTO saas.storefront_checkout_pricing_contexts280(operation_id,store_id,hostname,source_kind,source_cart_id,source_intent_id,source_version,
   delivery_digest,attribution_digest,normalized_codes,customer_id,customer_credential_id,quote_payload,quote_expires_at,expires_at,created_at)
  VALUES(p_operation_id,scope.store_id,p_hostname,p_kind,CASE WHEN p_kind='cart'THEN scope.source_id END,CASE WHEN p_kind='buy_now'THEN scope.source_id END,p_expected_version,
   encode(sha256(convert_to(p_delivery::text,'UTF8')),'hex'),encode(sha256(convert_to(p_attribution::text,'UTF8')),'hex'),p_normalized_codes,
   selected_customer,credential_id,selected_result,quote_deadline,candidate_deadline,p_now);
 EXCEPTION WHEN SQLSTATE 'P2801'THEN RETURN QUERY SELECT coalesce(selected_outcome,'unavailable'),selected_result;RETURN;
 END;
 RETURN QUERY SELECT 'quoted',selected_result;
EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END $function$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_authority_v4(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,p_prospective_customer_id uuid,p_operation_id uuid,p_expected_quote_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selection record;candidate jsonb;BEGIN
 IF p_operation_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.pricing.context280:'||p_operation_id::text,0));
 SELECT *INTO selection FROM saas.storefront_checkout_pricing_candidate280(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,p_normalized_codes,p_expected_quote_digest);
 IF selection.outcome='absent'THEN candidate:=p_customer_candidates;
 ELSIF selection.outcome='found'THEN candidate:=selection.customer_candidates;
 ELSE RETURN QUERY SELECT selection.outcome,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT *FROM saas.public_storefront_hosted_checkout_authority_v3(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
  candidate,p_normalized_codes,p_order_id,p_prospective_customer_id,p_operation_id,p_expected_quote_digest);
END $function$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_begin_v5(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,p_session_id uuid,p_callback_binding_digest text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,p_receipt_id uuid,p_customer_credential_id uuid,
 p_payment_session_key_id text,p_payment_session_digest text,p_receipt_key_id text,p_receipt_digest text,p_customer_key_id text,p_customer_digest text,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_expected_evaluator_authority_digest text,p_expected_pricing_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selection record;candidate jsonb;BEGIN
 IF p_operation_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.pricing.context280:'||p_operation_id::text,0));
 SELECT *INTO selection FROM saas.storefront_checkout_pricing_candidate280(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,p_normalized_codes,p_expected_pricing_digest);
 IF selection.outcome='absent'THEN candidate:=p_customer_candidates;
 ELSIF selection.outcome='found'THEN candidate:=selection.customer_candidates;
 ELSE RETURN QUERY SELECT selection.outcome,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT *FROM saas.public_storefront_hosted_checkout_begin_v4(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
  p_expected_authority_digest,p_operation_id,p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,
  p_payment_session_key_id,p_payment_session_digest,p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,candidate,p_normalized_codes,p_expected_evaluator_authority_digest,p_expected_pricing_digest);
END $function$;

CREATE FUNCTION saas.storefront_checkout_pricing_fingerprint280(p_business jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
 SELECT encode(sha256(convert_to(p_business::text,'UTF8')),'hex')
$function$;

CREATE FUNCTION saas.public_checkout_complete_v4(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
 p_operation_id uuid,p_fingerprint text,p_expected_version bigint,p_delivery jsonb,p_payment_kind text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
 p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
 p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,
 p_normalized_codes text[],p_expected_quote_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selection record;candidate jsonb;selected_fingerprint text;BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.pricing.context280:'||p_operation_id::text,0));
 SELECT *INTO selection FROM saas.storefront_checkout_pricing_candidate280(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,to_jsonb(p_normalized_codes),p_expected_quote_digest);
 IF selection.outcome='absent'THEN candidate:=p_customer_credentials;selected_fingerprint:=p_fingerprint;
 ELSIF selection.outcome='found'THEN
  candidate:=selection.customer_candidates;
  -- Old browser-wide proof can rotate in another tab. Bind every immutable
  -- business input, excluding that ambient proof and movable request times.
  selected_fingerprint:=saas.storefront_checkout_pricing_fingerprint280(jsonb_build_object('schemaVersion',280,'host',p_hostname,'kind',p_kind,'source',p_credentials,
   'operation',p_operation_id,'version',p_expected_version,'delivery',p_delivery,'paymentKind',p_payment_kind,
   'order',p_order_id,'customer',p_customer_id,'address',p_address_id,'event',p_event_id,
   'receipt',p_receipt_id,'receiptKey',p_receipt_key_id,'receiptDigest',p_receipt_digest,
   'customerCredential',p_customer_credential_id,'customerKey',p_customer_key_id,'customerDigest',p_customer_digest,
   'codes',p_normalized_codes,'quoteDigest',p_expected_quote_digest));
 ELSE RETURN QUERY SELECT selection.outcome,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT *FROM saas.public_checkout_complete_v3(p_hostname,p_now,p_kind,p_credentials,candidate,
  p_operation_id,selected_fingerprint,p_expected_version,p_delivery,p_payment_kind,p_order_id,p_customer_id,p_address_id,p_event_id,
  p_receipt_id,p_receipt_key_id,p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,p_customer_digest,p_customer_expires_at,
  p_normalized_codes,p_expected_quote_digest);
END $function$;

-- Read-only recovery shares the exact private business fingerprint; it never
-- starts or retries a payment when a COMMIT result is unknown.
CREATE FUNCTION saas.public_checkout_recover_v4(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
 p_operation_id uuid,p_fingerprint text,p_expected_version bigint,p_delivery jsonb,p_payment_kind text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
 p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
 p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,
 p_normalized_codes text[],p_expected_quote_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selection record;candidate jsonb;selected_fingerprint text;BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT *INTO selection FROM saas.storefront_checkout_pricing_candidate280(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,to_jsonb(p_normalized_codes),p_expected_quote_digest);
 IF selection.outcome='absent'THEN candidate:=p_customer_credentials;selected_fingerprint:=p_fingerprint;
 ELSIF selection.outcome='found'THEN
  candidate:=selection.customer_candidates;
  -- Old browser-wide proof can rotate in another tab. Bind every immutable
  -- business input, excluding that ambient proof and movable request times.
  selected_fingerprint:=saas.storefront_checkout_pricing_fingerprint280(jsonb_build_object('schemaVersion',280,'host',p_hostname,'kind',p_kind,'source',p_credentials,
   'operation',p_operation_id,'version',p_expected_version,'delivery',p_delivery,'paymentKind',p_payment_kind,
   'order',p_order_id,'customer',p_customer_id,'address',p_address_id,'event',p_event_id,
   'receipt',p_receipt_id,'receiptKey',p_receipt_key_id,'receiptDigest',p_receipt_digest,
   'customerCredential',p_customer_credential_id,'customerKey',p_customer_key_id,'customerDigest',p_customer_digest,
   'codes',p_normalized_codes,'quoteDigest',p_expected_quote_digest));
 ELSE RETURN QUERY SELECT selection.outcome,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT *FROM saas.public_checkout_recover_v2(p_hostname,p_now,p_operation_id,selected_fingerprint);
END $function$;

REVOKE ALL ON TABLE saas.storefront_checkout_pricing_contexts280,saas.checkout_pricing_context280_predecessors
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
REVOKE ALL ON FUNCTION
 saas.storefront_checkout_pricing_context280_immutable(),
 saas.storefront_checkout_pricing_fingerprint280(jsonb),
 saas.storefront_checkout_pricing_source280(text,timestamptz,text,jsonb),
 saas.storefront_checkout_pricing_candidate280(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,text),
 saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb),
 saas.public_storefront_hosted_checkout_authority_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text),
 saas.public_storefront_hosted_checkout_begin_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text),
 saas.public_checkout_complete_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text),
 saas.public_checkout_recover_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION
 saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb),
 saas.public_storefront_hosted_checkout_authority_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text),
 saas.public_storefront_hosted_checkout_begin_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text),
 saas.public_checkout_complete_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text),
 saas.public_checkout_recover_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)
TO celebix_saas_host_resolver;
COMMIT;
