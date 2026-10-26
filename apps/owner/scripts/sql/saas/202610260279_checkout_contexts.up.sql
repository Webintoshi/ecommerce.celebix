-- Explicit future checkout contexts may coexist; old sessions retain their
-- original admission, uniqueness and immutable financial settlement contract.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.checkout-contexts.release279',0));
LOCK TABLE saas.storefront_hosted_checkout_sessions IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$DECLARE expected record;actual record;BEGIN
 IF to_regclass('saas.storefront_checkout_contexts279')IS NOT NULL
  OR to_regclass('saas.checkout_context279_predecessors')IS NOT NULL
  OR to_regclass('saas.catalog_attribute_templates278_seeded')IS NULL
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_PREDECESSOR_INVALID';END IF;
 FOR expected IN SELECT *FROM(VALUES
  ('saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)',
   '6d481e8ff90e074a2f47229251e686e5f2f91a285d7ade8173bb175e28027f58','{celebix_saas_owner=X/celebix_saas_owner}'),
  ('saas.storefront_hosted_checkout_promotion_terminal_v2()',
   '413a758e1c307945c4e2e21d275476a6bdfe4651bb0a555e417e18b45ad546c2','{celebix_saas_owner=X/celebix_saas_owner}')
 )proof(signature,definition_sha,acl)LOOP
  SELECT p.*,pg_get_functiondef(p.oid)definition INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND OR encode(sha256(convert_to(actual.definition,'UTF8')),'hex')<>expected.definition_sha
   OR actual.proowner<>'celebix_saas_owner'::regrole OR(actual.proacl::text IS DISTINCT FROM expected.acl
    AND NOT(expected.signature LIKE 'saas.public_storefront_hosted_checkout_begin_v2(%'
     AND actual.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'))
   OR NOT actual.prosecdef OR actual.provolatile<>'v'OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_ROUTINE_PREDECESSOR_INVALID:%',expected.signature;END IF;
 END LOOP;
 IF pg_get_indexdef('saas.storefront_hosted_checkout_one_active_cart_idx'::regclass)IS DISTINCT FROM
  'CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_cart_idx ON saas.storefront_hosted_checkout_sessions USING btree (store_id, cart_id) WHERE ((cart_id IS NOT NULL) AND (status = ANY (ARRAY[''active''::text, ''provider_ready''::text, ''processing''::text])))'
 OR pg_get_indexdef('saas.storefront_hosted_checkout_one_active_intent_idx'::regclass)IS DISTINCT FROM
  'CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_intent_idx ON saas.storefront_hosted_checkout_sessions USING btree (store_id, intent_id) WHERE ((intent_id IS NOT NULL) AND (status = ANY (ARRAY[''active''::text, ''provider_ready''::text, ''processing''::text])))'
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_INDEX_PREDECESSOR_INVALID';END IF;
END $preflight$;

CREATE TABLE saas.checkout_context279_predecessors(
 signature text PRIMARY KEY,definition_sha256 char(64)NOT NULL,original_definition text,
 published_sha256 char(64)NOT NULL,owner_name text NOT NULL,acl text,config text[],
 security_definer boolean NOT NULL,volatility char NOT NULL
);
INSERT INTO saas.checkout_context279_predecessors
SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 CASE WHEN p.proname IN('public_storefront_hosted_checkout_begin_v2','storefront_hosted_checkout_promotion_terminal_v2')THEN pg_get_functiondef(p.oid)END,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile
FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;
CREATE TABLE saas.storefront_checkout_contexts279(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,source_kind text NOT NULL,
 source_cart_id uuid,source_intent_id uuid,source_version bigint NOT NULL,session_id uuid NOT NULL,
 fingerprint char(64)NOT NULL,authority_digest char(64)NOT NULL,created_at timestamptz NOT NULL,
 UNIQUE(store_id,operation_id),UNIQUE(store_id,session_id),
 FOREIGN KEY(store_id)REFERENCES saas.stores(id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,source_cart_id)REFERENCES saas.storefront_carts(store_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(store_id,source_intent_id)REFERENCES saas.storefront_checkout_intents(store_id,id)ON DELETE RESTRICT,
 CHECK((source_kind='cart'AND source_cart_id IS NOT NULL AND source_intent_id IS NULL)
  OR(source_kind='buy_now'AND source_cart_id IS NULL AND source_intent_id IS NOT NULL)),
 CHECK(source_version BETWEEN 1 AND 9007199254740991),
 CHECK(fingerprint~'^[a-f0-9]{64}$'AND authority_digest~'^[a-f0-9]{64}$'),CHECK(isfinite(created_at))
);
ALTER TABLE saas.storefront_checkout_contexts279 ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_contexts279 FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_context279_predecessors ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_context279_predecessors FORCE ROW LEVEL SECURITY;

ALTER TABLE saas.storefront_hosted_checkout_sessions ADD COLUMN context_version integer NOT NULL DEFAULT 1 CHECK(context_version IN(1,2));
DROP INDEX saas.storefront_hosted_checkout_one_active_cart_idx;
CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_cart_idx ON saas.storefront_hosted_checkout_sessions(store_id,cart_id)
 WHERE context_version=1 AND cart_id IS NOT NULL AND status IN('active','provider_ready','processing');
DROP INDEX saas.storefront_hosted_checkout_one_active_intent_idx;
CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_intent_idx ON saas.storefront_hosted_checkout_sessions(store_id,intent_id)
 WHERE context_version=1 AND intent_id IS NOT NULL AND status IN('active','provider_ready','processing');
CREATE INDEX storefront_hosted_checkout_context279_source_idx ON saas.storefront_hosted_checkout_sessions(store_id,cart_id,created_at,id)
 WHERE context_version=2;

CREATE FUNCTION saas.storefront_checkout_context279_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_IMMUTABLE';END $function$;
CREATE TRIGGER storefront_checkout_contexts279_immutable BEFORE UPDATE OR DELETE ON saas.storefront_checkout_contexts279
FOR EACH ROW EXECUTE FUNCTION saas.storefront_checkout_context279_immutable();

CREATE FUNCTION saas.storefront_checkout_context279_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.storefront_checkout_contexts279 context WHERE context.store_id=NEW.store_id
  AND context.operation_id=NEW.payment_attempt_id AND context.session_id=NEW.id
  AND context.source_cart_id IS NOT DISTINCT FROM NEW.cart_id AND context.source_intent_id IS NOT DISTINCT FROM NEW.intent_id
  AND context.source_version=NEW.source_version AND context.authority_digest=NEW.commerce_authority_digest
  AND context.created_at=NEW.created_at)
 THEN NEW.context_version:=2;
 ELSIF NEW.context_version<>1 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_ADMISSION_REQUIRED';END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER storefront_hosted_checkout_context279_assign BEFORE INSERT ON saas.storefront_hosted_checkout_sessions
FOR EACH ROW EXECUTE FUNCTION saas.storefront_checkout_context279_assign();

CREATE FUNCTION saas.public_storefront_hosted_checkout_begin_v4(
 p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
 p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,p_session_id uuid,p_callback_binding_digest text,
 p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,p_receipt_id uuid,p_customer_credential_id uuid,
 p_payment_session_key_id text,p_payment_session_digest text,p_receipt_key_id text,p_receipt_digest text,p_customer_key_id text,p_customer_digest text,
 p_customer_candidates jsonb,p_normalized_codes jsonb,p_expected_evaluator_authority_digest text,p_expected_pricing_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid;source_ids uuid[];source_id uuid;context saas.storefront_checkout_contexts279%ROWTYPE;
 selected_outcome text;selected_result jsonb;source_status text;source_version bigint;
BEGIN
 IF p_hostname IS NULL OR p_now IS NULL OR NOT isfinite(p_now)OR date_trunc('milliseconds',p_now)<>p_now
  OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
  OR saas.storefront_credential_candidates_valid(p_credentials,false)IS DISTINCT FROM true
  OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
  OR p_operation_id IS NULL OR p_session_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  OR p_expected_authority_digest IS NULL OR p_expected_authority_digest!~'^[a-f0-9]{64}$'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
 SELECT *INTO context FROM saas.storefront_checkout_contexts279 WHERE operation_id=p_operation_id;
 IF p_kind='cart'THEN
  SELECT array_agg(DISTINCT cart.id ORDER BY cart.id)INTO source_ids FROM saas.storefront_carts cart
  JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
  JOIN jsonb_array_elements(p_credentials)candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE cart.store_id=selected_store AND cart.status IN('active','converted')AND cart.expires_at>p_now
   AND cart.created_at<=p_now AND credential.expires_at>p_now;
 ELSE
  SELECT array_agg(DISTINCT intent.id ORDER BY intent.id)INTO source_ids FROM saas.storefront_checkout_intents intent
  JOIN jsonb_array_elements(p_credentials)candidate ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
  WHERE intent.store_id=selected_store AND intent.kind='buy_now'AND intent.status IN('active','converted')
   AND intent.expires_at>p_now AND intent.created_at<=p_now;
 END IF;
 IF coalesce(cardinality(source_ids),0)<>1 THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 source_id:=source_ids[1];
 IF context.operation_id IS NOT NULL THEN
  IF context.store_id<>selected_store OR context.source_kind<>p_kind
   OR coalesce(context.source_cart_id,context.source_intent_id)<>source_id OR context.source_version<>p_expected_version
   OR context.session_id<>p_session_id OR context.fingerprint<>p_fingerprint OR context.authority_digest<>p_expected_authority_digest
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations WHERE operation_id=p_operation_id)
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  -- Match the existing engine's operation -> catalog -> source lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||selected_store::text,0));
  IF p_kind='cart'THEN SELECT cart.status,cart.version INTO source_status,source_version FROM saas.storefront_carts cart
   WHERE cart.store_id=selected_store AND cart.id=source_id FOR UPDATE;
  ELSE SELECT intent.status,1::bigint INTO source_status,source_version FROM saas.storefront_checkout_intents intent
   WHERE intent.store_id=selected_store AND intent.id=source_id FOR UPDATE;END IF;
  IF source_status<>'active'OR source_version<>p_expected_version
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 END IF;
 BEGIN
  IF context.operation_id IS NULL THEN
   INSERT INTO saas.storefront_checkout_contexts279(operation_id,store_id,source_kind,source_cart_id,source_intent_id,
    source_version,session_id,fingerprint,authority_digest,created_at)
   VALUES(p_operation_id,selected_store,p_kind,CASE WHEN p_kind='cart'THEN source_id END,
    CASE WHEN p_kind='buy_now'THEN source_id END,p_expected_version,p_session_id,p_fingerprint,p_expected_authority_digest,p_now);
  END IF;
  -- The existing V3 engine retains the original source-bound price quote,
  -- customer proof, stock hold, provider and callback checks without a bridge.
  SELECT response.outcome,response.result_payload INTO selected_outcome,selected_result
  FROM saas.public_storefront_hosted_checkout_begin_v3(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
   p_expected_authority_digest,p_operation_id,p_fingerprint,p_session_id,p_callback_binding_digest,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,
   p_payment_session_key_id,p_payment_session_digest,p_receipt_key_id,p_receipt_digest,p_customer_key_id,p_customer_digest,
   p_customer_candidates,p_normalized_codes,p_expected_evaluator_authority_digest,p_expected_pricing_digest)response;
  IF selected_outcome NOT IN('created','operation_replayed')OR selected_outcome IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='P2791',MESSAGE='CHECKOUT_CONTEXT279_START_NOT_COMMITTED';
  END IF;
 EXCEPTION WHEN SQLSTATE 'P2791'THEN RETURN QUERY SELECT coalesce(selected_outcome,'unavailable'),selected_result;RETURN;
 END;
 RETURN QUERY SELECT selected_outcome,selected_result;
EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
 RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END $function$;

CREATE FUNCTION saas.storefront_checkout_context279_for_attempt(p_store_id uuid,p_operation_id uuid,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
 SELECT coalesce(p_store_id IS NOT NULL AND p_operation_id IS NOT NULL AND p_now IS NOT NULL AND isfinite(p_now)
  AND date_trunc('milliseconds',p_now)=p_now AND EXISTS(
   SELECT 1 FROM saas.storefront_checkout_contexts279 context JOIN saas.storefront_hosted_checkout_sessions session
   ON session.store_id=context.store_id AND session.payment_attempt_id=context.operation_id AND session.id=context.session_id
    AND session.cart_id IS NOT DISTINCT FROM context.source_cart_id AND session.intent_id IS NOT DISTINCT FROM context.source_intent_id
   WHERE context.store_id=p_store_id AND context.operation_id=p_operation_id AND session.context_version=2 AND context.created_at<=p_now
  ),false)
$function$;

-- Only two reviewed predecessors change, through exact, counted anchors.
DO $patch$DECLARE saved record;definition text;anchor text;replacement text;BEGIN
 FOR saved IN SELECT *FROM saas.checkout_context279_predecessors WHERE original_definition IS NOT NULL LOOP
  definition:=saved.original_definition;
  IF saved.signature LIKE 'saas.public_storefront_hosted_checkout_begin_v2(%'THEN
   anchor:=$old$AND session.status IN('active','provider_ready','processing')
  ) THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;$old$;
   replacement:=$new$AND session.status IN('active','provider_ready','processing')
  ) AND NOT EXISTS(SELECT 1 FROM saas.storefront_checkout_contexts279 context
    WHERE context.store_id=v_store_id AND context.operation_id=p_operation_id AND context.session_id=p_session_id
      AND context.source_kind=p_kind AND coalesce(context.source_cart_id,context.source_intent_id)=v_source_id
      AND context.source_version=p_expected_version AND context.fingerprint=p_fingerprint
      AND context.authority_digest=p_expected_authority_digest AND context.created_at=p_now)
  THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;$new$;
   IF(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>2
   THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_BEGIN_ANCHOR_INVALID';END IF;
   definition:=replace(definition,anchor,replacement);
  ELSE
   anchor:=$old$AND cart.id=v_session.cart_id AND cart.status='active'$old$;
   replacement:=$new$AND cart.id=v_session.cart_id AND(cart.status='active'OR(cart.status='converted'AND(
      v_session.context_version=2 OR EXISTS(
        SELECT 1 FROM saas.storefront_hosted_checkout_sessions conversion
        JOIN saas.storefront_checkout_contexts279 context ON context.store_id=conversion.store_id
          AND context.operation_id=conversion.payment_attempt_id AND context.session_id=conversion.id
          AND context.source_cart_id=conversion.cart_id AND context.source_version=conversion.source_version
          AND context.authority_digest=conversion.commerce_authority_digest
        WHERE conversion.store_id=v_session.store_id AND conversion.cart_id=cart.id
          AND conversion.context_version=2 AND conversion.status='captured'
          AND cart.version=conversion.source_version+1 AND cart.updated_at=conversion.updated_at
      )
    )))$new$;
   IF(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
   THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_CART_SETTLEMENT_ANCHOR_INVALID';END IF;
   definition:=replace(definition,anchor,replacement);
   anchor:=$old$AND intent.id=v_session.intent_id AND intent.status='active'$old$;
   replacement:=$new$AND intent.id=v_session.intent_id AND(intent.status='active'OR(intent.status='converted'AND v_session.context_version=2))$new$;
   IF(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
   THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_INTENT_SETTLEMENT_ANCHOR_INVALID';END IF;
   definition:=replace(definition,anchor,replacement);
  END IF;
  EXECUTE definition;
  UPDATE saas.checkout_context279_predecessors SET published_sha256=encode(sha256(convert_to(definition,'UTF8')),'hex')WHERE signature=saved.signature;
 END LOOP;
END $patch$;

REVOKE ALL ON saas.storefront_checkout_contexts279,saas.checkout_context279_predecessors FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.storefront_checkout_context279_immutable(),saas.storefront_checkout_context279_assign(),
 saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text),
 saas.storefront_checkout_context279_for_attempt(uuid,uuid,timestamptz)FROM PUBLIC;
DO $private$DECLARE role_name text;BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON saas.storefront_checkout_contexts279,saas.checkout_context279_predecessors FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON FUNCTION saas.storefront_checkout_context279_immutable(),saas.storefront_checkout_context279_assign(),saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text),saas.storefront_checkout_context279_for_attempt(uuid,uuid,timestamptz) FROM %I',role_name);
 END LOOP;
END $private$;
GRANT EXECUTE ON FUNCTION saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text),
 saas.storefront_checkout_context279_for_attempt(uuid,uuid,timestamptz)TO celebix_saas_host_resolver;
COMMIT;
