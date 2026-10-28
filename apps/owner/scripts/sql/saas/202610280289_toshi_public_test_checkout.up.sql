-- Fixed public paid gift: exactly one Toshi credit, no merchant identity or access.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-public-test.release289',0));
DO $guard289$DECLARE r record;p pg_proc%ROWTYPE;BEGIN
 IF to_regclass('saas.platform_checkout_public289_predecessors')IS NOT NULL OR to_regprocedure('saas.platform_checkout_public_test_create(timestamptz,uuid,text,text,text)')IS NOT NULL THEN RAISE EXCEPTION 'PUBLIC_TEST289_ALREADY_APPLIED_OR_DRIFT';END IF;
 FOR r IN SELECT *FROM(VALUES
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','f5aba85e14927d5f96eb8aafa20dee7c9683e7004f8fd9cfee55171f7eafe82d','9a66db7c528966865d5be36f31c7c4b257e86088ce71f879c904260a8862cfcb','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'),
 ('saas.platform_checkout_machine(text,jsonb)','8d2c10e32f7e5d171daa42f358d52810ed7e80e2aa1605cae4b471b4c5bd9b82','a61d3f87e6e848aa6eaa06384810e8df6b9f9e25f226db47f2103b2810805852','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'),
 ('saas.platform_checkout_fulfill281(uuid,uuid,timestamp with time zone)','6fc11ee0ce00e9cab8ab2d01c9eafad4bab7b7373928c45f96611af09dc4da17','856ac9609ac4d3c36bdabebb18958a34ab786c05140b02811aba59e4045e65b2','{celebix_saas_owner=X/celebix_saas_owner}')
 )v(identity,old_hash,new_hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.old_hash THEN RAISE EXCEPTION 'PUBLIC_TEST289_PREDECESSOR_DRIFT';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.platform_checkout_orders'::regclass AND conname='platform_checkout_shape283'AND convalidated AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='a99907470fc8346c25131250ee947c38fb23ac5d2f848d0d159302b4f67dbd30')THEN RAISE EXCEPTION 'PUBLIC_TEST289_ORDER_SHAPE_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.toshi_credit_ledger'::regclass AND conname='toshi_credit_ledger_check'AND convalidated AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='441c5722d6536aa2dd0175e916eb06fa0530c733bacdd09fe68a2a74f29d7f07')THEN RAISE EXCEPTION 'PUBLIC_TEST289_LEDGER_SHAPE_DRIFT';END IF;
END $guard289$;
CREATE TABLE saas.platform_checkout_public289_predecessors(signature text PRIMARY KEY,definition text NOT NULL,old_hash char(64)NOT NULL,new_hash char(64)NOT NULL,function_oid oid NOT NULL,owner_name text NOT NULL,acl text);
INSERT INTO saas.platform_checkout_public289_predecessors
 SELECT v.identity,pg_get_functiondef(p.oid),v.old_hash,v.new_hash,p.oid,pg_get_userbyid(p.proowner),p.proacl::text
 FROM(VALUES
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','f5aba85e14927d5f96eb8aafa20dee7c9683e7004f8fd9cfee55171f7eafe82d','9a66db7c528966865d5be36f31c7c4b257e86088ce71f879c904260a8862cfcb','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'),
 ('saas.platform_checkout_machine(text,jsonb)','8d2c10e32f7e5d171daa42f358d52810ed7e80e2aa1605cae4b471b4c5bd9b82','a61d3f87e6e848aa6eaa06384810e8df6b9f9e25f226db47f2103b2810805852','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'),
 ('saas.platform_checkout_fulfill281(uuid,uuid,timestamp with time zone)','6fc11ee0ce00e9cab8ab2d01c9eafad4bab7b7373928c45f96611af09dc4da17','856ac9609ac4d3c36bdabebb18958a34ab786c05140b02811aba59e4045e65b2','{celebix_saas_owner=X/celebix_saas_owner}')
 )v(identity,old_hash,new_hash,acl)JOIN pg_proc p ON p.oid=to_regprocedure(v.identity);
CREATE TABLE saas.platform_checkout_public_test_limits289(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ip_digest char(64)NOT NULL CHECK(ip_digest~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL CHECK(isfinite(created_at)));
CREATE INDEX platform_checkout_public_test_ip289 ON saas.platform_checkout_public_test_limits289(ip_digest,created_at);
CREATE INDEX platform_checkout_public_test_time289 ON saas.platform_checkout_public_test_limits289(created_at);
ALTER TABLE saas.platform_checkout_orders ADD COLUMN public_test_purchase boolean NOT NULL DEFAULT false;
ALTER TABLE saas.platform_checkout_orders ALTER COLUMN principal_id DROP NOT NULL;
ALTER TABLE saas.platform_checkout_orders ALTER COLUMN membership_id DROP NOT NULL;
ALTER TABLE saas.platform_checkout_orders ADD CONSTRAINT platform_checkout_public_actor289 CHECK(
 (NOT public_test_purchase AND principal_id IS NOT NULL AND membership_id IS NOT NULL)
 OR(public_test_purchase AND principal_id IS NULL AND membership_id IS NULL AND kind='toshi_credit'AND offer_id='toshi-test-1'AND term='once'AND plan_id IS NULL AND tool_purchase_id IS NULL AND cardinality(tool_keys)=0 AND net_cents=83 AND vat_bps=2000 AND vat_cents=17 AND total_cents=100 AND currency='TRY'));
ALTER TABLE saas.platform_checkout_intents ALTER COLUMN principal_id DROP NOT NULL;
CREATE FUNCTION saas.platform_checkout_public_intent_guard289()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $intent289$
DECLARE o saas.platform_checkout_orders;BEGIN
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=NEW.order_id AND store_id=NEW.store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUBLIC_TEST289_INTENT_ORDER_INVALID';END IF;
 IF o.public_test_purchase THEN
  IF NEW.principal_id IS NOT NULL OR NEW.redeemed_at IS DISTINCT FROM NEW.created_at OR NEW.session_digest IS NULL
   OR saas.catalog_onboarding_json_exact(NEW.intent,ARRAY['kind','offerId','term','publicTest','storeSelector'],ARRAY[]::text[])IS DISTINCT FROM true
   OR NEW.intent->>'kind'IS DISTINCT FROM 'toshi_credit'OR NEW.intent->>'offerId'IS DISTINCT FROM 'toshi-test-1'OR NEW.intent->>'term'IS DISTINCT FROM 'once'OR NEW.intent->'publicTest'IS DISTINCT FROM 'true'::jsonb
  THEN RAISE EXCEPTION 'PUBLIC_TEST289_INTENT_ACTOR_INVALID';END IF;
 ELSIF NEW.principal_id IS NULL THEN RAISE EXCEPTION 'PUBLIC_TEST289_MERCHANT_ACTOR_REQUIRED';END IF;
 RETURN NEW;
END $intent289$;
CREATE TRIGGER platform_checkout_public_intent_guard289 BEFORE INSERT OR UPDATE ON saas.platform_checkout_intents FOR EACH ROW EXECUTE FUNCTION saas.platform_checkout_public_intent_guard289();
-- Exact reviewed replacement preserves the existing identity and ACL.
CREATE OR REPLACE FUNCTION saas.platform_checkout_create(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_operation uuid, p_intent jsonb, p_handoff_digest text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());e text;prior saas.platform_checkout_intents;o saas.platform_checkout_orders;sub saas.subscriptions;credits bigint;net bigint;BEGIN
 IF p_intent->>'kind'IS DISTINCT FROM 'toshi_credit'THEN RETURN QUERY SELECT *FROM saas.platform_checkout_create283_baseline(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,p_operation,p_intent,p_handoff_digest);RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_operation IS NULL OR p_handoff_digest IS NULL OR p_handoff_digest!~'^[a-f0-9]{64}$'OR saas.catalog_onboarding_json_exact(p_intent,ARRAY['kind','offerId','term'],ARRAY[]::text[])IS DISTINCT FROM true OR p_intent->>'term'<>'once'OR jsonb_typeof(p_intent->'offerId')<>'string'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT v.c,v.n INTO credits,net FROM(VALUES('toshi-500',500::bigint,24900::bigint),('toshi-2500',2500,99900),('toshi-10000',10000,299900),('toshi-50000',50000,1249900),('toshi-test-1',1,83))v(id,c,n)WHERE id=p_intent->>'offerId';
 IF credits IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active'AND support_session_id IS NULL AND role IN('store_owner','admin'))THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.operation281:'||p_operation,0));
 SELECT *INTO prior FROM saas.platform_checkout_intents WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id<>p_store OR prior.principal_id<>p_principal OR prior.intent<>p_intent OR prior.handoff_digest<>p_handoff_digest THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||prior.order_id,0));SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=prior.order_id FOR UPDATE;
  IF o.expires_at<=moment AND o.status IN('pending','processing','failed','expired')AND NOT EXISTS(SELECT 1 FROM saas.platform_checkout_attempts WHERE order_id=o.id AND status<>'failed')THEN RETURN QUERY SELECT 'checkout_expired',NULL::jsonb;RETURN;END IF;
  IF prior.redeemed_at IS NULL AND o.expires_at>moment AND prior.expires_at<=moment THEN UPDATE saas.platform_checkout_intents SET expires_at=least(moment+interval '5 minutes',o.expires_at)WHERE operation_id=p_operation;END IF;
  RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_projection281(prior.order_id);RETURN;
 END IF;
 INSERT INTO saas.platform_store_versions(store_id)VALUES(p_store)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.platform_store_versions WHERE store_id=p_store FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||p_store,263));PERFORM saas.platform_checkout_expire282(p_store,p_principal,moment);
 SELECT *INTO sub FROM saas.subscriptions WHERE store_id=p_store AND status='active'AND valid_from<=moment AND(valid_until IS NULL OR valid_until>moment);
 IF NOT FOUND OR sub.plan_id<>p_plan THEN RETURN QUERY SELECT 'subscription_denied',NULL::jsonb;RETURN;END IF;
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE store_id=p_store AND NOT public_test_purchase AND kind='toshi_credit'AND offer_id=p_intent->>'offerId'AND status IN('pending','processing','failed')ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
 IF FOUND AND o.principal_id<>p_principal THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
 IF o.id IS NOT NULL AND o.expires_at<=moment THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
 IF o.id IS NULL THEN
  INSERT INTO saas.platform_checkout_orders(id,store_id,principal_id,membership_id,kind,offer_id,offer_name,term,plan_id,tool_purchase_id,tool_keys,baseline_subscription_id,baseline_subscription_digest,net_cents,vat_bps,vat_cents,total_cents,currency,status,created_at,expires_at,updated_at)
  VALUES(gen_random_uuid(),p_store,p_principal,p_member,'toshi_credit',p_intent->>'offerId','Toshi '||credits||' Kredi','once',NULL,NULL,'{}',sub.id,encode(sha256(convert_to(to_jsonb(sub)::text,'UTF8')),'hex'),net,2000,round(net::numeric/5),net+round(net::numeric/5),'TRY','pending',moment,moment+interval '24 hours',moment)RETURNING *INTO o;
 END IF;
 INSERT INTO saas.platform_checkout_intents(operation_id,order_id,store_id,principal_id,intent,handoff_digest,created_at,expires_at)VALUES(p_operation,o.id,p_store,p_principal,p_intent,p_handoff_digest,moment,least(moment+interval '5 minutes',o.expires_at));
 INSERT INTO saas.platform_checkout_audit(order_id,actor_kind,principal_id,action,payload,created_at)VALUES(o.id,'buyer',p_principal,'created',jsonb_build_object('operationId',p_operation,'intent',p_intent),moment);
 RETURN QUERY SELECT 'created',saas.platform_checkout_projection281(o.id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR foreign_key_violation OR unique_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $function$
;
-- Exact reviewed replacement preserves the existing identity and ACL.
CREATE OR REPLACE FUNCTION saas.platform_checkout_machine(p_action text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
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
  IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=o.store_id AND status='active')OR NOT((o.public_test_purchase AND o.kind='toshi_credit'AND o.offer_id='toshi-test-1'AND o.term='once'AND o.principal_id IS NULL AND o.membership_id IS NULL AND o.net_cents=83 AND o.vat_bps=2000 AND o.vat_cents=17 AND o.total_cents=100 AND saas.commercial_plan_has_capability(saas.commercial_current_plan(o.store_id),'ai')IS TRUE)OR(NOT o.public_test_purchase AND EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=o.store_id AND id=o.membership_id AND principal_id=o.principal_id AND status='active'AND support_session_id IS NULL AND(role='store_owner'OR(o.kind IN('tool','toshi_credit')AND role='admin')))))
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
END $function$
;
-- Exact reviewed replacement preserves the existing identity and ACL.
CREATE OR REPLACE FUNCTION saas.platform_checkout_fulfill281(p_order uuid, p_attempt uuid, p_now timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE o saas.platform_checkout_orders;a saas.platform_checkout_attempts;credits bigint;net bigint;reason text;entry uuid;BEGIN
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=p_order;
 IF o.kind IS DISTINCT FROM 'toshi_credit'THEN RETURN saas.platform_checkout_fulfill283_baseline(p_order,p_attempt,p_now);END IF;
 SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=p_attempt AND order_id=p_order AND status='approved';
 IF o.id IS NULL OR a.id IS NULL THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT283_APPROVAL_REQUIRED';END IF;
 IF o.status='fulfilled'AND o.fulfilled_attempt_id=p_attempt THEN RETURN 'fulfilled';END IF;
 SELECT v.c,v.n INTO credits,net FROM(VALUES('toshi-500',500::bigint,24900::bigint),('toshi-2500',2500,99900),('toshi-10000',10000,299900),('toshi-50000',50000,1249900),('toshi-test-1',1,83))v(id,c,n)WHERE id=o.offer_id;
 IF o.status IN('fulfilled','paid_review','expired')THEN reason:='duplicate_or_review_payment';
 ELSIF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=o.store_id AND status='active')THEN reason:='store_inactive';
 ELSIF o.public_test_purchase AND NOT(o.public_test_purchase AND o.kind='toshi_credit'AND o.offer_id='toshi-test-1'AND o.term='once'AND o.principal_id IS NULL AND o.membership_id IS NULL AND o.net_cents=83 AND o.vat_bps=2000 AND o.vat_cents=17 AND o.total_cents=100 AND saas.commercial_plan_has_capability(saas.commercial_current_plan(o.store_id),'ai')IS TRUE)THEN reason:='public_recipient_unavailable';
 ELSIF NOT o.public_test_purchase AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=o.membership_id AND store_id=o.store_id AND principal_id=o.principal_id AND status='active'AND support_session_id IS NULL AND role IN('store_owner','admin'))THEN reason:='purchaser_changed';
 ELSIF credits IS NULL OR o.net_cents<>net OR o.term<>'once'OR o.vat_bps<>2000 OR o.total_cents<>net+round(net::numeric/5)THEN reason:='credit_quote_changed';END IF;
 IF reason IS NULL THEN
  BEGIN
   PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-credit.wallet283:'||o.store_id,0));
   INSERT INTO saas.toshi_credit_wallets(store_id,updated_at)VALUES(o.store_id,p_now)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.toshi_credit_wallets WHERE store_id=o.store_id FOR UPDATE;
   PERFORM saas.toshi_credit_expire283(o.store_id,p_now);
   INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,checkout_order_id,created_at)VALUES(o.store_id,'purchase',o.id,'purchase',credits,0,o.id,p_now)RETURNING id INTO entry;
   UPDATE saas.toshi_credit_wallets SET balance=balance+credits,updated_at=p_now WHERE store_id=o.store_id;
   UPDATE saas.platform_checkout_orders SET status='fulfilled',fulfilled_attempt_id=p_attempt,fulfillment_id=entry,fulfilled_at=p_now,updated_at=p_now WHERE id=o.id;
  EXCEPTION WHEN OTHERS THEN reason:='fulfillment_conflict';END;
 END IF;
 IF reason IS NOT NULL THEN UPDATE saas.platform_checkout_attempts SET status='paid_review',code=reason,updated_at=p_now WHERE id=p_attempt;UPDATE saas.platform_checkout_orders SET status='paid_review',review_code=reason,updated_at=p_now WHERE id=o.id;RETURN 'paid_review';END IF;
 RETURN 'fulfilled';
END $function$
;
CREATE FUNCTION saas.platform_checkout_public_test_create(p_now timestamptz,p_operation uuid,p_selector text,p_session_digest text,p_ip_digest text)
RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $public289$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());prior saas.platform_checkout_intents;o saas.platform_checkout_orders;sub saas.subscriptions;selected uuid;resolved uuid;canonical jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_operation IS NULL OR p_selector IS NULL OR p_selector<>lower(p_selector)OR p_selector<>btrim(p_selector)OR length(p_selector)NOT BETWEEN 1 AND 253
  OR NOT(p_selector~'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'OR p_selector~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
  OR p_session_digest IS NULL OR p_session_digest!~'^[a-f0-9]{64}$'OR p_ip_digest IS NULL OR p_ip_digest!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 canonical:=jsonb_build_object('kind','toshi_credit','offerId','toshi-test-1','term','once','publicTest',true,'storeSelector',p_selector);
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.operation281:'||p_operation,0));
 SELECT *INTO prior FROM saas.platform_checkout_intents WHERE operation_id=p_operation;
 IF FOUND THEN
  SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=prior.order_id;
  IF NOT o.public_test_purchase OR o.principal_id IS NOT NULL OR o.membership_id IS NOT NULL OR prior.principal_id IS NOT NULL OR prior.intent IS DISTINCT FROM canonical OR prior.session_digest IS DISTINCT FROM p_session_digest THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF prior.session_expires_at<=moment OR o.expires_at<=moment THEN RETURN QUERY SELECT 'store_unavailable',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'operation_replayed',saas.platform_checkout_machine_projection281(o.id);RETURN;
 END IF;
 -- One rolling global lock makes both budgets durable and concurrency-safe.
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.public-toshi-test.rate289',0));
 moment:=date_trunc('milliseconds',clock_timestamp());
 IF(SELECT count(*)FROM saas.platform_checkout_public_test_limits289 WHERE created_at>moment-interval '1 hour')>=300
  OR(SELECT count(*)FROM saas.platform_checkout_public_test_limits289 WHERE ip_digest=p_ip_digest AND created_at>moment-interval '15 minutes')>=30 THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb;RETURN;END IF;
 DELETE FROM saas.platform_checkout_public_test_limits289 WHERE created_at<=moment-interval '2 hours';
 INSERT INTO saas.platform_checkout_public_test_limits289(ip_digest,created_at)VALUES(p_ip_digest,moment);
 IF position('.'IN p_selector)>0 THEN
  SELECT d.store_id INTO selected FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id AND s.status='active'WHERE d.hostname=p_selector AND d.status='active'AND d.verified_at<=moment;
 ELSE SELECT id INTO selected FROM saas.stores WHERE slug=p_selector AND status='active';END IF;
 IF selected IS NULL THEN RETURN QUERY SELECT 'store_unavailable',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.platform_store_versions(store_id)VALUES(selected)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.platform_store_versions WHERE store_id=selected FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||selected,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||selected,263));
 moment:=date_trunc('milliseconds',clock_timestamp());
 -- Re-resolve after store locks: a moved/disabled domain cannot change recipient.
 IF position('.'IN p_selector)>0 THEN
  SELECT d.store_id INTO resolved FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id AND s.status='active'WHERE d.hostname=p_selector AND d.status='active'AND d.verified_at<=moment;
 ELSE SELECT id INTO resolved FROM saas.stores WHERE slug=p_selector AND status='active';END IF;
 IF resolved IS DISTINCT FROM selected THEN RETURN QUERY SELECT 'store_unavailable',NULL::jsonb;RETURN;END IF;
 SELECT *INTO sub FROM saas.subscriptions WHERE store_id=selected AND status='active'AND valid_from<=moment AND(valid_until IS NULL OR valid_until>moment)AND plan_id=saas.commercial_current_plan(selected);
 IF NOT FOUND OR saas.commercial_plan_has_capability(sub.plan_id,'ai')IS DISTINCT FROM true THEN RETURN QUERY SELECT 'store_unavailable',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.platform_checkout_orders(id,store_id,principal_id,membership_id,kind,offer_id,offer_name,term,plan_id,tool_purchase_id,tool_keys,baseline_subscription_id,baseline_subscription_digest,net_cents,vat_bps,vat_cents,total_cents,currency,status,created_at,expires_at,updated_at,public_test_purchase)
 VALUES(gen_random_uuid(),selected,NULL,NULL,'toshi_credit','toshi-test-1','Toshi 1 Kredi','once',NULL,NULL,'{}',sub.id,encode(sha256(convert_to(to_jsonb(sub)::text,'UTF8')),'hex'),83,2000,17,100,'TRY','pending',moment,moment+interval '24 hours',moment,true)RETURNING *INTO o;
 INSERT INTO saas.platform_checkout_intents(operation_id,order_id,store_id,principal_id,intent,handoff_digest,created_at,expires_at,redeemed_at,session_digest,session_expires_at)
 VALUES(p_operation,o.id,selected,NULL,canonical,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),moment,o.expires_at,moment,p_session_digest,moment+interval '24 hours');
 INSERT INTO saas.platform_checkout_audit(order_id,actor_kind,action,payload,created_at)VALUES(o.id,'machine','public_test.created',jsonb_build_object('operationId',p_operation,'origin','public_test','offerId','toshi-test-1'),moment);
 RETURN QUERY SELECT 'created',saas.platform_checkout_machine_projection281(o.id);
END $public289$;
DO $private289$DECLARE t text;r record;f text;BEGIN
 FOREACH t IN ARRAY ARRAY['platform_checkout_public289_predecessors','platform_checkout_public_test_limits289']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY platform_checkout_public289_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['saas.platform_checkout_public_test_create(timestamptz,uuid,text,text,text)','saas.platform_checkout_public_intent_guard289()']LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname);END LOOP;
 END LOOP;
END $private289$;
GRANT EXECUTE ON FUNCTION saas.platform_checkout_public_test_create(timestamptz,uuid,text,text,text)TO celebix_saas_platform_operator;
COMMIT;
