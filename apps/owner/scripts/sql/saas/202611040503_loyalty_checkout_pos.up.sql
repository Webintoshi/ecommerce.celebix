BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL check_function_bodies=off;

CREATE TABLE IF NOT EXISTS saas.loyalty503_functions(identity text PRIMARY KEY,definition text NOT NULL,patched_hash text);
ALTER TABLE saas.loyalty503_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.loyalty503_functions FORCE ROW LEVEL SECURITY;
DO $d$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='saas.loyalty503_functions'::regclass AND polname='loyalty503_owner')THEN CREATE POLICY loyalty503_owner ON saas.loyalty503_functions TO celebix_saas_owner USING(true)WITH CHECK(true);END IF;END $d$;
REVOKE ALL ON saas.loyalty503_functions FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
DO $d$DECLARE r record;BEGIN FOR r IN SELECT * FROM saas.loyalty503_functions WHERE patched_hash IS NOT NULL LOOP IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY503_FUNCTION_DRIFT:%',r.identity;END IF;END LOOP;END $d$;

CREATE OR REPLACE FUNCTION saas.loyalty503_patch(p_signature text,p_changes jsonb)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE d text;original text;change jsonb;anchor text;BEGIN
 IF EXISTS(SELECT 1 FROM saas.loyalty503_functions WHERE identity=p_signature AND patched_hash IS NOT NULL)THEN RETURN;END IF;
 original:=pg_get_functiondef(p_signature::regprocedure);d:=original;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes)LOOP anchor:=change->>0;IF anchor=''OR(length(d)-length(replace(d,anchor,'')))/length(anchor)<>coalesce((change->>2)::integer,1)THEN RAISE EXCEPTION 'LOYALTY503_PATCH_ANCHOR:%:%',p_signature,anchor;END IF;d:=replace(d,anchor,change->>1);END LOOP;
 EXECUTE d;
 INSERT INTO saas.loyalty503_functions VALUES(p_signature,original,encode(sha256(convert_to(pg_get_functiondef(p_signature::regprocedure),'UTF8')),'hex'))ON CONFLICT(identity)DO UPDATE SET patched_hash=excluded.patched_hash;
END $f$;
CREATE OR REPLACE FUNCTION saas.loyalty_pos_after_v1(s uuid,p_sale uuid,kind text,operation uuid,n timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sale saas.in_store_sales;b saas.loyalty_pos_redemptions;q record;response record;order_id uuid;op uuid;fingerprint text;BEGIN
 SELECT * INTO b FROM saas.loyalty_pos_redemptions WHERE store_id=s AND loyalty_pos_redemptions.sale_id=loyalty_pos_after_v1.p_sale AND status IN('ready','reserved')FOR UPDATE;IF NOT FOUND THEN RETURN;END IF;
 SELECT * INTO STRICT sale FROM saas.in_store_sales WHERE store_id=s AND id=p_sale;
 order_id:=saas.inventory_deterministic_uuid('in-store-order',s::text||':'||p_sale::text);
 IF kind='prepare'AND sale.status='payment_pending'AND b.status='ready'THEN
  SELECT * INTO q FROM saas.in_store_quote_v4(s,sale.owner_membership_id,n,sale.intent,sale.items);
  IF q.outcome<>'found'OR(q.result_payload->>'totalCents')::bigint<>sale.total_cents OR q.result_payload->'items'<>sale.items THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
  op:=saas.inventory_deterministic_uuid('loyalty-pos-reserve',operation::text);
  fingerprint:=saas.promotion_operation_fingerprint_v2('reserve',s,jsonb_build_object('sourceKind','offline_checkout','sourceReference',order_id::text,'evaluatorContext',q.result_payload->'loyaltyContext'));
  SELECT * INTO response FROM saas.promotion_reserve_group_v1(s,op,fingerprint,'offline_checkout',order_id::text,q.result_payload->'loyaltyContext',n);
  IF response.outcome NOT IN('reserved','operation_replayed')THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
  UPDATE saas.loyalty_pos_redemptions SET status='reserved',reservation_group_id=(response.result_payload->>'reservationGroupId')::uuid,evaluator_context=q.result_payload->'loyaltyContext',evaluation=q.result_payload->'loyaltyEvaluation',updated_at=n WHERE id=b.id;
 ELSIF kind='complete'AND sale.status='completed'AND b.status='reserved'THEN
  UPDATE saas.order_items item SET discount_cents=allocation.discount_cents,line_total_cents=allocation.net_cents FROM saas.in_store_discount_allocations allocation WHERE allocation.store_id=s AND allocation.sale_id=p_sale AND item.store_id=allocation.store_id AND item.id=allocation.order_item_id;
  op:=saas.inventory_deterministic_uuid('loyalty-pos-commit',operation::text);fingerprint:=saas.promotion_operation_fingerprint_v2('commit',s,jsonb_build_object('reservationGroupId',b.reservation_group_id,'orderId',sale.order_id));
  SELECT * INTO response FROM saas.promotion_commit_reservation_group_v1(s,op,fingerprint,b.reservation_group_id,sale.order_id,n);
  IF response.outcome NOT IN('committed','operation_replayed')THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
  UPDATE saas.loyalty_pos_redemptions SET status='used',updated_at=n WHERE id=b.id;
 ELSIF sale.status='cancelled'THEN
  IF b.reservation_group_id IS NOT NULL THEN
   op:=saas.inventory_deterministic_uuid('loyalty-pos-release',operation::text);fingerprint:=saas.promotion_operation_fingerprint_v2('release',s,jsonb_build_object('reservationGroupId',b.reservation_group_id));
   SELECT * INTO response FROM saas.promotion_release_reservation_group_v1(s,op,fingerprint,b.reservation_group_id,n);
   IF response.outcome NOT IN('released','operation_replayed')THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
  END IF;
  UPDATE saas.loyalty_pos_redemptions SET status='released',updated_at=n WHERE id=b.id;
 END IF;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_available_stock_v1(s uuid,variant uuid,n timestamptz)RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT saas.storefront_available_stock(s,variant,n,NULL)+coalesce((SELECT sum(r.quantity)FROM saas.in_store_inventory_reservations r JOIN saas.loyalty_pos_redemptions p ON p.store_id=r.store_id AND p.sale_id=r.sale_id WHERE r.store_id=s AND r.variant_id=variant AND r.status='held'AND p.status IN('ready','reserved')AND current_setting('saas.loyalty.pos_sale',true)=s::text||':'||r.sale_id::text),0)
$f$;

DO $pos_patch$BEGIN
 PERFORM saas.loyalty503_patch('saas.promotion_evaluator_context_valid(uuid,jsonb)',jsonb_build_array(jsonb_build_array('p_context->>''salesChannel'' NOT IN (''storefront'',''quick_order'')','p_context->>''salesChannel'' NOT IN (''storefront'',''quick_order'',''in_store'')')));
 PERFORM saas.loyalty503_patch('saas.promotion_evaluator_candidate_facts_unfiltered_v1(uuid,jsonb,timestamp with time zone,jsonb)',jsonb_build_array(jsonb_build_array('saas.storefront_available_stock(p_store_id,variant.id,p_now,NULL)','saas.loyalty_pos_available_stock_v1(p_store_id,variant.id,p_now)')));
 PERFORM saas.loyalty503_patch('saas.in_store_quote_v4(uuid,uuid,timestamp with time zone,jsonb,jsonb)',jsonb_build_array(jsonb_build_array('RETURN QUERY SELECT ''found'',r.result_payload||jsonb_build_object(', 'RETURN QUERY SELECT ''found'',saas.loyalty_pos_quote_v1(p_store,p_member,p_now,p_intent,r.result_payload||jsonb_build_object('),jsonb_build_array('''paymentMethod'',method,''dueDate'',due);','''paymentMethod'',method,''dueDate'',due));')));
 PERFORM saas.loyalty503_patch('saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',jsonb_build_array(
  jsonb_build_array(' IF p_kind IN(''create'',''update'',''prepare'') THEN', ' PERFORM set_config(''saas.loyalty.pos_sale'',p_store_id::text||'':''||p_sale_id::text,true);'||E'\n'||' IF p_kind IN(''create'',''update'',''prepare'') THEN'),
  jsonb_build_array('(p_args->>''expectedTotalCents'')::numeric<=0 OR (quote.result_payload->>''totalCents'')::bigint<=0','(p_args->>''expectedTotalCents'')::numeric<0 OR (quote.result_payload->>''totalCents'')::bigint<0 OR (quote.result_payload->>''totalCents'')::bigint=0 AND NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions lp JOIN saas.loyalty_rewards lr ON lr.store_id=lp.store_id AND lr.id=lp.reward_id WHERE lp.store_id=p_store_id AND lp.sale_id=p_sale_id AND lp.status=''ready'')'),
  jsonb_build_array(' projected:=jsonb_build_object(''sale'',saas.in_store_sales_projection_v4(p_store_id,p_sale_id),''replayed'',false,''priceChanged'',changed);',' PERFORM saas.loyalty_pos_after_v1(p_store_id,p_sale_id,p_kind,p_operation_id,p_now);'||E'\n'||' projected:=jsonb_build_object(''sale'',saas.in_store_sales_projection_v4(p_store_id,p_sale_id),''replayed'',false,''priceChanged'',changed);'),
  jsonb_build_array('EXCEPTION WHEN SQLSTATE ''P0246'' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;','EXCEPTION WHEN SQLSTATE ''P0503''THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;WHEN SQLSTATE ''P0246'' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;')
 ));
 PERFORM saas.loyalty503_patch('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)',jsonb_build_array(jsonb_build_array('WHERE due.status=''reserved'' AND due.expires_at<=p_now','WHERE due.status=''reserved'' AND due.expires_at<=p_now AND NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions lp WHERE lp.store_id=due.store_id AND lp.reservation_group_id=due.reservation_group_id AND lp.status=''reserved'')')));
 PERFORM saas.loyalty503_patch('saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)',jsonb_build_array(jsonb_build_array('p_now>=v_expires_at','(p_now>=v_expires_at AND NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions lp JOIN saas.in_store_sales sale ON sale.store_id=lp.store_id AND sale.id=lp.sale_id WHERE lp.store_id=p_store_id AND lp.reservation_group_id=p_reservation_group_id AND lp.status=''reserved''AND sale.status=''completed''AND sale.order_id=p_order_id))')));
 PERFORM saas.loyalty503_patch('saas.promotion_commit_integrity_valid_v1(uuid,uuid)',jsonb_build_array(jsonb_build_array('v_operation.created_at>=v_group_expires','(v_operation.created_at>=v_group_expires AND NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions lp JOIN saas.in_store_sales sale ON sale.store_id=lp.store_id AND sale.id=lp.sale_id WHERE lp.store_id=p_store_id AND lp.reservation_group_id=v_group_id AND lp.status IN(''reserved'',''used'')AND sale.status=''completed''AND sale.order_id=v_order.id))')));
END $pos_patch$;

ALTER TABLE saas.in_store_staff_grants ADD COLUMN IF NOT EXISTS can_manage_loyalty boolean NOT NULL DEFAULT false;
DO $capture$DECLARE r record;BEGIN FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('loyalty_pos_authority_error_v1','loyalty_pos_bind_v1','loyalty_pos_reward_v1','loyalty_reward_held_v1','loyalty_code_allowed_v1')LOOP INSERT INTO saas.loyalty503_functions(identity,definition)VALUES('saas.'||r.oid::regprocedure::text,pg_get_functiondef(r.oid))ON CONFLICT DO NOTHING;END LOOP;END $capture$;
CREATE OR REPLACE FUNCTION saas.loyalty_pos_authority_error_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE code ALIAS FOR $5;version ALIAS FOR $6;role_name text;err text;BEGIN
 SELECT role INTO role_name FROM saas.platform_authorized_memberships WHERE store_id=s AND id=m AND principal_id=p AND status='active';
 IF role_name='cashier'THEN
  err:=saas.merchant_action_authority_error(s,p,m,pl,code,version,n,'orders','in_store.read');IF err IS NOT NULL THEN RETURN err;END IF;
  IF NOT saas.commercial_plan_has_capability(pl,'cashier')OR NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=pl AND feature_key='promotions'AND enabled)THEN RETURN 'feature_not_enabled';END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=s AND membership_id=m AND enabled AND can_manage_loyalty)THEN RETURN 'membership_denied';END IF;
  RETURN NULL;
 END IF;
 RETURN saas.promotion_authority_error(s,p,m,pl,code,version,n,'promotions.read');
END $f$;

CREATE TABLE IF NOT EXISTS saas.loyalty_pos_redemptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,sale_id uuid NOT NULL,reward_id uuid NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,status text NOT NULL CHECK(status IN('ready','reserved','used','released')),evaluator_context jsonb,evaluation jsonb,reservation_group_id uuid,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,FOREIGN KEY(store_id,sale_id)REFERENCES saas.in_store_sales(store_id,id),FOREIGN KEY(store_id,reward_id)REFERENCES saas.loyalty_rewards(store_id,id),FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_pos_sale_active ON saas.loyalty_pos_redemptions(store_id,sale_id)WHERE status IN('ready','reserved','used');
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_pos_reward_active ON saas.loyalty_pos_redemptions(store_id,reward_id)WHERE status IN('ready','reserved','used');
ALTER TABLE saas.loyalty_pos_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.loyalty_pos_redemptions FORCE ROW LEVEL SECURITY;
DO $d$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='saas.loyalty_pos_redemptions'::regclass AND polname='loyalty_pos_owner')THEN CREATE POLICY loyalty_pos_owner ON saas.loyalty_pos_redemptions TO celebix_saas_owner USING(true)WITH CHECK(true);END IF;END $d$;
REVOKE ALL ON saas.loyalty_pos_redemptions FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_bind_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz,sale uuid,token text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE code ALIAS FOR $5;version ALIAS FOR $6;a saas.loyalty_pos_approvals;current_sale saas.in_store_sales;customer saas.customers;rewards jsonb;err text;BEGIN
 err:=saas.loyalty_pos_authority_error_v1(s,p,m,pl,code,version,n);IF err IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE=err;END IF;
 IF sale IS NULL OR token IS NULL OR token!~'^[a-f0-9]{64}$'THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||s::text,0));
 SELECT * INTO current_sale FROM saas.in_store_sales WHERE store_id=s AND id=sale FOR UPDATE;
 IF current_sale.id IS NULL OR current_sale.status NOT IN('draft','held')OR(current_sale.owner_membership_id<>m AND NOT saas.in_store_is_manager(s,m))THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_transition';END IF;
 SELECT x.* INTO a FROM saas.loyalty_pos_approvals x JOIN saas.storefront_accounts account ON account.store_id=x.store_id AND account.id=x.account_id AND account.customer_id=x.customer_id AND account.status='active'AND account.phone_verified_at IS NOT NULL WHERE x.store_id=s AND x.token_digest=encode(sha256(convert_to(token,'UTF8')),'hex')AND x.created_at<=n AND x.expires_at>n FOR UPDATE OF x;
 IF a.id IS NULL OR a.consumed_at IS NOT NULL AND a.sale_id IS DISTINCT FROM sale OR current_sale.customer_id IS NOT NULL AND current_sale.customer_id<>a.customer_id THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='membership_denied';END IF;
 IF EXISTS(SELECT 1 FROM saas.loyalty_pos_approvals WHERE store_id=s AND sale_id=sale AND consumed_at IS NOT NULL AND account_id<>a.account_id)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='approval_invalid';END IF;
 SELECT * INTO STRICT customer FROM saas.customers WHERE store_id=s AND id=a.customer_id AND status='active'AND archived_at IS NULL;
 IF a.consumed_at IS NULL THEN
  UPDATE saas.loyalty_pos_approvals SET consumed_at=n,sale_id=sale WHERE id=a.id;
  UPDATE saas.in_store_sales target SET customer_id=a.customer_id,customer_snapshot=saas.in_store_pos_customer_projection(customer),intent=jsonb_set(jsonb_set(target.intent,'{customerId}',to_jsonb(a.customer_id)),'{customerName}',to_jsonb(customer.first_name||' '||customer.last_name)),version=target.version+1,updated_at=n WHERE target.store_id=s AND target.id=sale;
 END IF;
 rewards:=saas.loyalty_available_rewards_v1(s,a.account_id,n);
 RETURN jsonb_build_object('customerId',a.customer_id,'approvalId',a.id,'expiresAt',saas.loyalty_iso_v1(a.expires_at),'availableRewards',rewards);
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_reward_held_v1(s uuid,c uuid,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations r LEFT JOIN saas.storefront_hosted_checkout_sessions h ON r.source_kind='hosted_checkout'AND h.store_id=r.store_id AND h.id::text=r.source_reference WHERE r.store_id=s AND r.code_id=c AND((r.status='reserved'AND r.expires_at>n)OR(r.status<>'committed'AND h.id IS NOT NULL AND h.terminal_at IS NULL AND h.status IN('active','provider_ready','processing'))))
 OR EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions p JOIN saas.loyalty_rewards r ON r.store_id=p.store_id AND r.id=p.reward_id JOIN saas.in_store_sales sale ON sale.store_id=p.store_id AND sale.id=p.sale_id WHERE p.store_id=s AND r.code_id=c AND p.status='reserved'AND sale.status IN('payment_pending','payment_received'))
$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_code_allowed_v1(s uuid,code_id uuid,ctx jsonb,n timestamptz)RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.loyalty_rewards;own_pos boolean;verified_pos boolean;BEGIN
 SELECT x.* INTO r FROM saas.loyalty_rewards x WHERE x.store_id=s AND x.code_id=loyalty_code_allowed_v1.code_id;IF NOT FOUND THEN RETURN true;END IF;
 SELECT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions p JOIN saas.in_store_sales sale ON sale.store_id=p.store_id AND sale.id=p.sale_id WHERE p.store_id=s AND p.reward_id=r.id AND p.status='reserved'AND sale.status IN('payment_pending','payment_received')AND current_setting('saas.loyalty.pos_sale',true)=s::text||':'||p.sale_id::text AND ctx->>'salesChannel'='in_store')INTO own_pos;
 SELECT EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions p JOIN saas.loyalty_pos_approvals approval ON approval.store_id=p.store_id AND approval.sale_id=p.sale_id AND approval.account_id=p.account_id AND approval.customer_id=p.customer_id AND approval.consumed_at IS NOT NULL AND approval.consumed_at<approval.expires_at WHERE p.store_id=s AND p.reward_id=r.id AND p.account_id=r.account_id AND p.customer_id=r.customer_id AND p.status IN('ready','reserved')AND current_setting('saas.loyalty.pos_sale',true)=s::text||':'||p.sale_id::text AND ctx->>'salesChannel'='in_store')INTO verified_pos;
 RETURN(verified_pos OR saas.loyalty_checkout_proof_v1(s,r.account_id,r.customer_id,r.code,n))AND r.status IN('available','reserved')AND r.customer_id::text=ctx->>'customerId'AND(r.expires_at IS NULL OR n<r.expires_at OR own_pos)AND EXISTS(SELECT 1 FROM saas.storefront_accounts a WHERE a.store_id=s AND a.id=r.account_id AND a.customer_id=r.customer_id AND a.status='active'AND a.phone_verified_at IS NOT NULL)AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions d WHERE d.store_id=s AND d.code_id=r.code_id)AND(own_pos OR NOT saas.loyalty_reward_held_v1(s,r.code_id,n))AND(own_pos OR NOT EXISTS(SELECT 1 FROM saas.loyalty_members lm WHERE lm.store_id=s AND lm.program_id=r.program_id AND lm.account_id=r.account_id AND lm.balance<0));
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_quote_v1(s uuid,m uuid,n timestamptz,intent jsonb,base jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sale uuid;binding saas.loyalty_pos_redemptions;r saas.loyalty_rewards;ctx jsonb;evaluated jsonb;lines jsonb;item jsonb;discount bigint;parts jsonb;amount bigint;shipping_method uuid;BEGIN
 IF current_setting('saas.loyalty.pos_sale',true)NOT LIKE s::text||':%'THEN RETURN base;END IF;
 sale:=split_part(current_setting('saas.loyalty.pos_sale',true),':',2)::uuid;
 SELECT * INTO binding FROM saas.loyalty_pos_redemptions WHERE store_id=s AND sale_id=sale AND status IN('ready','reserved');IF NOT FOUND THEN RETURN base;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.loyalty_pos_approvals a JOIN saas.storefront_accounts account ON account.store_id=a.store_id AND account.id=a.account_id AND account.customer_id=a.customer_id AND account.status='active'AND account.phone_verified_at IS NOT NULL WHERE a.store_id=s AND a.sale_id=sale AND a.account_id=binding.account_id AND a.customer_id=(intent->>'customerId')::uuid AND a.consumed_at IS NOT NULL AND a.consumed_at<a.expires_at)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='membership_denied';END IF;
 IF intent->'discount'<>'null'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(base->'items')i WHERE i->>'unitPriceOverrideCents'IS NOT NULL)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
 SELECT * INTO STRICT r FROM saas.loyalty_rewards WHERE store_id=s AND id=binding.reward_id AND customer_id=binding.customer_id;
 SELECT id INTO shipping_method FROM saas.merchant_admin_records WHERE store_id=s AND record_kind='shipping_setting'AND status='active'AND archived_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',saas.inventory_deterministic_uuid('in-store-order-item',sale::text||':'||(i->>'variantId')),'position',ordinal-1,'productId',i->'productId','variantId',i->'variantId','quantity',i->'quantity','unitPriceMinor',i->'unitPriceCents','unitCostMinor',NULL,'currency','TRY','categoryIds','[]'::jsonb,'brandId',NULL,'collectionIds','[]'::jsonb)ORDER BY ordinal),'[]')INTO lines FROM jsonb_array_elements(base->'items')WITH ORDINALITY e(i,ordinal);
 ctx:=jsonb_build_object('storeId',s,'customerId',binding.customer_id,'paidOrderCount',0,'customerSegmentIds','[]'::jsonb,'customerTagIds','[]'::jsonb,'cartLines',lines,'shippingMethodId',shipping_method,'paymentMethodId',NULL,'shippingBeforeDiscountMinor',base->'shippingCents','currency','TRY','storeLocalTime',saas.loyalty_iso_v1(n),'salesChannel','in_store','submittedCodes',jsonb_build_array(r.code),'abandonedCart',NULL);
 evaluated:=saas.promotion_evaluate_v1(s,ctx,n);
 IF evaluated->>'merchantExplanation'<>'evaluated'OR jsonb_array_length(evaluated->'appliedPromotions')<>1 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(evaluated->'appliedPromotions')a WHERE a->>'normalizedCode'=r.code)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='reward_unavailable';END IF;
 SELECT coalesce(jsonb_agg(i||jsonb_build_object('allocatedDiscountCents',coalesce((SELECT sum((effect->>'discountMinor')::bigint)FROM jsonb_array_elements(evaluated->'lineEffects')effect WHERE effect->>'lineId'=saas.inventory_deterministic_uuid('in-store-order-item',sale::text||':'||(i->>'variantId'))::text),0),'lineNetCents',(i->>'lineSubtotalCents')::bigint-coalesce((SELECT sum((effect->>'discountMinor')::bigint)FROM jsonb_array_elements(evaluated->'lineEffects')effect WHERE effect->>'lineId'=saas.inventory_deterministic_uuid('in-store-order-item',sale::text||':'||(i->>'variantId'))::text),0))ORDER BY ordinal),'[]')INTO lines FROM jsonb_array_elements(base->'items')WITH ORDINALITY e(i,ordinal);
 parts:=base->'paymentParts';amount:=coalesce((base->>'initialCollectionCents')::bigint,0);
 IF jsonb_array_length(parts)=1 AND amount=(base->>'totalCents')::bigint THEN IF(evaluated->>'grandTotalMinor')::bigint=0 THEN parts:='[]';amount:=0;ELSE parts:=jsonb_set(parts,'{0,amountCents}',evaluated->'grandTotalMinor');amount:=(evaluated->>'grandTotalMinor')::bigint;END IF;END IF;
 IF amount>(evaluated->>'grandTotalMinor')::bigint THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_input';END IF;
 RETURN base||jsonb_build_object('items',lines,'discountCents',evaluated->'discountTotalMinor','totalCents',evaluated->'grandTotalMinor','paymentParts',parts,'initialCollectionCents',amount,'loyaltyContext',ctx,'loyaltyEvaluation',evaluated);
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_reward_v1(s uuid,p uuid,m uuid,pl uuid,c text,v bigint,n timestamptz,op uuid,payload jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE code ALIAS FOR $5;version ALIAS FOR $6;operation ALIAS FOR $8;sale saas.in_store_sales;r saas.loyalty_rewards;approval saas.loyalty_pos_approvals;intent jsonb;items jsonb;item jsonb;binding saas.loyalty_pos_redemptions;response record;err text;fingerprint text;BEGIN
 err:=saas.loyalty_pos_authority_error_v1(s,p,m,pl,code,version,n);IF err IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE=err;END IF;
 IF saas.catalog_onboarding_json_exact(payload,ARRAY['saleId','rewardId','expectedVersion'],ARRAY[]::text[])IS DISTINCT FROM true OR NOT saas.promotion_json_uuid(payload->'saleId')OR(payload->'rewardId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(payload->'rewardId'))OR NOT saas.promotion_json_integer(payload->'expectedVersion',1,9007199254740990)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||operation::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||s::text,0));
 SELECT * INTO sale FROM saas.in_store_sales WHERE store_id=s AND id=(payload->>'saleId')::uuid FOR UPDATE;
 IF sale.id IS NULL OR sale.status NOT IN('draft','held')OR(sale.owner_membership_id<>m AND NOT saas.in_store_is_manager(s,m))THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_transition';END IF;
 IF sale.version<>(payload->>'expectedVersion')::bigint THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='version_conflict';END IF;
 IF payload->'rewardId'='null'::jsonb THEN
  IF EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions WHERE store_id=s AND sale_id=sale.id AND status='reserved')THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='invalid_transition';END IF;
  UPDATE saas.loyalty_pos_redemptions SET status='released',updated_at=n WHERE store_id=s AND sale_id=sale.id AND status='ready';
  intent:=jsonb_set(sale.intent,'{paymentParts}','[]');items:=intent->'items';
 ELSE
 SELECT * INTO approval FROM saas.loyalty_pos_approvals WHERE store_id=s AND sale_id=sale.id AND consumed_at IS NOT NULL ORDER BY consumed_at DESC LIMIT 1;
 PERFORM code.id FROM saas.promotion_codes code JOIN saas.loyalty_rewards reward ON reward.store_id=code.store_id AND reward.code_id=code.id WHERE reward.store_id=s AND reward.id=(payload->>'rewardId')::uuid FOR UPDATE OF code;
 SELECT * INTO r FROM saas.loyalty_rewards WHERE store_id=s AND id=(payload->>'rewardId')::uuid AND account_id=approval.account_id AND customer_id=sale.customer_id FOR UPDATE;
 IF r.id IS NULL OR r.status<>'available'OR r.expires_at<=n OR saas.loyalty_reward_held_v1(s,r.code_id,n)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='reward_unavailable';END IF;
 IF sale.intent->'discount'<>'null'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(sale.intent->'items')i WHERE i->>'unitPriceOverrideCents'IS NOT NULL)THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
 UPDATE saas.loyalty_pos_redemptions SET status='released',updated_at=n WHERE store_id=s AND sale_id=sale.id AND status='ready';
 INSERT INTO saas.loyalty_pos_redemptions(store_id,sale_id,reward_id,account_id,customer_id,status,created_at,updated_at)VALUES(s,sale.id,r.id,r.account_id,r.customer_id,'ready',n,n);
 intent:=jsonb_set(sale.intent,'{paymentParts}','[]');items:=intent->'items';
 IF r.reward->>'kind'='gift'THEN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items)i WHERE i->>'variantId'=r.reward->>'variantId')THEN items:=items||jsonb_build_array(jsonb_build_object('variantId',r.reward->'variantId','quantity',r.reward->'quantity','unitPriceOverrideCents',NULL));
  ELSE SELECT jsonb_agg(CASE WHEN i->>'variantId'=r.reward->>'variantId'THEN jsonb_set(i,'{quantity}',to_jsonb(greatest((i->>'quantity')::bigint,(r.reward->>'quantity')::bigint)))ELSE i END ORDER BY ordinal)INTO items FROM jsonb_array_elements(items)WITH ORDINALITY e(i,ordinal);END IF;
 END IF;
 END IF;
 intent:=jsonb_set(intent,'{items}',items);fingerprint:=encode(sha256(convert_to(jsonb_build_object('kind','loyalty-pos-reward','operation',operation,'payload',payload)::text,'UTF8')),'hex');
 SELECT * INTO response FROM saas.in_store_sales_mutate_v4(s,p,m,pl,code,version,n,operation,fingerprint,sale.id,sale.version,'update',jsonb_build_object('intent',intent));
 IF response.outcome NOT IN('committed','operation_replayed')THEN RAISE EXCEPTION USING ERRCODE='P0503',MESSAGE='conditions_not_met';END IF;
 RETURN response.result_payload;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_pos_projection_v1(s uuid,sale uuid,base jsonb)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
SELECT CASE WHEN base IS NULL THEN NULL ELSE base||coalesce((SELECT jsonb_build_object('loyalty',jsonb_build_object('rewardId',p.reward_id,'label',program.name,'shippingDiscountCents',(base#>>'{totals,discountCents}')::bigint-coalesce((SELECT sum((i->>'allocatedDiscountCents')::bigint)FROM jsonb_array_elements(base->'items')i),0)))FROM saas.loyalty_pos_redemptions p JOIN saas.loyalty_rewards r ON r.store_id=p.store_id AND r.id=p.reward_id JOIN saas.loyalty_programs program ON program.store_id=r.store_id AND program.id=r.program_id WHERE p.store_id=s AND p.sale_id=sale AND p.status IN('ready','reserved','used')LIMIT 1),'{}'::jsonb)END
$f$;
DO $projection$BEGIN
 PERFORM saas.loyalty503_patch('saas.in_store_sales_projection_v4(uuid,uuid)',jsonb_build_array(jsonb_build_array(' SELECT saas.in_store_projection_v4_value(', ' SELECT saas.loyalty_pos_projection_v1(p_store,p_sale,saas.in_store_projection_v4_value('),jsonb_build_array(' FROM saas.in_store_sales s WHERE s.store_id=p_store AND s.id=p_sale',') FROM saas.in_store_sales s WHERE s.store_id=p_store AND s.id=p_sale')));
END $projection$;

CREATE OR REPLACE FUNCTION saas.in_store_sales_bootstrap_v5(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT r.outcome,CASE WHEN r.outcome='found'THEN jsonb_set(r.result_payload,'{permissions,canManageLoyalty}',to_jsonb(saas.loyalty_pos_authority_error_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now)IS NULL))ELSE r.result_payload END
FROM saas.in_store_sales_bootstrap_v4(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now)r
$f$;

CREATE OR REPLACE FUNCTION saas.in_store_staff_projection_v9(p_store uuid,p_member uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT saas.in_store_staff_projection_v8(p_store,p_member)||jsonb_build_object('canManageLoyalty',coalesce((SELECT can_manage_loyalty FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false))
$f$;
DO $staff$DECLARE d text;change jsonb;anchor text;BEGIN
 IF to_regprocedure('saas.in_store_sales_list_staff_v9(uuid,uuid,uuid,uuid,text,bigint,timestamptz)')IS NULL THEN
  d:=pg_get_functiondef('saas.in_store_sales_list_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz)'::regprocedure);EXECUTE replace(d,'_v8','_v9');
  d:=replace(pg_get_functiondef('saas.in_store_sales_recover_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)'::regprocedure),'_v8','_v9');anchor:='prior.result_payload||jsonb_build_object(''canViewOverview''';IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'LOYALTY503_STAFF_RECOVER_ANCHOR';END IF;EXECUTE replace(d,anchor,'prior.result_payload||jsonb_build_object(''canManageLoyalty'',coalesce((prior.result_payload->>''canManageLoyalty'')::boolean,false),''canViewOverview''');
  d:=replace(pg_get_functiondef('saas.in_store_sales_set_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer,boolean,boolean)'::regprocedure),'_v8','_v9');
  FOR change IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   jsonb_build_array('p_can_view_overview boolean)','p_can_view_overview boolean, p_can_manage_loyalty boolean)'),
   jsonb_build_array('p_can_view_overview IS NULL','p_can_view_overview IS NULL OR p_can_manage_loyalty IS NULL'),
   jsonb_build_array('(p_can_manage_accounting OR p_commission_enabled OR p_can_manage_orders OR p_can_view_overview)','(p_can_manage_accounting OR p_commission_enabled OR p_can_manage_orders OR p_can_view_overview OR p_can_manage_loyalty)'),
   jsonb_build_array('can_manage_orders,can_view_overview) VALUES','can_manage_orders,can_view_overview,can_manage_loyalty) VALUES'),
   jsonb_build_array('p_can_manage_orders,p_can_view_overview)','p_can_manage_orders,p_can_view_overview,p_can_manage_loyalty)'),
   jsonb_build_array('DO UPDATE SET can_view_overview=excluded.can_view_overview','DO UPDATE SET can_manage_loyalty=excluded.can_manage_loyalty,can_view_overview=excluded.can_view_overview')
  ))LOOP anchor:=change->>0;IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'LOYALTY503_STAFF_ANCHOR:%',anchor;END IF;d:=replace(d,anchor,change->>1);END LOOP;EXECUTE d;
 END IF;
END $staff$;

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_customer_v1(s uuid,n timestamptz,candidates jsonb)RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT customer.id FROM saas.storefront_account_sessions session
 JOIN saas.storefront_accounts account ON account.store_id=session.store_id AND account.id=session.account_id AND account.status='active'AND account.phone_verified_at IS NOT NULL
 JOIN saas.customers customer ON customer.store_id=account.store_id AND customer.id=account.customer_id AND customer.status='active'AND customer.archived_at IS NULL
 JOIN jsonb_array_elements(candidates)candidate ON candidate->>'keyId'=session.key_id AND candidate->>'digest'=session.credential_digest
 WHERE session.store_id=s AND session.session_kind='full'AND session.revoked_at IS NULL AND session.created_at<=n AND session.idle_expires_at>n AND session.absolute_expires_at>n ORDER BY session.created_at DESC,session.id LIMIT 1
$f$;
DO $identity_quote$DECLARE signature text;anchor text;BEGIN
 FOREACH signature IN ARRAY ARRAY['saas.merchant_checkout_quote_scope_233(uuid,text,jsonb,jsonb,timestamp with time zone)']LOOP
  anchor:=CASE WHEN signature LIKE '%public_checkout_quote%'THEN '  IF p_kind=''cart'' AND v_customer_id IS NOT NULL THEN'ELSE ' structural_digest:=saas.merchant_checkout_quote_structural_digest_233(context.trace);'END;
  PERFORM saas.loyalty503_patch(signature,jsonb_build_array(jsonb_build_array(anchor,CASE WHEN signature LIKE '%public_checkout_quote%'THEN '  v_customer_id:=coalesce(saas.loyalty_checkout_customer_v1(v_store_id,p_now,p_customer_credentials),v_customer_id);'ELSE ' customer_id:=coalesce(saas.loyalty_checkout_customer_v1(p_store_id,p_now,p_customer_credentials),customer_id);'END||E'\n'||anchor)));
 END LOOP;
END $identity_quote$;
DO $zero_checkout$DECLARE signature text;BEGIN
 signature:='saas.public_checkout_quote_v2(text,timestamp with time zone,text,jsonb,jsonb,text[],jsonb)';
 PERFORM saas.loyalty503_patch(signature,jsonb_build_array(
  jsonb_build_array('  SELECT credential.customer_id INTO v_customer_id','  PERFORM saas.loyalty_checkout_scope_v1(p_hostname,p_now,p_kind,p_credentials,NULL,NULL,NULL,to_jsonb(p_normalized_codes));PERFORM set_config(''saas.loyalty.account_candidates'',p_customer_credentials::text,true);'||E'\n'||'  SELECT credential.customer_id INTO v_customer_id'),
  jsonb_build_array('  IF p_kind=''cart'' AND v_customer_id IS NOT NULL THEN','  v_customer_id:=coalesce(saas.loyalty_checkout_customer_v1(v_store_id,p_now,p_customer_credentials),v_customer_id);'||E'\n'||'  IF p_kind=''cart'' AND v_customer_id IS NOT NULL THEN'),
  jsonb_build_array('OR pg_catalog.jsonb_array_length(v_payments)=0','OR pg_catalog.jsonb_array_length(v_payments)=0 AND NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards lr WHERE lr.store_id=v_store_id AND lr.code=ANY(p_normalized_codes))'),
  jsonb_build_array('IF COALESCE((v_cart_payload->>''checkoutReady'')::boolean,false) IS DISTINCT FROM true','IF COALESCE((v_cart_payload->>''checkoutReady'')::boolean,false) IS DISTINCT FROM true AND NOT(v_cart_payload->>''checkoutBlocker''=''payment_unavailable''AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cart_payload->''items'')i WHERE i->>''available''IS DISTINCT FROM ''true'')AND EXISTS(SELECT 1 FROM saas.loyalty_rewards lr WHERE lr.store_id=v_store_id AND lr.code=ANY(p_normalized_codes)))'),
  jsonb_build_array('  v_public_quote:=pg_catalog.jsonb_build_object(',
  '  IF v_grand_total=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_public_applied) a JOIN saas.loyalty_rewards r ON r.store_id=v_store_id AND r.code=a->>''normalizedCode'' WHERE r.customer_id=v_customer_id)THEN v_payments:=jsonb_build_array(jsonb_build_object(''kind'',''reward'',''label'',''Ödül kullanımı'',''instructions'',''Bu sipariş için ödeme alınmaz.''));v_public_cart:=v_public_cart||jsonb_build_object(''checkoutReady'',true,''checkoutBlocker'',NULL);ELSIF jsonb_array_length(v_payments)=0 THEN RETURN QUERY SELECT ''payment_unavailable'',NULL::jsonb;RETURN;END IF;'||E'\n'||'  v_public_quote:=pg_catalog.jsonb_build_object(')));
 signature:='saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])';
 PERFORM saas.loyalty503_patch(signature,jsonb_build_array(
  jsonb_build_array('  PERFORM credential.id','  IF saas.loyalty_checkout_enter_v1(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,to_jsonb(p_normalized_codes),NULL,p_customer_credentials)IS NULL THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb;RETURN;END IF;'||E'\n'||'  PERFORM credential.id'),
  jsonb_build_array('p_payment_kind NOT IN (''bank_transfer'',''cash_on_delivery'')','p_payment_kind NOT IN (''bank_transfer'',''cash_on_delivery'',''reward'')'),
  jsonb_build_array('IF COALESCE((v_cart_payload->>''checkoutReady'')::boolean,false) IS DISTINCT FROM true','IF COALESCE((v_cart_payload->>''checkoutReady'')::boolean,false) IS DISTINCT FROM true AND NOT(p_payment_kind=''reward''AND v_cart_payload->>''checkoutBlocker''=''payment_unavailable''AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cart_payload->''items'')i WHERE i->>''available''IS DISTINCT FROM ''true''))'),
  jsonb_build_array('  SELECT method.* INTO v_payment','  IF p_payment_kind=''reward''THEN v_payment.kind:=''reward'';v_payment.label:=''Ödül kullanımı'';v_payment.config:=jsonb_build_object(''instructions'',''Bu sipariş için ödeme alınmaz.'');ELSE'||E'\n'||'  SELECT method.* INTO v_payment'),
  jsonb_build_array('IF NOT FOUND THEN RETURN QUERY SELECT ''payment_unavailable'',NULL::jsonb; RETURN; END IF;','IF NOT FOUND THEN RETURN QUERY SELECT ''payment_unavailable'',NULL::jsonb; RETURN; END IF;END IF;'),
  jsonb_build_array('  IF v_feature_enabled AND v_evaluation_mode=''evaluated'''||E'\n'||'     AND pg_catalog.jsonb_array_length(v_evaluation->''appliedPromotions'')>0 THEN',
   '  IF p_payment_kind=''reward''AND(v_grand_total<>0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_public_applied) a JOIN saas.loyalty_rewards r ON r.store_id=v_store_id AND r.code=a->>''normalizedCode''WHERE r.customer_id=v_customer.id))THEN RETURN QUERY SELECT ''payment_unavailable'',NULL::jsonb;RETURN;END IF;'||E'\n'||'  IF v_feature_enabled AND v_evaluation_mode=''evaluated'''||E'\n'||'     AND pg_catalog.jsonb_array_length(v_evaluation->''appliedPromotions'')>0 THEN'),
  jsonb_build_array('v_grand_total,''pending'',''pending'',','v_grand_total,''pending'',CASE WHEN p_payment_kind=''reward''THEN ''completed''ELSE ''pending''END,'),
  jsonb_build_array('''totalCents'',v_grand_total,''paymentStatus'',''pending'',','''totalCents'',v_grand_total,''paymentStatus'',CASE WHEN p_payment_kind=''reward''THEN ''completed''ELSE ''pending''END,')
 ));
 PERFORM saas.loyalty503_patch('saas.product_tax_order_event()',jsonb_build_array(jsonb_build_array('NEW.payload->>''paymentKind''IN(''bank_transfer'',''cash_on_delivery'')','NEW.payload->>''paymentKind''IN(''bank_transfer'',''cash_on_delivery'',''reward'')')));
 PERFORM saas.loyalty503_patch('saas.product_tax_capture_order(uuid,uuid,text,timestamp with time zone)',jsonb_build_array(jsonb_build_array('greatest(o.total_cents-o.shipping_cents,0)','greatest(o.total_cents-o.shipping_cents+greatest(coalesce((SELECT sum((snapshot.snapshot->>''shippingDiscountMinor'')::bigint)FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store AND snapshot.order_id=p_order),0),coalesce((SELECT (lp.evaluation->>''shippingDiscountTotalMinor'')::bigint FROM saas.loyalty_pos_redemptions lp JOIN saas.in_store_sales sale ON sale.store_id=lp.store_id AND sale.id=lp.sale_id WHERE lp.store_id=p_store AND (sale.order_id=p_order OR current_setting(''saas.loyalty.pos_sale'',true)=lp.store_id::text||'':''||lp.sale_id::text AND p_order=saas.inventory_deterministic_uuid(''in-store-order'',lp.store_id::text||'':''||lp.sale_id::text))AND sale.status IN(''payment_pending'',''payment_received'',''completed'')AND lp.status IN(''reserved'',''used'')LIMIT 1),0)),0)::bigint')));
END $zero_checkout$;

CREATE TABLE IF NOT EXISTS saas.loyalty_checkout_authorizations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,account_id uuid NOT NULL,customer_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('cart','buy_now')),source_id uuid NOT NULL,source_version bigint NOT NULL,
 delivery_digest text NOT NULL,normalized_codes jsonb NOT NULL,proof_token text NOT NULL UNIQUE CHECK(proof_token~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,quote_digest text,hosted_session_id uuid,reservation_group_id uuid,
 FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id),FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id),
 UNIQUE(store_id,hosted_session_id),CHECK(created_at<expires_at),CHECK(reservation_group_id IS NULL OR hosted_session_id IS NOT NULL)
);
ALTER TABLE saas.loyalty_checkout_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.loyalty_checkout_authorizations FORCE ROW LEVEL SECURITY;
DO $policy$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='saas.loyalty_checkout_authorizations'::regclass AND polname='loyalty_checkout_owner')THEN CREATE POLICY loyalty_checkout_owner ON saas.loyalty_checkout_authorizations TO celebix_saas_owner USING(true)WITH CHECK(true);END IF;END $policy$;
REVOKE ALL ON saas.loyalty_checkout_authorizations FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
CREATE OR REPLACE FUNCTION saas.loyalty_checkout_immutable_v1()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='DELETE'OR to_jsonb(NEW)-ARRAY['quote_digest','hosted_session_id','reservation_group_id']<>to_jsonb(OLD)-ARRAY['quote_digest','hosted_session_id','reservation_group_id']
 OR OLD.quote_digest IS NOT NULL AND NEW.quote_digest IS DISTINCT FROM OLD.quote_digest
 OR OLD.hosted_session_id IS NOT NULL AND(NEW.hosted_session_id IS DISTINCT FROM OLD.hosted_session_id OR NEW.reservation_group_id IS DISTINCT FROM OLD.reservation_group_id)
 OR NEW.quote_digest IS NOT NULL AND NEW.quote_digest!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'LOYALTY_CHECKOUT_AUTHORIZATION_IMMUTABLE';END IF;RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS loyalty_checkout_immutable ON saas.loyalty_checkout_authorizations;
CREATE TRIGGER loyalty_checkout_immutable BEFORE UPDATE OR DELETE ON saas.loyalty_checkout_authorizations FOR EACH ROW EXECUTE FUNCTION saas.loyalty_checkout_immutable_v1();

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_session_v1(s uuid,a uuid,c uuid,n timestamptz,candidates jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.storefront_account_sessions session
 JOIN saas.storefront_accounts account ON account.store_id=session.store_id AND account.id=session.account_id
 JOIN jsonb_array_elements(candidates)candidate ON candidate->>'keyId'=session.key_id AND candidate->>'digest'=session.credential_digest
 JOIN saas.customers customer ON customer.store_id=account.store_id AND customer.id=account.customer_id
 WHERE session.store_id=s AND account.id=a AND account.customer_id=c AND account.status='active'AND account.phone_verified_at IS NOT NULL
 AND customer.status='active'AND customer.archived_at IS NULL AND session.session_kind='full'AND session.revoked_at IS NULL
 AND session.created_at<=n AND session.idle_expires_at>n AND session.absolute_expires_at>n)
$f$;
CREATE OR REPLACE FUNCTION saas.loyalty_checkout_proof_v1(s uuid,a uuid,c uuid,code text,n timestamptz)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE candidates jsonb;BEGIN
 candidates:=coalesce(nullif(current_setting('saas.loyalty.account_candidates',true),''),'[]')::jsonb;
 IF saas.storefront_credential_candidates_valid(candidates,true)AND saas.loyalty_checkout_session_v1(s,a,c,n,candidates)THEN RETURN true;END IF;
 RETURN EXISTS(SELECT 1 FROM saas.loyalty_checkout_authorizations auth_record WHERE auth_record.store_id=s AND auth_record.account_id=a AND auth_record.customer_id=c
 AND auth_record.proof_token=current_setting('saas.loyalty.checkout_proof',true)AND auth_record.created_at<=n AND auth_record.expires_at>n AND auth_record.normalized_codes?code);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_enter_v1(hostname text,n timestamptz,kind text,credentials jsonb,version bigint,delivery jsonb,operation uuid,codes jsonb,quote text,account_candidates jsonb)RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE scope record;auth_record saas.loyalty_checkout_authorizations;account uuid;customer uuid;proof text;managed boolean;selected_store uuid;BEGIN
 PERFORM set_config('saas.loyalty.checkout_proof','',true);
 PERFORM set_config('saas.loyalty.account_candidates',coalesce(account_candidates,'[]')::text,true);
 IF saas.storefront_hosted_checkout_promotion_codes_valid_v2(codes)IS DISTINCT FROM true OR saas.storefront_credential_candidates_valid(account_candidates,true)IS DISTINCT FROM true THEN RETURN NULL;END IF;
 selected_store:=saas.storefront_public_store(hostname,n);
 managed:=EXISTS(SELECT 1 FROM saas.loyalty_rewards reward WHERE reward.store_id=selected_store AND codes?reward.code);
 IF NOT managed AND NOT EXISTS(SELECT 1 FROM saas.loyalty_checkout_authorizations WHERE operation_id=operation)AND saas.loyalty_checkout_customer_v1(selected_store,n,account_candidates)IS NULL THEN RETURN '';END IF;
 IF operation IS NULL OR version IS NULL OR version NOT BETWEEN 1 AND 9007199254740991 OR saas.storefront_delivery_valid(delivery)IS DISTINCT FROM true THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.loyalty.checkout:'||operation::text,0));
 SELECT * INTO scope FROM saas.storefront_checkout_pricing_source280(hostname,n,kind,credentials);IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO auth_record FROM saas.loyalty_checkout_authorizations WHERE operation_id=operation FOR UPDATE;
 IF FOUND THEN
  IF auth_record.store_id<>scope.store_id OR auth_record.source_kind<>kind OR auth_record.source_id<>scope.source_id OR auth_record.source_version<>version
   OR auth_record.delivery_digest<>encode(sha256(convert_to(delivery::text,'UTF8')),'hex')OR auth_record.normalized_codes<>codes
   OR quote IS NOT NULL AND auth_record.quote_digest IS NOT NULL AND quote<>auth_record.quote_digest
   OR auth_record.expires_at<=n AND NOT EXISTS(SELECT 1 FROM saas.storefront_checkout_operations WHERE operation_id=operation)AND NOT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_operations op WHERE op.operation_id=operation AND op.store_id=auth_record.store_id AND op.session_id=auth_record.hosted_session_id)THEN RETURN NULL;END IF;
 ELSE
  IF scope.source_status<>'active'OR scope.source_version<>version THEN RETURN NULL;END IF;
  SELECT a.id,a.customer_id INTO account,customer FROM saas.storefront_account_sessions session
  JOIN jsonb_array_elements(account_candidates)candidate ON candidate->>'keyId'=session.key_id AND candidate->>'digest'=session.credential_digest
  JOIN saas.storefront_accounts a ON a.store_id=session.store_id AND a.id=session.account_id
  JOIN saas.customers c ON c.store_id=a.store_id AND c.id=a.customer_id
  WHERE session.store_id=scope.store_id AND session.session_kind='full'AND session.revoked_at IS NULL AND session.created_at<=n AND session.idle_expires_at>n AND session.absolute_expires_at>n
  AND a.status='active'AND a.phone_verified_at IS NOT NULL AND c.status='active'AND c.archived_at IS NULL ORDER BY session.created_at DESC,session.id LIMIT 1;
  IF account IS NULL THEN IF managed THEN RETURN NULL;ELSE RETURN '';END IF;END IF;
  IF EXISTS(SELECT 1 FROM saas.loyalty_rewards r WHERE r.store_id=scope.store_id AND codes?r.code AND(r.account_id<>account OR r.customer_id<>customer))THEN RETURN NULL;END IF;
  proof:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  INSERT INTO saas.loyalty_checkout_authorizations(operation_id,store_id,account_id,customer_id,source_kind,source_id,source_version,delivery_digest,normalized_codes,proof_token,created_at,expires_at,quote_digest)
  VALUES(operation,scope.store_id,account,customer,kind,scope.source_id,version,encode(sha256(convert_to(delivery::text,'UTF8')),'hex'),codes,proof,n,least(scope.deadline,n+interval'35 minutes'),quote)RETURNING * INTO auth_record;
 END IF;
 PERFORM set_config('saas.loyalty.checkout_proof',auth_record.proof_token,true);RETURN auth_record.proof_token;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_scope_v1(hostname text,n timestamptz,kind text,credentials jsonb,operation uuid,version bigint,delivery jsonb,codes jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE scope record;auth_record saas.loyalty_checkout_authorizations;BEGIN
 SELECT * INTO auth_record FROM saas.loyalty_checkout_authorizations WHERE proof_token=current_setting('saas.loyalty.checkout_proof',true);
 IF NOT FOUND THEN PERFORM set_config('saas.loyalty.checkout_proof','',true);RETURN;END IF;
 SELECT * INTO scope FROM saas.storefront_checkout_pricing_source280(hostname,n,kind,credentials);
 IF NOT FOUND OR auth_record.store_id<>scope.store_id OR auth_record.source_kind<>kind OR auth_record.source_id<>scope.source_id
 OR operation IS NOT NULL AND auth_record.operation_id<>operation OR version IS NOT NULL AND auth_record.source_version<>version
 OR delivery IS NOT NULL AND auth_record.delivery_digest<>encode(sha256(convert_to(delivery::text,'UTF8')),'hex')
 OR auth_record.normalized_codes<>codes THEN PERFORM set_config('saas.loyalty.checkout_proof','',true);END IF;
END $f$;

CREATE OR REPLACE FUNCTION saas.public_storefront_checkout_prepare_quote_v5(hostname text,n timestamptz,kind text,credentials jsonb,version bigint,delivery jsonb,operation uuid,codes jsonb,attribution jsonb,account_candidates jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE proof text;response record;BEGIN
 proof:=saas.loyalty_checkout_enter_v1(hostname,n,kind,credentials,version,delivery,operation,codes,NULL,account_candidates);
 IF proof IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO response FROM saas.public_storefront_checkout_prepare_quote_v4(hostname,n,kind,credentials,version,delivery,operation,codes,attribution);
 IF response.outcome='quoted'AND proof<>''THEN UPDATE saas.loyalty_checkout_authorizations SET quote_digest=response.result_payload->>'quoteDigest'WHERE operation_id=operation AND quote_digest IS NULL;END IF;
 PERFORM set_config('saas.loyalty.checkout_proof','',true);PERFORM set_config('saas.loyalty.account_candidates','[]',true);
 RETURN QUERY SELECT response.outcome,response.result_payload;
END $f$;

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_hosted_binding_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE h saas.storefront_hosted_checkout_sessions;auth_record saas.loyalty_checkout_authorizations;BEGIN
 IF NEW.operation_kind<>'start'THEN RETURN NEW;END IF;
 SELECT * INTO h FROM saas.storefront_hosted_checkout_sessions WHERE store_id=NEW.store_id AND id=NEW.session_id;
 SELECT * INTO auth_record FROM saas.loyalty_checkout_authorizations WHERE operation_id=NEW.operation_id FOR UPDATE;
 IF NOT FOUND THEN IF EXISTS(SELECT 1 FROM saas.loyalty_rewards r WHERE r.store_id=h.store_id AND h.promotion_normalized_codes?r.code)THEN RAISE EXCEPTION 'LOYALTY_CHECKOUT_ACCOUNT_AUTHORIZATION_REQUIRED';ELSE RETURN NEW;END IF;END IF;
 IF auth_record.customer_id<>h.customer_id AND NOT EXISTS(SELECT 1 FROM saas.loyalty_rewards r WHERE r.store_id=h.store_id AND h.promotion_normalized_codes?r.code)THEN RETURN NEW;END IF;
 IF auth_record.proof_token IS DISTINCT FROM current_setting('saas.loyalty.checkout_proof',true)THEN RAISE EXCEPTION 'LOYALTY_CHECKOUT_ACCOUNT_AUTHORIZATION_REQUIRED';END IF;
 IF auth_record.store_id<>h.store_id OR auth_record.customer_id<>h.customer_id OR auth_record.normalized_codes<>h.promotion_normalized_codes OR auth_record.created_at>h.created_at OR auth_record.expires_at<=h.created_at
 OR auth_record.hosted_session_id IS NOT NULL AND auth_record.hosted_session_id<>h.id OR EXISTS(SELECT 1 FROM saas.loyalty_rewards r WHERE r.store_id=h.store_id AND h.promotion_normalized_codes?r.code AND r.account_id<>auth_record.account_id)THEN RAISE EXCEPTION 'LOYALTY_CHECKOUT_AUTHORIZATION_MISMATCH';END IF;
 UPDATE saas.loyalty_checkout_authorizations SET hosted_session_id=h.id,reservation_group_id=h.promotion_reservation_group_id WHERE operation_id=NEW.operation_id;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS loyalty_checkout_hosted_binding ON saas.storefront_hosted_checkout_operations;
CREATE TRIGGER loyalty_checkout_hosted_binding AFTER INSERT ON saas.storefront_hosted_checkout_operations FOR EACH ROW EXECUTE FUNCTION saas.loyalty_checkout_hosted_binding_v1();

DO $verified_checkout$DECLARE signature text;definition text;marker text;params text;BEGIN
 PERFORM saas.loyalty503_patch('saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb)',jsonb_build_array(jsonb_build_array('BEGIN'||E'\n'||' IF p_hostname IS NULL','BEGIN'||E'\n'||' PERFORM set_config(''saas.loyalty.account_candidates'',''[]'',true);PERFORM saas.loyalty_checkout_scope_v1(p_hostname,p_now,p_kind,p_credentials,p_operation_id,p_expected_version,p_delivery,p_normalized_codes);'||E'\n'||' IF p_hostname IS NULL')));
 PERFORM saas.loyalty503_patch('saas.storefront_hosted_checkout_customer_prepare_v2(uuid,timestamp with time zone,jsonb,jsonb,uuid,boolean)',jsonb_build_array(jsonb_build_array('  v_email:=p_delivery','  PERFORM set_config(''saas.loyalty.account_candidates'',p_customer_candidates::text,true);'||E'\n'||'  v_email:=p_delivery')));
 FOREACH signature IN ARRAY ARRAY[
  'saas.public_checkout_complete_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)',
  'saas.public_storefront_hosted_checkout_authority_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text)',
  'saas.public_storefront_hosted_checkout_begin_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)']LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  marker:=CASE WHEN signature LIKE '%complete%'THEN ' BEGIN'ELSE ' BEGIN'END;
  params:=CASE WHEN signature LIKE '%complete%'THEN 'to_jsonb(p_normalized_codes),p_expected_quote_digest,p_customer_credentials'WHEN signature LIKE '%authority%'THEN 'p_normalized_codes,p_expected_quote_digest,p_customer_candidates'ELSE 'p_normalized_codes,p_expected_pricing_digest,p_customer_candidates'END;
  PERFORM saas.loyalty503_patch(signature,jsonb_build_array(jsonb_build_array('BEGIN'||E'\n'||' IF p_operation_id IS NULL','BEGIN'||E'\n'||' IF saas.loyalty_checkout_enter_v1(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,'||params||')IS NULL THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb;RETURN;END IF;'||E'\n'||' IF p_operation_id IS NULL')));
 END LOOP;
 FOR signature IN SELECT 'saas.'||oid::regprocedure::text FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('public_storefront_hosted_checkout_authority_v2','public_storefront_hosted_checkout_begin_v2')LOOP
  PERFORM saas.loyalty503_patch(signature,jsonb_build_array(jsonb_build_array('  v_store_id:=saas.storefront_public_store(p_hostname,p_now);','  IF saas.loyalty_checkout_enter_v1(p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_operation_id,p_normalized_codes,NULL,p_customer_candidates)IS NULL THEN RETURN QUERY SELECT ''invalid_input'',NULL::jsonb;RETURN;END IF;'||E'\n'||'  v_store_id:=saas.storefront_public_store(p_hostname,p_now);')));
 END LOOP;
END $verified_checkout$;

CREATE OR REPLACE FUNCTION saas.loyalty_checkout_order_binding_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE auth_record saas.loyalty_checkout_authorizations;order_row saas.orders;captured boolean;BEGIN
 SELECT * INTO auth_record FROM saas.loyalty_checkout_authorizations WHERE operation_id=NEW.operation_id AND store_id=NEW.store_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF EXISTS(SELECT 1 FROM saas.loyalty_order_members member WHERE member.store_id=NEW.store_id AND member.order_id=NEW.order_id AND(member.account_id<>auth_record.account_id OR member.customer_id<>auth_record.customer_id OR member.source_kind<>'account_session'OR member.source_id<>auth_record.operation_id))THEN RAISE EXCEPTION 'LOYALTY_ORDER_OWNER_MISMATCH';END IF;
 SELECT * INTO order_row FROM saas.orders WHERE store_id=NEW.store_id AND id=NEW.order_id;
 IF NOT FOUND OR order_row.customer_id IS DISTINCT FROM auth_record.customer_id THEN RETURN NEW;END IF;
 captured:=EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h JOIN saas.payment_attempts attempt ON attempt.store_id=h.store_id AND attempt.id=h.payment_attempt_id
  WHERE h.store_id=NEW.store_id AND h.id=auth_record.hosted_session_id AND h.payment_attempt_id=NEW.operation_id AND h.order_id=NEW.order_id AND h.customer_id=auth_record.customer_id
  AND h.created_at>=auth_record.created_at AND h.created_at<auth_record.expires_at AND attempt.status='captured'AND attempt.amount_minor=h.total_minor AND attempt.currency=h.currency
  AND h.cart_id IS NOT DISTINCT FROM NEW.cart_id AND h.intent_id IS NOT DISTINCT FROM NEW.intent_id
  AND(auth_record.source_id=coalesce(NEW.cart_id,NEW.intent_id)OR EXISTS(SELECT 1 FROM saas.storefront_checkout_contexts279 context WHERE context.operation_id=auth_record.operation_id AND context.store_id=auth_record.store_id AND context.session_id=h.id AND context.source_kind=auth_record.source_kind AND coalesce(context.source_cart_id,context.source_intent_id)=auth_record.source_id AND context.source_version=auth_record.source_version AND context.authority_digest=h.commerce_authority_digest)));
 IF NOT captured AND(auth_record.source_id IS DISTINCT FROM coalesce(NEW.cart_id,NEW.intent_id)OR auth_record.source_kind IS DISTINCT FROM CASE WHEN NEW.cart_id IS NULL THEN 'buy_now'ELSE 'cart'END)THEN RETURN NEW;END IF;
 IF NOT captured AND(auth_record.proof_token=current_setting('saas.loyalty.checkout_proof',true)AND NEW.committed_at>=auth_record.created_at AND NEW.committed_at<auth_record.expires_at)IS DISTINCT FROM true THEN RAISE EXCEPTION 'LOYALTY_ORDER_SOURCE_UNVERIFIED';END IF;
 INSERT INTO saas.loyalty_order_members(store_id,order_id,account_id,customer_id,source_kind,source_id,verified_at)
 VALUES(NEW.store_id,NEW.order_id,auth_record.account_id,auth_record.customer_id,'account_session',auth_record.operation_id,auth_record.created_at)ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM saas.loyalty_order_members member WHERE member.store_id=NEW.store_id AND member.order_id=NEW.order_id AND member.account_id=auth_record.account_id AND member.customer_id=auth_record.customer_id AND member.source_kind='account_session'AND member.source_id=auth_record.operation_id)THEN RAISE EXCEPTION 'LOYALTY_ORDER_OWNER_MISMATCH';END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS loyalty_checkout_order_binding ON saas.storefront_checkout_operations;
CREATE CONSTRAINT TRIGGER loyalty_checkout_order_binding AFTER INSERT ON saas.storefront_checkout_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas.loyalty_checkout_order_binding_v1();

CREATE OR REPLACE FUNCTION saas.loyalty_pos_order_binding_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE approval saas.loyalty_pos_approvals;BEGIN
 IF NEW.status<>'completed'OR OLD.status='completed'OR NEW.order_id IS NULL THEN RETURN NEW;END IF;
 SELECT a.* INTO approval FROM saas.loyalty_pos_approvals a WHERE a.store_id=NEW.store_id AND a.sale_id=NEW.id AND a.customer_id=NEW.customer_id
 AND a.consumed_at IS NOT NULL AND a.created_at<=a.consumed_at AND a.consumed_at<a.expires_at ORDER BY a.consumed_at DESC,a.id LIMIT 1;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=NEW.store_id AND o.id=NEW.order_id AND o.customer_id=approval.customer_id AND o.source='in_store')THEN RAISE EXCEPTION 'LOYALTY_POS_ORDER_SOURCE_MISMATCH';END IF;
 INSERT INTO saas.loyalty_order_members(store_id,order_id,account_id,customer_id,source_kind,source_id,verified_at)
 VALUES(NEW.store_id,NEW.order_id,approval.account_id,approval.customer_id,'pos_approval',approval.id,approval.consumed_at)ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM saas.loyalty_order_members member WHERE member.store_id=NEW.store_id AND member.order_id=NEW.order_id AND member.account_id=approval.account_id AND member.customer_id=approval.customer_id AND member.source_kind='pos_approval'AND member.source_id=approval.id)THEN RAISE EXCEPTION 'LOYALTY_ORDER_OWNER_MISMATCH';END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS loyalty_pos_order_binding ON saas.in_store_sales;
CREATE CONSTRAINT TRIGGER loyalty_pos_order_binding AFTER UPDATE ON saas.in_store_sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas.loyalty_pos_order_binding_v1();

DO $acl$DECLARE f record;r record;BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.loyalty_checkout_authorizations FROM %I',r.rolname);END LOOP;
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'loyalty_pos_%'OR proname LIKE 'loyalty_checkout_%'OR proname IN('public_storefront_checkout_prepare_quote_v5','loyalty_reward_held_v1','loyalty_code_allowed_v1','loyalty503_patch','in_store_sales_bootstrap_v5','in_store_staff_projection_v9','in_store_sales_list_staff_v9','in_store_sales_set_staff_v9','in_store_sales_recover_staff_v9'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.oid::regprocedure);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.oid::regprocedure,r.rolname);END LOOP;
  IF f.proname IN('in_store_sales_bootstrap_v5','in_store_sales_list_staff_v9','in_store_sales_set_staff_v9','in_store_sales_recover_staff_v9')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.oid::regprocedure);END IF;
  IF f.proname='public_storefront_checkout_prepare_quote_v5'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_host_resolver',f.oid::regprocedure);END IF;
 END LOOP;
 UPDATE saas.loyalty503_functions SET patched_hash=encode(sha256(convert_to(pg_get_functiondef(identity::regprocedure),'UTF8')),'hex');
END $acl$;
COMMIT;
