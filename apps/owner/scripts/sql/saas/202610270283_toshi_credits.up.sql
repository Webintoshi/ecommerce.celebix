-- Central store credits. Provider calls happen outside these short transactions.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-credits.release283',0));
DO $guard$BEGIN
 IF to_regclass('saas.platform_checkout282_predecessors')IS NULL OR to_regclass('saas.toshi_credit_wallets')IS NOT NULL THEN RAISE EXCEPTION 'TOSHI_CREDITS283_PREDECESSOR_INVALID';END IF;
END $guard$;
CREATE TABLE saas.toshi_credit283_predecessors(signature text PRIMARY KEY,definition text NOT NULL,definition_sha256 char(64)NOT NULL,owner_name text NOT NULL,acl text,config text[],security_definer boolean NOT NULL,volatility char NOT NULL);
INSERT INTO saas.toshi_credit283_predecessors SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef,p.provolatile FROM pg_proc p WHERE p.oid IN('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)'::regprocedure,'saas.platform_checkout_fulfill281(uuid,uuid,timestamp with time zone)'::regprocedure,'saas.platform_checkout_machine(text,jsonb)'::regprocedure);
CREATE TABLE saas.toshi_credit_wallets(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),balance bigint NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 9007199254740991),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved BETWEEN 0 AND balance),updated_at timestamptz NOT NULL
);
CREATE TABLE saas.toshi_credit_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.toshi_credit_wallets(store_id),principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,
 fingerprint char(64)NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),cost bigint NOT NULL CHECK(cost BETWEEN 1 AND 1000),
 status text NOT NULL CHECK(status IN('reserved','completed','failed','unknown')),result jsonb,charged_credits bigint NOT NULL DEFAULT 0 CHECK(charged_credits BETWEEN 0 AND cost),safe_code text,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,finished_at timestamptz,
 FOREIGN KEY(store_id,membership_id)REFERENCES saas.memberships(store_id,id),UNIQUE(store_id,operation_id),
 CHECK(expires_at=created_at+interval '15 minutes'),CHECK(result IS NULL OR octet_length(result::text)<=262144),
 CHECK((status='reserved'AND result IS NULL AND charged_credits=0 AND finished_at IS NULL AND safe_code IS NULL)
 OR(status='completed'AND result IS NOT NULL AND result<>'null'::jsonb AND charged_credits>0 AND finished_at IS NOT NULL AND safe_code IS NULL)
 OR(status IN('failed','unknown')AND result IS NULL AND charged_credits=0 AND finished_at IS NOT NULL AND safe_code~'^[a-z][a-z0-9_]{0,63}$'))
);
CREATE INDEX toshi_credit_expiry283 ON saas.toshi_credit_operations(store_id,expires_at)WHERE status='reserved';
CREATE TABLE saas.toshi_credit_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.toshi_credit_wallets(store_id),
 source_kind text NOT NULL CHECK(source_kind IN('operation','grant','purchase')),source_id uuid NOT NULL,event text NOT NULL CHECK(event IN('reserve','complete','release','grant','purchase')),
 balance_delta bigint NOT NULL,reserved_delta bigint NOT NULL,operator_id uuid REFERENCES saas.platform_operators(id),reason text,checkout_order_id uuid,
 created_at timestamptz NOT NULL,UNIQUE(source_kind,source_id,event),
 FOREIGN KEY(store_id,checkout_order_id)REFERENCES saas.platform_checkout_orders(store_id,id),
 CHECK((source_kind='operation'AND event='reserve'AND balance_delta=0 AND reserved_delta BETWEEN 1 AND 1000 AND operator_id IS NULL AND reason IS NULL AND checkout_order_id IS NULL)
 OR(source_kind='operation'AND event='complete'AND balance_delta BETWEEN -1000 AND -1 AND reserved_delta BETWEEN -1000 AND -1 AND balance_delta>=reserved_delta AND operator_id IS NULL AND reason IS NULL AND checkout_order_id IS NULL)
 OR(source_kind='operation'AND event='release'AND balance_delta=0 AND reserved_delta BETWEEN -1000 AND -1 AND operator_id IS NULL AND reason~'^[a-z][a-z0-9_]{0,63}$'AND checkout_order_id IS NULL)
 OR(source_kind='grant'AND event='grant'AND balance_delta BETWEEN 1 AND 1000000000 AND reserved_delta=0 AND operator_id IS NOT NULL AND length(reason)BETWEEN 1 AND 1000 AND reason=btrim(reason)AND reason!~'[[:cntrl:]]'AND checkout_order_id IS NULL)
 OR(source_kind='purchase'AND event='purchase'AND balance_delta IN(500,2500,10000,50000)AND reserved_delta=0 AND operator_id IS NULL AND reason IS NULL AND checkout_order_id=source_id))
);
CREATE TRIGGER toshi_credit_ledger_immutable283 BEFORE UPDATE OR DELETE ON saas.toshi_credit_ledger FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
DO $private$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['toshi_credit283_predecessors','toshi_credit_wallets','toshi_credit_operations','toshi_credit_ledger']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY toshi_credit283_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
CREATE FUNCTION saas.toshi_credit_wallet283(p_store uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('balance',balance,'reserved',reserved,'available',balance-reserved)FROM saas.toshi_credit_wallets WHERE store_id=p_store
$f$;
CREATE FUNCTION saas.toshi_credit_expire283(p_store uuid,p_now timestamptz)RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE op saas.toshi_credit_operations;BEGIN
 -- Caller owns the wallet lock. Expiry is terminal and releases the whole hold.
 FOR op IN SELECT *FROM saas.toshi_credit_operations WHERE store_id=p_store AND status='reserved'AND expires_at<=p_now ORDER BY operation_id FOR UPDATE LOOP
  UPDATE saas.toshi_credit_operations SET status='unknown',safe_code='reservation_expired',finished_at=p_now WHERE operation_id=op.operation_id;
  UPDATE saas.toshi_credit_wallets SET reserved=reserved-op.cost,updated_at=p_now WHERE store_id=p_store;
  INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,reason,created_at)VALUES(p_store,'operation',op.operation_id,'release',0,-op.cost,'reservation_expired',p_now);
 END LOOP;
END $f$;
CREATE FUNCTION saas.toshi_credit_command(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_action text,p_args jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());e text;op saas.toshi_credit_operations;selected uuid;cost bigint;charged bigint;terminal text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_action IS NULL OR p_action NOT IN('wallet','reserve','complete','fail')OR p_args IS NULL OR jsonb_typeof(p_args)<>'object'OR octet_length(p_args::text)>264000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.manage');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_action='wallet'THEN
  IF p_args<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSE
  IF saas.catalog_onboarding_json_exact(p_args,CASE p_action WHEN 'reserve'THEN ARRAY['operationId','fingerprint','cost']WHEN 'complete'THEN ARRAY['operationId','fingerprint','result','chargedCredits']ELSE ARRAY['operationId','fingerprint','safeCode','unknown']END,ARRAY[]::text[])IS DISTINCT FROM true
   OR saas.store_engagement_uuid_valid(p_args->'operationId')IS DISTINCT FROM true OR jsonb_typeof(p_args->'fingerprint')<>'string'OR p_args->>'fingerprint'!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  selected:=(p_args->>'operationId')::uuid;
  IF p_action='reserve'THEN
   IF jsonb_typeof(p_args->'cost')<>'number'OR p_args->>'cost'!~'^[1-9][0-9]{0,3}$'OR(p_args->>'cost')::bigint>1000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;cost:=(p_args->>'cost')::bigint;
  ELSIF p_action='complete'THEN
   IF p_args->'result'='null'::jsonb OR octet_length((p_args->'result')::text)>262144 OR jsonb_typeof(p_args->'chargedCredits')<>'number'OR p_args->>'chargedCredits'!~'^[1-9][0-9]{0,3}$'OR(p_args->>'chargedCredits')::bigint>1000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;charged:=(p_args->>'chargedCredits')::bigint;
  ELSE
   IF jsonb_typeof(p_args->'safeCode')<>'string'OR p_args->>'safeCode'!~'^[a-z][a-z0-9_]{0,63}$'OR jsonb_typeof(p_args->'unknown')<>'boolean'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-credit.operation283:'||selected,0));
  SELECT *INTO op FROM saas.toshi_credit_operations WHERE operation_id=selected;
  IF FOUND AND(op.store_id<>p_store OR op.principal_id<>p_principal OR op.fingerprint<>p_args->>'fingerprint'OR(p_action='reserve'AND op.cost<>cost))THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-credit.wallet283:'||p_store,0));
 INSERT INTO saas.toshi_credit_wallets(store_id,updated_at)VALUES(p_store,moment)ON CONFLICT DO NOTHING;
 PERFORM 1 FROM saas.toshi_credit_wallets WHERE store_id=p_store FOR UPDATE;
 PERFORM saas.toshi_credit_expire283(p_store,moment);
 IF p_action='wallet'THEN RETURN QUERY SELECT 'wallet',saas.toshi_credit_wallet283(p_store);RETURN;END IF;
 SELECT *INTO op FROM saas.toshi_credit_operations WHERE operation_id=selected FOR UPDATE;
 IF p_action='reserve'THEN
  IF FOUND THEN
   terminal:=CASE WHEN op.status='reserved'THEN 'pending'ELSE 'replayed'END;
   RETURN QUERY SELECT terminal,jsonb_build_object('kind',terminal,'status',op.status,'result',op.result,'chargedCredits',op.charged_credits);RETURN;
  END IF;
  IF(SELECT balance-reserved FROM saas.toshi_credit_wallets WHERE store_id=p_store)<cost THEN RETURN QUERY SELECT 'insufficient_credits',NULL::jsonb;RETURN;END IF;
  UPDATE saas.toshi_credit_wallets SET reserved=reserved+cost,updated_at=moment WHERE store_id=p_store;
  INSERT INTO saas.toshi_credit_operations(operation_id,store_id,principal_id,membership_id,fingerprint,cost,status,created_at,expires_at)VALUES(selected,p_store,p_principal,p_member,p_args->>'fingerprint',cost,'reserved',moment,moment+interval '15 minutes');
  INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,created_at)VALUES(p_store,'operation',selected,'reserve',0,cost,moment);
  RETURN QUERY SELECT 'created',jsonb_build_object('kind','created','status','reserved','result',NULL,'chargedCredits',0);RETURN;
 END IF;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 IF p_action='complete'THEN
  IF op.status='completed'THEN
   IF op.result IS DISTINCT FROM p_args->'result'OR op.charged_credits<>charged THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  ELSIF op.status<>'reserved'THEN RETURN QUERY SELECT 'operation_failed',NULL::jsonb;RETURN;
  ELSIF charged>op.cost THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;
  ELSE
   UPDATE saas.toshi_credit_wallets SET balance=balance-charged,reserved=reserved-op.cost,updated_at=moment WHERE store_id=p_store;
   UPDATE saas.toshi_credit_operations SET status='completed',result=p_args->'result',charged_credits=charged,finished_at=moment WHERE operation_id=selected;
   INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,created_at)VALUES(p_store,'operation',selected,'complete',-charged,-op.cost,moment);
  END IF;
  RETURN QUERY SELECT 'completed',saas.toshi_credit_wallet283(p_store);RETURN;
 END IF;
 IF op.status='reserved'THEN
  terminal:=CASE WHEN(p_args->>'unknown')::boolean THEN 'unknown'ELSE 'failed'END;
  UPDATE saas.toshi_credit_wallets SET reserved=reserved-op.cost,updated_at=moment WHERE store_id=p_store;
  UPDATE saas.toshi_credit_operations SET status=terminal,safe_code=p_args->>'safeCode',finished_at=moment WHERE operation_id=selected;
  INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,reason,created_at)VALUES(p_store,'operation',selected,'release',0,-op.cost,p_args->>'safeCode',moment);
 END IF;
 RETURN QUERY SELECT CASE WHEN op.status='completed'THEN 'completed'ELSE 'failed'END,saas.toshi_credit_wallet283(p_store);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR foreign_key_violation OR unique_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.platform_toshi_credit_grant(p_operator uuid,p_store uuid,p_operation uuid,p_credits bigint,p_reason text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());prior saas.toshi_credit_ledger;BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_store IS NULL OR p_operation IS NULL OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 1000000000 OR p_reason IS NULL OR length(p_reason)NOT BETWEEN 1 AND 1000 OR p_reason<>btrim(p_reason)OR p_reason~'[[:cntrl:]]'THEN RAISE EXCEPTION 'invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-credit.grant283:'||p_operation,0));
 SELECT *INTO prior FROM saas.toshi_credit_ledger WHERE source_kind='grant'AND source_id=p_operation AND event='grant';
 IF FOUND THEN
  IF prior.store_id<>p_store OR prior.operator_id<>p_operator OR prior.balance_delta<>p_credits OR prior.reason<>p_reason THEN RAISE EXCEPTION 'operation_mismatch';END IF;
  RETURN saas.toshi_credit_wallet283(p_store);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active')THEN RAISE EXCEPTION 'store_inactive';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.toshi-credit.wallet283:'||p_store,0));
 INSERT INTO saas.toshi_credit_wallets(store_id,updated_at)VALUES(p_store,moment)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.toshi_credit_wallets WHERE store_id=p_store FOR UPDATE;
 PERFORM saas.toshi_credit_expire283(p_store,moment);
 UPDATE saas.toshi_credit_wallets SET balance=balance+p_credits,updated_at=moment WHERE store_id=p_store;
 INSERT INTO saas.toshi_credit_ledger(store_id,source_kind,source_id,event,balance_delta,reserved_delta,operator_id,reason,created_at)VALUES(p_store,'grant',p_operation,'grant',p_credits,0,p_operator,p_reason,moment);
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload,created_at)VALUES(p_operator,p_store,'toshi.credit.grant',jsonb_build_object('operationId',p_operation,'credits',p_credits,'reason',p_reason),moment);
 RETURN saas.toshi_credit_wallet283(p_store);
END $f$;
-- Preserve old package/tool implementation verbatim behind the new dispatcher.
ALTER FUNCTION saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)RENAME TO platform_checkout_create283_baseline;
ALTER FUNCTION saas.platform_checkout_fulfill281(uuid,uuid,timestamptz)RENAME TO platform_checkout_fulfill283_baseline;
DO $constraints$DECLARE k record;BEGIN
 FOR k IN SELECT conname FROM pg_constraint WHERE conrelid='saas.platform_checkout_orders'::regclass AND contype='c'AND pg_get_constraintdef(oid)LIKE '%kind%'LOOP EXECUTE format('ALTER TABLE saas.platform_checkout_orders DROP CONSTRAINT %I',k.conname);END LOOP;
END $constraints$;
ALTER TABLE saas.platform_checkout_orders ADD CONSTRAINT platform_checkout_kind283 CHECK(kind IN('package','tool','toshi_credit'));
ALTER TABLE saas.platform_checkout_orders ADD CONSTRAINT platform_checkout_shape283 CHECK((kind='package'AND term IN('monthly','annual')AND plan_id IS NOT NULL AND tool_purchase_id IS NULL AND cardinality(tool_keys)=0)OR(kind='tool'AND term='once'AND plan_id IS NULL AND tool_purchase_id IS NOT NULL AND cardinality(tool_keys)BETWEEN 1 AND 5)OR(kind='toshi_credit'AND term='once'AND plan_id IS NULL AND tool_purchase_id IS NULL AND cardinality(tool_keys)=0 AND offer_id IN('toshi-500','toshi-2500','toshi-10000','toshi-50000')));
CREATE FUNCTION saas.platform_checkout_create(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_intent jsonb,p_handoff_digest text)
RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=date_trunc('milliseconds',clock_timestamp());e text;prior saas.platform_checkout_intents;o saas.platform_checkout_orders;sub saas.subscriptions;credits bigint;net bigint;BEGIN
 IF p_intent->>'kind'IS DISTINCT FROM 'toshi_credit'THEN RETURN QUERY SELECT *FROM saas.platform_checkout_create283_baseline(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,p_operation,p_intent,p_handoff_digest);RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now)OR abs(extract(epoch FROM(moment-p_now)))>60 OR p_operation IS NULL OR p_handoff_digest IS NULL OR p_handoff_digest!~'^[a-f0-9]{64}$'OR saas.catalog_onboarding_json_exact(p_intent,ARRAY['kind','offerId','term'],ARRAY[]::text[])IS DISTINCT FROM true OR p_intent->>'term'<>'once'OR jsonb_typeof(p_intent->'offerId')<>'string'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT v.c,v.n INTO credits,net FROM(VALUES('toshi-500',500::bigint,24900::bigint),('toshi-2500',2500,99900),('toshi-10000',10000,299900),('toshi-50000',50000,1249900))v(id,c,n)WHERE id=p_intent->>'offerId';
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
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE store_id=p_store AND kind='toshi_credit'AND offer_id=p_intent->>'offerId'AND status IN('pending','processing','failed')ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE;
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
END $f$;
CREATE FUNCTION saas.platform_checkout_fulfill281(p_order uuid,p_attempt uuid,p_now timestamptz)RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.platform_checkout_orders;a saas.platform_checkout_attempts;credits bigint;net bigint;reason text;entry uuid;BEGIN
 SELECT *INTO o FROM saas.platform_checkout_orders WHERE id=p_order;
 IF o.kind IS DISTINCT FROM 'toshi_credit'THEN RETURN saas.platform_checkout_fulfill283_baseline(p_order,p_attempt,p_now);END IF;
 SELECT *INTO a FROM saas.platform_checkout_attempts WHERE id=p_attempt AND order_id=p_order AND status='approved';
 IF o.id IS NULL OR a.id IS NULL THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT283_APPROVAL_REQUIRED';END IF;
 IF o.status='fulfilled'AND o.fulfilled_attempt_id=p_attempt THEN RETURN 'fulfilled';END IF;
 SELECT v.c,v.n INTO credits,net FROM(VALUES('toshi-500',500::bigint,24900::bigint),('toshi-2500',2500,99900),('toshi-10000',10000,299900),('toshi-50000',50000,1249900))v(id,c,n)WHERE id=o.offer_id;
 IF o.status IN('fulfilled','paid_review','expired')THEN reason:='duplicate_or_review_payment';
 ELSIF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=o.store_id AND status='active')THEN reason:='store_inactive';
 ELSIF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=o.membership_id AND store_id=o.store_id AND principal_id=o.principal_id AND status='active'AND support_session_id IS NULL AND role IN('store_owner','admin'))THEN reason:='purchaser_changed';
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
END $f$;
-- Counted replacement also invalidates cached machine calls to the old helper.
DO $machine$DECLARE source text;needle text:='(o.kind=''tool''AND role=''admin'')';replacement text:='(o.kind IN(''tool'',''toshi_credit'')AND role=''admin'')';BEGIN
 source:=pg_get_functiondef('saas.platform_checkout_machine(text,jsonb)'::regprocedure);
 IF length(source)-length(replace(source,needle,''))<>length(needle)THEN RAISE EXCEPTION 'TOSHI_CREDITS283_MACHINE_PATCH_DRIFT';END IF;
 EXECUTE replace(source,needle,replacement);
END $machine$;
DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'toshi_credit_%283'OR proname IN('toshi_credit_command','platform_toshi_credit_grant','platform_checkout_create283_baseline','platform_checkout_fulfill283_baseline','platform_checkout_create','platform_checkout_fulfill281'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.identity);FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.identity,r.rolname);END LOOP;
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION saas.toshi_credit_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.platform_toshi_credit_grant(uuid,uuid,uuid,bigint,text)TO celebix_saas_platform_operator;
COMMIT;
