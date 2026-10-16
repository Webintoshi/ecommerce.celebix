-- Customer debt settlement discount. Install disabled; enable only after both panel readers are compatible.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
CREATE TABLE saas.accounting_discount_243_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[]);
ALTER TABLE saas.accounting_discount_243_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.accounting_discount_243_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.accounting_discount_243_backup FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator;
DO $predecessors$
DECLARE f record;
BEGIN
 IF to_regclass('saas.accounting_profitability_line_costs') IS NULL THEN RAISE EXCEPTION 'ACCOUNTING243_PREDECESSOR242_REQUIRED';END IF;
 FOR f IN SELECT * FROM(VALUES
  ('saas.in_store_order_guard()','2517c236d97f02cb6e46c72b6a3706cc356e2809ca9c91bcc71f26a85d780c2c'),
  ('saas.accounting_intent_valid(text,jsonb)','16201d8726b49a4c218ff448df3367f6c22f0b8c7108f7a36783335e278789e2'),
  ('saas.accounting_order_finance(uuid,uuid)','e00884d384ea8320d21d0263607adcb7f102c071e809b3a98ba38a7bb7eea796'),
  ('saas.accounting_event_projection(uuid,uuid)','f6f2552d3f25251c70caa20d808000db42ca3a376bdf90a14334657adaf188c9'),
  ('saas.accounting_schedule_projection(uuid,uuid)','f356480614c8d07ac9ae77636f7c0c62172db7f0fc23ea00cd4aa47d7f738775'),
  ('saas.accounting_schedule_obligations(uuid,uuid)','34853e1486c5b9db60f8806ce60e35762531090203bb83b6c826f8c250e62f00'),
  ('saas.accounting_receivable_projection(uuid,uuid)','ad6192e29f6ae5e537891c4019daf7f170db76522d60d28a37475bfdfea13fea'),
  ('saas.platform_command(uuid,text,jsonb,bigint,text)','87a91408afb5b6f939622125d45dae75ec0844451fdf2e5c8f6a58e3a3d8abd7'),
  ('saas.accounting_customer_projection(uuid,uuid,text)','72a945d03a719e362b4abdb37c92a26824f812e69a8847074a0ea1c6cef7488e'),
  ('saas.accounting_sync_order(uuid,uuid,timestamp with time zone)','437b03f9cdd737c5f33f4b250d96a4b6755864ba00e23c33c036055f49e5b8b3'),
  ('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)','35d89b6a2a548492e7786e3ed71ca6e1120b1aa50b9f072b3ab44a75c500fe1e'),
  ('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)','e2c07b6da26d462879fda7d168649d1bfd6fc51bd101562e71d99c15bec18272'),
  ('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)','6612ac47918dcbe12137f1f02efb5a2fbee8d2a463670ed90a49f761118f5236'),
  ('saas.accounting_schedule_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,jsonb)','75e110ff8556b7fb3fb81ab37444625b13752c5e1ab7aa187735bd47d994f538')
 )expected(signature,sha256) LOOP
  IF to_regprocedure(f.signature) IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(f.signature)),'UTF8')),'hex')<>f.sha256 THEN RAISE EXCEPTION 'ACCOUNTING243_PREDECESSOR_DRIFT: %',f.signature;END IF;
  INSERT INTO saas.accounting_discount_243_backup SELECT f.signature,pg_get_functiondef(p.oid),f.sha256,NULL,p.oid,p.proowner,p.proacl FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature);
 END LOOP;
END $predecessors$;
ALTER TABLE saas.accounting_release_state ADD COLUMN collection_discounts_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE saas.accounting_receivables ADD COLUMN discount_cents bigint NOT NULL DEFAULT 0 CONSTRAINT accounting_receivables_discount_cents_check CHECK(discount_cents BETWEEN 0 AND 9007199254740991 AND discount_cents<=sale_cents-return_cents);
ALTER TABLE saas.accounting_receivables DROP CONSTRAINT accounting_receivables_check1;
ALTER TABLE saas.accounting_receivables ADD CONSTRAINT accounting_receivables_check1 CHECK(refunded_cents BETWEEN 0 AND greatest(collected_cents-sale_cents+return_cents+discount_cents,0));
ALTER TABLE saas.accounting_allocations DROP CONSTRAINT accounting_allocations_effect_check;
ALTER TABLE saas.accounting_allocations ADD CONSTRAINT accounting_allocations_effect_check CHECK(effect IN('collect','return','refund','charge','discount'));
CREATE OR REPLACE FUNCTION saas.in_store_order_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
BEGIN
 IF OLD.source='in_store' AND current_setting('saas.in_store.v4_shipping',true)=OLD.store_id::text||':'||OLD.id::text AND EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=OLD.store_id AND order_id=OLD.id AND contract_version=4 AND fulfillment_method='shipping' AND status='completed') AND NEW.status IN('pending','confirmed','preparing','shipped','delivered') AND to_jsonb(NEW)-ARRAY['status','shipping_address','tracking','version','updated_at']=to_jsonb(OLD)-ARRAY['status','shipping_address','tracking','version','updated_at'] AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at THEN RETURN NEW;END IF;

 IF OLD.source='in_store' AND current_setting('saas.accounting.sync_order',true)=OLD.store_id::text||':'||OLD.id::text
 AND to_jsonb(NEW)-ARRAY['payment_status','paid_at','version','updated_at']=to_jsonb(OLD)-ARRAY['payment_status','paid_at','version','updated_at']
 AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at
 AND EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=OLD.store_id AND r.order_id=OLD.id AND NEW.payment_status=CASE WHEN r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents<=0 THEN 'completed' ELSE 'pending' END)
 THEN RETURN NEW;END IF;
 IF OLD.source='in_store' AND (NEW.source<>OLD.source OR NEW.status<>OLD.status OR NEW.payment_status<>OLD.payment_status OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address OR NEW.tracking IS DISTINCT FROM OLD.tracking OR NEW.subtotal_cents<>OLD.subtotal_cents OR NEW.discount_cents<>OLD.discount_cents OR NEW.total_cents<>OLD.total_cents) THEN RAISE check_violation USING MESSAGE='IN_STORE_ORDER_IMMUTABLE';END IF;RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_intent_valid(p_kind text, p_args jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE required text[];k text;v jsonb;parsed_date date;BEGIN
 required:=CASE p_kind
 WHEN 'collect' THEN ARRAY['customerId','orderId','amountCents','currency','paymentMethod','accountId','expectedVersion','note'] WHEN 'openingDebt' THEN ARRAY['customerId','amountCents','currency','occurredOn','note','expectedVersion'] WHEN 'saveAccount' THEN ARRAY['name','type','currency'] WHEN 'openBalance' THEN ARRAY['accountId','amountCents','occurredOn','note','expectedVersion'] WHEN 'expense' THEN ARRAY['accountId','amountCents','currency','category','note','occurredOn','expectedVersion'] WHEN 'transfer' THEN ARRAY['fromAccountId','toAccountId','amountCents','expectedVersion','toExpectedVersion','note'] WHEN 'settleCard' THEN ARRAY['fromAccountId','toAccountId','amountCents','commissionCents','expectedVersion','toExpectedVersion','note'] WHEN 'reverse' THEN ARRAY['eventId','reason','expectedVersion'] WHEN 'returnCredit' THEN ARRAY['orderId','amountCents','reason','expectedVersion'] WHEN 'refund' THEN ARRAY['orderId','accountId','amountCents','paymentMethod','reason','expectedVersion'] ELSE NULL END;
 IF required IS NULL OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>16384 OR NOT(p_args?&required) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_args) key WHERE NOT key=ANY(required) AND NOT(p_kind='expense' AND key='documentNumber') AND NOT(p_kind='collect' AND key='discountCents')) THEN RETURN false;END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_args) LOOP
 IF right(k,2)='Id' THEN IF v='null'::jsonb AND p_kind='collect' AND k IN('orderId','accountId') THEN CONTINUE;END IF;IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
 ELSIF k IN('amountCents','discountCents','commissionCents','expectedVersion','toExpectedVersion') THEN IF jsonb_typeof(v)<>'number' OR (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) OR ((v#>>'{}')::numeric < (CASE WHEN k IN('commissionCents','discountCents') OR k='expectedVersion' AND p_kind='openingDebt' OR k='amountCents' AND p_kind IN('openBalance','collect') THEN 0 ELSE 1 END) OR (v#>>'{}')::numeric>9007199254740991) THEN RETURN false;END IF;
 ELSIF k='currency' THEN IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^[A-Z]{3}$' THEN RETURN false;END IF;
 ELSIF k='paymentMethod' THEN IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN('cash','card','bank_transfer') THEN RETURN false;END IF;
 ELSIF k='type' THEN IF jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN('cash','card','bank') THEN RETURN false;END IF;
 ELSIF k='occurredOn' THEN IF jsonb_typeof(v)<>'string' OR v#>>'{}'!~'^\d{4}-\d{2}-\d{2}$' THEN RETURN false;END IF;parsed_date:=(v#>>'{}')::date;IF to_char(parsed_date,'YYYY-MM-DD')<>v#>>'{}' THEN RETURN false;END IF;
 ELSE IF v='null'::jsonb AND (k='note' AND p_kind='collect' OR k='documentNumber') THEN CONTINUE;END IF;IF jsonb_typeof(v)<>'string' OR (length(v#>>'{}')<1 OR length(v#>>'{}')>(CASE WHEN k='name' THEN 200 WHEN k IN('category','documentNumber') THEN 100 ELSE 2000 END)) OR v#>>'{}'<>btrim(v#>>'{}') OR v#>>'{}'~'[[:cntrl:]]' THEN RETURN false;END IF;
 END IF;END LOOP;
 IF p_kind='collect' AND ((p_args->>'amountCents')::numeric+coalesce((p_args->>'discountCents')::numeric,0) NOT BETWEEN 1 AND 9007199254740991) THEN RETURN false;END IF;
 IF p_kind IN('transfer','settleCard') AND (p_args->>'fromAccountId'=p_args->>'toAccountId' OR p_kind='settleCard' AND (p_args->>'commissionCents')::bigint>(p_args->>'amountCents')::bigint) THEN RETURN false;END IF;RETURN true;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_order_finance(p_store uuid, p_order uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT jsonb_build_object('status',CASE WHEN sale_cents-return_cents-discount_cents-collected_cents<=0 THEN 'paid' WHEN collected_cents>0 THEN 'partial' ELSE 'unpaid' END,'collectedCents',collected_cents,'dueCents',greatest(sale_cents-return_cents-discount_cents-collected_cents,0),'refundDueCents',greatest(collected_cents-sale_cents+return_cents+discount_cents-refunded_cents,0),'version',version,'receipts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'amountCents',a.amount_cents,'paymentMethod',e.payment_method,'receivedAt',saas.orders_json_timestamp(e.occurred_at),'actorMembershipId',e.actor_membership_id,'reversed',EXISTS(SELECT 1 FROM saas.accounting_events rev WHERE rev.store_id=p_store AND rev.reverses_event_id=e.id)) ORDER BY e.occurred_at,e.id) FROM saas.accounting_events e JOIN saas.accounting_allocations a ON a.store_id=e.store_id AND a.event_id=e.id WHERE a.receivable_id=r.id AND e.store_id=p_store AND e.kind='collection' AND a.effect='collect' AND a.amount_cents>0),'[]'::jsonb)) FROM saas.accounting_receivables r WHERE store_id=p_store AND order_id=p_order $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_event_projection(p_store uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT jsonb_build_object('id',e.id,'kind',e.kind,'currency',e.currency,'amountCents',e.amount_cents,'accountId',e.account_id,'customerId',e.customer_id,'orderId',e.order_id,'channel',e.channel,'paymentMethod',e.payment_method,'note',e.note,'category',e.category,'documentNumber',e.document_number,'actorMembershipId',e.actor_membership_id,'occurredAt',saas.orders_json_timestamp(e.occurred_at),'createdAt',saas.orders_json_timestamp(e.created_at),'reversesEventId',e.reverses_event_id,'reversed',EXISTS(SELECT 1 FROM saas.accounting_events rev WHERE rev.store_id=p_store AND rev.reverses_event_id=e.id),'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('receivableId',a.receivable_id,'orderId',r.order_id,'amountCents',a.amount_cents) ORDER BY r.occurred_at,r.id) FROM saas.accounting_allocations a JOIN saas.accounting_receivables r ON r.store_id=a.store_id AND r.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=e.id AND a.effect<>'discount'),'[]'::jsonb),'metadata',e.metadata||coalesce(saas.accounting_manual_event_context_v4(p_store,e.id),'{}')) FROM saas.accounting_events e WHERE e.store_id=p_store AND e.id=p_id $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_schedule_projection(p_store uuid, p_receivable uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT jsonb_build_object('receivable',saas.accounting_receivable_projection(p_store,r.id),'hasPlan',plan.id IS NOT NULL,
  'plannedCents',coalesce(plan.planned_cents,0),'unplannedCents',greatest(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents-coalesce(plan.planned_cents,0),0),
  'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('dueDate',due_date,'amountCents',amount_cents,'coveredCents',covered_cents,'dueCents',due_cents) ORDER BY installment_position)
   FROM saas.accounting_schedule_obligations(p_store,r.id) WHERE installment_position IS NOT NULL),'[]'::jsonb))
 FROM saas.accounting_receivables r LEFT JOIN LATERAL(SELECT id,planned_cents FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=r.id ORDER BY version DESC LIMIT 1) plan ON true
 WHERE r.store_id=p_store AND r.id=p_receivable
$function$
;

CREATE OR REPLACE FUNCTION saas.accounting_schedule_obligations(p_store uuid, p_receivable uuid)
 RETURNS TABLE(installment_position integer, due_date date, amount_cents bigint, covered_cents bigint, due_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE debt saas.accounting_receivables%ROWTYPE;plan saas.accounting_schedule_plans%ROWTYPE;actual_due bigint;residual bigint;
BEGIN
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND id=p_receivable;
 IF NOT FOUND THEN RETURN;END IF;
 actual_due:=greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0);
 SELECT * INTO plan FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=p_receivable ORDER BY version DESC LIMIT 1;
 IF FOUND THEN
  RETURN QUERY SELECT * FROM saas.accounting_schedule_parts(plan.installments,actual_due);
  residual:=greatest(actual_due-plan.planned_cents,0);
 ELSE residual:=actual_due;END IF;
 IF residual>0 THEN installment_position:=NULL;due_date:=debt.due_date;amount_cents:=residual;covered_cents:=0;due_cents:=residual;RETURN NEXT;END IF;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_receivable_projection(p_store uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT jsonb_build_object('id',r.id,'customerId',r.customer_id,'customerName',coalesce(nullif(r.customer_snapshot->>'name',''),nullif(concat_ws(' ',c.first_name,c.last_name),''),'Mağaza müşterisi'),'customerPhone',CASE WHEN r.customer_snapshot?'phone' THEN r.customer_snapshot->>'phone' ELSE c.phone END,'customerArchived',coalesce(c.status='archived',false),'orderId',r.order_id,'orderNumber',coalesce(o.order_number,r.deleted_order_number),'channel',r.channel,'currency',r.currency,'saleCents',r.sale_cents,'collectedCents',r.collected_cents,'returnCents',r.return_cents,'refundedCents',r.refunded_cents,'dueCents',greatest(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents,0),'refundDueCents',greatest(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents-r.refunded_cents,0),'occurredAt',saas.orders_json_timestamp(r.occurred_at),'dueDate',CASE WHEN EXISTS(SELECT 1 FROM saas.accounting_schedule_plans WHERE store_id=p_store AND receivable_id=r.id) THEN saas.accounting_schedule_next_due(p_store,r.id) ELSE r.due_date END,'version',r.version)||CASE WHEN r.discount_cents>0 THEN jsonb_build_object('discountCents',r.discount_cents) ELSE '{}'::jsonb END FROM saas.accounting_receivables r LEFT JOIN saas.customers c ON c.store_id=r.store_id AND c.id=r.customer_id LEFT JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id WHERE r.store_id=p_store AND r.id=p_id $function$
;

CREATE OR REPLACE FUNCTION saas.platform_command(p_operator uuid, p_action text, p_payload jsonb, p_expected_version bigint, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE sid uuid; ver bigint; request jsonb; prior saas.platform_command_results; result jsonb; entity uuid; period saas.platform_billing_periods; receipt saas.platform_receipts; amount bigint; plan saas.plans; target saas.principals; token text; usage jsonb; feature text; limits text[]:=ARRAY['products','staff','storageBytes','monthlyOrders','customDomains']; features text[]:=ARRAY['catalog','orders','customers','content','media','analytics','checkout','custom_domains','staff_management','promotions','integrations','accounting','marketplaces']; i integer;BEGIN
   IF p_action='ownership.invite' THEN RAISE EXCEPTION 'merchant_invitations_retired';END IF;
   IF p_action='membership.update' AND saas.merchant_whatsapp_policy_enabled((p_payload->>'storeId')::uuid) THEN RAISE EXCEPTION 'merchant_owner_required';END IF;
  
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>16384 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 128 OR p_idempotency_key<>btrim(p_idempotency_key) OR p_idempotency_key~'[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid_input';END IF;
 request:=jsonb_build_object('action',p_action,'payload',CASE WHEN p_action='support.issue' THEN (p_payload-'handoff')||jsonb_build_object('handoffHash',encode(sha256(convert_to(p_payload->>'handoff','UTF8')),'hex')) ELSE p_payload END,'expectedVersion',p_expected_version);PERFORM pg_advisory_xact_lock(hashtextextended('platform-replay:'||p_operator::text||':'||p_idempotency_key,0));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;result:=jsonb_set(prior.result,'{outcome}','"replayed"');IF p_action='support.issue' THEN result:=jsonb_set(result,'{result,handoff}',to_jsonb(p_payload->>'handoff'));END IF;RETURN result;END IF;
 IF p_action IN('support.issue','support.revoke','sales.pause','sales.resume') THEN
  IF p_action='support.issue' THEN IF p_payload-ARRAY['storeId','adminHost','host','reason','handoff']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason','handoff']) OR NOT(p_payload ? 'adminHost' OR p_payload ? 'host') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_issue($1,$2,$3,$4,$5,$6,$7)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,coalesce(p_payload->>'adminHost',p_payload->>'host'),p_payload->>'reason',p_expected_version,p_idempotency_key,p_payload->>'handoff';
  ELSIF p_action='support.revoke' THEN IF p_payload-ARRAY['sessionId']<>'{}' OR NOT(p_payload ? 'sessionId') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_revoke($1,$2,$3,$4)' INTO result USING p_operator,(p_payload->>'sessionId')::uuid,p_expected_version,p_idempotency_key;
  ELSE IF p_payload-ARRAY['storeId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_sales_policy_set($1,$2,$3,$4,$5,$6)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,p_action='sales.pause',p_payload->>'reason',p_expected_version,p_idempotency_key;END IF;
  result:=jsonb_build_object('outcome',CASE WHEN result->>'replayed'='true' THEN 'replayed' ELSE 'committed' END,'version',(result->>'version')::bigint,'result',result);
  INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result#-ARRAY['result','handoff']);RETURN result;
 END IF;
 IF p_action='plan.publish' THEN
  IF p_payload-ARRAY['code','features','limits','monthlyPriceCents','yearlyPriceCents']<>'{}' OR NOT(p_payload ?& ARRAY['code','features','limits']) OR jsonb_typeof(p_payload->'features')<>'object' OR jsonb_typeof(p_payload->'limits')<>'object' OR NOT(p_payload->'features' ?& features) OR (p_payload->'features')-features<>'{}' OR NOT(p_payload->'limits' ?& limits) OR (p_payload->'limits')-limits<>'{}' THEN RAISE EXCEPTION 'invalid_input';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-plan:'||(p_payload->>'code'),0));SELECT coalesce(max(version),0) INTO ver FROM saas.plans WHERE plan_code=p_payload->>'code';IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;entity:=gen_random_uuid();
  INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at) VALUES(entity,p_payload->>'code',ver+1,'active',now(),now(),now());INSERT INTO saas.platform_plan_publications VALUES(entity,txid_current());
  FOR i IN 1..array_length(features,1) LOOP IF jsonb_typeof(p_payload->'features'->features[i])<>'boolean' THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_features VALUES(entity,features[i],i,(p_payload->'features'->>features[i])::boolean);END LOOP;
  FOR i IN 1..array_length(limits,1) LOOP IF jsonb_typeof(p_payload->'limits'->limits[i])<>'number' OR (p_payload->'limits'->>limits[i])::numeric<>trunc((p_payload->'limits'->>limits[i])::numeric) OR (p_payload->'limits'->>limits[i])::numeric NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value) VALUES(entity,limits[i],i,(p_payload->'limits'->>limits[i])::numeric);END LOOP;DELETE FROM saas.platform_plan_publications WHERE plan_id=entity;
  FOREACH feature IN ARRAY ARRAY['monthlyPriceCents','yearlyPriceCents'] LOOP IF p_payload ? feature AND p_payload->feature<>'null'::jsonb AND (jsonb_typeof(p_payload->feature)<>'number' OR (p_payload->>feature)::numeric<>trunc((p_payload->>feature)::numeric) OR (p_payload->>feature)::numeric NOT BETWEEN 0 AND 9007199254740991) THEN RAISE EXCEPTION 'invalid_input';END IF;END LOOP;
  INSERT INTO saas.platform_plan_prices VALUES(entity,(p_payload->>'monthlyPriceCents')::bigint,(p_payload->>'yearlyPriceCents')::bigint);ver:=ver+1;result:=jsonb_build_object('planId',entity);
 ELSE
  sid:=(p_payload->>'storeId')::uuid;IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=sid) THEN RAISE EXCEPTION 'record_not_found';END IF;INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
  IF p_action='billing.period.create' THEN
   IF p_payload-ARRAY['storeId','label','startsOn','endsOn','dueOn','amountCents']<>'{}' OR NOT(p_payload ?& ARRAY['label','startsOn','endsOn','dueOn','amountCents']) THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   INSERT INTO saas.platform_billing_periods(store_id,label,starts_on,ends_on,due_on,amount_cents) VALUES(sid,p_payload->>'label',(p_payload->>'startsOn')::date,(p_payload->>'endsOn')::date,(p_payload->>'dueOn')::date,(p_payload->>'amountCents')::bigint) RETURNING id INTO entity;result:=jsonb_build_object('periodId',entity);
  ELSIF p_action='billing.period.adjust' THEN
   IF p_payload-ARRAY['storeId','periodId','deltaCents','reason']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','deltaCents','reason']) OR jsonb_typeof(p_payload->'deltaCents')<>'number' OR (p_payload->>'deltaCents')::numeric<>trunc((p_payload->>'deltaCents')::numeric) OR (p_payload->>'deltaCents')::numeric NOT BETWEEN -9007199254740991 AND 9007199254740991 OR (p_payload->>'deltaCents')::numeric=0 OR jsonb_typeof(p_payload->'reason')<>'string' OR length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'deltaCents')::bigint;
   IF (saas.platform_period_projection(period.id)->>'amountCents')::numeric+amount NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF (saas.platform_period_projection(period.id)->>'remainingCents')::numeric+amount<0 THEN RAISE EXCEPTION 'charge_below_collected';END IF;
   INSERT INTO saas.platform_billing_adjustments(store_id,period_id,delta_cents,reason) VALUES(sid,period.id,amount,btrim(p_payload->>'reason')) RETURNING id INTO entity;result:=jsonb_build_object('adjustmentId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.record' THEN
   IF p_payload-ARRAY['storeId','periodId','amountCents','method','reference']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','amountCents','method','reference']) OR jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'amountCents')::bigint;
   IF amount<1 OR amount>(saas.platform_period_projection(period.id)->>'remainingCents')::bigint THEN RAISE EXCEPTION 'overpayment';END IF;INSERT INTO saas.platform_receipts(store_id,period_id,amount_cents,method,reference) VALUES(sid,period.id,amount,p_payload->>'method',p_payload->>'reference') RETURNING id INTO entity;result:=jsonb_build_object('receiptId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.reverse' THEN
   IF p_payload-ARRAY['storeId','receiptId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['receiptId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO receipt FROM saas.platform_receipts WHERE store_id=sid AND id=(p_payload->>'receiptId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;IF EXISTS(SELECT 1 FROM saas.platform_receipt_reversals WHERE receipt_id=receipt.id) THEN RAISE EXCEPTION 'already_reversed';END IF;INSERT INTO saas.platform_receipt_reversals(store_id,receipt_id,reason) VALUES(sid,receipt.id,p_payload->>'reason') RETURNING id INTO entity;result:=jsonb_build_object('reversalId',entity,'periodId',receipt.period_id);
  ELSIF p_action='subscription.assign' THEN
   IF p_payload-ARRAY['storeId','planId']<>'{}' OR NOT(p_payload ? 'planId') THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO plan FROM saas.plans WHERE id=(p_payload->>'planId')::uuid AND status='active' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now());IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
   usage:=saas.platform_store_usage(sid);FOR i IN 1..array_length(limits,1) LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan.id AND limit_key=limits[i] AND effective_limit>=(usage->>limits[i])::bigint) THEN RAISE EXCEPTION 'limit_below_usage';END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received')) THEN FOREACH feature IN ARRAY ARRAY['orders','checkout','catalog'] LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key=feature AND enabled) THEN RAISE EXCEPTION 'pending_pos_blocks_downgrade';END IF;END LOOP;END IF;
   IF (EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=sid AND sale_cents-return_cents-discount_cents-collected_cents>0) OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received') AND contract_version=3 AND initial_collection_cents<total_cents)) AND NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key='accounting' AND enabled) THEN RAISE EXCEPTION 'open_debt_blocks_downgrade';END IF;
   UPDATE saas.subscriptions SET status='inactive',updated_at=greatest(clock_timestamp(),updated_at) WHERE store_id=sid AND status='active';INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES(gen_random_uuid(),sid,plan.id,plan.plan_code,plan.version,'active',now(),now(),now()) RETURNING id INTO entity;result:=jsonb_build_object('subscriptionId',entity,'planId',plan.id);
  ELSIF p_action='membership.update' THEN
   IF p_payload-ARRAY['storeId','membershipId','role','status']<>'{}' OR NOT(p_payload ?& ARRAY['membershipId','role','status']) OR p_payload->>'role' NOT IN('store_owner','admin','editor','analyst','cashier') OR p_payload->>'status' NOT IN('active','invited','revoked') THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF NOT EXISTS(SELECT 1 FROM saas.memberships m WHERE store_id=sid AND id=(p_payload->>'membershipId')::uuid AND coalesce(to_jsonb(m)->>'support_session_id','')='') THEN RAISE EXCEPTION 'record_not_found';END IF;
   IF p_payload->>'role'='store_owner' AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND role='store_owner' AND status='active') THEN RAISE EXCEPTION 'ownership_acceptance_required';END IF;
   IF p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND status='invited') THEN RAISE EXCEPTION 'invitation_acceptance_required';END IF;
   IF p_payload->>'role'<>'store_owner' AND p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND (role='store_owner' OR status<>'active')) AND NOT EXISTS(SELECT 1 FROM saas.plan_limits l JOIN saas.subscriptions sub ON sub.plan_id=l.plan_id WHERE sub.store_id=sid AND sub.status='active' AND l.limit_key='staff' AND l.effective_limit>(saas.platform_store_usage(sid)->>'staff')::bigint) THEN RAISE EXCEPTION 'staff_limit_reached';END IF;
   UPDATE saas.memberships SET role=p_payload->>'role',status=p_payload->>'status',updated_at=greatest(clock_timestamp(),updated_at) WHERE id=(p_payload->>'membershipId')::uuid AND store_id=sid RETURNING id INTO entity;result:=jsonb_build_object('membershipId',entity);
  ELSIF p_action='ownership.invite' THEN
   IF p_payload-ARRAY['storeId','targetPrincipalId','role','kind','previousOwnerDisposition']<>'{}' OR NOT(p_payload ?& ARRAY['targetPrincipalId','role','kind']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO target FROM saas.principals WHERE id=(p_payload->>'targetPrincipalId')::uuid AND email_verified;IF NOT FOUND THEN RAISE EXCEPTION 'verified_identity_required';END IF;token:=gen_random_uuid()::text||gen_random_uuid()::text;
   INSERT INTO saas.platform_ownership_invitations(store_id,target_principal_id,target_issuer,target_subject,role,kind,previous_owner_disposition,created_by,token_hash,expires_at) VALUES(sid,target.id,target.issuer,target.subject,p_payload->>'role',p_payload->>'kind',p_payload->>'previousOwnerDisposition',p_operator,sha256(convert_to(token,'UTF8')),now()+interval '7 days') RETURNING id INTO entity;result:=jsonb_build_object('invitationId',entity,'acceptanceToken',token,'expiresAt',now()+interval '7 days');
  ELSE RAISE EXCEPTION 'invalid_input';END IF;
  ver:=ver+1;UPDATE saas.platform_store_versions SET version=ver WHERE store_id=sid;
 END IF;
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(p_operator,sid,p_action,p_payload);
 result:=jsonb_build_object('outcome','committed','version',ver,'result',result);INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_input';
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_customer_projection(p_store uuid, p_customer uuid, p_currency text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT jsonb_build_object('customerId',c.id,'customerName',concat_ws(' ',c.first_name,c.last_name),'customerPhone',c.phone,'customerArchived',c.status='archived','currency',p_currency,'version',coalesce((SELECT version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=p_customer AND currency=p_currency),0),'dueCents',coalesce((SELECT sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)) FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=p_customer AND currency=p_currency),0),'refundDueCents',coalesce((SELECT sum(greatest(collected_cents-sale_cents+return_cents+discount_cents-refunded_cents,0)) FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=p_customer AND currency=p_currency),0),'receivables',coalesce((SELECT jsonb_agg(saas.accounting_receivable_projection(p_store,id) ORDER BY occurred_at,id) FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=p_customer AND currency=p_currency),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(saas.accounting_event_projection(p_store,id) ORDER BY occurred_at DESC,id DESC) FROM saas.accounting_events WHERE store_id=p_store AND (customer_id=p_customer OR EXISTS(SELECT 1 FROM saas.accounting_allocations a JOIN saas.accounting_receivables r ON r.store_id=a.store_id AND r.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=accounting_events.id AND r.customer_id=p_customer)) AND currency=p_currency),'[]'::jsonb)) FROM saas.customers c WHERE c.store_id=p_store AND c.id=p_customer $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_sync_order(p_store uuid, p_order uuid, p_now timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE previous text;BEGIN
 IF p_order IS NOT NULL THEN
 previous:=current_setting('saas.accounting.sync_order',true);PERFORM set_config('saas.accounting.sync_order',p_store::text||':'||p_order::text,true);
 UPDATE saas.orders o SET payment_status=CASE WHEN r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents<=0 THEN 'completed' ELSE 'pending' END,paid_at=CASE WHEN r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents<=0 THEN (SELECT max(e.occurred_at) FROM saas.accounting_events e JOIN saas.accounting_allocations a ON a.store_id=e.store_id AND a.event_id=e.id WHERE a.receivable_id=r.id AND e.kind='collection' AND NOT EXISTS(SELECT 1 FROM saas.accounting_events rev WHERE rev.store_id=p_store AND rev.reverses_event_id=e.id)) ELSE NULL END,version=o.version+1,updated_at=greatest(o.updated_at,p_now) FROM saas.accounting_receivables r WHERE o.store_id=p_store AND o.id=p_order AND r.store_id=p_store AND r.order_id=p_order;
 PERFORM set_config('saas.accounting.sync_order',coalesce(previous,''),true);
 END IF;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_read(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_kind text, p_filters jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;start_at timestamptz;end_at timestamptz;tz text;customer uuid;currency_code text;result jsonb;preview_debt record;leftover bigint;alloc jsonb:='[]';take bigint;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,p_kind IN('receivables','customerAccount','orderFinance','previewCollection','collectionAccounts'));IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_filters_valid(p_filters) OR p_kind NOT IN('overview','receivables','customerAccount','accounts','collectionAccounts','expenses','orderFinance','previewCollection') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 start_at:=CASE WHEN p_filters?'dateFrom' THEN (p_filters->>'dateFrom')::date::timestamp AT TIME ZONE tz ELSE '-infinity'::timestamptz END;end_at:=CASE WHEN p_filters?'dateTo' THEN ((p_filters->>'dateTo')::date+1)::timestamp AT TIME ZONE tz ELSE 'infinity'::timestamptz END;
 customer:=(p_filters->>'customerId')::uuid;currency_code:=coalesce(p_filters->>'currency',(SELECT currency FROM saas.stores WHERE id=p_store));
 IF p_kind IN('customerAccount','previewCollection') THEN
 IF customer IS NULL OR NOT EXISTS(SELECT 1 FROM saas.customers WHERE store_id=p_store AND id=customer) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code HAVING sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0))>9007199254740991 OR sum(greatest(collected_cents-sale_cents+return_cents+discount_cents-refunded_cents,0))>9007199254740991) THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 result:=saas.accounting_customer_projection(p_store,customer,currency_code);
 IF p_kind='previewCollection' THEN
 IF NOT(p_filters?'amountCents') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;leftover:=(p_filters->>'amountCents')::bigint;
 FOR preview_debt IN SELECT * FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (NOT(p_filters?'orderId') OR order_id=(p_filters->>'orderId')::uuid) ORDER BY occurred_at,id LOOP take:=least(leftover,greatest(preview_debt.sale_cents-preview_debt.return_cents-preview_debt.discount_cents-preview_debt.collected_cents,0));IF take>0 THEN alloc:=alloc||jsonb_build_array(jsonb_build_object('receivableId',preview_debt.id,'orderId',preview_debt.order_id,'amountCents',take));leftover:=leftover-take;END IF;END LOOP;
 IF leftover>0 THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;result:=jsonb_build_object('customerId',customer,'currency',currency_code,'version',result->'version','dueCents',result->'dueCents','allocations',alloc);
 END IF;
 ELSIF p_kind='orderFinance' THEN IF NOT(p_filters?'orderId') OR NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store AND id=(p_filters->>'orderId')::uuid) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;result:=saas.accounting_order_finance(p_store,(p_filters->>'orderId')::uuid);
 ELSIF p_kind='receivables' THEN SELECT jsonb_build_object('receivables',coalesce(jsonb_agg(saas.accounting_receivable_projection(p_store,r.id) ORDER BY r.occurred_at,r.id),'[]'::jsonb)) INTO result FROM saas.accounting_receivables r LEFT JOIN saas.customers c ON c.store_id=r.store_id AND c.id=r.customer_id LEFT JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id WHERE r.store_id=p_store AND saas.accounting_sales_channel_matches_v4(p_store,r.id,r.order_id,NULL,p_filters->>'salesChannel') AND (customer IS NULL OR r.customer_id=customer) AND (NOT(p_filters?'orderId') OR r.order_id=(p_filters->>'orderId')::uuid) AND (NOT(p_filters?'channel') OR r.channel=p_filters->>'channel') AND (NOT(p_filters?'currency') OR r.currency=p_filters->>'currency') AND r.occurred_at>=start_at AND r.occurred_at<end_at AND (NOT(p_filters?'query') OR concat_ws(' ',c.first_name,c.last_name,c.phone,coalesce(o.order_number,r.deleted_order_number)) ILIKE '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%');
 ELSIF p_kind='collectionAccounts' THEN SELECT jsonb_build_object('accounts',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'type',account_type,'currency',currency) ORDER BY created_at,id),'[]'::jsonb)) INTO result FROM saas.accounting_accounts WHERE store_id=p_store;
 ELSIF p_kind='accounts' THEN SELECT jsonb_build_object('accounts',coalesce((SELECT jsonb_agg(saas.accounting_account_projection(p_store,id) ORDER BY created_at,id) FROM saas.accounting_accounts WHERE store_id=p_store),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(saas.accounting_event_projection(p_store,id) ORDER BY occurred_at DESC,id DESC) FROM (SELECT id,occurred_at FROM saas.accounting_events WHERE store_id=p_store AND account_id IS NOT NULL AND occurred_at>=start_at AND occurred_at<end_at ORDER BY occurred_at DESC,id DESC LIMIT 200) recent),'[]'::jsonb)) INTO result;
 ELSIF p_kind='expenses' THEN SELECT jsonb_build_object('expenses',coalesce(jsonb_agg(saas.accounting_event_projection(p_store,id) ORDER BY occurred_at DESC,id DESC),'[]'::jsonb)) INTO result FROM saas.accounting_events WHERE store_id=p_store AND kind IN('expense','card_settlement') AND occurred_at>=start_at AND occurred_at<end_at AND (NOT(p_filters?'currency') OR currency=p_filters->>'currency');
 ELSE
 -- WEB receipts use recorded transition/provider evidence, with no inferred account or commission.
 WITH events AS(
 SELECT coalesce(orig.kind,e.kind) kind,e.currency,CASE WHEN coalesce(orig.kind,e.kind)='collection' AND p_filters?'channel' THEN CASE WHEN saas.accounting_pending_receipt_v4(p_store,e.id) AND e.channel=p_filters->>'channel' THEN e.amount_cents::numeric ELSE coalesce((SELECT sum(a.amount_cents::numeric) FROM saas.accounting_allocations a JOIN saas.accounting_receivables allocated ON allocated.store_id=a.store_id AND allocated.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=e.id AND a.effect='collect' AND allocated.channel=p_filters->>'channel' AND saas.accounting_sales_channel_matches_v4(p_store,allocated.id,allocated.order_id,NULL,p_filters->>'salesChannel')),0) END WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric END amount,coalesce(orig.metadata,e.metadata) metadata,CASE WHEN e.kind='reversal' THEN -1 ELSE 1 END sign,coalesce((SELECT sum(a.amount_cents::numeric) FROM saas.accounting_allocations a JOIN saas.accounting_receivables d ON d.store_id=a.store_id AND d.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=e.id AND a.effect='discount' AND (NOT(p_filters?'channel') OR d.channel=p_filters->>'channel') AND saas.accounting_sales_channel_matches_v4(p_store,d.id,d.order_id,NULL,p_filters->>'salesChannel')),0) discount_amount
 FROM saas.accounting_events e LEFT JOIN saas.accounting_events orig ON orig.store_id=e.store_id AND orig.id=e.reverses_event_id
 WHERE e.store_id=p_store AND saas.accounting_event_sales_channel_matches_v4(p_store,e.id,p_filters->>'salesChannel') AND e.occurred_at>=start_at AND e.occurred_at<end_at AND (NOT(p_filters?'channel') OR coalesce(orig.kind,e.kind)<>'collection' AND e.channel=p_filters->>'channel' OR coalesce(orig.kind,e.kind)='collection' AND (saas.accounting_pending_receipt_v4(p_store,e.id) AND e.channel=p_filters->>'channel' OR EXISTS(SELECT 1 FROM saas.accounting_allocations channel_alloc JOIN saas.accounting_receivables channel_debt ON channel_debt.store_id=channel_alloc.store_id AND channel_debt.id=channel_alloc.receivable_id WHERE channel_alloc.store_id=p_store AND channel_alloc.event_id=e.id AND channel_alloc.effect IN('collect','discount') AND channel_debt.channel=p_filters->>'channel'))) AND (NOT(p_filters?'currency') OR e.currency=p_filters->>'currency')
 ),web AS(
 SELECT payment.currency,sum(payment.amount_cents::numeric) amount FROM saas.accounting_web_payment_evidence(p_store) payment WHERE NOT(p_filters?'salesChannel') AND payment.received_at>=start_at AND payment.received_at<end_at AND (NOT(p_filters?'channel') OR p_filters->>'channel'='WEB') AND (NOT(p_filters?'currency') OR payment.currency=p_filters->>'currency') AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND r.order_id=payment.order_id) GROUP BY payment.currency
 ),legacy_pos_sales AS(
 SELECT o.currency,sum(s.total_cents::numeric) amount FROM saas.in_store_sales s JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id WHERE s.store_id=p_store AND (NOT(p_filters?'salesChannel') OR s.sales_channel=p_filters->>'salesChannel') AND s.status='completed' AND s.completed_at>=start_at AND s.completed_at<end_at AND (NOT(p_filters?'channel') OR p_filters->>'channel'='POS') AND (NOT(p_filters?'currency') OR o.currency=p_filters->>'currency') AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND r.order_id=s.order_id) GROUP BY o.currency
 ),legacy_pos_receipts AS(
 SELECT o.currency,sum(a.amount_cents::numeric) amount FROM saas.in_store_payment_attestations a JOIN saas.in_store_sales s ON s.store_id=a.store_id AND s.id=a.sale_id JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id WHERE s.store_id=p_store AND (NOT(p_filters?'salesChannel') OR s.sales_channel=p_filters->>'salesChannel') AND s.status='completed' AND a.received_at>=start_at AND a.received_at<end_at AND (NOT(p_filters?'channel') OR p_filters->>'channel'='POS') AND (NOT(p_filters?'currency') OR o.currency=p_filters->>'currency') AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND r.order_id=s.order_id) GROUP BY o.currency
 ),codes AS(SELECT currency FROM events UNION SELECT currency FROM web UNION SELECT currency FROM legacy_pos_sales UNION SELECT currency FROM legacy_pos_receipts UNION SELECT currency FROM saas.accounting_receivables WHERE store_id=p_store AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND (NOT(p_filters?'currency') OR currency=p_filters->>'currency')),
 sums AS(SELECT code.currency,
 coalesce((SELECT sum(amount) FROM events WHERE currency=code.currency AND kind='sale'),0)+coalesce((SELECT amount FROM web WHERE currency=code.currency),0)+coalesce((SELECT amount FROM legacy_pos_sales WHERE currency=code.currency),0) sales,
 coalesce((SELECT sum(amount) FROM events WHERE currency=code.currency AND kind='collection'),0)+coalesce((SELECT amount FROM web WHERE currency=code.currency),0)+coalesce((SELECT amount FROM legacy_pos_receipts WHERE currency=code.currency),0) receipts,
 coalesce((SELECT sum(amount) FROM events WHERE currency=code.currency AND kind='return_credit'),0) returns,coalesce((SELECT sum(discount_amount) FROM events WHERE currency=code.currency AND kind='collection'),0) discounts,coalesce((SELECT sum(amount) FROM events WHERE currency=code.currency AND kind='refund'),0) refunds,coalesce((SELECT sum(amount) FROM events WHERE currency=code.currency AND kind='expense'),0) expenses,coalesce((SELECT sum((metadata->>'commissionCents')::numeric*sign) FROM events WHERE currency=code.currency AND kind='card_settlement'),0) commission,
 coalesce((SELECT sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)::numeric) FROM saas.accounting_receivables WHERE store_id=p_store AND currency=code.currency AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND (NOT(p_filters?'channel') OR channel=p_filters->>'channel')),0) due,
 coalesce((SELECT sum(saas.accounting_schedule_overdue_cents(p_store,id,(p_now AT TIME ZONE tz)::date)::numeric) FROM saas.accounting_receivables WHERE store_id=p_store AND currency=code.currency AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND (NOT(p_filters?'channel') OR channel=p_filters->>'channel')),0) overdue,
 coalesce((SELECT sum(greatest(collected_cents-sale_cents+return_cents+discount_cents-refunded_cents,0)::numeric) FROM saas.accounting_receivables WHERE store_id=p_store AND currency=code.currency AND saas.accounting_sales_channel_matches_v4(p_store,id,order_id,NULL,p_filters->>'salesChannel') AND (NOT(p_filters?'channel') OR channel=p_filters->>'channel')),0) refund_due,coalesce((SELECT amount FROM web WHERE currency=code.currency),0) web_payments FROM codes code)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM sums WHERE greatest(abs(sales),abs(receipts),abs(discounts),abs(returns),abs(refunds),abs(expenses),abs(commission),due,overdue,refund_due,web_payments)>9007199254740991) THEN NULL ELSE jsonb_build_object('currencies',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'salesCents',sales,'collectionsCents',receipts,'returnCents',returns,'refundsCents',refunds,'expensesCents',expenses,'commissionCents',commission,'dueCents',due,'overdueCents',overdue,'refundDueCents',refund_due,'recordedWebPaymentsCents',web_payments)||CASE WHEN discounts<>0 THEN jsonb_build_object('discountCents',discounts) ELSE '{}'::jsonb END ORDER BY currency) FROM sums),'[]'::jsonb),'accounts',coalesce((SELECT jsonb_agg(saas.accounting_account_projection(p_store,id) ORDER BY created_at,id) FROM saas.accounting_accounts WHERE store_id=p_store),'[]'::jsonb),'recentEvents',coalesce((SELECT jsonb_agg(saas.accounting_event_projection(p_store,id) ORDER BY occurred_at DESC,id DESC) FROM(SELECT e.id,e.occurred_at FROM saas.accounting_events e WHERE e.store_id=p_store AND saas.accounting_event_sales_channel_matches_v4(p_store,e.id,p_filters->>'salesChannel') AND e.occurred_at>=start_at AND e.occurred_at<end_at AND (NOT(p_filters?'channel') OR e.channel=p_filters->>'channel') AND (NOT(p_filters?'currency') OR e.currency=p_filters->>'currency') ORDER BY e.occurred_at DESC,e.id DESC LIMIT 100) recent),'[]'::jsonb)) END INTO result;
 IF result IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;RETURN QUERY SELECT 'found',result;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_profitability_read(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_filters jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;tz text;start_at timestamptz;end_at timestamptz;result jsonb;
BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_profitability_filters_valid(p_filters) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 start_at:=(p_filters->>'dateFrom')::date::timestamp AT TIME ZONE tz;
 end_at:=((p_filters->>'dateTo')::date+1)::timestamp AT TIME ZONE tz;
 WITH period_events AS MATERIALIZED(
  SELECT e.id,coalesce(orig.id,e.id) original_id,coalesce(orig.kind,e.kind) kind,e.currency,
   CASE WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric END amount,
   coalesce(orig.metadata,e.metadata) metadata,CASE WHEN e.kind='reversal' THEN -1 ELSE 1 END sign,
   coalesce(e.order_id,e.deleted_order_id,orig.order_id,orig.deleted_order_id) order_id
  FROM saas.accounting_events e LEFT JOIN saas.accounting_events orig ON orig.store_id=e.store_id AND orig.id=e.reverses_event_id
  WHERE e.store_id=p_store AND e.occurred_at>=start_at AND e.occurred_at<end_at
   AND(NOT(p_filters?'currency') OR e.currency=p_filters->>'currency')
 ),web AS MATERIALIZED(
  SELECT w.order_id,w.currency,w.amount_cents::numeric amount FROM saas.accounting_web_payment_evidence(p_store) w
  WHERE w.received_at>=start_at AND w.received_at<end_at AND(NOT(p_filters?'currency') OR w.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=w.order_id)
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale' AND coalesce(e.order_id,e.deleted_order_id)=w.order_id)
 ),legacy_pos_sales AS MATERIALIZED(
  SELECT s.order_id,o.currency,s.total_cents::numeric amount FROM saas.in_store_sales s JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id
  WHERE s.store_id=p_store AND s.status='completed' AND s.completed_at>=start_at AND s.completed_at<end_at
   AND(NOT(p_filters?'currency') OR o.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=s.order_id)
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale' AND coalesce(e.order_id,e.deleted_order_id)=s.order_id)
 ),legacy_pos_receipts AS MATERIALIZED(
  SELECT o.currency,a.amount_cents::numeric amount FROM saas.in_store_payment_attestations a JOIN saas.in_store_sales s ON s.store_id=a.store_id AND s.id=a.sale_id
  JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id
  WHERE s.store_id=p_store AND s.status='completed' AND a.received_at>=start_at AND a.received_at<end_at
   AND(NOT(p_filters?'currency') OR o.currency=p_filters->>'currency')
   AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables r WHERE r.store_id=p_store AND coalesce(r.order_id,r.deleted_order_id)=s.order_id)
 ),sale_evidence AS MATERIALIZED(
  SELECT order_id,currency,amount,sign FROM period_events WHERE kind='sale'
  UNION ALL SELECT order_id,currency,amount,1 FROM web
  UNION ALL SELECT order_id,currency,amount,1 FROM legacy_pos_sales
 ),sales AS MATERIALIZED(
  SELECT order_id,currency,sum(amount) amount,sign(sum(sign)) cost_sign FROM sale_evidence GROUP BY order_id,currency
 ),costs AS MATERIALIZED(
  SELECT s.order_id,s.currency,s.amount,
   s.cost_sign*coalesce(c.known_cost,0) known_cost,
   s.cost_sign=0 OR (c.item_count>0 AND c.item_count=c.max_observed AND c.all_known AND c.same_currency
    AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=s.order_id)
    AND (NOT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=p_store AND o.id=s.order_id)
     OR ((SELECT count(*) FROM saas.order_items i WHERE i.store_id=p_store AND i.order_id=s.order_id)=c.item_count
      AND NOT EXISTS(SELECT 1 FROM saas.order_items i LEFT JOIN saas.accounting_profitability_line_costs frozen ON frozen.store_id=i.store_id AND frozen.item_id=i.id
       WHERE i.store_id=p_store AND i.order_id=s.order_id AND(frozen.item_id IS NULL OR frozen.order_id<>i.order_id OR frozen.quantity<>i.quantity))))) cost_complete
  FROM sales s LEFT JOIN LATERAL(
   SELECT count(*) item_count,max(f.observed_line_count) max_observed,bool_and(f.unit_cost_cents IS NOT NULL) all_known,
    bool_and(f.currency=s.currency) same_currency,coalesce(sum(f.unit_cost_cents::numeric*f.quantity),0) known_cost
   FROM saas.accounting_profitability_line_costs f WHERE f.store_id=p_store AND f.order_id=s.order_id
  ) c ON true
 ),supplier_groups AS MATERIALIZED(
  SELECT e.currency,e.original_id,sum(e.amount) amount FROM period_events e
  JOIN saas.accounting_supplier_payments payment ON payment.store_id=p_store AND payment.event_id=e.original_id
  WHERE e.kind='expense' GROUP BY e.currency,e.original_id
 ),return_groups AS MATERIALIZED(
  SELECT e.currency,coalesce(e.order_id,e.original_id) order_id,sum(e.amount) amount FROM period_events e WHERE e.kind='return_credit'
  GROUP BY e.currency,coalesce(e.order_id,e.original_id)
 ),provider_links AS MATERIALIZED(
  SELECT s.order_id,s.payment_attempt_id attempt_id FROM saas.storefront_hosted_checkout_sessions s WHERE s.store_id=p_store AND s.order_id IS NOT NULL
  UNION SELECT b.order_id,b.attempt_id FROM saas.quick_order_hosted_payment_bridges b WHERE b.store_id=p_store
 ),dated_returns AS MATERIALIZED(
  -- These records prove a return occurred, but do not prove refunded quantity or cost.
  SELECT o.id order_id,o.currency,o.refunded_at occurred_at FROM saas.orders o WHERE o.store_id=p_store AND o.refunded_at IS NOT NULL
  UNION SELECT o.id,o.currency,e.created_at FROM saas.order_events e JOIN saas.orders o ON o.store_id=e.store_id AND o.id=e.order_id
   WHERE e.store_id=p_store AND e.event_type IN('payment_transition','status_transition') AND e.to_value='refunded'
  UNION SELECT o.id,o.currency,e.occurred_at FROM provider_links link
   JOIN saas.payment_attempt_events e ON e.store_id=p_store AND e.attempt_id=link.attempt_id
   JOIN saas.orders o ON o.store_id=p_store AND o.id=link.order_id
   WHERE e.to_status IN('partially_refunded','refunded')
 ),unresolved_returns AS MATERIALIZED(
  SELECT currency,order_id FROM return_groups WHERE amount<>0
  UNION SELECT r.currency,r.order_id FROM dated_returns r WHERE r.occurred_at<end_at
   AND(r.occurred_at>=start_at OR EXISTS(SELECT 1 FROM sales s WHERE s.order_id=r.order_id AND s.currency=r.currency AND s.cost_sign<>0))
   AND(NOT(p_filters?'currency') OR r.currency=p_filters->>'currency')
  UNION SELECT s.currency,s.order_id FROM sales s JOIN saas.orders o ON o.store_id=p_store AND o.id=s.order_id
   WHERE s.cost_sign<>0 AND (o.payment_status='refunded' OR o.status='refunded'
    OR EXISTS(SELECT 1 FROM provider_links link JOIN saas.payment_attempts attempt ON attempt.store_id=p_store AND attempt.id=link.attempt_id
     WHERE link.order_id=s.order_id AND attempt.status IN('partially_refunded','refunded')))
    AND NOT EXISTS(SELECT 1 FROM dated_returns r WHERE r.order_id=s.order_id)
 ),codes AS(
  SELECT currency FROM period_events UNION SELECT currency FROM web UNION SELECT currency FROM legacy_pos_sales UNION SELECT currency FROM legacy_pos_receipts
   UNION SELECT currency FROM unresolved_returns
 ),sums AS(
  SELECT code.currency,
   coalesce((SELECT sum(amount) FROM sales WHERE currency=code.currency),0) sales,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='return_credit'),0) returns,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='collection'),0)
    +coalesce((SELECT sum(amount) FROM web WHERE currency=code.currency),0)+coalesce((SELECT sum(amount) FROM legacy_pos_receipts WHERE currency=code.currency),0) collections,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='refund'),0) refunds,
   coalesce((SELECT sum(coalesce((metadata->>'discountCents')::numeric,0)*sign) FROM period_events WHERE currency=code.currency AND kind='collection'),0) discounts,
   coalesce((SELECT sum(amount) FROM period_events WHERE currency=code.currency AND kind='expense'),0) expenses,
   coalesce((SELECT sum(amount) FROM supplier_groups WHERE currency=code.currency),0) supplier_payments,
   coalesce((SELECT sum((metadata->>'commissionCents')::numeric*sign) FROM period_events WHERE currency=code.currency AND kind='card_settlement'),0) commissions,
   coalesce((SELECT sum(known_cost) FROM costs WHERE currency=code.currency),0) known_cost,
   coalesce((SELECT sum(amount) FROM costs WHERE currency=code.currency AND cost_complete),0) costed_sales,
   (SELECT count(*) FROM costs WHERE currency=code.currency AND cost_complete IS NOT TRUE) missing_cost,
   (SELECT count(*) FROM unresolved_returns WHERE currency=code.currency) unresolved_returns,
   (SELECT count(*) FROM supplier_groups WHERE currency=code.currency AND amount<>0) unclassified_supplier_payments
  FROM codes code
 ),calculated AS(
  SELECT *,sales-returns-discounts net_sales,expenses-supplier_payments operating_expenses,
   collections-refunds-expenses-commissions net_cash,
   CASE WHEN missing_cost=0 AND unresolved_returns=0 THEN sales-returns-discounts-known_cost ELSE NULL END gross_profit
  FROM sums
 ),final AS(
  SELECT *,CASE WHEN unclassified_supplier_payments=0 THEN gross_profit-operating_expenses-commissions ELSE NULL END profit FROM calculated
 )
 SELECT CASE WHEN EXISTS(SELECT 1 FROM final WHERE greatest(abs(sales),abs(returns),abs(net_sales),abs(discounts),abs(collections),abs(refunds),abs(expenses),abs(supplier_payments),abs(operating_expenses),abs(commissions),abs(net_cash),abs(known_cost),abs(costed_sales),missing_cost,unresolved_returns,unclassified_supplier_payments,coalesce(abs(gross_profit),0),coalesce(abs(profit),0))>9007199254740991)
  THEN NULL ELSE jsonb_build_object('dateFrom',p_filters->>'dateFrom','dateTo',p_filters->>'dateTo',
   'currencies',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'salesCents',sales,'returnCents',returns,'netSalesCents',net_sales,
    'collectionsCents',collections,'refundsCents',refunds,'expensesCents',expenses,'supplierPaymentsCents',supplier_payments,
    'operatingExpensesCents',operating_expenses,'commissionCents',commissions,'netCashCents',net_cash,'knownCostCents',known_cost,
    'costedSalesCents',costed_sales,'missingCostOrderCount',missing_cost,'unresolvedReturnCount',unresolved_returns,
    'unclassifiedSupplierPaymentCount',unclassified_supplier_payments,'grossProfitCents',gross_profit,'profitCents',profit)||CASE WHEN discounts<>0 THEN jsonb_build_object('discountCents',discounts) ELSE '{}'::jsonb END ORDER BY currency) FROM final),'[]'::jsonb)) END INTO result;
 IF result IS NULL THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',result;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_mutate(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.accounting_operations%ROWTYPE;account saas.accounting_accounts%ROWTYPE;target saas.accounting_accounts%ROWTYPE;debt saas.accounting_receivables%ROWTYPE;original saas.accounting_events%ROWTYPE;r record;event uuid;customer uuid;order_id_value uuid;account_id_value uuid;currency_code text;amount bigint;commission bigint:=0;current_version bigint;leftover bigint;take bigint;occurred timestamptz;kind_value text;note_value text;method text;channel_value text;reverses uuid;metadata_value jsonb:='{}';result jsonb;projection jsonb;refundable bigint;discount bigint:=0;discount_left bigint:=0;discount_take bigint:=0;discount_allocations jsonb:='[]';
BEGIN PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_plan_version,p_now,p_kind='collect');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR NOT saas.accounting_intent_valid(p_kind,p_args) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.operation:'||p_operation::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member FOR SHARE;PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member FOR SHARE;
 -- Recheck durable role/grant after waiting; revocation never grants a queued writer.
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_plan_version,p_now,p_kind='collect');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 discount:=CASE WHEN p_kind='collect' THEN coalesce((p_args->>'discountCents')::bigint,0) ELSE 0 END;
 IF discount>0 AND NOT saas.in_store_is_manager(p_store,p_member) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF prior.store_id=p_store AND prior.kind=p_kind AND prior.payload_fingerprint=p_fingerprint AND (prior.actor_membership_id=p_member OR saas.in_store_is_manager(p_store,p_member)) THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF discount>0 AND NOT coalesce((SELECT collection_discounts_enabled FROM saas.accounting_release_state WHERE singleton),false) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 event:=saas.inventory_deterministic_uuid('accounting','saas.accounting.event:'||p_operation::text);amount:=(p_args->>'amountCents')::bigint;customer:=(p_args->>'customerId')::uuid;order_id_value:=(p_args->>'orderId')::uuid;account_id_value:=(p_args->>'accountId')::uuid;currency_code:=p_args->>'currency';note_value:=coalesce(p_args->>'note',p_args->>'reason');method:=p_args->>'paymentMethod';occurred:=CASE WHEN p_args?'occurredOn' THEN (p_args->>'occurredOn')::date::timestamp AT TIME ZONE saas.accounting_timezone(p_store) ELSE p_now END;
 IF occurred>p_now THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind IN('collect','openingDebt') THEN
 IF NOT EXISTS(SELECT 1 FROM saas.customers WHERE store_id=p_store AND id=customer) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=customer AND currency=currency_code FOR UPDATE;
 IF coalesce(current_version,0)<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code HAVING sum(sale_cents::numeric)+coalesce(amount,0)>9007199254740991 OR sum(collected_cents::numeric)+coalesce(amount,0)>9007199254740991) THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_kind='saveAccount' THEN account_id_value:=saas.inventory_deterministic_uuid('accounting','saas.accounting.account:'||p_operation::text);INSERT INTO saas.accounting_accounts(id,store_id,name,account_type,currency,created_at) VALUES(account_id_value,p_store,p_args->>'name',p_args->>'type',currency_code,p_now);
 ELSE
 IF p_kind IN('openBalance','expense','refund') THEN
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF p_kind<>'refund' AND account.version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF currency_code IS NOT NULL AND account.currency<>currency_code THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;currency_code:=account.currency;
 ELSIF p_kind IN('transfer','settleCard') THEN
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'fromAccountId')::uuid FOR UPDATE;SELECT * INTO target FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'toAccountId')::uuid FOR UPDATE;
 IF account.id IS NULL OR target.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.version<>(p_args->>'expectedVersion')::bigint OR target.version<>(p_args->>'toExpectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF account.currency<>target.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
 IF p_kind='settleCard' AND (account.account_type<>'card' OR target.account_type<>'bank') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 commission:=coalesce((p_args->>'commissionCents')::bigint,0);currency_code:=account.currency;account_id_value:=account.id;metadata_value:=jsonb_build_object('toAccountId',target.id,'grossCents',amount,'netCents',amount-commission,'commissionCents',commission);
 END IF;
 IF p_kind IN('returnCredit','refund') THEN
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF debt.version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF currency_code IS NOT NULL AND currency_code<>debt.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;currency_code:=debt.currency;customer:=debt.customer_id;channel_value:=debt.channel;
 IF p_kind='returnCredit' AND amount>debt.sale_cents-debt.return_cents-debt.discount_cents THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind='refund' AND amount>greatest(debt.collected_cents-debt.sale_cents+debt.return_cents+debt.discount_cents-debt.refunded_cents,0) THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_kind='collect' THEN
 IF order_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value AND customer_id=customer AND currency=currency_code) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF amount::numeric+discount>(SELECT coalesce(sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)),0) FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value)) THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
 IF amount>0 THEN
 IF account_id_value IS NULL THEN account_id_value:=saas.accounting_default_account(p_store,currency_code,method,p_now);END IF;
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.currency<>currency_code THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
 IF account.account_type<>(CASE method WHEN 'bank_transfer' THEN 'bank' ELSE method END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSE account_id_value:=NULL;method:=NULL;END IF;
 -- A customer receipt can span POS/WEB only when real receivables exist. Channel follows allocations.
 WITH fifo_debts AS(SELECT channel,coalesce(sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)::numeric) OVER(ORDER BY occurred_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_due FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) AND sale_cents-return_cents-discount_cents-collected_cents>0) SELECT CASE WHEN count(DISTINCT channel)=1 AND count(*) FILTER(WHERE channel IS NULL)=0 THEN min(channel) ELSE NULL END INTO channel_value FROM fifo_debts WHERE prior_due<amount::numeric+discount;
 IF discount>0 THEN
  -- Allocate real money first, then forgive only the remaining debt, in the same FIFO sequence.
  leftover:=amount;discount_left:=discount;
  FOR debt IN SELECT * FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) ORDER BY occurred_at,id FOR UPDATE LOOP
   take:=least(leftover,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0));leftover:=leftover-take;
   discount_take:=least(discount_left,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents-take,0));
   IF discount_take>0 THEN discount_allocations:=discount_allocations||jsonb_build_array(jsonb_build_object('receivableId',debt.id,'orderId',debt.order_id,'amountCents',discount_take));discount_left:=discount_left-discount_take;END IF;
   EXIT WHEN leftover=0 AND discount_left=0;
  END LOOP;
  IF leftover<>0 OR discount_left<>0 THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
  metadata_value:=jsonb_build_object('discountCents',discount,'discountAllocations',discount_allocations);
 END IF;
 END IF;
 IF p_kind IN('collect','openBalance') AND account.balance_cents::numeric+amount>9007199254740991 OR p_kind IN('expense','refund','transfer','settleCard') AND account.balance_cents<amount OR p_kind IN('transfer','settleCard') AND target.balance_cents::numeric+amount-commission>9007199254740991 THEN RETURN QUERY SELECT CASE WHEN p_kind IN('expense','refund','transfer','settleCard') AND account.balance_cents<amount THEN 'insufficient_funds' ELSE 'amount_overflow' END,NULL::jsonb;RETURN;END IF;
 IF p_kind='refund' AND account.account_type<>(CASE method WHEN 'bank_transfer' THEN 'bank' ELSE method END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind='reverse' THEN
 SELECT * INTO original FROM saas.accounting_events WHERE store_id=p_store AND id=(p_args->>'eventId')::uuid;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 pending_receipt JOIN saas.in_store_sales s ON s.store_id=pending_receipt.store_id AND s.id=pending_receipt.sale_id LEFT JOIN saas.in_store_payment_returns_v4 returned ON returned.store_id=pending_receipt.store_id AND returned.receipt_id=pending_receipt.id WHERE pending_receipt.store_id=p_store AND (pending_receipt.event_id=original.id OR returned.event_id=original.id) AND s.status<>'completed') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF original.kind IN('sale','reversal') OR EXISTS(SELECT 1 FROM saas.accounting_events WHERE store_id=p_store AND reverses_event_id=original.id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 customer:=original.customer_id;currency_code:=original.currency;order_id_value:=original.order_id;account_id_value:=original.account_id;amount:=original.amount_cents;channel_value:=original.channel;reverses:=original.id;metadata_value:=jsonb_build_object('reversedKind',original.kind)||CASE WHEN coalesce((original.metadata->>'discountCents')::bigint,0)>0 THEN jsonb_build_object('discountCents',(original.metadata->>'discountCents')::bigint,'discountAllocations',original.metadata->'discountAllocations') ELSE '{}'::jsonb END;
 IF order_id_value IS NULL THEN SELECT min(allocated.order_id::text)::uuid INTO order_id_value FROM saas.accounting_allocations allocation JOIN saas.accounting_receivables allocated ON allocated.store_id=allocation.store_id AND allocated.id=allocation.receivable_id WHERE allocation.store_id=p_store AND allocation.event_id=original.id HAVING count(DISTINCT allocated.order_id)=1 AND count(*) FILTER(WHERE allocated.order_id IS NULL)=0;END IF;
 IF customer IS NOT NULL THEN SELECT version INTO current_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=customer AND currency=currency_code FOR UPDATE;
 ELSIF order_id_value IS NOT NULL THEN SELECT version INTO current_version FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value FOR UPDATE;
 ELSIF original.kind='return_credit' AND account_id_value IS NULL THEN
 SELECT d.version INTO current_version FROM saas.accounting_receivables d
 JOIN saas.accounting_allocations a ON a.store_id=d.store_id AND a.receivable_id=d.id
 WHERE a.store_id=p_store AND a.event_id=original.id AND a.effect='return' FOR UPDATE OF d;
 ELSE SELECT version INTO current_version FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;END IF;
 IF current_version IS NULL OR current_version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 FOR r IN SELECT m.*,a.balance_cents FROM saas.accounting_account_movements m JOIN saas.accounting_accounts a ON a.store_id=m.store_id AND a.id=m.account_id WHERE m.store_id=p_store AND m.event_id=original.id ORDER BY m.account_id FOR UPDATE OF a LOOP IF r.balance_cents::numeric-r.amount_cents NOT BETWEEN 0 AND 9007199254740991 THEN RETURN QUERY SELECT 'insufficient_funds',NULL::jsonb;RETURN;END IF;END LOOP;
 FOR r IN SELECT a.*,d.sale_cents,d.collected_cents,d.return_cents,d.discount_cents,d.refunded_cents FROM saas.accounting_allocations a JOIN saas.accounting_receivables d ON d.store_id=a.store_id AND d.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=original.id ORDER BY d.id FOR UPDATE OF d LOOP
 IF r.effect='collect' AND r.collected_cents<r.amount_cents OR r.effect='discount' AND r.discount_cents<r.amount_cents OR r.effect='return' AND r.return_cents<r.amount_cents OR r.effect='refund' AND r.refunded_cents<r.amount_cents OR r.effect='charge' AND (r.collected_cents>0 OR r.return_cents>0 OR r.discount_cents>0) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF r.refunded_cents-coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect='refund'),0) > greatest(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents
  -coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect IN('collect','discount','return')),0)
  +coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect='charge'),0),0)
 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 END LOOP;
 END IF;
 kind_value:=CASE p_kind WHEN 'collect' THEN 'collection' WHEN 'reverse' THEN 'reversal' WHEN 'openingDebt' THEN 'opening_debt' WHEN 'openBalance' THEN 'account_opening' WHEN 'settleCard' THEN 'card_settlement' WHEN 'returnCredit' THEN 'return_credit' ELSE p_kind END;
 INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,account_id,customer_id,order_id,channel,payment_method,note,category,document_number,actor_membership_id,occurred_at,created_at,reverses_event_id,metadata) VALUES(event,p_store,p_operation,kind_value,currency_code,amount,account_id_value,customer,order_id_value,channel_value,method,note_value,p_args->>'category',p_args->>'documentNumber',p_member,occurred,p_now,reverses,metadata_value);
 IF p_kind='openingDebt' THEN
 INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,currency,sale_cents,occurred_at) SELECT event,p_store,customer,jsonb_build_object('name',concat_ws(' ',first_name,last_name),'phone',phone),currency_code,amount,occurred FROM saas.customers WHERE store_id=p_store AND id=customer;
 INSERT INTO saas.accounting_allocations VALUES(p_store,event,event,'charge',amount);
 ELSIF p_kind='collect' THEN
 leftover:=amount;discount_left:=discount;
 FOR debt IN SELECT * FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) ORDER BY occurred_at,id FOR UPDATE LOOP
  take:=least(leftover,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0));
  discount_take:=least(discount_left,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents-take,0));
  IF take>0 THEN INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,'collect',take);END IF;
  IF discount_take>0 THEN INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,'discount',discount_take);END IF;
  IF take>0 OR discount_take>0 THEN UPDATE saas.accounting_receivables SET collected_cents=collected_cents+take,discount_cents=discount_cents+discount_take,version=version+1 WHERE store_id=p_store AND id=debt.id;PERFORM saas.accounting_sync_order(p_store,debt.order_id,p_now);END IF;
  leftover:=leftover-take;discount_left:=discount_left-discount_take;EXIT WHEN leftover=0 AND discount_left=0;
 END LOOP;
 IF amount>0 THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,amount);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+amount,version=version+1 WHERE store_id=p_store AND id=account_id_value;END IF;
 ELSIF p_kind IN('returnCredit','refund') THEN
 INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,CASE p_kind WHEN 'refund' THEN 'refund' ELSE 'return' END,amount);
 UPDATE saas.accounting_receivables SET return_cents=return_cents+CASE WHEN p_kind='returnCredit' THEN amount ELSE 0 END,refunded_cents=refunded_cents+CASE WHEN p_kind='refund' THEN amount ELSE 0 END,version=version+1 WHERE store_id=p_store AND id=debt.id;
 IF p_kind='refund' THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,-amount);UPDATE saas.accounting_accounts SET balance_cents=balance_cents-amount,version=version+1 WHERE store_id=p_store AND id=account_id_value;END IF;PERFORM saas.accounting_sync_order(p_store,order_id_value,p_now);
 ELSIF p_kind IN('openBalance','expense','transfer','settleCard') THEN
 INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,CASE p_kind WHEN 'openBalance' THEN amount ELSE -amount END);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+CASE p_kind WHEN 'openBalance' THEN amount ELSE -amount END,version=version+1 WHERE store_id=p_store AND id=account_id_value;
 IF p_kind IN('transfer','settleCard') THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,target.id,amount-commission);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+amount-commission,version=version+1 WHERE store_id=p_store AND id=target.id;END IF;
 ELSE
 INSERT INTO saas.accounting_allocations SELECT store_id,event,receivable_id,effect,-amount_cents FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id;
 FOR r IN SELECT receivable_id,sum(amount_cents)FILTER(WHERE effect='collect') collected,sum(amount_cents)FILTER(WHERE effect='discount') discounted,sum(amount_cents)FILTER(WHERE effect='return') returned,sum(amount_cents)FILTER(WHERE effect='refund') refunded,sum(amount_cents)FILTER(WHERE effect='charge') charged FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id GROUP BY receivable_id LOOP
  UPDATE saas.accounting_receivables SET collected_cents=collected_cents-coalesce(r.collected,0),discount_cents=discount_cents-coalesce(r.discounted,0),return_cents=return_cents-coalesce(r.returned,0),refunded_cents=refunded_cents-coalesce(r.refunded,0),sale_cents=sale_cents-coalesce(r.charged,0),version=version+1 WHERE store_id=p_store AND id=r.receivable_id;
  PERFORM saas.accounting_sync_order(p_store,(SELECT order_id FROM saas.accounting_receivables WHERE store_id=p_store AND id=r.receivable_id),p_now);
 END LOOP;
 FOR r IN SELECT * FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=original.id LOOP INSERT INTO saas.accounting_account_movements VALUES(p_store,event,r.account_id,-r.amount_cents);UPDATE saas.accounting_accounts SET balance_cents=balance_cents-r.amount_cents,version=version+1 WHERE store_id=p_store AND id=r.account_id;END LOOP;
 END IF;
 IF p_kind='reverse' THEN PERFORM saas.accounting_bump_customer(p_store,affected.customer_id,currency_code) FROM (SELECT DISTINCT allocated.customer_id FROM saas.accounting_allocations allocation JOIN saas.accounting_receivables allocated ON allocated.store_id=allocation.store_id AND allocated.id=allocation.receivable_id WHERE allocation.store_id=p_store AND allocation.event_id=original.id AND allocated.customer_id IS NOT NULL AND allocated.customer_id IS DISTINCT FROM customer) affected;END IF;
 PERFORM saas.accounting_bump_customer(p_store,customer,currency_code);
 END IF;
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'event',CASE WHEN p_kind='saveAccount' THEN NULL ELSE saas.accounting_event_projection(p_store,event) END,'account',CASE WHEN saas.in_store_is_manager(p_store,p_member) THEN saas.accounting_account_projection(p_store,account_id_value) ELSE NULL END,'customerAccount',saas.accounting_customer_projection(p_store,customer,currency_code),'finance',saas.accounting_order_finance(p_store,order_id_value));
 -- Keep the exact frozen operation payload for ambiguous-commit recovery.
 INSERT INTO saas.accounting_operations VALUES(p_operation,p_store,p_member,p_kind,p_fingerprint,result,p_now);RETURN QUERY SELECT 'committed',result;
END $function$
;

CREATE OR REPLACE FUNCTION saas.accounting_schedule_mutate(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_intent jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.accounting_schedule_operations%ROWTYPE;debt saas.accounting_receivables%ROWTYPE;receivable uuid;actual_due bigint;result jsonb;customer_version bigint;
BEGIN
 PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_schedule_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_intent IS NULL OR jsonb_typeof(p_intent)<>'object'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF pg_column_size(p_intent)>16384 OR (SELECT count(*) FROM jsonb_object_keys(p_intent))<>3 OR NOT(p_intent?&ARRAY['receivableId','expectedVersion','installments'])
  OR jsonb_typeof(p_intent->'receivableId')<>'string' OR p_intent->>'receivableId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(p_intent->'expectedVersion')<>'number'
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (p_intent->>'expectedVersion')::numeric<>trunc((p_intent->>'expectedVersion')::numeric)
  OR (p_intent->>'expectedVersion')::numeric NOT BETWEEN 1 AND 9007199254740991 OR NOT saas.accounting_schedule_installments_valid(p_intent->'installments',NULL)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 receivable:=(p_intent->>'receivableId')::uuid;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.schedule.operation:'||p_operation::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_schedule_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.store_id=p_store AND prior.receivable_id=receivable AND prior.payload_fingerprint=p_fingerprint AND (prior.actor_membership_id=p_member OR saas.in_store_is_manager(p_store,p_member))
  THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);
  ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND id=receivable FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF debt.version<>(p_intent->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 actual_due:=greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0);
 IF actual_due=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting_schedule_installments_valid(p_intent->'installments',actual_due) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF debt.version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 IF debt.customer_id IS NOT NULL THEN
  SELECT version INTO customer_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=debt.customer_id AND currency=debt.currency FOR UPDATE;
  IF customer_version>=9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 INSERT INTO saas.accounting_schedule_plans(id,store_id,receivable_id,actor_membership_id,version,planned_cents,installments,created_at)
 VALUES(p_operation,p_store,receivable,p_member,debt.version+1,actual_due,p_intent->'installments',p_now);
 UPDATE saas.accounting_receivables SET version=version+1 WHERE store_id=p_store AND id=receivable;
 PERFORM saas.accounting_bump_customer(p_store,debt.customer_id,debt.currency);
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'schedule',saas.accounting_schedule_projection(p_store,receivable));
 INSERT INTO saas.accounting_schedule_operations(operation_id,store_id,receivable_id,actor_membership_id,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation,p_store,receivable,p_member,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'committed',result;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $function$
;
DO $published$ DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM saas.accounting_discount_243_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.function_oid AND p.proowner=f.function_owner AND p.proacl IS NOT DISTINCT FROM f.function_acl) THEN RAISE EXCEPTION 'ACCOUNTING243_FUNCTION_AUTHORITY_DRIFT: %',f.signature;END IF;
  UPDATE saas.accounting_discount_243_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(f.function_oid),'UTF8')),'hex') WHERE signature=f.signature;
 END LOOP;
END $published$;
COMMIT;
