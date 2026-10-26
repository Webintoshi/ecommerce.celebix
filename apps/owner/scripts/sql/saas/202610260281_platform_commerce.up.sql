-- Celebix's own explicit purchases: no tenant orders, recurring charges or
-- historical package/license rewrites. Only verified gateway commands settle.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.platform-commerce.release281',0));
DO $guard$BEGIN
 IF to_regclass('saas.checkout_pricing_context280_predecessors')IS NULL OR to_regclass('saas.platform_checkout_orders')IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.store_tool_receipts'::regclass AND attname='operator_id'AND attnotnull)
 THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_PREDECESSOR_INVALID';END IF;
END $guard$;
CREATE TABLE saas.platform_checkout281_predecessors(signature text PRIMARY KEY,definition_sha256 char(64)NOT NULL,owner_name text NOT NULL,acl text,config text[],security_definer boolean NOT NULL,volatility char NOT NULL);
INSERT INTO saas.platform_checkout281_predecessors SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;
CREATE TABLE saas.platform_checkout_orders(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('package','tool')),offer_id text NOT NULL,offer_name text NOT NULL,term text NOT NULL CHECK(term IN('monthly','annual','once')),
 plan_id uuid REFERENCES saas.plans(id),tool_purchase_id uuid,tool_keys text[] NOT NULL,
 baseline_subscription_id uuid NOT NULL,baseline_subscription_digest char(64)NOT NULL CHECK(baseline_subscription_digest~'^[a-f0-9]{64}$'),
 net_cents bigint NOT NULL CHECK(net_cents BETWEEN 1 AND 8000000000),vat_bps integer NOT NULL CHECK(vat_bps=2000),vat_cents bigint NOT NULL,
 total_cents bigint NOT NULL CHECK(total_cents=net_cents+vat_cents),currency text NOT NULL CHECK(currency='TRY'),
 status text NOT NULL CHECK(status IN('pending','processing','failed','fulfilled','paid_review','expired')),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 fulfilled_at timestamptz,fulfilled_attempt_id uuid,fulfillment_id uuid,review_code text,
 UNIQUE(store_id,id),FOREIGN KEY(store_id,membership_id)REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(store_id,baseline_subscription_id)REFERENCES saas.subscriptions(store_id,id),
 FOREIGN KEY(store_id,tool_purchase_id)REFERENCES saas.store_tool_purchases(store_id,id),
 CHECK((kind='package'AND term IN('monthly','annual')AND plan_id IS NOT NULL AND tool_purchase_id IS NULL AND cardinality(tool_keys)=0)
 OR(kind='tool'AND term='once'AND plan_id IS NULL AND tool_purchase_id IS NOT NULL AND cardinality(tool_keys)BETWEEN 1 AND 5)),
 CHECK(vat_cents=round(net_cents::numeric*vat_bps/10000)),CHECK(expires_at=created_at+interval '24 hours'AND updated_at>=created_at),
 CHECK((fulfilled_at IS NULL AND fulfillment_id IS NULL)OR(fulfilled_at IS NOT NULL AND fulfillment_id IS NOT NULL AND fulfilled_attempt_id IS NOT NULL))
);
CREATE TABLE saas.platform_checkout_intents(
 operation_id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES saas.platform_checkout_orders(id),store_id uuid NOT NULL,principal_id uuid NOT NULL,
 intent jsonb NOT NULL,handoff_digest char(64)NOT NULL UNIQUE CHECK(handoff_digest~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,session_digest char(64)UNIQUE,session_expires_at timestamptz,
 FOREIGN KEY(store_id,order_id)REFERENCES saas.platform_checkout_orders(store_id,id),
 FOREIGN KEY(principal_id)REFERENCES saas.principals(id),CHECK(expires_at>created_at AND expires_at<=created_at+interval '24 hours'),
 CHECK((redeemed_at IS NULL AND session_digest IS NULL AND session_expires_at IS NULL)OR(redeemed_at IS NOT NULL AND session_digest~'^[a-f0-9]{64}$'AND session_expires_at=redeemed_at+interval '24 hours'))
);
CREATE TABLE saas.platform_checkout_attempts(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES saas.platform_checkout_orders(id),request_digest char(64)NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN('initializing','ready','unknown','pending','approved','failed','paid_review')),
 sealed_buyer jsonb NOT NULL,token_digest char(64)UNIQUE,sealed_provider jsonb,expires_at timestamptz,
 provider_payment_id text UNIQUE,provider_items jsonb,proof_digest char(64),code text,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 CHECK(token_digest IS NULL OR token_digest~'^[a-f0-9]{64}$'),CHECK(proof_digest IS NULL OR proof_digest~'^[a-f0-9]{64}$'),
 CHECK(provider_payment_id IS NULL OR provider_payment_id~'^[1-9][0-9]{0,63}$'),CHECK(updated_at>=created_at),UNIQUE(order_id,id)
);
CREATE UNIQUE INDEX platform_checkout_one_active_attempt281 ON saas.platform_checkout_attempts(order_id)WHERE status IN('initializing','ready','unknown','pending');
ALTER TABLE saas.platform_checkout_orders ADD CONSTRAINT platform_checkout_fulfilled_attempt281 FOREIGN KEY(id,fulfilled_attempt_id)REFERENCES saas.platform_checkout_attempts(order_id,id);
CREATE TABLE saas.platform_checkout_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES saas.platform_checkout_orders(id),attempt_id uuid,
 actor_kind text NOT NULL CHECK(actor_kind IN('buyer','machine')),principal_id uuid REFERENCES saas.principals(id),action text NOT NULL,
 proof_digest char(64),payload jsonb NOT NULL,created_at timestamptz NOT NULL,
 FOREIGN KEY(order_id,attempt_id)REFERENCES saas.platform_checkout_attempts(order_id,id),
 CHECK((actor_kind='buyer'AND principal_id IS NOT NULL)OR(actor_kind='machine'AND principal_id IS NULL)),
 CHECK(pg_column_size(payload)<=16384),CHECK(proof_digest IS NULL OR proof_digest~'^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX platform_checkout_proof281 ON saas.platform_checkout_audit(attempt_id,action,proof_digest)WHERE proof_digest IS NOT NULL;
CREATE INDEX platform_checkout_store281 ON saas.platform_checkout_orders(store_id,created_at DESC,id);
ALTER TABLE saas.store_tool_receipts ALTER COLUMN operator_id DROP NOT NULL;
ALTER TABLE saas.store_tool_receipts ADD COLUMN checkout_order_id uuid;
ALTER TABLE saas.store_tool_receipts ADD CONSTRAINT store_tool_receipt_checkout281 FOREIGN KEY(store_id,checkout_order_id)REFERENCES saas.platform_checkout_orders(store_id,id);
ALTER TABLE saas.store_tool_receipts ADD CONSTRAINT store_tool_receipt_actor281 CHECK((operator_id IS NOT NULL AND checkout_order_id IS NULL)OR(operator_id IS NULL AND checkout_order_id IS NOT NULL));
DO $private$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['platform_checkout281_predecessors','platform_checkout_orders','platform_checkout_intents','platform_checkout_attempts','platform_checkout_audit']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY platform_checkout281_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
CREATE FUNCTION saas.platform_checkout_seal_valid281(p jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE envelope jsonb;raw text;BEGIN
 IF jsonb_typeof(p)IS DISTINCT FROM 'string'OR pg_column_size(p)>65536 THEN RETURN false;END IF;
 raw:=p#>>'{}';envelope:=raw::jsonb;
 RETURN coalesce(jsonb_typeof(envelope)='object'AND envelope?&ARRAY['v','iv','tag','ciphertext']AND envelope-ARRAY['v','iv','tag','ciphertext']='{}'::jsonb
 AND envelope->'v'='1'::jsonb AND envelope->>'iv'~'^[a-zA-Z0-9_-]{16}$'AND envelope->>'tag'~'^[a-zA-Z0-9_-]{22}$'
 AND length(envelope->>'ciphertext')BETWEEN 1 AND 60000 AND envelope->>'ciphertext'~'^[a-zA-Z0-9_-]+$'
 AND raw='{"v":1,"iv":'||to_jsonb(envelope->>'iv')::text||',"tag":'||to_jsonb(envelope->>'tag')::text||',"ciphertext":'||to_jsonb(envelope->>'ciphertext')::text||'}',false);
 EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $f$;
CREATE FUNCTION saas.platform_checkout_term_end281(p_start timestamptz,p_term text)RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_term='monthly'THEN(p_start AT TIME ZONE 'Europe/Istanbul'+interval '1 month')AT TIME ZONE 'Europe/Istanbul'
 WHEN p_term='annual'THEN(p_start AT TIME ZONE 'Europe/Istanbul'+interval '12 months')AT TIME ZONE 'Europe/Istanbul'END
$f$;
CREATE FUNCTION saas.platform_checkout_guard281()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_IMMUTABLE';END IF;
 IF TG_TABLE_NAME='platform_checkout_orders'THEN
  IF to_jsonb(NEW)-ARRAY['status','updated_at','fulfilled_at','fulfilled_attempt_id','fulfillment_id','review_code']IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','updated_at','fulfilled_at','fulfilled_attempt_id','fulfillment_id','review_code']
   OR(OLD.fulfillment_id IS NOT NULL AND(NEW.fulfillment_id IS DISTINCT FROM OLD.fulfillment_id OR NEW.fulfilled_at IS DISTINCT FROM OLD.fulfilled_at OR NEW.fulfilled_attempt_id IS DISTINCT FROM OLD.fulfilled_attempt_id))
   OR(OLD.status IN('fulfilled','paid_review','expired')AND NEW.status NOT IN(OLD.status,'paid_review'))
  THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_ORDER_IMMUTABLE';END IF;
 ELSIF TG_TABLE_NAME='platform_checkout_intents'THEN
  IF to_jsonb(NEW)-ARRAY['expires_at','redeemed_at','session_digest','session_expires_at']IS DISTINCT FROM to_jsonb(OLD)-ARRAY['expires_at','redeemed_at','session_digest','session_expires_at']OR OLD.redeemed_at IS NOT NULL
   OR(NEW.redeemed_at IS NULL AND(NEW.expires_at<OLD.expires_at OR NEW.session_digest IS NOT NULL OR NEW.session_expires_at IS NOT NULL))
   OR(NEW.redeemed_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at)
  THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_HANDOFF_IMMUTABLE';END IF;
 ELSIF TG_TABLE_NAME='platform_checkout_attempts'THEN
  IF to_jsonb(NEW)-ARRAY['status','token_digest','sealed_provider','expires_at','provider_payment_id','provider_items','proof_digest','code','updated_at']IS DISTINCT FROM to_jsonb(OLD)-ARRAY['status','token_digest','sealed_provider','expires_at','provider_payment_id','provider_items','proof_digest','code','updated_at']
   OR(OLD.token_digest IS NOT NULL AND NEW.token_digest IS DISTINCT FROM OLD.token_digest)
   OR(OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id)
   OR(OLD.status IN('approved','paid_review')AND NEW.status NOT IN(OLD.status,'paid_review'))
  THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_ATTEMPT_IMMUTABLE';END IF;
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER platform_checkout_orders_guard281 BEFORE UPDATE OR DELETE ON saas.platform_checkout_orders FOR EACH ROW EXECUTE FUNCTION saas.platform_checkout_guard281();
CREATE TRIGGER platform_checkout_intents_guard281 BEFORE UPDATE OR DELETE ON saas.platform_checkout_intents FOR EACH ROW EXECUTE FUNCTION saas.platform_checkout_guard281();
CREATE TRIGGER platform_checkout_attempts_guard281 BEFORE UPDATE OR DELETE ON saas.platform_checkout_attempts FOR EACH ROW EXECUTE FUNCTION saas.platform_checkout_guard281();
CREATE TRIGGER platform_checkout_audit_immutable281 BEFORE UPDATE OR DELETE ON saas.platform_checkout_audit FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE FUNCTION saas.platform_checkout_projection281(p_order uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('orderId',o.id,'storeId',o.store_id,'storeName',s.name,'storeSlug',s.slug,'kind',o.kind,'offerId',o.offer_id,'offerName',o.offer_name,'term',o.term,
 'netCents',o.net_cents,'vatBps',o.vat_bps,'vatCents',o.vat_cents,'totalCents',o.total_cents,'currency',o.currency,'status',o.status,'createdAt',saas.merchant_admin_timestamp(o.created_at),'expiresAt',saas.merchant_admin_timestamp(o.expires_at),
 'attempt',(SELECT jsonb_build_object('attemptId',a.id,'status',a.status)FROM saas.platform_checkout_attempts a WHERE a.order_id=o.id ORDER BY a.created_at DESC,a.id LIMIT 1))FROM saas.platform_checkout_orders o JOIN saas.stores s ON s.id=o.store_id WHERE o.id=p_order
$f$;
CREATE FUNCTION saas.platform_checkout_machine_projection281(p_order uuid,p_attempt uuid DEFAULT NULL)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('order',saas.platform_checkout_projection281(p_order),'attempt',(SELECT jsonb_build_object('attemptId',a.id,'status',a.status,'requestDigest',a.request_digest,'sealedBuyer',a.sealed_buyer,'tokenDigest',a.token_digest,'sealedProvider',a.sealed_provider,'expiresAt',CASE WHEN a.expires_at IS NOT NULL THEN saas.merchant_admin_timestamp(a.expires_at)END)FROM saas.platform_checkout_attempts a WHERE a.order_id=p_order AND(p_attempt IS NULL OR a.id=p_attempt)ORDER BY a.created_at DESC,a.id LIMIT 1))
$f$;
CREATE FUNCTION saas.platform_checkout_receipt_guard281()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$BEGIN
 IF NEW.checkout_order_id IS NULL THEN RETURN NEW;END IF;
 IF NEW.operator_id IS NOT NULL OR NEW.method<>'card'OR NOT EXISTS(SELECT 1 FROM saas.platform_checkout_orders o JOIN saas.platform_checkout_attempts a ON a.order_id=o.id AND a.id=o.fulfilled_attempt_id
 WHERE o.id=NEW.checkout_order_id AND o.store_id=NEW.store_id AND o.kind='tool'AND o.tool_purchase_id=NEW.purchase_id AND o.total_cents=NEW.amount_cents
 AND a.status='approved'AND a.provider_payment_id IS NOT NULL AND NEW.reference='iyzico:'||a.provider_payment_id)
 THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_MACHINE_RECEIPT_INVALID';END IF;RETURN NEW;
END $f$;
CREATE TRIGGER store_tool_receipt_validate281 BEFORE INSERT ON saas.store_tool_receipts FOR EACH ROW EXECUTE FUNCTION saas.platform_checkout_receipt_guard281();
CREATE FUNCTION saas.platform_checkout_create(
 p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_intent jsonb,p_handoff_digest text
)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());e text;prior saas.platform_checkout_intents;o saas.platform_checkout_orders;sub saas.subscriptions;
 target saas.plans;offer saas.store_tool_offers;purchase saas.store_tool_purchases;net bigint;title text;keys text[]:='{}';new_id uuid:=gen_random_uuid();BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_operation IS NULL OR p_handoff_digest IS NULL OR p_handoff_digest!~'^[a-f0-9]{64}$'
  OR saas.catalog_onboarding_json_exact(p_intent,ARRAY['kind','offerId','term'],ARRAY[]::text[])IS DISTINCT FROM true
  OR jsonb_typeof(p_intent->'offerId')<>'string'OR p_intent->>'kind'NOT IN('package','tool')
  OR(p_intent->>'kind'='package'AND p_intent->>'term'NOT IN('monthly','annual'))OR(p_intent->>'kind'='tool'AND p_intent->>'term'<>'once')
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.manage');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active'AND support_session_id IS NULL
  AND(role='store_owner'OR(p_intent->>'kind'='tool'AND role='admin')))
 THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.operation281:'||p_operation,0));
 SELECT *INTO prior FROM saas.platform_checkout_intents WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id<>p_store OR prior.principal_id<>p_principal OR prior.intent<>p_intent OR prior.handoff_digest<>p_handoff_digest THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE
   SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=prior.order_id;
   IF prior.redeemed_at IS NULL AND o.expires_at>moment AND prior.expires_at<=moment THEN
    UPDATE saas.platform_checkout_intents SET expires_at=least(moment+interval '5 minutes',o.expires_at)WHERE operation_id=p_operation AND redeemed_at IS NULL;
   END IF;
   RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_projection281(prior.order_id);END IF;RETURN;
 END IF;
 INSERT INTO saas.platform_store_versions(store_id)VALUES(p_store)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.platform_store_versions WHERE store_id=p_store FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||p_store,263));
 SELECT *INTO sub FROM saas.subscriptions WHERE store_id=p_store AND status='active'AND valid_from<=moment AND(valid_until IS NULL OR valid_until>moment);
 IF NOT FOUND OR sub.plan_id<>p_plan THEN RETURN QUERY SELECT 'subscription_denied',NULL::jsonb;RETURN;END IF;
 IF p_intent->>'kind'='package'THEN
  IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders q WHERE q.store_id=p_store AND q.kind='package'AND q.status IN('pending','processing','failed','paid_review')
   AND(q.status='paid_review'OR q.offer_id<>p_intent->>'offerId'OR q.term<>p_intent->>'term'OR q.principal_id<>p_principal))
  THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.platform_plan_prices WHERE plan_id=sub.plan_id AND monthly_price_cents=0 AND yearly_price_cents=0)OR sub.plan_code<>'free_starter'
  THEN RETURN QUERY SELECT 'already_covered',NULL::jsonb;RETURN;END IF;
  SELECT *INTO target FROM saas.plans WHERE id=(p_intent->>'offerId')::uuid AND status='active'AND valid_from<=moment AND(valid_until IS NULL OR valid_until>moment)AND saas.commercial248_plan_selectable(id);
  SELECT CASE p_intent->>'term'WHEN 'monthly'THEN monthly_price_cents ELSE yearly_price_cents END INTO net FROM saas.platform_plan_prices WHERE plan_id=target.id;
  IF target.id IS NULL OR net IS NULL OR net<=0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  title:=CASE target.plan_code WHEN 'starter'THEN 'Başlangıç'WHEN 'growth'THEN 'Büyüme'WHEN 'professional'THEN 'Profesyonel'ELSE target.plan_code END;
 ELSE
  SELECT *INTO offer FROM saas.store_tool_offers WHERE id=p_intent->>'offerId';IF NOT FOUND OR offer.vat_bps<>2000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(p_store,moment)WHERE tool_key=ANY(offer.tool_keys))THEN RETURN QUERY SELECT 'already_owned',NULL::jsonb;RETURN;END IF;
  SELECT *INTO purchase FROM saas.store_tool_purchases WHERE store_id=p_store AND status='pending'AND tool_keys&&offer.tool_keys ORDER BY created_at,id LIMIT 1;
  IF FOUND AND(purchase.principal_id<>p_principal OR purchase.offer_id<>offer.id OR purchase.quote_fingerprint<>offer.quote_fingerprint OR purchase.net_cents<>offer.net_cents OR purchase.vat_bps<>2000 OR purchase.tool_keys<>offer.tool_keys OR purchase.total_cents<>offer.net_cents+round(offer.net_cents::numeric/5))
  THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
  IF purchase.id IS NULL THEN
   INSERT INTO saas.store_tool_purchases(store_id,id,principal_id,offer_id,offer_name,quote_fingerprint,tool_keys,net_cents,vat_bps,vat_cents,total_cents,created_at)
   VALUES(p_store,gen_random_uuid(),p_principal,offer.id,offer.name,offer.quote_fingerprint,offer.tool_keys,offer.net_cents,2000,round(offer.net_cents::numeric/5),offer.net_cents+round(offer.net_cents::numeric/5),moment)RETURNING *INTO purchase;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=purchase.id AND status='paid_review')THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
  net:=purchase.net_cents;title:=purchase.offer_name;keys:=purchase.tool_keys;
 END IF;
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE store_id=p_store AND kind=p_intent->>'kind'AND offer_id=p_intent->>'offerId'AND term=p_intent->>'term'AND status IN('pending','processing','failed')ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF o.principal_id<>p_principal THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
  IF o.expires_at<=moment THEN
   IF EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE order_id=o.id AND status IN('initializing','ready','unknown','pending'))THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
   UPDATE saas.platform_checkout_orders SET status='expired',updated_at=moment WHERE id=o.id;o.id:=NULL;
  END IF;
 END IF;
 IF o.id IS NULL THEN
  INSERT INTO saas.platform_checkout_orders(id,store_id,principal_id,membership_id,kind,offer_id,offer_name,term,plan_id,tool_purchase_id,tool_keys,
   baseline_subscription_id,baseline_subscription_digest,net_cents,vat_bps,vat_cents,total_cents,currency,status,created_at,expires_at,updated_at)
  VALUES(new_id,p_store,p_principal,p_member,p_intent->>'kind',p_intent->>'offerId',title,p_intent->>'term',target.id,purchase.id,keys,
   sub.id,encode(sha256(convert_to(to_jsonb(sub)::text,'UTF8')),'hex'),net,2000,round(net::numeric/5),net+round(net::numeric/5),'TRY','pending',moment,moment+interval '24 hours',moment)RETURNING *INTO o;
 END IF;
 INSERT INTO saas.platform_checkout_intents(operation_id,order_id,store_id,principal_id,intent,handoff_digest,created_at,expires_at)VALUES(p_operation,o.id,p_store,p_principal,p_intent,p_handoff_digest,moment,moment+interval '5 minutes');
 INSERT INTO saas.platform_checkout_audit(order_id,actor_kind,principal_id,action,payload,created_at)VALUES(o.id,'buyer',p_principal,'created',jsonb_build_object('operationId',p_operation,'intent',p_intent),moment);
 RETURN QUERY SELECT 'created',saas.platform_checkout_projection281(o.id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR foreign_key_violation OR unique_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
-- Existing manual assignment uses store-version row then commercial lock.
-- The caller holds those locks and the exact order/attempt row locks already.
CREATE FUNCTION saas.platform_checkout_fulfill281(p_order uuid,p_attempt uuid,p_now timestamptz)RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.platform_checkout_orders;a saas.platform_checkout_attempts;sub saas.subscriptions;target saas.plans;purchase saas.store_tool_purchases;
 reason text;selected_fulfillment uuid;new_subscription uuid:=gen_random_uuid();period uuid:=gen_random_uuid();until_at timestamptz;usage jsonb;BEGIN
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=p_order;SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=p_attempt AND order_id=p_order AND status='approved';
 IF o.id IS NULL OR a.id IS NULL THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT281_APPROVAL_REQUIRED';END IF;
 IF o.status IN('fulfilled','paid_review')THEN reason:='duplicate_or_review_payment';
 ELSIF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=o.store_id AND status='active')THEN reason:='store_inactive';
 ELSIF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=o.membership_id AND store_id=o.store_id AND principal_id=o.principal_id AND status='active'AND support_session_id IS NULL AND(role='store_owner'OR(o.kind='tool'AND role='admin')))THEN reason:='purchaser_changed';
 ELSIF o.kind='package'THEN
  SELECT *INTO sub FROM saas.subscriptions WHERE store_id=o.store_id AND status='active'FOR UPDATE;
  SELECT *INTO target FROM saas.plans WHERE id=o.plan_id AND status='active'AND valid_from<=p_now AND(valid_until IS NULL OR valid_until>p_now);
  IF sub.id IS DISTINCT FROM o.baseline_subscription_id OR encode(sha256(convert_to(to_jsonb(sub)::text,'UTF8')),'hex')IS DISTINCT FROM o.baseline_subscription_digest THEN reason:='subscription_changed';
  ELSIF sub.plan_code<>'free_starter'OR NOT EXISTS(SELECT 1 FROM saas.platform_plan_prices WHERE plan_id=sub.plan_id AND monthly_price_cents=0 AND yearly_price_cents=0)THEN reason:='subscription_changed';
  ELSIF target.id IS NULL OR NOT coalesce((SELECT assignments_enabled FROM saas.commercial_package_release_state WHERE singleton),false)THEN reason:='plan_unavailable';
  ELSE
   usage:=saas.commercial_usage(o.store_id,p_now);
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['products','staff','storageBytes','monthlyOrders','customDomains'])k WHERE NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=o.plan_id AND limit_key=k AND effective_limit>=coalesce((usage->>k)::bigint,0)))
    OR EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=o.plan_id AND variant_limit<coalesce((usage->>'variants')::bigint,0))
    OR(SELECT effective_limit FROM saas.plan_limits WHERE plan_id=o.plan_id AND limit_key='monthlyOrders')<coalesce((usage->>'monthlyOrders')::bigint,0)+(SELECT count(*)FROM saas.commercial_order_reservations WHERE store_id=o.store_id AND state='reserved'AND month_start=saas.commercial_month(o.store_id,p_now))
   THEN reason:='usage_changed';
   ELSIF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=o.store_id AND status IN('payment_pending','payment_received')AND((contract_version=4 AND NOT saas.commercial_plan_has_capability(o.plan_id,'manual_orders'))OR(contract_version<>4 AND NOT saas.commercial_plan_has_capability(o.plan_id,'cashier'))))
   THEN reason:='open_sales_require_features';
   ELSIF(EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=o.store_id AND sale_cents-return_cents-discount_cents-collected_cents>0)OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=o.store_id AND status IN('payment_pending','payment_received')AND contract_version IN(3,4)AND initial_collection_cents<total_cents))AND NOT saas.commercial_plan_has_capability(o.plan_id,'accounting')
   THEN reason:='open_debt_requires_accounting';END IF;
  END IF;
 ELSE
  SELECT *INTO purchase FROM saas.store_tool_purchases WHERE store_id=o.store_id AND id=o.tool_purchase_id FOR UPDATE;
  IF purchase.status IS DISTINCT FROM 'pending'OR purchase.total_cents<>o.total_cents OR purchase.principal_id<>o.principal_id OR purchase.tool_keys<>o.tool_keys
   OR EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(o.store_id,p_now)WHERE tool_key=ANY(o.tool_keys))
  THEN reason:='tool_rights_changed';END IF;
 END IF;
 IF reason IS NULL THEN
  BEGIN
   UPDATE saas.platform_checkout_orders SET fulfilled_attempt_id=p_attempt,updated_at=p_now WHERE id=p_order;
   IF o.kind='package'THEN
    until_at:=saas.platform_checkout_term_end281(p_now,o.term);
    UPDATE saas.subscriptions SET status='inactive',updated_at=greatest(updated_at,p_now)WHERE id=sub.id AND store_id=o.store_id;
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at)
    VALUES(new_subscription,o.store_id,target.id,target.plan_code,target.version,'active',p_now,until_at,p_now,p_now);
    INSERT INTO saas.platform_billing_periods(id,store_id,label,starts_on,ends_on,due_on,amount_cents,currency,created_at)
    VALUES(period,o.store_id,o.offer_name||CASE o.term WHEN 'annual'THEN ' · Yıllık'ELSE ' · Aylık'END,(p_now AT TIME ZONE 'Europe/Istanbul')::date,(until_at AT TIME ZONE 'Europe/Istanbul')::date-1,(p_now AT TIME ZONE 'Europe/Istanbul')::date,o.total_cents,'TRY',p_now);
    INSERT INTO saas.platform_receipts(store_id,period_id,amount_cents,method,reference,created_at)VALUES(o.store_id,period,o.total_cents,'card','iyzico:'||a.provider_payment_id,p_now);
    UPDATE saas.platform_store_versions SET version=version+1 WHERE store_id=o.store_id;
    selected_fulfillment:=new_subscription;
   ELSE
    INSERT INTO saas.store_tool_receipts(store_id,purchase_id,amount_cents,method,reference,reason,operator_id,checkout_order_id,created_at)
    VALUES(o.store_id,purchase.id,o.total_cents,'card','iyzico:'||a.provider_payment_id,'iyzico doğrulanmış platform ödemesi',NULL,o.id,p_now);
    UPDATE saas.store_tool_purchases SET status='settled',version=version+1,settled_at=p_now WHERE store_id=o.store_id AND id=purchase.id;
    INSERT INTO saas.store_tool_licenses(store_id,tool_key,source,purchase_id,granted_at)SELECT o.store_id,k,'purchase',purchase.id,p_now FROM unnest(purchase.tool_keys)k WHERE NOT EXISTS(SELECT 1 FROM saas.store_tool_legacy_releases WHERE store_id=o.store_id AND tool_key=k);
    selected_fulfillment:=purchase.id;
   END IF;
   UPDATE saas.platform_checkout_orders SET status='fulfilled',fulfillment_id=selected_fulfillment,fulfilled_at=p_now,updated_at=p_now WHERE id=p_order;
  EXCEPTION WHEN OTHERS THEN reason:='fulfillment_conflict';END;
 END IF;
 IF reason IS NOT NULL THEN
  UPDATE saas.platform_checkout_attempts SET status='paid_review',code=reason,updated_at=p_now WHERE id=p_attempt;
  UPDATE saas.platform_checkout_orders SET status='paid_review',review_code=reason,updated_at=p_now WHERE id=p_order;
  RETURN 'paid_review';
 END IF;RETURN 'fulfilled';
END $f$;
CREATE FUNCTION saas.platform_checkout_machine(p_action text,p_args jsonb)RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());o saas.platform_checkout_orders;a saas.platform_checkout_attempts;t saas.platform_checkout_intents;
 prior saas.platform_checkout_audit;requested uuid;token text;state text;code text;approved_payment text;items jsonb;response text;until_at timestamptz;BEGIN
 IF p_args IS NULL OR jsonb_typeof(p_args)<>'object'OR pg_column_size(p_args)>131072 OR p_action IS NULL OR p_action NOT IN('redeem','read','begin','initialized','lookup','finish')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_args)field WHERE field.value='null'::jsonb AND NOT(p_action='finish'AND field.key IN('paymentId','fraudStatus')))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='lookup'THEN
  IF(saas.catalog_onboarding_json_exact(p_args,ARRAY['attemptId'],ARRAY[]::text[])IS TRUE)THEN
   SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=(p_args->>'attemptId')::uuid;
  ELSIF saas.catalog_onboarding_json_exact(p_args,ARRAY['tokenDigest'],ARRAY[]::text[])IS TRUE AND p_args->>'tokenDigest'~'^[a-f0-9]{64}$'THEN
   SELECT *INTO a FROM saas.platform_checkout_attempts WHERE token_digest=p_args->>'tokenDigest';
  ELSE RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF a.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;ELSE RETURN QUERY SELECT 'found',saas.platform_checkout_machine_projection281(a.order_id,a.id);END IF;RETURN;
 END IF;
 requested:=(p_args->>'orderId')::uuid;SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=requested;
 IF o.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF p_action IN('redeem','read','begin')THEN
  IF p_action='redeem'THEN
   IF saas.catalog_onboarding_json_exact(p_args,ARRAY['orderId','handoffDigest','sessionDigest'],ARRAY[]::text[])IS DISTINCT FROM true OR p_args->>'handoffDigest'!~'^[a-f0-9]{64}$'OR p_args->>'sessionDigest'!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||o.id,0));
   SELECT *INTO t FROM saas.platform_checkout_intents WHERE order_id=o.id AND handoff_digest=p_args->>'handoffDigest'FOR UPDATE;
   IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
   IF t.redeemed_at IS NOT NULL THEN
    IF t.session_digest=p_args->>'sessionDigest'AND t.session_expires_at>moment THEN RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_machine_projection281(o.id);ELSE RETURN QUERY SELECT 'handoff_used',NULL::jsonb;END IF;RETURN;
   END IF;
   IF t.expires_at<=moment OR o.expires_at<=moment THEN RETURN QUERY SELECT 'checkout_expired',NULL::jsonb;RETURN;END IF;
   UPDATE saas.platform_checkout_intents SET redeemed_at=moment,session_digest=p_args->>'sessionDigest',session_expires_at=moment+interval '24 hours'WHERE operation_id=t.operation_id;
   RETURN QUERY SELECT 'redeemed',saas.platform_checkout_machine_projection281(o.id);RETURN;
  END IF;
  IF p_action='read'AND saas.catalog_onboarding_json_exact(p_args,ARRAY['orderId','sessionDigest'],ARRAY[]::text[])IS DISTINCT FROM true
   OR p_action='begin'AND saas.catalog_onboarding_json_exact(p_args,ARRAY['orderId','sessionDigest','attemptId','requestDigest','sealedBuyer'],ARRAY[]::text[])IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_args->>'sessionDigest'!~'^[a-f0-9]{64}$'OR NOT EXISTS(SELECT 1 FROM saas.platform_checkout_intents WHERE order_id=o.id AND session_digest=p_args->>'sessionDigest'AND redeemed_at<=moment AND session_expires_at>moment)
  THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF p_action='read'THEN RETURN QUERY SELECT 'found',saas.platform_checkout_machine_projection281(o.id);RETURN;END IF;
  IF p_args->>'requestDigest'!~'^[a-f0-9]{64}$'OR saas.platform_checkout_seal_valid281(p_args->'sealedBuyer')IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||o.id,0));SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=o.id FOR UPDATE;
  SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=(p_args->>'attemptId')::uuid;
  IF FOUND THEN
   IF a.order_id<>o.id OR a.request_digest<>p_args->>'requestDigest'THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'attempt_replayed',saas.platform_checkout_machine_projection281(o.id,a.id);END IF;RETURN;
  END IF;
  IF o.status NOT IN('pending','processing','failed')THEN RETURN QUERY SELECT 'already_completed',saas.platform_checkout_machine_projection281(o.id);RETURN;END IF;
  IF o.expires_at<=moment THEN RETURN QUERY SELECT 'checkout_expired',NULL::jsonb;RETURN;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=o.store_id AND status='active')OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=o.store_id AND id=o.membership_id AND principal_id=o.principal_id AND status='active'AND support_session_id IS NULL AND(role='store_owner'OR(o.kind='tool'AND role='admin')))
  THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF o.kind='package'AND NOT EXISTS(SELECT 1 FROM saas.subscriptions s WHERE s.id=o.baseline_subscription_id AND s.store_id=o.store_id AND s.status='active'AND(s.valid_until IS NULL OR s.valid_until>moment)AND encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex')=o.baseline_subscription_digest)
  THEN RETURN QUERY SELECT 'already_covered',NULL::jsonb;RETURN;END IF;
  IF o.kind='tool'AND EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(o.store_id,moment)WHERE tool_key=ANY(o.tool_keys))THEN RETURN QUERY SELECT 'already_owned',NULL::jsonb;RETURN;END IF;
  SELECT *INTO a FROM saas.platform_checkout_attempts WHERE order_id=o.id AND status IN('initializing','ready','unknown','pending')ORDER BY created_at DESC,id LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'attempt_in_progress',saas.platform_checkout_machine_projection281(o.id,a.id);RETURN;END IF;
  INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,created_at,updated_at)VALUES((p_args->>'attemptId')::uuid,o.id,p_args->>'requestDigest','initializing',p_args->'sealedBuyer',moment,moment)RETURNING *INTO a;
  UPDATE saas.platform_checkout_orders SET status='processing',updated_at=moment WHERE id=o.id;
  INSERT INTO saas.platform_checkout_audit(order_id,attempt_id,actor_kind,action,payload,created_at)VALUES(o.id,a.id,'machine','begin',jsonb_build_object('requestDigest',a.request_digest),moment);
  RETURN QUERY SELECT 'initialization_claimed',saas.platform_checkout_machine_projection281(o.id,a.id);RETURN;
 END IF;
 IF p_action='initialized'THEN
  IF saas.catalog_onboarding_json_exact(p_args,ARRAY['orderId','attemptId','requestDigest','status'],ARRAY['tokenDigest','sealedProvider','expiresAt','code'])IS DISTINCT FROM true OR jsonb_typeof(p_args->'status')<>'string'OR p_args->>'status'NOT IN('ready','failed','unknown')OR p_args->>'requestDigest'!~'^[a-f0-9]{64}$'
   OR(p_args?'code'AND(p_args->>'code'!~'^[a-z0-9_]{1,80}$'))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  state:=p_args->>'status';
  IF state='ready'THEN
   until_at:=(p_args->>'expiresAt')::timestamptz;
   IF p_args->>'tokenDigest'!~'^[a-f0-9]{64}$'OR saas.platform_checkout_seal_valid281(p_args->'sealedProvider')IS DISTINCT FROM true OR until_at IS NULL OR NOT isfinite(until_at)OR until_at<=moment OR until_at>moment+interval '1 hour'
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSIF p_args?|ARRAY['tokenDigest','sealedProvider','expiresAt'] THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||o.id,0));
  SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=(p_args->>'attemptId')::uuid AND order_id=o.id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF a.request_digest<>p_args->>'requestDigest'THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF a.status<>'initializing'THEN
   IF(a.status=state AND a.token_digest IS NOT DISTINCT FROM p_args->>'tokenDigest')OR a.status IN('approved','paid_review','pending')THEN RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_machine_projection281(o.id,a.id);
   ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
  END IF;
  UPDATE saas.platform_checkout_attempts SET status=state,token_digest=p_args->>'tokenDigest',sealed_provider=p_args->'sealedProvider',expires_at=until_at,code=p_args->>'code',updated_at=moment WHERE id=a.id;
  UPDATE saas.platform_checkout_orders SET status=CASE state WHEN 'failed'THEN 'failed'ELSE 'processing'END,updated_at=moment WHERE id=o.id;
  INSERT INTO saas.platform_checkout_audit(order_id,attempt_id,actor_kind,action,payload,created_at)VALUES(o.id,a.id,'machine','initialized',jsonb_build_object('status',state,'code',p_args->>'code'),moment);
  RETURN QUERY SELECT 'initialized',saas.platform_checkout_machine_projection281(o.id,a.id);RETURN;
 END IF;
 -- Callback values reach this command only after the owner gateway verifies
 -- iyzico's signature and the complete exact single-item financial response.
 IF saas.catalog_onboarding_json_exact(p_args,ARRAY['orderId','attemptId','tokenDigest','status','paymentId','conversationId','basketId','priceCents','paidPriceCents','currency','fraudStatus','proofDigest','itemTransactions'],ARRAY['sealedProvider']::text[])IS DISTINCT FROM true
  OR p_args->>'tokenDigest'!~'^[a-f0-9]{64}$'OR p_args->>'proofDigest'!~'^[a-f0-9]{64}$'OR jsonb_typeof(p_args->'status')<>'string'OR p_args->>'status'NOT IN('approved','failed','pending')
  OR jsonb_typeof(p_args->'currency')<>'string'OR p_args->>'currency'<>'TRY'OR jsonb_typeof(p_args->'tokenDigest')<>'string'OR jsonb_typeof(p_args->'proofDigest')<>'string'OR jsonb_typeof(p_args->'basketId')<>'string'OR p_args->>'basketId'<>o.id::text OR jsonb_typeof(p_args->'conversationId')<>'string'OR p_args->>'conversationId'<>p_args->>'attemptId'
  OR jsonb_typeof(p_args->'priceCents')<>'number'OR p_args->>'priceCents'!~'^[1-9][0-9]{0,14}$'OR(p_args->>'priceCents')::bigint<>o.total_cents
  OR jsonb_typeof(p_args->'paidPriceCents')<>'number'OR p_args->>'paidPriceCents'!~'^[1-9][0-9]{0,14}$'OR(p_args->>'paidPriceCents')::bigint<>o.total_cents
  OR(p_args->'paymentId'<>'null'::jsonb AND(jsonb_typeof(p_args->'paymentId')<>'string'OR p_args->>'paymentId'!~'^[1-9][0-9]{0,63}$'))
  OR p_args->'fraudStatus'NOT IN('null'::jsonb,'-1'::jsonb,'0'::jsonb,'1'::jsonb)
  OR jsonb_typeof(p_args->'itemTransactions')<>'array'OR jsonb_array_length(p_args->'itemTransactions')>1
 THEN RETURN QUERY SELECT 'payment_mismatch',NULL::jsonb;RETURN;END IF;
 IF p_args->>'status'='approved'AND(p_args->'fraudStatus'<>'1'::jsonb OR p_args->'paymentId'='null'::jsonb OR jsonb_array_length(p_args->'itemTransactions')<>1)
 THEN RETURN QUERY SELECT 'payment_mismatch',NULL::jsonb;RETURN;END IF;
 IF jsonb_array_length(p_args->'itemTransactions')=1 THEN
  items:=p_args->'itemTransactions'->0;
  IF saas.catalog_onboarding_json_exact(items,ARRAY['itemId','transactionId','priceCents','paidPriceCents'],ARRAY[]::text[])IS DISTINCT FROM true OR jsonb_typeof(items->'itemId')<>'string'OR items->>'itemId'<>o.id::text
   OR jsonb_typeof(items->'transactionId')<>'string'OR items->>'transactionId'!~'^[1-9][0-9]{0,63}$'OR items->'priceCents'IS DISTINCT FROM p_args->'priceCents'OR items->'paidPriceCents'IS DISTINCT FROM p_args->'paidPriceCents'
  THEN RETURN QUERY SELECT 'payment_mismatch',NULL::jsonb;RETURN;END IF;
 END IF;
 INSERT INTO saas.platform_store_versions(store_id)VALUES(o.store_id)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.platform_store_versions WHERE store_id=o.store_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||o.store_id,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||o.store_id,263));PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||o.store_id,256));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||o.id,0));SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=o.id FOR UPDATE;
 SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=(p_args->>'attemptId')::uuid AND order_id=o.id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF a.token_digest IS NOT NULL AND a.token_digest<>p_args->>'tokenDigest'OR a.token_digest IS NULL AND(a.status NOT IN('initializing','unknown')OR saas.platform_checkout_seal_valid281(p_args->'sealedProvider')IS DISTINCT FROM true)
 THEN RETURN QUERY SELECT 'payment_mismatch',NULL::jsonb;RETURN;END IF;
 SELECT *INTO prior FROM saas.platform_checkout_audit WHERE attempt_id=a.id AND action='finish'AND proof_digest=p_args->>'proofDigest';
 IF FOUND THEN
  IF prior.payload<>p_args-'sealedProvider' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_machine_projection281(o.id,a.id);END IF;RETURN;
 END IF;
 IF a.status IN('approved','paid_review')THEN
  IF a.provider_payment_id IS NOT DISTINCT FROM p_args->>'paymentId'AND p_args->>'status'='approved'THEN RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_machine_projection281(o.id,a.id);ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 approved_payment:=p_args->>'paymentId';
 IF approved_payment IS NOT NULL AND EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE provider_payment_id=approved_payment AND id<>a.id)THEN RETURN QUERY SELECT 'payment_id_used',NULL::jsonb;RETURN;END IF;
 state:=p_args->>'status';
 UPDATE saas.platform_checkout_attempts SET status=CASE state WHEN 'approved'THEN 'approved'WHEN 'pending'THEN 'pending'ELSE 'failed'END,token_digest=coalesce(token_digest,p_args->>'tokenDigest'),sealed_provider=coalesce(sealed_provider,p_args->'sealedProvider'),provider_payment_id=coalesce(provider_payment_id,approved_payment),provider_items=p_args->'itemTransactions',proof_digest=p_args->>'proofDigest',updated_at=moment WHERE id=a.id;
 IF state='approved'THEN response:=saas.platform_checkout_fulfill281(o.id,a.id,moment);
 ELSIF state='pending'THEN
  IF o.status NOT IN('fulfilled','paid_review')THEN UPDATE saas.platform_checkout_orders SET status='processing',updated_at=moment WHERE id=o.id;END IF;response:='pending';
 ELSE
  IF o.status NOT IN('fulfilled','paid_review')AND NOT EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE order_id=o.id AND id<>a.id AND status IN('initializing','ready','unknown','pending'))THEN UPDATE saas.platform_checkout_orders SET status='failed',updated_at=moment WHERE id=o.id;END IF;response:='failed';
 END IF;
 INSERT INTO saas.platform_checkout_audit(order_id,attempt_id,actor_kind,action,proof_digest,payload,created_at)VALUES(o.id,a.id,'machine','finish',p_args->>'proofDigest',p_args-'sealedProvider',moment);
 RETURN QUERY SELECT response,saas.platform_checkout_machine_projection281(o.id,a.id);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR check_violation OR foreign_key_violation OR unique_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'platform_checkout_%281'OR proname IN('platform_checkout_create','platform_checkout_machine'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.identity);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.identity,r.rolname);END LOOP;
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.platform_checkout_machine(text,jsonb)TO celebix_saas_platform_operator;
COMMIT;
