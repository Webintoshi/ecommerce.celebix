BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE IF NOT EXISTS saas.loyalty_migration_baseline(identity text PRIMARY KEY,definition text NOT NULL,patched_hash text NOT NULL);

CREATE OR REPLACE FUNCTION saas.loyalty_config_valid_v1(p jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE r jsonb;k text;v jsonb;
BEGIN
 IF saas.catalog_onboarding_json_exact(p,ARRAY['schemaVersion','template','target','eligibleProductIds','reward','minimumBasketMinor','rewardMinimumBasketMinor','channels','startsAt','endsAt','timezone','repeat','maxOncePerDay','allowMultiplePrograms','allowCombination','progressExpiryDays','rewardExpiryDays'],ARRAY[]::text[]) IS DISTINCT FROM true
 OR p->'schemaVersion'<>'1'::jsonb OR jsonb_typeof(p->'template')<>'string' OR p->>'template' NOT IN('product_gift','purchase_gift','spend_discount','purchase_shipping')
 OR saas.promotion_json_integer(p->'target',1,CASE WHEN p->>'template'='spend_discount'THEN 8000000000 ELSE 1000000 END) IS DISTINCT FROM true
 OR saas.promotion_json_integer(p->'minimumBasketMinor',0,8000000000) IS DISTINCT FROM true
 OR saas.promotion_json_integer(p->'rewardMinimumBasketMinor',0,8000000000) IS DISTINCT FROM true
 OR jsonb_typeof(p->'eligibleProductIds')<>'array' OR jsonb_array_length(p->'eligibleProductIds')>100 OR NOT saas.promotion_json_array_unique(p->'eligibleProductIds')
 OR jsonb_typeof(p->'channels')<>'array' OR jsonb_array_length(p->'channels') NOT BETWEEN 1 AND 3 OR NOT saas.promotion_json_array_unique(p->'channels')
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p->>'timezone') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['repeat','maxOncePerDay','allowMultiplePrograms','allowCombination'] LOOP IF jsonb_typeof(p->k)<>'boolean' THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['progressExpiryDays','rewardExpiryDays'] LOOP IF p->k<>'null'::jsonb AND saas.promotion_json_integer(p->k,1,3650) IS DISTINCT FROM true THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['startsAt','endsAt'] LOOP IF p->k<>'null'::jsonb AND (jsonb_typeof(p->k)<>'string' OR p->>k!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' OR NOT isfinite((p->>k)::timestamptz)) THEN RETURN false;END IF;END LOOP;
 IF p->>'startsAt' IS NOT NULL AND p->>'endsAt' IS NOT NULL AND (p->>'endsAt')::timestamptz<=(p->>'startsAt')::timestamptz THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p->'eligibleProductIds') LOOP IF NOT saas.promotion_json_uuid(v) THEN RETURN false;END IF;END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(p->'channels') LOOP IF jsonb_typeof(v)<>'string'OR v#>>'{}' NOT IN('storefront','in_store','manual') THEN RETURN false;END IF;END LOOP;
 r:=p->'reward';
 IF p->>'template' IN('product_gift','purchase_gift') THEN
  RETURN(saas.catalog_onboarding_json_exact(r,ARRAY['kind','variantId','quantity'],ARRAY[]::text[]) AND r->>'kind'='gift' AND saas.promotion_json_uuid(r->'variantId') AND saas.promotion_json_integer(r->'quantity',1,20))IS TRUE;
 ELSIF p->>'template'='spend_discount' THEN
  RETURN(saas.catalog_onboarding_json_exact(r,ARRAY['kind','amountMinor'],ARRAY[]::text[]) AND r->>'kind'='discount' AND saas.promotion_json_integer(r->'amountMinor',1,8000000000))IS TRUE;
 ELSE
  IF saas.catalog_onboarding_json_exact(r,ARRAY['kind','shippingMethodIds'],ARRAY[]::text[]) IS DISTINCT FROM true OR r->>'kind'IS DISTINCT FROM 'shipping' OR jsonb_typeof(r->'shippingMethodIds')<>'array' OR jsonb_array_length(r->'shippingMethodIds')>100 OR NOT saas.promotion_json_array_unique(r->'shippingMethodIds') THEN RETURN false;END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(r->'shippingMethodIds') LOOP IF NOT saas.promotion_json_uuid(v) THEN RETURN false;END IF;END LOOP;RETURN true;
 END IF;
EXCEPTION WHEN OTHERS THEN RETURN false;END $f$;

CREATE TABLE IF NOT EXISTS saas.loyalty_programs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.stores(id),name text NOT NULL CHECK(name=btrim(name) AND length(name) BETWEEN 1 AND 120 AND name!~'[[:cntrl:]]'),enabled boolean NOT NULL,version bigint NOT NULL CHECK(version>0),config jsonb NOT NULL CHECK(saas.loyalty_config_valid_v1(config)),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(store_id,id));
CREATE INDEX IF NOT EXISTS loyalty_program_list ON saas.loyalty_programs(store_id,created_at,id);
CREATE TABLE IF NOT EXISTS saas.loyalty_program_versions(
 store_id uuid NOT NULL,program_id uuid NOT NULL,version bigint NOT NULL,config jsonb NOT NULL,promotion_id uuid,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,program_id,version),FOREIGN KEY(store_id,program_id)REFERENCES saas.loyalty_programs(store_id,id),FOREIGN KEY(store_id,promotion_id)REFERENCES saas.promotions(store_id,id));
CREATE TABLE IF NOT EXISTS saas.loyalty_members(
 store_id uuid NOT NULL,program_id uuid NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,balance bigint NOT NULL DEFAULT 0,progress bigint NOT NULL DEFAULT 0 CHECK(progress>=0),earned bigint NOT NULL DEFAULT 0 CHECK(earned>=0),last_activity_at timestamptz NOT NULL,expires_at timestamptz,rule_version bigint NOT NULL DEFAULT 1,pending_issuance boolean NOT NULL DEFAULT false,reconciled_at timestamptz,PRIMARY KEY(store_id,program_id,account_id),FOREIGN KEY(store_id,program_id)REFERENCES saas.loyalty_programs(store_id,id),FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id),FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id));
CREATE INDEX IF NOT EXISTS loyalty_member_customer ON saas.loyalty_members(store_id,customer_id,program_id);
CREATE INDEX IF NOT EXISTS loyalty_member_pending ON saas.loyalty_members(reconciled_at,store_id,program_id,account_id)WHERE pending_issuance;
CREATE TABLE IF NOT EXISTS saas.loyalty_effects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,program_id uuid NOT NULL,program_version bigint NOT NULL,account_id uuid NOT NULL,operation_id uuid NOT NULL,delta bigint NOT NULL,reason text NOT NULL,metadata jsonb NOT NULL,created_at timestamptz NOT NULL,UNIQUE(store_id,program_id,account_id,operation_id),FOREIGN KEY(store_id,program_id,program_version)REFERENCES saas.loyalty_program_versions(store_id,program_id,version));
CREATE INDEX IF NOT EXISTS loyalty_effects_member ON saas.loyalty_effects(store_id,program_id,account_id,created_at,id);
CREATE TABLE IF NOT EXISTS saas.loyalty_rewards(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,program_id uuid NOT NULL,program_version bigint NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,sequence bigint NOT NULL,target_cost bigint NOT NULL CHECK(target_cost>0),reward jsonb NOT NULL,code_id uuid,code text,status text NOT NULL CHECK(status IN('available','reserved','used','revoked','expired')),earned_at timestamptz NOT NULL,expires_at timestamptz,used_at timestamptz,order_id uuid,cost_minor bigint CHECK(cost_minor>=0),UNIQUE(store_id,id),UNIQUE(store_id,code_id),UNIQUE(store_id,program_id,account_id,sequence),FOREIGN KEY(store_id,program_id,program_version)REFERENCES saas.loyalty_program_versions(store_id,program_id,version),FOREIGN KEY(store_id,code_id)REFERENCES saas.promotion_codes(store_id,id));
CREATE INDEX IF NOT EXISTS loyalty_rewards_member ON saas.loyalty_rewards(store_id,account_id,status,earned_at,id);
CREATE INDEX IF NOT EXISTS loyalty_rewards_program ON saas.loyalty_rewards(store_id,program_id,status,earned_at,id);
CREATE TABLE IF NOT EXISTS saas.loyalty_order_effects(
 store_id uuid NOT NULL,order_id uuid NOT NULL,program_id uuid NOT NULL,program_version bigint NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,amount bigint NOT NULL,paid_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(store_id,order_id,program_id),FOREIGN KEY(store_id,program_id,program_version)REFERENCES saas.loyalty_program_versions(store_id,program_id,version));
CREATE INDEX IF NOT EXISTS loyalty_order_member_day ON saas.loyalty_order_effects(store_id,program_id,account_id,paid_at)WHERE amount>0;
CREATE TABLE IF NOT EXISTS saas.loyalty_order_members(
 store_id uuid NOT NULL,order_id uuid NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,source_kind text NOT NULL CHECK(source_kind IN('account_session','pos_approval')),source_id uuid NOT NULL,verified_at timestamptz NOT NULL,PRIMARY KEY(store_id,order_id),FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id),FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id));
CREATE TABLE IF NOT EXISTS saas.loyalty_order_queue(store_id uuid NOT NULL,order_id uuid NOT NULL,revision bigint NOT NULL DEFAULT 1,queued_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL,last_error text,program_snapshot jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(store_id,order_id));
CREATE INDEX IF NOT EXISTS loyalty_queue_due ON saas.loyalty_order_queue(next_attempt_at,store_id,order_id);
CREATE TABLE IF NOT EXISTS saas.loyalty_operations(store_id uuid NOT NULL,actor_id uuid NOT NULL,operation_id uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,actor_id,operation_id));
CREATE TABLE IF NOT EXISTS saas.loyalty_pos_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,token_digest text NOT NULL UNIQUE,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,sale_id uuid,FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id),UNIQUE(store_id,id));
CREATE INDEX IF NOT EXISTS loyalty_pos_sale ON saas.loyalty_pos_approvals(store_id,sale_id)WHERE consumed_at IS NOT NULL;
DO $t$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['loyalty_migration_baseline','loyalty_programs','loyalty_program_versions','loyalty_members','loyalty_effects','loyalty_rewards','loyalty_order_effects','loyalty_order_members','loyalty_order_queue','loyalty_operations','loyalty_pos_approvals'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=('saas.'||t)::regclass AND polname=t||'_owner')THEN EXECUTE format('CREATE POLICY %I ON saas.%I TO celebix_saas_owner USING(true) WITH CHECK(true)',t||'_owner',t);END IF;
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_migrator,celebix_saas_bootstrap,celebix_saas_observability',t);
END LOOP;END $t$;

CREATE OR REPLACE FUNCTION saas.loyalty_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $f$ BEGIN RAISE EXCEPTION 'LOYALTY_IMMUTABLE';END $f$;
DO $t$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['loyalty_program_versions','loyalty_effects','loyalty_operations','loyalty_order_members']LOOP IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname=t||'_immutable')THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.loyalty_immutable_v1()',t||'_immutable',t);END IF;END LOOP;END $t$;
CREATE OR REPLACE FUNCTION saas.loyalty_iso_v1(t timestamptz) RETURNS text LANGUAGE sql IMMUTABLE AS $f$SELECT to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_program_json_v1(p saas.loyalty_programs,n timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT jsonb_build_object('id',p.id,'name',p.name,'status',CASE WHEN NOT p.enabled THEN 'paused' WHEN(p.config->>'startsAt')::timestamptz>n THEN 'scheduled' ELSE 'active' END,'version',p.version,'config',p.config,'createdAt',saas.loyalty_iso_v1(p.created_at),'updatedAt',saas.loyalty_iso_v1(p.updated_at))$f$;

CREATE OR REPLACE FUNCTION saas.loyalty_reward_held_v1(s uuid,c uuid,n timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations r LEFT JOIN saas.storefront_hosted_checkout_sessions h ON r.source_kind='hosted_checkout' AND h.store_id=r.store_id AND h.id::text=r.source_reference WHERE r.store_id=s AND r.code_id=c AND ((r.status='reserved'AND r.expires_at>n)OR(r.status<>'committed'AND h.id IS NOT NULL AND h.terminal_at IS NULL AND h.status IN('active','provider_ready','processing'))))$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_reward_json_v1(r saas.loyalty_rewards,n timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT jsonb_build_object('id',r.id,'programId',r.program_id,'programName',(SELECT name FROM saas.loyalty_programs WHERE store_id=r.store_id AND id=r.program_id),'reward',r.reward,'status',CASE WHEN r.status IN('used','revoked','expired')THEN r.status WHEN saas.loyalty_reward_held_v1(r.store_id,r.code_id,n)OR r.status='reserved' THEN 'reserved' WHEN r.expires_at<=n THEN 'expired' ELSE 'available' END,'earnedAt',saas.loyalty_iso_v1(r.earned_at),'expiresAt',saas.loyalty_iso_v1(r.expires_at))$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_available_rewards_v1(s uuid,a uuid,n timestamptz)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(saas.loyalty_reward_json_v1(r,n)ORDER BY r.earned_at,r.id),'[]')FROM(
 SELECT * FROM saas.loyalty_rewards WHERE store_id=s AND account_id=a AND status IN('available','reserved')AND(expires_at IS NULL OR expires_at>n OR saas.loyalty_reward_held_v1(s,code_id,n))ORDER BY earned_at,id LIMIT 100
 )r $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_rule_v1(c jsonb,currency_code text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT jsonb_build_object('schemaVersion',1,'benefit',CASE c->'reward'->>'kind' WHEN 'gift' THEN jsonb_build_object('kind','gift','giftVariantId',c->'reward'->>'variantId','quantity',c->'reward'->'quantity','autoAdd',false)WHEN 'discount'THEN jsonb_build_object('kind','fixed_amount','amountMinor',c->'reward'->'amountMinor','currency',currency_code)ELSE jsonb_build_object('kind','free_shipping')END,'targets',jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',jsonb_build_object('mode','everyone'),'trigger',jsonb_build_object('kind','code','codes',jsonb_build_array('LOYALTY-MANAGED')),'schedule',jsonb_build_object('timezone',c->>'timezone'),'limits',jsonb_build_object('totalUsage',NULL,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',jsonb_build_object('minimumBasketMinor',c->'rewardMinimumBasketMinor','minimumQuantity',0,'minimumProductQuantity',0)||CASE WHEN c->'reward'->>'kind'='shipping'AND jsonb_array_length(c->'reward'->'shippingMethodIds')>0 THEN jsonb_build_object('shippingMethodIds',c->'reward'->'shippingMethodIds')ELSE '{}'::jsonb END,'combinationPolicy',CASE WHEN(c->>'allowCombination')::boolean THEN jsonb_build_object('kind','benefit_classes','benefitClasses',jsonb_build_array('percentage','fixed_amount','free_shipping','buy_x_get_y','quantity_tiers','bundle_price','gift'))ELSE jsonb_build_object('kind','none')END,'priority',100,'marginPolicy',jsonb_build_object('kind','warn'),'progressMessagePolicy',jsonb_build_object('enabled',false))$f$;

CREATE OR REPLACE FUNCTION saas.loyalty_apply_effect_v1(s uuid,p uuid,v bigint,a uuid,c uuid,op uuid,d bigint,n timestamptz,why text,meta jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE cfg jsonb;m saas.loyalty_members;r saas.loyalty_rewards;threshold bigint;issued integer:=0;pid uuid;rid uuid;cid uuid;code_value text;grant_version bigint;
BEGIN
 IF d=0 AND why<>'reconcile_rewards'THEN RETURN;END IF;
 SELECT config,promotion_id INTO cfg,pid FROM saas.loyalty_program_versions WHERE store_id=s AND program_id=p AND version=v;IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_VERSION_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-member:'||s||':'||p||':'||a,0));
 IF d<>0 AND EXISTS(SELECT 1 FROM saas.loyalty_effects WHERE store_id=s AND program_id=p AND account_id=a AND operation_id=op)THEN
  IF NOT EXISTS(SELECT 1 FROM saas.loyalty_effects WHERE store_id=s AND program_id=p AND account_id=a AND operation_id=op AND delta=d AND program_version=v AND reason=why AND metadata=meta)THEN RAISE EXCEPTION 'LOYALTY_OPERATION_MISMATCH';END IF;RETURN;
 END IF;
 INSERT INTO saas.loyalty_members(store_id,program_id,account_id,customer_id,last_activity_at)VALUES(s,p,a,c,n)ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM saas.loyalty_members WHERE store_id=s AND program_id=p AND account_id=a FOR UPDATE;
 IF m.customer_id<>c THEN RAISE EXCEPTION 'LOYALTY_MEMBER_INVALID';END IF;
 grant_version:=CASE WHEN why='paid_order'THEN v ELSE greatest(m.rule_version,(SELECT version FROM saas.loyalty_programs WHERE store_id=s AND id=p))END;
 IF grant_version<>v THEN SELECT config,promotion_id INTO cfg,pid FROM saas.loyalty_program_versions WHERE store_id=s AND program_id=p AND version=grant_version;END IF;
 IF m.expires_at<=n AND m.balance>0 THEN
  INSERT INTO saas.loyalty_effects(store_id,program_id,program_version,account_id,operation_id,delta,reason,metadata,created_at)VALUES(s,p,v,a,gen_random_uuid(),-m.balance,'progress_expired','{}',n);m.balance:=0;
 END IF;
 m.balance:=m.balance+d;threshold:=(cfg->>'target')::bigint;
 IF abs(m.balance)>9007199254740991 THEN RAISE EXCEPTION 'LOYALTY_AMOUNT_OVERFLOW';END IF;
 IF m.balance<0 THEN
  FOR r IN SELECT * FROM saas.loyalty_rewards WHERE store_id=s AND program_id=p AND account_id=a AND status='available' ORDER BY sequence DESC LOOP
   EXIT WHEN m.balance>=0;
   IF r.code_id IS NOT NULL THEN PERFORM 1 FROM saas.promotion_codes WHERE store_id=s AND id=r.code_id FOR UPDATE;END IF;
   SELECT * INTO r FROM saas.loyalty_rewards WHERE id=r.id FOR UPDATE;
   IF NOT FOUND OR r.status IS DISTINCT FROM 'available'THEN CONTINUE;END IF;
   IF saas.loyalty_reward_held_v1(s,r.code_id,n)THEN CONTINUE;END IF;
   UPDATE saas.loyalty_rewards SET status='revoked'WHERE id=r.id;
   IF r.code_id IS NOT NULL THEN UPDATE saas.promotion_codes SET status='revoked'WHERE store_id=s AND id=r.code_id;END IF;
   m.balance:=m.balance+r.target_cost;
  END LOOP;
 END IF;
 WHILE m.balance>=threshold AND ((cfg->>'repeat')::boolean OR NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards WHERE store_id=s AND program_id=p AND account_id=a AND status IN('available','reserved','used')))LOOP
  EXIT WHEN issued>=1000;issued:=issued+1;
  rid:=gen_random_uuid();cid:=NULL;code_value:=NULL;
  IF pid IS NOT NULL THEN cid:=gen_random_uuid();code_value:='L-'||upper(replace(rid::text,'-',''));INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at)VALUES(cid,s,pid,code_value,'active',n);END IF;
  m.earned:=m.earned+1;
  INSERT INTO saas.loyalty_rewards(id,store_id,program_id,program_version,account_id,customer_id,sequence,target_cost,reward,code_id,code,status,earned_at,expires_at)
  VALUES(rid,s,p,grant_version,a,c,m.earned,threshold,cfg->'reward',cid,code_value,'available',n,CASE WHEN cfg->>'rewardExpiryDays'IS NOT NULL THEN n+make_interval(days=>(cfg->>'rewardExpiryDays')::integer)END);
  m.balance:=m.balance-threshold;
 END LOOP;
 IF d<>0 THEN INSERT INTO saas.loyalty_effects(store_id,program_id,program_version,account_id,operation_id,delta,reason,metadata,created_at)VALUES(s,p,v,a,op,d,why,meta,n);END IF;
 IF issued>0 AND pid IS NOT NULL THEN UPDATE saas.promotions SET status='active',updated_at=n WHERE store_id=s AND id=pid AND status='archived';END IF;
 UPDATE saas.loyalty_members SET balance=m.balance,progress=greatest(m.balance,0),earned=m.earned,last_activity_at=CASE WHEN d<>0 THEN n ELSE m.last_activity_at END,expires_at=CASE WHEN d=0 THEN m.expires_at WHEN cfg->>'progressExpiryDays'IS NOT NULL THEN n+make_interval(days=>(cfg->>'progressExpiryDays')::integer)END,rule_version=grant_version,pending_issuance=m.balance>=threshold AND((cfg->>'repeat')::boolean OR NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards WHERE store_id=s AND program_id=p AND account_id=a AND status IN('available','reserved','used'))),reconciled_at=n WHERE store_id=s AND program_id=p AND account_id=a;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_code_allowed_v1(s uuid,code_id uuid,ctx jsonb,n timestamptz)RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.loyalty_rewards;BEGIN
 SELECT * INTO r FROM saas.loyalty_rewards x WHERE x.store_id=s AND x.code_id=loyalty_code_allowed_v1.code_id;
 IF NOT FOUND THEN RETURN true;END IF;
 RETURN r.status='available' AND r.customer_id::text=ctx->>'customerId' AND(r.expires_at IS NULL OR n<r.expires_at)
 AND EXISTS(SELECT 1 FROM saas.storefront_accounts a WHERE a.store_id=s AND a.id=r.account_id AND a.customer_id=r.customer_id AND a.status='active' AND a.phone_verified_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions d WHERE d.store_id=s AND d.code_id=r.code_id)
 AND NOT saas.loyalty_reward_held_v1(s,r.code_id,n)
 AND NOT EXISTS(SELECT 1 FROM saas.loyalty_members lm WHERE lm.store_id=s AND lm.program_id=r.program_id AND lm.account_id=r.account_id AND lm.balance<0);
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_one_reward_selected_v1(s uuid,code_id uuid,ctx jsonb,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 WITH submitted AS(SELECT code,position FROM jsonb_array_elements_text(ctx->'submittedCodes')WITH ORDINALITY x(code,position)),eligible AS(
 SELECT pc.id,su.position FROM submitted su JOIN saas.promotion_codes pc ON pc.store_id=s AND pc.code=su.code JOIN saas.loyalty_rewards r ON r.store_id=pc.store_id AND r.code_id=pc.id
 WHERE r.customer_id::text=ctx->>'customerId'
 )SELECT NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards WHERE store_id=s AND loyalty_rewards.code_id=loyalty_one_reward_selected_v1.code_id)OR code_id=(SELECT id FROM eligible ORDER BY position LIMIT 1)
 $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_reward_conditions_v1(s uuid,code_id uuid,ctx jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.loyalty_rewards;cfg jsonb;subtotal numeric;gift_price bigint;BEGIN
 SELECT * INTO r FROM saas.loyalty_rewards x WHERE x.store_id=s AND x.code_id=loyalty_reward_conditions_v1.code_id;IF NOT FOUND OR r.reward->>'kind'<>'gift'THEN RETURN true;END IF;
 SELECT config INTO cfg FROM saas.loyalty_program_versions WHERE store_id=s AND program_id=r.program_id AND version=r.program_version;
 IF(cfg->>'rewardMinimumBasketMinor')::bigint=0 THEN RETURN true;END IF;
 SELECT coalesce(sum((x->>'unitPriceMinor')::numeric*(x->>'quantity')::integer),0),max((x->>'unitPriceMinor')::bigint)FILTER(WHERE x->>'variantId'=r.reward->>'variantId')INTO subtotal,gift_price FROM jsonb_array_elements(ctx->'cartLines')x;
 RETURN gift_price IS NOT NULL AND subtotal-gift_price*(r.reward->>'quantity')::bigint>=(cfg->>'rewardMinimumBasketMinor')::bigint;
END $f$;

DO $patch$ DECLARE original text;updated text;signature text:='saas.promotion_evaluator_code_facts(uuid,jsonb,timestamp with time zone)';anchor text:='WHERE code.status=''active'' AND (';BEGIN
 IF EXISTS(SELECT 1 FROM saas.loyalty_migration_baseline WHERE identity=signature)THEN
  IF encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')<>(SELECT patched_hash FROM saas.loyalty_migration_baseline WHERE identity=signature)THEN RAISE EXCEPTION 'LOYALTY_PREDECESSOR_DRIFT';END IF;
 ELSE
  original:=pg_get_functiondef(signature::regprocedure);IF length(original)-length(replace(original,anchor,''))<>length(anchor)THEN RAISE EXCEPTION 'LOYALTY_CODE_ANCHOR_INVALID';END IF;
  updated:=replace(original,anchor,'WHERE code.status=''active'' AND saas.loyalty_code_allowed_v1(code.store_id,code.id,p_context,p_now) AND saas.loyalty_one_reward_selected_v1(code.store_id,code.id,p_context,p_now) AND saas.loyalty_reward_conditions_v1(code.store_id,code.id,p_context) AND (');EXECUTE updated;
  INSERT INTO saas.loyalty_migration_baseline VALUES(signature,original,encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex'));
 END IF;END $patch$;

CREATE OR REPLACE FUNCTION saas.loyalty_redemption_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.loyalty_rewards;BEGIN
 SELECT * INTO r FROM saas.loyalty_rewards WHERE store_id=NEW.store_id AND code_id=NEW.code_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF r.customer_id IS DISTINCT FROM NEW.customer_id OR r.status NOT IN('available','reserved') OR EXISTS(SELECT 1 FROM saas.promotion_redemptions d WHERE d.store_id=NEW.store_id AND d.code_id=NEW.code_id)THEN RAISE EXCEPTION 'LOYALTY_REWARD_NOT_AVAILABLE';END IF;
 UPDATE saas.loyalty_rewards SET status='used',order_id=NEW.order_id,used_at=NEW.created_at,cost_minor=CASE WHEN r.reward->>'kind'='gift'THEN(SELECT coalesce(v.cost_cents,(SELECT min(other.cost_cents)FROM saas.product_variants other WHERE other.store_id=v.store_id AND other.product_id=v.product_id HAVING count(other.cost_cents)>0 AND min(other.cost_cents)=max(other.cost_cents)))*(r.reward->>'quantity')::bigint FROM saas.product_variants v WHERE v.store_id=r.store_id AND v.id=(r.reward->>'variantId')::uuid)ELSE NEW.discount_minor END WHERE id=r.id;
 RETURN NEW;END $f$;
DROP TRIGGER IF EXISTS loyalty_redemption ON saas.promotion_redemptions;
CREATE TRIGGER loyalty_redemption BEFORE INSERT ON saas.promotion_redemptions FOR EACH ROW EXECUTE FUNCTION saas.loyalty_redemption_v1();

CREATE OR REPLACE FUNCTION saas.loyalty_reservation_released_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.loyalty_rewards;BEGIN
 IF NEW.status NOT IN('released','expired')OR NEW.status=OLD.status THEN RETURN NULL;END IF;
 SELECT * INTO r FROM saas.loyalty_rewards WHERE store_id=NEW.store_id AND code_id=NEW.code_id;
 IF FOUND AND NOT saas.loyalty_reward_held_v1(r.store_id,r.code_id,NEW.updated_at)THEN PERFORM saas.loyalty_apply_effect_v1(r.store_id,r.program_id,r.program_version,r.account_id,r.customer_id,gen_random_uuid(),0,NEW.updated_at,'reconcile_rewards','{}');END IF;RETURN NULL;
END $f$;
DROP TRIGGER IF EXISTS loyalty_reservation_released ON saas.promotion_usage_reservations;
CREATE TRIGGER loyalty_reservation_released AFTER UPDATE OF status ON saas.promotion_usage_reservations FOR EACH ROW EXECUTE FUNCTION saas.loyalty_reservation_released_v1();

CREATE OR REPLACE FUNCTION saas.loyalty_paid_units_v1(s uuid,o uuid,l uuid,q integer)RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 WITH free_ranges AS(
 SELECT greatest(0,(r->>'startOrdinal')::bigint)lo,least(q::bigint,(r->>'startOrdinal')::bigint+(r->>'quantity')::bigint)hi
 FROM saas.order_promotion_snapshots snap CROSS JOIN LATERAL jsonb_array_elements(coalesce(snap.snapshot->'discountLines','[]'))fl CROSS JOIN LATERAL jsonb_array_elements(fl->'capturedRanges')r
 WHERE snap.store_id=s AND snap.order_id=o AND EXISTS(SELECT 1 FROM saas.order_discount_allocations alloc WHERE alloc.store_id=s AND alloc.order_id=o AND alloc.snapshot_id=snap.id AND alloc.line_id=l AND alloc.line_position=(fl->>'position')::integer)AND(r->>'kind'='gift'OR(r->>'discountUnitMinor')::bigint>=(r->>'grossUnitMinor')::bigint)
 ),merged AS(SELECT range_agg(int8range(lo,hi,'[)'))ranges FROM free_ranges WHERE hi>lo)
 SELECT greatest(q-coalesce((SELECT sum(upper(x)-lower(x))FROM merged,LATERAL unnest(ranges)x),0),0)::bigint
 $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_paid_order_amount_v1(s uuid,o uuid)RETURNS bigint LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE ord saas.orders;r saas.accounting_receivables;paid bigint:=0;shipping_paid bigint;BEGIN
 SELECT * INTO ord FROM saas.orders WHERE store_id=s AND id=o;IF NOT FOUND OR ord.source IN('marketplace','manual_import') OR ord.status IN('cancelled','refunded')THEN RETURN 0;END IF;
 SELECT greatest(ord.shipping_cents-coalesce(sum((snapshot->>'shippingDiscountMinor')::bigint),0),0)INTO shipping_paid FROM saas.order_promotion_snapshots WHERE store_id=s AND order_id=o;
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=s AND order_id=o;
 IF FOUND THEN
  IF r.collected_cents<=0 OR r.collected_cents<greatest(r.sale_cents-r.return_cents-r.discount_cents,0)THEN RETURN 0;END IF;
  RETURN greatest(least(r.sale_cents-r.return_cents-r.discount_cents,r.collected_cents-r.refunded_cents)-shipping_paid,0);
 END IF;
 SELECT greatest(coalesce(max(amount),0),0) INTO paid FROM(
  SELECT a.expected_payment_amount amount FROM saas.checkout_payment_attempts a WHERE a.store_id=s AND a.settled_order_id=o AND a.status='succeeded'AND a.succeeded_at IS NOT NULL
  UNION ALL SELECT a.amount_minor FROM saas.storefront_hosted_checkout_sessions h JOIN saas.payment_attempts a ON a.store_id=h.store_id AND a.id=h.payment_attempt_id WHERE h.store_id=s AND h.order_id=o AND h.status='captured'AND a.status='captured'
  UNION ALL SELECT a.amount_minor FROM saas.quick_order_hosted_payment_bridges b JOIN saas.payment_attempts a ON a.store_id=b.store_id AND a.id=b.attempt_id WHERE b.store_id=s AND b.order_id=o AND b.status='captured'AND a.status='captured'
  UNION ALL SELECT ord.total_cents FROM saas.order_events e WHERE e.store_id=s AND e.order_id=o AND e.event_type='payment_transition'AND e.to_value='completed'
 )e;
 RETURN greatest(least(paid,ord.total_cents)-shipping_paid,0);
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_store_enabled_v1(s uuid,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.stores st JOIN saas.subscriptions sub ON sub.store_id=st.id JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='promotions'AND f.enabled WHERE st.id=s AND st.status='active'AND sub.status='active'AND sub.valid_from<=n AND(sub.valid_until IS NULL OR sub.valid_until>n)AND p.status='active'AND p.valid_from<=n AND(p.valid_until IS NULL OR p.valid_until>n))
 $f$;
CREATE OR REPLACE FUNCTION saas.loyalty_enqueue_order_v1(s uuid,o uuid,n timestamptz)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE snapshot jsonb:='{}';BEGIN IF s IS NULL OR o IS NULL OR NOT EXISTS(SELECT 1 FROM saas.loyalty_programs WHERE store_id=s)THEN RETURN;END IF;
 IF saas.loyalty_store_enabled_v1(s,n)AND saas.loyalty_paid_order_amount_v1(s,o)>0 AND EXISTS(SELECT 1 FROM saas.loyalty_order_members WHERE store_id=s AND order_id=o)THEN SELECT coalesce(jsonb_object_agg(id::text,version),'{}')INTO snapshot FROM(SELECT id,version FROM saas.loyalty_programs WHERE store_id=s AND enabled AND((config->>'startsAt')IS NULL OR(config->>'startsAt')::timestamptz<=n)AND((config->>'endsAt')IS NULL OR(config->>'endsAt')::timestamptz>n)ORDER BY id FOR SHARE)eligible;END IF;
 INSERT INTO saas.loyalty_order_queue(store_id,order_id,queued_at,next_attempt_at,program_snapshot)VALUES(s,o,n,n,snapshot)ON CONFLICT(store_id,order_id)DO UPDATE SET revision=saas.loyalty_order_queue.revision+1,queued_at=excluded.queued_at,next_attempt_at=excluded.next_attempt_at,attempts=0,last_error=NULL,program_snapshot=excluded.program_snapshot||saas.loyalty_order_queue.program_snapshot;
END $f$;
CREATE OR REPLACE FUNCTION saas.loyalty_source_changed_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE rowdata jsonb;sid uuid;oid uuid;BEGIN
 rowdata:=CASE WHEN TG_OP='DELETE'THEN to_jsonb(OLD)ELSE to_jsonb(NEW)END;sid:=(rowdata->>'store_id')::uuid;
 IF TG_TABLE_NAME='orders'THEN oid:=(rowdata->>'id')::uuid;
 ELSIF TG_TABLE_NAME='checkout_payment_attempts'THEN oid:=(rowdata->>'settled_order_id')::uuid;
 ELSIF TG_TABLE_NAME='payment_attempts'THEN SELECT order_id INTO oid FROM saas.storefront_hosted_checkout_sessions WHERE store_id=sid AND payment_attempt_id=(rowdata->>'id')::uuid;
 ELSIF TG_TABLE_NAME='accounting_allocations'THEN SELECT order_id INTO oid FROM saas.accounting_receivables WHERE store_id=sid AND id=(rowdata->>'receivable_id')::uuid;
 ELSE oid:=(rowdata->>'order_id')::uuid;END IF;
 PERFORM saas.loyalty_enqueue_order_v1(sid,oid,date_trunc('milliseconds',clock_timestamp()));RETURN NULL;
END $f$;
DO $tr$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['orders','order_items','order_events','order_promotion_snapshots','accounting_receivables','accounting_allocations','checkout_payment_attempts','payment_attempts','storefront_hosted_checkout_sessions','quick_order_hosted_payment_bridges','loyalty_order_members']LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS loyalty_source_changed ON saas.%I',t);EXECUTE format('CREATE TRIGGER loyalty_source_changed AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.loyalty_source_changed_v1()',t);END LOOP;END $tr$;

CREATE OR REPLACE FUNCTION saas.loyalty_reconcile_order_v1(s uuid,oid uuid,n timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE ord saas.orders;acc saas.storefront_accounts;account_snapshot saas.storefront_accounts;p saas.loyalty_programs;old saas.loyalty_order_effects;cfg jsonb;paid bigint;amount bigint;delta bigint;ver bigint;channel text;paid_time timestamptz;op uuid;chosen boolean:=false;allow_more boolean:=true;meta jsonb;eligible_sum bigint;all_sum bigint;snapshot jsonb;has_return boolean;
BEGIN
 SELECT * INTO ord FROM saas.orders WHERE store_id=s AND id=oid;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO acc FROM saas.storefront_accounts WHERE store_id=s AND id=(SELECT account_id FROM saas.loyalty_order_effects WHERE store_id=s AND order_id=oid LIMIT 1);
 IF NOT FOUND THEN SELECT a.* INTO acc FROM saas.loyalty_order_members proof JOIN saas.storefront_accounts a ON a.store_id=proof.store_id AND a.id=proof.account_id WHERE proof.store_id=s AND proof.order_id=oid AND proof.customer_id=a.customer_id;END IF;
 IF NOT FOUND THEN RETURN;END IF;
 account_snapshot:=acc;
 channel:=CASE WHEN ord.source='in_store'THEN 'in_store'WHEN ord.source IN('manual','social')THEN 'manual'ELSE 'storefront'END;
 IF channel='in_store'AND NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_approvals a JOIN saas.in_store_sales sale ON sale.store_id=a.store_id AND sale.id=a.sale_id WHERE a.store_id=s AND a.account_id=acc.id AND sale.order_id=oid AND a.consumed_at IS NOT NULL)THEN RETURN;END IF;
 paid:=saas.loyalty_paid_order_amount_v1(s,oid);paid_time:=coalesce(ord.paid_at,ord.updated_at);
 SELECT program_snapshot INTO snapshot FROM saas.loyalty_order_queue WHERE store_id=s AND order_id=oid;
 SELECT EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=s AND order_id=oid AND return_cents>0)INTO has_return;
 FOR p IN SELECT * FROM saas.loyalty_programs WHERE store_id=s ORDER BY created_at,id LOOP
  acc:=account_snapshot;
  SELECT * INTO old FROM saas.loyalty_order_effects WHERE store_id=s AND order_id=oid AND program_id=p.id FOR UPDATE;
  ver:=CASE WHEN FOUND THEN old.program_version ELSE coalesce((snapshot->>p.id::text)::bigint,p.version)END;
  IF old.account_id IS NOT NULL AND old.account_id<>acc.id THEN SELECT * INTO acc FROM saas.storefront_accounts WHERE store_id=s AND id=old.account_id;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-member:'||s||':'||p.id||':'||acc.id,0));
  SELECT config INTO cfg FROM saas.loyalty_program_versions WHERE store_id=s AND program_id=p.id AND version=ver;
  amount:=0;
  IF paid>0 AND ord.created_at>=p.created_at AND cfg->'channels'?channel AND (old.order_id IS NOT NULL OR((p.enabled OR snapshot?p.id::text)AND((cfg->>'startsAt')IS NULL OR paid_time>=(cfg->>'startsAt')::timestamptz)AND((cfg->>'endsAt')IS NULL OR paid_time<(cfg->>'endsAt')::timestamptz)))THEN
   SELECT coalesce(sum(line_total_cents),0)INTO all_sum FROM saas.order_items WHERE store_id=s AND order_id=oid;
   SELECT coalesce(sum(line_total_cents),0),coalesce(sum(saas.loyalty_paid_units_v1(s,oid,i.id,i.quantity)),0)INTO eligible_sum,amount FROM saas.order_items i WHERE i.store_id=s AND i.order_id=oid AND i.line_total_cents>0 AND(jsonb_array_length(cfg->'eligibleProductIds')=0 OR cfg->'eligibleProductIds'?i.product_id::text);
   IF all_sum>0 THEN eligible_sum:=floor(eligible_sum::numeric*least(paid,all_sum)/all_sum)::bigint;ELSE eligible_sum:=0;END IF;
   IF eligible_sum<(cfg->>'minimumBasketMinor')::bigint OR eligible_sum=0 THEN amount:=0;
   ELSIF cfg->>'template'='spend_discount'THEN amount:=eligible_sum;
   ELSIF cfg->>'template'<>'product_gift'THEN amount:=1;END IF;
   IF (cfg->>'maxOncePerDay')::boolean AND cfg->>'template'<>'product_gift'AND cfg->>'template'<>'spend_discount'AND EXISTS(SELECT 1 FROM saas.loyalty_order_effects e WHERE e.store_id=s AND e.program_id=p.id AND e.account_id=acc.id AND e.order_id<>oid AND e.amount>0 AND(e.paid_at AT TIME ZONE(cfg->>'timezone'))::date=(paid_time AT TIME ZONE(cfg->>'timezone'))::date)THEN amount:=0;END IF;
   IF has_return AND(cfg->>'template'<>'spend_discount'OR jsonb_array_length(cfg->'eligibleProductIds')>0)THEN amount:=0;END IF;
   IF(NOT saas.loyalty_store_enabled_v1(s,n)OR NOT p.enabled OR(p.config->>'startsAt')::timestamptz>n OR(p.config->>'endsAt')::timestamptz<=n)AND NOT coalesce(snapshot?p.id::text,false)THEN amount:=least(amount,coalesce(old.amount,0));END IF;
   IF chosen AND(NOT allow_more OR NOT(cfg->>'allowMultiplePrograms')::boolean)AND old.order_id IS NULL THEN amount:=0;END IF;
   IF amount>0 THEN chosen:=true;allow_more:=allow_more AND(cfg->>'allowMultiplePrograms')::boolean;END IF;
  END IF;
  delta:=amount-coalesce(old.amount,0);
  IF delta<>0 THEN
   meta:=jsonb_build_object('orderId',oid,'before',coalesce(old.amount,0),'after',amount,'orderVersion',ord.version);
   op:=gen_random_uuid();
   PERFORM saas.loyalty_apply_effect_v1(s,p.id,ver,acc.id,acc.customer_id,op,delta,n,CASE WHEN old.order_id IS NOT NULL THEN 'order_adjustment'ELSE 'paid_order'END,meta);
   INSERT INTO saas.loyalty_order_effects(store_id,order_id,program_id,program_version,account_id,customer_id,amount,paid_at,updated_at)VALUES(s,oid,p.id,ver,acc.id,acc.customer_id,amount,paid_time,n)ON CONFLICT(store_id,order_id,program_id)DO UPDATE SET amount=excluded.amount,updated_at=excluded.updated_at;
  END IF;
 END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_process_pending_v1(n timestamptz,lim integer)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE q record;done integer:=0;failed integer:=0;BEGIN
 IF n IS NULL OR NOT isfinite(n)OR lim NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'LOYALTY_INVALID_INPUT';END IF;
 FOR q IN SELECT * FROM saas.loyalty_order_queue WHERE next_attempt_at<=n AND attempts<8 ORDER BY next_attempt_at,store_id,order_id LIMIT greatest(1,lim/2) FOR UPDATE SKIP LOCKED LOOP
  BEGIN PERFORM saas.loyalty_reconcile_order_v1(q.store_id,q.order_id,n);DELETE FROM saas.loyalty_order_queue WHERE store_id=q.store_id AND order_id=q.order_id AND revision=q.revision;done:=done+1;
  EXCEPTION WHEN OTHERS THEN UPDATE saas.loyalty_order_queue SET attempts=attempts+1,next_attempt_at=n+make_interval(secs=>least(3600,5*power(2,attempts)::integer)),last_error=SQLSTATE WHERE store_id=q.store_id AND order_id=q.order_id;failed:=failed+1;END;
 END LOOP;
 FOR q IN SELECT * FROM saas.loyalty_members WHERE pending_issuance ORDER BY reconciled_at,store_id,program_id,account_id LIMIT greatest(0,lim-done-failed) LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended('loyalty-member:'||q.store_id||':'||q.program_id||':'||q.account_id,0))THEN CONTINUE;END IF;
  BEGIN PERFORM saas.loyalty_apply_effect_v1(q.store_id,q.program_id,q.rule_version,q.account_id,q.customer_id,gen_random_uuid(),0,n,'reconcile_rewards','{}');done:=done+1;EXCEPTION WHEN OTHERS THEN failed:=failed+1;END;
 END LOOP;RETURN jsonb_build_object('processed',done,'failed',failed);
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_authority_error_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz)RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$SELECT saas.promotion_authority_error(s,p,m,pl,c,v,n,'promotions.read')$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_pos_bind_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz,sale uuid,token text)RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$BEGIN RAISE EXCEPTION 'LOYALTY_POS_NOT_READY';END $f$;
CREATE OR REPLACE FUNCTION saas.loyalty_pos_reward_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz,op uuid,payload jsonb)RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$BEGIN RAISE EXCEPTION 'LOYALTY_POS_NOT_READY';END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_admin_command_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz,action text,op uuid,payload jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;pr saas.loyalty_programs;cfg jsonb;result jsonb;existing saas.loyalty_operations;pid uuid;rule jsonb;cur text;actor uuid;sid uuid;customer uuid;delta bigint;acc uuid;limit_n integer;cursor_id uuid;auth_action text;BEGIN
 IF n IS NULL OR NOT isfinite(n) OR jsonb_typeof(payload)<>'object'OR pg_column_size(payload)>32768 OR action NOT IN('list','report','save','pause','duplicate','adjust','approve-pos','prepare-pos-reward','recover')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 auth_action:=CASE WHEN action='recover'THEN payload->>'action'ELSE action END;
 err:=CASE WHEN auth_action IN('approve-pos','prepare-pos-reward')THEN saas.loyalty_pos_authority_error_v1(s,p,m,pl,c,v,n)ELSE saas.promotion_authority_error(s,p,m,pl,c,v,n,CASE WHEN auth_action IN('list','report')THEN 'promotions.read'ELSE 'promotions.publish'END)END;
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF action='list'THEN SELECT jsonb_build_object('programs',coalesce(jsonb_agg(saas.loyalty_program_json_v1(x,n)ORDER BY created_at,id),'[]'))INTO result FROM saas.loyalty_programs x WHERE store_id=s;RETURN QUERY SELECT 'found',result;RETURN;END IF;
 IF action='report'THEN
  SELECT * INTO pr FROM saas.loyalty_programs WHERE store_id=s AND id=(payload->>'programId')::uuid;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  limit_n:=coalesce((payload->>'limit')::integer,50);IF limit_n NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;cursor_id:=(payload->>'cursor')::uuid;
  SELECT jsonb_build_object('program',saas.loyalty_program_json_v1(pr,n),'summary',jsonb_build_object('members',(SELECT count(*)FROM saas.loyalty_members WHERE store_id=s AND program_id=pr.id),'earned',count(*),'used',count(*)FILTER(WHERE status='used'),'available',count(*)FILTER(WHERE status='available'AND(expires_at IS NULL OR expires_at>n)AND NOT saas.loyalty_reward_held_v1(s,code_id,n)),'reserved',count(*)FILTER(WHERE status='reserved'OR(status='available'AND saas.loyalty_reward_held_v1(s,code_id,n))),'knownCostMinor',sum(cost_minor),'unknownCostRewards',count(*)FILTER(WHERE cost_minor IS NULL AND status='used')),'members','[]'::jsonb,'nextCursor',NULL)INTO result FROM saas.loyalty_rewards WHERE store_id=s AND program_id=pr.id;
  SELECT jsonb_set(result,'{members}',coalesce(jsonb_agg(row ORDER BY row->>'customerId'),'[]'))INTO result FROM(SELECT jsonb_build_object('customerId',lm.customer_id,'customerName',cu.first_name||' '||cu.last_name,'progress',greatest(lm.balance,0),'target',(pr.config->>'target')::bigint,'earned',lm.earned,'used',(SELECT count(*)FROM saas.loyalty_rewards r WHERE r.store_id=s AND r.program_id=pr.id AND r.account_id=lm.account_id AND r.status='used'),'available',(SELECT count(*)FROM saas.loyalty_rewards r WHERE r.store_id=s AND r.program_id=pr.id AND r.account_id=lm.account_id AND r.status='available'AND(r.expires_at IS NULL OR r.expires_at>n)))row FROM saas.loyalty_members lm JOIN saas.customers cu ON cu.store_id=lm.store_id AND cu.id=lm.customer_id WHERE lm.store_id=s AND lm.program_id=pr.id AND(cursor_id IS NULL OR lm.customer_id>cursor_id)ORDER BY lm.customer_id LIMIT limit_n)q;
  IF jsonb_array_length(result->'members')=limit_n THEN result:=jsonb_set(result,'{nextCursor}',to_jsonb(result->'members'->(limit_n-1)->>'customerId'));END IF;
  RETURN QUERY SELECT 'found',result;RETURN;
 END IF;
 IF op IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-operation:'||s||':'||p||':'||op,0));
 SELECT * INTO existing FROM saas.loyalty_operations WHERE store_id=s AND actor_id=p AND operation_id=op;
 IF action='recover'THEN IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;ELSIF existing.action=payload->>'action'AND existing.payload=payload->'payload'THEN RETURN QUERY SELECT 'operation_replayed',existing.result;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF FOUND THEN IF existing.action=action AND existing.payload=payload THEN RETURN QUERY SELECT 'operation_replayed',existing.result;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 err:=saas.promotion_operation_authority_lock_v1(s,p,m,pl,c,v,n,op,CASE WHEN action IN('approve-pos','prepare-pos-reward')THEN 'promotions.read'ELSE 'promotions.publish'END);
 IF err IS NOT NULL AND action NOT IN('approve-pos','prepare-pos-reward')THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF action IN('save','pause','duplicate')THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-program-store:'||s,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('promotion-published-cap:'||s,0));
  IF payload->>'programId'IS NOT NULL THEN PERFORM 1 FROM saas.promotions prom WHERE prom.store_id=s AND prom.status IN('active','scheduled')AND EXISTS(SELECT 1 FROM saas.loyalty_program_versions lv WHERE lv.store_id=s AND lv.program_id=(payload->>'programId')::uuid AND lv.promotion_id=prom.id)ORDER BY prom.id FOR UPDATE;END IF;
  IF payload->>'programId'IS NOT NULL THEN SELECT * INTO pr FROM saas.loyalty_programs WHERE store_id=s AND id=(payload->>'programId')::uuid FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;IF pr.version<>(payload->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;END IF;
  IF action='pause'THEN
   UPDATE saas.loyalty_programs SET enabled=NOT enabled,version=version+1,updated_at=n WHERE store_id=s AND id=pr.id RETURNING * INTO pr;
   INSERT INTO saas.loyalty_program_versions(store_id,program_id,version,config,promotion_id,created_at)SELECT s,pr.id,pr.version,pr.config,promotion_id,n FROM saas.loyalty_program_versions WHERE store_id=s AND program_id=pr.id AND version=pr.version-1;
  ELSE
   cfg:=CASE WHEN action='duplicate'THEN pr.config ELSE payload->'config'END;
   IF pr.id IS NOT NULL AND cfg->>'template'IS DISTINCT FROM pr.config->>'template'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF saas.loyalty_config_valid_v1(cfg)IS DISTINCT FROM true OR(action='save'AND(payload->>'name'IS NULL OR length(payload->>'name')NOT BETWEEN 1 AND 120 OR payload->>'name'<>btrim(payload->>'name')OR payload->>'name'~'[[:cntrl:]]'OR jsonb_typeof(payload->'enabled')<>'boolean'))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF jsonb_array_length(cfg->'eligibleProductIds')>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(cfg->'eligibleProductIds')e WHERE NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=s AND id=e::uuid))THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
   IF cfg->'reward'->>'kind'='gift'AND NOT EXISTS(SELECT 1 FROM saas.product_variants WHERE store_id=s AND id=(cfg->'reward'->>'variantId')::uuid)THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
   IF action='duplicate'OR pr.id IS NULL THEN
    IF(SELECT count(*)FROM saas.loyalty_programs WHERE store_id=s)>=20 THEN RETURN QUERY SELECT 'limit_exceeded',NULL::jsonb;RETURN;END IF;
    INSERT INTO saas.loyalty_programs(store_id,name,enabled,version,config,created_at,updated_at)VALUES(s,CASE WHEN action='duplicate'THEN left(pr.name,110)||' kopyası'ELSE payload->>'name'END,CASE WHEN action='duplicate'THEN false ELSE(payload->>'enabled')::boolean END,1,cfg,n,n)RETURNING * INTO pr;
   ELSE UPDATE saas.loyalty_programs SET name=payload->>'name',enabled=(payload->>'enabled')::boolean,config=cfg,version=version+1,updated_at=n WHERE store_id=s AND id=pr.id RETURNING * INTO pr;END IF;
   UPDATE saas.promotions prom SET status='archived',updated_at=n WHERE prom.store_id=s AND prom.status IN('active','scheduled')AND EXISTS(SELECT 1 FROM saas.loyalty_program_versions lv WHERE lv.store_id=s AND lv.program_id=pr.id AND lv.promotion_id=prom.id)AND NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards lr JOIN saas.loyalty_program_versions lv ON lv.store_id=lr.store_id AND lv.program_id=lr.program_id AND lv.version=lr.program_version WHERE lv.promotion_id=prom.id AND lr.status IN('available','reserved')AND(lr.expires_at IS NULL OR lr.expires_at>n OR saas.loyalty_reward_held_v1(lr.store_id,lr.code_id,n)))AND NOT EXISTS(SELECT 1 FROM saas.loyalty_order_queue q JOIN saas.loyalty_program_versions lv ON lv.store_id=q.store_id AND lv.program_id=pr.id WHERE q.store_id=s AND lv.promotion_id=prom.id AND q.program_snapshot @> jsonb_build_object(lv.program_id::text,lv.version));
   IF(SELECT count(*)FROM saas.promotions WHERE store_id=s AND status IN('active','scheduled'))>=90 THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='limit_exceeded';END IF;
   pid:=gen_random_uuid();SELECT currency INTO cur FROM saas.stores WHERE id=s;rule:=saas.loyalty_rule_v1(cfg,cur);
   IF NOT saas.promotion_rule_document_valid(rule)THEN RAISE EXCEPTION 'LOYALTY_RULE_INVALID';END IF;
   INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)VALUES(pid,s,pr.name||' · Sadakat','active',1,rule,n,n);
   INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)VALUES(gen_random_uuid(),s,pid,1,rule,n);
   INSERT INTO saas.loyalty_program_versions(store_id,program_id,version,config,promotion_id,created_at)VALUES(s,pr.id,pr.version,cfg,pid,n);
  END IF;
  result:=jsonb_build_object('operationId',op,'program',saas.loyalty_program_json_v1(pr,n));
 ELSIF action='adjust'THEN
  SELECT * INTO pr FROM saas.loyalty_programs WHERE store_id=s AND id=(payload->>'programId')::uuid;
  SELECT id,customer_id INTO acc,customer FROM saas.storefront_accounts WHERE store_id=s AND customer_id=(payload->>'customerId')::uuid AND status='active'AND phone_verified_at IS NOT NULL;
  delta:=(payload->>'delta')::bigint;
  IF pr.id IS NULL OR acc IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF delta IS NULL OR delta=0 OR abs(delta)>8000000000 OR length(btrim(payload->>'reason'))NOT BETWEEN 3 AND 500 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  PERFORM saas.loyalty_apply_effect_v1(s,pr.id,pr.version,acc,customer,op,delta,n,'manual_adjustment',jsonb_build_object('reason',payload->>'reason','membershipId',m));
  result:=jsonb_build_object('operationId',op,'customerId',customer,'programId',pr.id,'progress',(SELECT progress FROM saas.loyalty_members WHERE store_id=s AND program_id=pr.id AND account_id=acc));
 ELSIF action='approve-pos'THEN result:=saas.loyalty_pos_bind_v1(s,p,m,pl,c,v,n,(payload->>'saleId')::uuid,payload->>'token')||jsonb_build_object('operationId',op);
 ELSIF action='prepare-pos-reward'THEN result:=saas.loyalty_pos_reward_v1(s,p,m,pl,c,v,n,op,payload);
 ELSE RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.loyalty_operations VALUES(s,p,op,action,payload,result,n);RETURN QUERY SELECT 'committed',result;
EXCEPTION WHEN SQLSTATE 'P0503'THEN
 IF SQLERRM IN('approval_invalid','reward_unavailable','version_conflict','membership_denied','invalid_input','invalid_transition','conditions_not_met','limit_exceeded')THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;ELSE RAISE;END IF;
WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_customer_command_v1(hostname text,n timestamptz,credentials jsonb,action text,op uuid,payload jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE ctx record;result jsonb;existing saas.loyalty_operations;r saas.loyalty_rewards;token text;approval saas.loyalty_pos_approvals;pid uuid;BEGIN
 IF n IS NULL OR NOT isfinite(n)OR jsonb_typeof(payload)<>'object'OR pg_column_size(payload)>2048 OR action NOT IN('list','prepare-reward','approve-pos','recover')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO ctx FROM saas.storefront_identity_session_context(hostname,n,credentials,false);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM saas.storefront_accounts WHERE store_id=ctx.store_id AND id=ctx.account_id AND customer_id=ctx.customer_id AND phone_verified_at IS NOT NULL AND status='active')THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 IF action='list'THEN
  SELECT jsonb_build_object('programs',coalesce(jsonb_agg(jsonb_build_object('programId',pr.id,'name',pr.name,'template',pr.config->>'template','progress',coalesce(CASE WHEN lm.expires_at<=n THEN 0 ELSE greatest(lm.balance,0)END,0),'target',pr.config->'target','reward',pr.config->'reward')ORDER BY pr.created_at,pr.id),'[]'),'rewards','[]'::jsonb)INTO result FROM saas.loyalty_programs pr LEFT JOIN saas.loyalty_members lm ON lm.store_id=pr.store_id AND lm.program_id=pr.id AND lm.account_id=ctx.account_id WHERE pr.store_id=ctx.store_id AND(pr.enabled OR lm.account_id IS NOT NULL);
  result:=jsonb_set(result,'{rewards}',saas.loyalty_available_rewards_v1(ctx.store_id,ctx.account_id,n));
  RETURN QUERY SELECT 'found',result;RETURN;
 END IF;
 IF op IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-operation:'||ctx.store_id||':'||ctx.account_id||':'||op,0));
 SELECT * INTO existing FROM saas.loyalty_operations WHERE store_id=ctx.store_id AND actor_id=ctx.account_id AND operation_id=op;
 IF action='recover'THEN IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;ELSIF existing.action=payload->>'action'AND existing.payload=payload->'payload'THEN RETURN QUERY SELECT 'operation_replayed',existing.result;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF FOUND THEN IF existing.action=action AND existing.payload=payload THEN RETURN QUERY SELECT 'operation_replayed',existing.result;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF action='prepare-reward'THEN
  SELECT * INTO r FROM saas.loyalty_rewards WHERE store_id=ctx.store_id AND id=(payload->>'rewardId')::uuid AND account_id=ctx.account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF r.status<>'available'OR r.expires_at<=n OR saas.loyalty_reward_held_v1(ctx.store_id,r.code_id,n)THEN RETURN QUERY SELECT 'reward_unavailable',NULL::jsonb;RETURN;END IF;
  IF r.reward->>'kind'='gift'THEN SELECT product_id INTO pid FROM saas.product_variants WHERE store_id=ctx.store_id AND id=(r.reward->>'variantId')::uuid;IF pid IS NULL THEN RETURN QUERY SELECT 'reward_unavailable',NULL::jsonb;RETURN;END IF;END IF;
  result:=jsonb_build_object('operationId',op,'rewardId',r.id,'code',r.code,'reward',r.reward,'giftProductId',pid,'expiresAt',saas.loyalty_iso_v1(r.expires_at));
 ELSIF action='approve-pos'THEN
  IF(SELECT count(*)FROM saas.loyalty_pos_approvals WHERE store_id=ctx.store_id AND account_id=ctx.account_id AND created_at>n-interval '5 minutes')>=5 THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb;RETURN;END IF;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  INSERT INTO saas.loyalty_pos_approvals(store_id,account_id,customer_id,token_digest,created_at,expires_at)VALUES(ctx.store_id,ctx.account_id,ctx.customer_id,encode(sha256(convert_to(token,'UTF8')),'hex'),n,n+interval '5 minutes')RETURNING * INTO approval;
  result:=jsonb_build_object('operationId',op,'customerId',ctx.customer_id,'approvalId',approval.id,'token',token,'expiresAt',saas.loyalty_iso_v1(approval.expires_at));
 END IF;
 INSERT INTO saas.loyalty_operations VALUES(ctx.store_id,ctx.account_id,op,action,payload,result,n);RETURN QUERY SELECT 'committed',result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_managed_promotion_guard_v1()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.loyalty_program_versions WHERE store_id=OLD.store_id AND promotion_id=OLD.id)THEN
  IF TG_OP='DELETE'THEN RAISE EXCEPTION 'LOYALTY_MANAGED_PROMOTION';END IF;
  IF NEW.rule_document IS DISTINCT FROM OLD.rule_document OR NEW.version<>OLD.version OR NEW.name<>OLD.name THEN RAISE EXCEPTION 'LOYALTY_MANAGED_PROMOTION';END IF;
  IF NEW.status<>OLD.status THEN
   IF NEW.status='archived'AND NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards r JOIN saas.loyalty_program_versions v ON v.store_id=r.store_id AND v.program_id=r.program_id AND v.version=r.program_version WHERE v.store_id=OLD.store_id AND v.promotion_id=OLD.id AND r.status IN('available','reserved')AND(r.expires_at IS NULL OR r.expires_at>NEW.updated_at OR saas.loyalty_reward_held_v1(r.store_id,r.code_id,NEW.updated_at)))THEN RETURN NEW;END IF;
   IF OLD.status='archived'AND NEW.status='active'AND EXISTS(SELECT 1 FROM saas.loyalty_rewards r JOIN saas.loyalty_program_versions v ON v.store_id=r.store_id AND v.program_id=r.program_id AND v.version=r.program_version WHERE v.store_id=OLD.store_id AND v.promotion_id=OLD.id AND r.status IN('available','reserved')AND r.reward=v.config->'reward'AND r.target_cost=(v.config->>'target')::bigint AND(r.expires_at IS NULL OR r.expires_at>NEW.updated_at OR saas.loyalty_reward_held_v1(r.store_id,r.code_id,NEW.updated_at)))THEN RETURN NEW;END IF;
   RAISE EXCEPTION 'LOYALTY_MANAGED_PROMOTION';
  END IF;
 END IF;RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS loyalty_managed_promotion_guard ON saas.promotions;
CREATE TRIGGER loyalty_managed_promotion_guard BEFORE UPDATE OR DELETE ON saas.promotions FOR EACH ROW EXECUTE FUNCTION saas.loyalty_managed_promotion_guard_v1();

DO $hide$DECLARE r record;original text;updated text;anchor text;BEGIN
 FOR r IN SELECT p.oid,'saas.'||p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname='promotion_list_v1'AND p.pronargs=18 LOOP
  IF EXISTS(SELECT 1 FROM saas.loyalty_migration_baseline WHERE identity=r.signature)THEN
   IF encode(sha256(convert_to(pg_get_functiondef(r.oid),'UTF8')),'hex')<>(SELECT patched_hash FROM saas.loyalty_migration_baseline WHERE identity=r.signature)THEN RAISE EXCEPTION 'LOYALTY_LIST_PREDECESSOR_DRIFT';END IF;CONTINUE;
  END IF;
  original:=pg_get_functiondef(r.oid);anchor:='WHERE p.store_id=p_store_id';
  IF length(original)-length(replace(original,anchor,''))<>length(anchor)THEN RAISE EXCEPTION 'LOYALTY_LIST_ANCHOR_INVALID';END IF;
  updated:=replace(original,anchor,anchor||' AND NOT EXISTS(SELECT 1 FROM saas.loyalty_program_versions lp WHERE lp.store_id=p.store_id AND lp.promotion_id=p.id)');EXECUTE updated;
  INSERT INTO saas.loyalty_migration_baseline VALUES(r.signature,original,encode(sha256(convert_to(pg_get_functiondef(r.oid),'UTF8')),'hex'));
 END LOOP;
END $hide$;

DO $grants$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'loyalty_%'LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_migrator,celebix_saas_bootstrap,celebix_saas_observability';END LOOP;END $grants$;
GRANT EXECUTE ON FUNCTION saas.loyalty_admin_command_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid,jsonb)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.loyalty_customer_command_v1(text,timestamptz,jsonb,text,uuid,jsonb)TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.loyalty_process_pending_v1(timestamptz,integer)TO celebix_saas_workflow;
COMMIT;
