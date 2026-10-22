-- One-time, store-bound licenses. No subscription/tariff/order/payment rows are rewritten.
-- VAT basis: GIB general rate 20%, saved in each immutable quote/receipt.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store-tools.release263',263));
DO $f$ BEGIN IF to_regclass('saas.cashier_overview262_functions') IS NULL OR to_regclass('saas.store_tool_offers') IS NOT NULL THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_INVALID';END IF;END $f$;
CREATE TABLE saas.store_tool_offers(id text PRIMARY KEY CHECK(id IN('contact_widget','whatsapp_ordering','cart_capture','restock','order_bump','all_tools')),version bigint NOT NULL CHECK(version=1),name text NOT NULL,tool_keys text[] NOT NULL,net_cents bigint NOT NULL CHECK(net_cents>0),vat_bps integer NOT NULL CHECK(vat_bps BETWEEN 0 AND 10000),quote_fingerprint text NOT NULL CHECK(quote_fingerprint~'^[a-f0-9]{64}$'),CHECK(cardinality(tool_keys) BETWEEN 1 AND 5 AND tool_keys<@ARRAY['contact_widget','whatsapp_ordering','cart_capture','restock','order_bump']::text[]));
CREATE TABLE saas.store_tool_purchases(store_id uuid NOT NULL REFERENCES saas.stores(id),id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES saas.principals(id),offer_id text NOT NULL REFERENCES saas.store_tool_offers(id),offer_name text NOT NULL,quote_fingerprint text NOT NULL,tool_keys text[] NOT NULL,net_cents bigint NOT NULL CHECK(net_cents>0),vat_bps integer NOT NULL CHECK(vat_bps BETWEEN 0 AND 10000),vat_cents bigint NOT NULL CHECK(vat_cents>=0),total_cents bigint NOT NULL CHECK(total_cents=net_cents+vat_cents AND total_cents>0),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','settled')),version bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),settled_at timestamptz,PRIMARY KEY(store_id,id),CHECK((status='pending' AND version=1 AND settled_at IS NULL)OR(status='settled' AND version=2 AND settled_at IS NOT NULL)),CHECK(vat_cents=round(net_cents::numeric*vat_bps/10000)));
CREATE TABLE saas.store_tool_receipts(store_id uuid NOT NULL,purchase_id uuid NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>0),method text NOT NULL CHECK(method IN('bank_transfer','cash','card')),reference text NOT NULL CHECK(reference=btrim(reference)AND length(reference)BETWEEN 1 AND 200 AND reference!~'[[:cntrl:]]'),reason text NOT NULL CHECK(reason=btrim(reason)AND length(reason)BETWEEN 1 AND 2000 AND reason!~'[[:cntrl:]]'),operator_id uuid NOT NULL REFERENCES saas.platform_operators(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,purchase_id),FOREIGN KEY(store_id,purchase_id)REFERENCES saas.store_tool_purchases(store_id,id));
CREATE UNIQUE INDEX store_tool_receipt_reference ON saas.store_tool_receipts(method,lower(reference));
CREATE TABLE saas.store_tool_licenses(store_id uuid NOT NULL REFERENCES saas.stores(id),tool_key text NOT NULL CHECK(tool_key IN('contact_widget','whatsapp_ordering','cart_capture','restock','order_bump')),source text NOT NULL CHECK(source IN('grandfathered','purchase')),purchase_id uuid,granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,tool_key),FOREIGN KEY(store_id,purchase_id)REFERENCES saas.store_tool_purchases(store_id,id),CHECK((source='grandfathered'AND purchase_id IS NULL)OR(source='purchase'AND purchase_id IS NOT NULL)));
CREATE TABLE saas.store_tools263_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL,function_language oid NOT NULL);
DO $f$ DECLARE t text;r record;BEGIN FOREACH t IN ARRAY ARRAY['store_tool_offers','store_tool_purchases','store_tool_receipts','store_tool_licenses','store_tools263_functions']LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY store_tools263_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;END $f$;
INSERT INTO saas.store_tool_offers SELECT id,1,name,CASE WHEN id='all_tools' THEN ARRAY['contact_widget','whatsapp_ordering','cart_capture','restock','order_bump']ELSE ARRAY[id]END,net,2000,encode(sha256(convert_to('store-tools:1:'||id||':'||net::text||':2000','UTF8')),'hex')FROM(VALUES('contact_widget','İletişim balonu',99000::bigint),('whatsapp_ordering','WhatsApp ile sipariş ver',249000),('cart_capture','Sepet yakalama',349000),('restock','Stok gelince haber ver',449000),('order_bump','Sepet ve ödeme önerileri',599000),('all_tools','Tüm mağaza araçları',1399000))v(id,name,net);
-- Snapshot existing earned rights once. Future subscription assignments do not create licenses.
INSERT INTO saas.store_tool_licenses(store_id,tool_key,source)
 SELECT DISTINCT s.store_id,k,'grandfathered' FROM saas.subscriptions s CROSS JOIN unnest(ARRAY['contact_widget','cart_capture','restock','order_bump'])k WHERE s.status='active'AND saas.commercial_plan_has_capability(s.plan_id,'growth_tools')
 UNION SELECT DISTINCT s.store_id,'whatsapp_ordering','grandfathered'FROM saas.subscriptions s WHERE s.status='active'AND saas.whatsapp_order_plan_eligible(s.plan_id);
-- Preserve an already configured restrictive commerce policy even after an old package change.
INSERT INTO saas.store_tool_licenses(store_id,tool_key,source)SELECT DISTINCT r.store_id,'whatsapp_ordering','grandfathered'FROM saas.merchant_admin_records r WHERE r.record_kind='whatsapp_order_setting'AND r.status='active'AND r.config->'enabled'='true'::jsonb ON CONFLICT DO NOTHING;
INSERT INTO saas.store_tool_licenses(store_id,tool_key,source)SELECT DISTINCT r.store_id,CASE r.record_kind WHEN 'contact_widget'THEN 'contact_widget'ELSE 'restock'END,'grandfathered'FROM saas.merchant_admin_records r WHERE r.record_kind IN('contact_widget','restock_alerts')AND r.status='active'AND r.config->'enabled'='true'::jsonb AND saas.merchant_admin_config_valid(r.record_kind,r.config)ON CONFLICT DO NOTHING;
CREATE TRIGGER store_tool_offers_immutable BEFORE UPDATE OR DELETE ON saas.store_tool_offers FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE TRIGGER store_tool_licenses_immutable BEFORE UPDATE OR DELETE ON saas.store_tool_licenses FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE TRIGGER store_tool_receipts_immutable BEFORE UPDATE OR DELETE ON saas.store_tool_receipts FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE FUNCTION saas.store_tool_purchase_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$BEGIN
 IF TG_OP='DELETE'OR(to_jsonb(NEW)-ARRAY['status','version','settled_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','version','settled_at'])OR OLD.status<>'pending'OR NEW.status<>'settled'OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE store_id=NEW.store_id AND purchase_id=NEW.id AND amount_cents=NEW.total_cents)THEN RAISE EXCEPTION 'STORE_TOOL_PURCHASE_IMMUTABLE';END IF;RETURN NEW;END $f$;
CREATE TRIGGER store_tool_purchases_guard BEFORE UPDATE OR DELETE ON saas.store_tool_purchases FOR EACH ROW EXECUTE FUNCTION saas.store_tool_purchase_guard();
CREATE FUNCTION saas.store_tool_is_licensed(p_store uuid,p_tool text,p_now timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT p_now IS NOT NULL AND isfinite(p_now)AND EXISTS(SELECT 1 FROM saas.store_tool_licenses l JOIN saas.stores st ON st.id=l.store_id AND st.status='active' WHERE l.store_id=p_store AND l.tool_key=p_tool AND l.granted_at<=p_now AND EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version AND p.status='active' AND p.valid_from<=p_now AND(p.valid_until IS NULL OR p.valid_until>p_now)WHERE s.store_id=p_store AND s.status='active'AND s.valid_from<=p_now AND(s.valid_until IS NULL OR s.valid_until>p_now)))
$f$;
CREATE FUNCTION saas.store_tool_offer_projection(p_id text)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',id,'version',version,'name',name,'toolKeys',to_jsonb(tool_keys),'netCents',net_cents,'vatBps',vat_bps,'vatCents',round(net_cents::numeric*vat_bps/10000)::bigint,'totalCents',net_cents+round(net_cents::numeric*vat_bps/10000)::bigint,'currency','TRY','quoteFingerprint',quote_fingerprint)FROM saas.store_tool_offers WHERE id=p_id
$f$;
CREATE FUNCTION saas.store_tool_purchase_projection(p_store uuid,p_id uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',p.id,'storeId',p.store_id,'storeName',st.name,'offerId',p.offer_id,'offerName',p.offer_name,'status',p.status,'version',p.version,'createdAt',saas.merchant_admin_timestamp(p.created_at),'netCents',p.net_cents,'vatBps',p.vat_bps,'vatCents',p.vat_cents,'totalCents',p.total_cents,'currency','TRY','toolKeys',to_jsonb(p.tool_keys),'settledAt',CASE WHEN p.settled_at IS NOT NULL THEN saas.merchant_admin_timestamp(p.settled_at)END,'receipt',CASE WHEN r.purchase_id IS NOT NULL THEN jsonb_build_object('method',r.method,'reference',r.reference,'amountCents',r.amount_cents)END)FROM saas.store_tool_purchases p JOIN saas.stores st ON st.id=p.store_id LEFT JOIN saas.store_tool_receipts r ON r.store_id=p.store_id AND r.purchase_id=p.id WHERE p.store_id=p_store AND p.id=p_id
$f$;
CREATE FUNCTION saas.store_tool_workspace_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;tz text;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz)THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',jsonb_build_object('storeId',p_store,'timezone',tz,'offers',(SELECT jsonb_agg(saas.store_tool_offer_projection(id)ORDER BY net_cents)FROM saas.store_tool_offers),'licenses',coalesce((SELECT jsonb_agg(jsonb_build_object('toolKey',tool_key,'source',source,'grantedAt',saas.merchant_admin_timestamp(granted_at))ORDER BY tool_key)FROM saas.store_tool_licenses WHERE store_id=p_store AND saas.store_tool_is_licensed(p_store,tool_key,p_now)),'[]'::jsonb),'purchases',coalesce((SELECT jsonb_agg(saas.store_tool_purchase_projection(p_store,id)ORDER BY created_at DESC,id)FROM(SELECT id,created_at FROM saas.store_tool_purchases WHERE store_id=p_store ORDER BY created_at DESC,id LIMIT 100)q),'[]'::jsonb),'canRequestPurchase',EXISTS(SELECT 1 FROM saas.platform_authorized_memberships WHERE id=p_member AND store_id=p_store AND principal_id=p_principal AND status='active'AND role IN('store_owner','admin')));
END $f$;
CREATE FUNCTION saas.store_tool_purchase_request(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_offer text,p_quote text)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;o saas.store_tool_offers;prior saas.store_tool_purchases;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_offer IS NULL OR p_quote IS NULL OR p_quote!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||p_store::text,263));
 SELECT * INTO prior FROM saas.store_tool_purchases WHERE store_id=p_store AND id=p_operation;
 IF FOUND THEN IF prior.principal_id<>p_principal OR prior.offer_id<>p_offer OR prior.quote_fingerprint<>p_quote THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',saas.store_tool_purchase_projection(p_store,p_operation);END IF;RETURN;END IF;
 SELECT * INTO o FROM saas.store_tool_offers WHERE id=p_offer;IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF o.quote_fingerprint<>p_quote THEN RETURN QUERY SELECT 'quote_changed',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_licenses WHERE store_id=p_store AND tool_key=ANY(o.tool_keys))THEN RETURN QUERY SELECT 'already_owned',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_purchases WHERE store_id=p_store AND status='pending'AND tool_keys&&o.tool_keys)THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.store_tool_purchases(store_id,id,principal_id,offer_id,offer_name,quote_fingerprint,tool_keys,net_cents,vat_bps,vat_cents,total_cents)VALUES(p_store,p_operation,p_principal,o.id,o.name,o.quote_fingerprint,o.tool_keys,o.net_cents,o.vat_bps,round(o.net_cents::numeric*o.vat_bps/10000)::bigint,o.net_cents+round(o.net_cents::numeric*o.vat_bps/10000)::bigint);
 RETURN QUERY SELECT 'ok',saas.store_tool_purchase_projection(p_store,p_operation);
END $f$;
CREATE FUNCTION saas.platform_tool_purchases_read(p_operator uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN PERFORM saas.platform_operator_require_active(p_operator);
 IF saas.catalog_onboarding_json_exact(p_query,ARRAY[]::text[],ARRAY['storeId','status'])IS DISTINCT FROM true OR(p_query?'storeId'AND saas.store_engagement_uuid_valid(p_query->'storeId')IS DISTINCT FROM true)OR(p_query?'status'AND p_query->>'status'NOT IN('pending','settled'))THEN RAISE EXCEPTION 'invalid_input';END IF;
 RETURN jsonb_build_object('available',true,'observedAt',saas.merchant_admin_timestamp(clock_timestamp()),'items',coalesce((SELECT jsonb_agg(saas.store_tool_purchase_projection(q.store_id,q.id)ORDER BY q.created_at DESC,q.id)FROM(SELECT store_id,id,created_at FROM saas.store_tool_purchases WHERE(NOT p_query?'storeId'OR store_id=(p_query->>'storeId')::uuid)AND(NOT p_query?'status'OR status=p_query->>'status')ORDER BY created_at DESC,id LIMIT 500)q),'[]'::jsonb));END $f$;
CREATE FUNCTION saas.platform_tool_purchase_settle(p_operator uuid,p_purchase uuid,p_expected_version bigint,p_operation text,p_receipt jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE p saas.store_tool_purchases;sid uuid;request jsonb;prior saas.platform_command_results;result jsonb;moment timestamptz:=clock_timestamp();BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_purchase IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_operation IS NULL OR length(p_operation)NOT BETWEEN 1 AND 128 OR p_operation<>btrim(p_operation)OR p_operation~'[[:cntrl:]]'OR saas.catalog_onboarding_json_exact(p_receipt,ARRAY['storeId','amountCents','method','reference','reason'],ARRAY[]::text[])IS DISTINCT FROM true OR saas.store_engagement_uuid_valid(p_receipt->'storeId')IS DISTINCT FROM true OR jsonb_typeof(p_receipt->'amountCents')<>'number'OR(p_receipt->>'amountCents')!~'^[1-9][0-9]{0,14}$'OR p_receipt->>'method'NOT IN('bank_transfer','cash','card')OR saas.store_engagement_text_valid(p_receipt->'reference',1,200)IS DISTINCT FROM true OR saas.store_engagement_text_valid(p_receipt->'reason',1,2000)IS DISTINCT FROM true THEN RAISE EXCEPTION 'invalid_input';END IF;
 sid:=(p_receipt->>'storeId')::uuid;request:=jsonb_build_object('action','tool.purchase.settle','purchaseId',p_purchase,'expectedVersion',p_expected_version,'receipt',p_receipt);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-tool-settle:'||p_operator::text||':'||p_operation,263));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_operation;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||sid::text,263));PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||sid::text,256));
 SELECT * INTO p FROM saas.store_tool_purchases WHERE store_id=sid AND id=p_purchase FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
 IF p.status='settled'THEN RAISE EXCEPTION 'already_settled';END IF;IF p.version<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=sid AND status='active')THEN RAISE EXCEPTION 'store_inactive';END IF;
 IF (p_receipt->>'amountCents')::bigint<>p.total_cents THEN RAISE EXCEPTION 'amount_mismatch';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_licenses WHERE store_id=sid AND tool_key=ANY(p.tool_keys))THEN RAISE EXCEPTION 'already_owned';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE method=p_receipt->>'method'AND lower(reference)=lower(p_receipt->>'reference'))THEN RAISE EXCEPTION 'receipt_used';END IF;
 BEGIN INSERT INTO saas.store_tool_receipts(store_id,purchase_id,amount_cents,method,reference,reason,operator_id,created_at)VALUES(sid,p.id,p.total_cents,p_receipt->>'method',p_receipt->>'reference',p_receipt->>'reason',p_operator,moment);EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'receipt_used';END;
 UPDATE saas.store_tool_purchases SET status='settled',version=version+1,settled_at=moment WHERE store_id=sid AND id=p.id;
 INSERT INTO saas.store_tool_licenses(store_id,tool_key,source,purchase_id,granted_at)SELECT sid,k,'purchase',p.id,moment FROM unnest(p.tool_keys)k;
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload,created_at)VALUES(p_operator,sid,'tool.purchase.settle',jsonb_build_object('purchaseId',p.id,'offerId',p.offer_id,'totalCents',p.total_cents,'method',p_receipt->>'method','reference',p_receipt->>'reference','reason',p_receipt->>'reason'),moment);
 result:=jsonb_build_object('ok',true,'purchase',saas.store_tool_purchase_projection(sid,p.id),'replayed',false);INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result,created_at)VALUES(p_operator,p_operation,request,result,moment);RETURN result;
END $f$;
-- Reviewed exact native administration gates.
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'7563d2eb1011224e70c2821c3ee0e6646de90c83766e3aba5bc2cb3957bc3675'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: merchant_admin_authority_error';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)',pg_get_functiondef(oid),'7563d2eb1011224e70c2821c3ee0e6646de90c83766e3aba5bc2cb3957bc3675',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_kind text, p_mutation boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE tool text;denied text;
BEGIN
 tool:=CASE p_kind WHEN 'contact_widget' THEN 'contact_widget' WHEN 'restock_alerts' THEN 'restock' WHEN 'whatsapp_order_setting' THEN 'whatsapp_ordering' WHEN 'order_bump' THEN 'order_bump' END;
 IF tool IS NULL THEN RETURN saas.merchant_admin_authority_error_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_mutation);END IF;
 denied:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END);
 IF denied IS NOT NULL THEN RETURN denied;END IF;
 IF NOT saas.store_tool_is_licensed(p_store_id,tool,p_now)THEN RETURN 'feature_not_enabled';END IF;
 RETURN NULL;
END $function$;

DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'b82187559166956c8602a48887ebae16fb6d8482cfd5c6dcd7a21346d3f23891'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: order_bump_options';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])',pg_get_functiondef(oid),'b82187559166956c8602a48887ebae16fb6d8482cfd5c6dcd7a21346d3f23891',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.order_bump_options(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_kind text, p_page integer, p_search text, p_product uuid, p_ids uuid[])
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;items jsonb;total bigint;
BEGIN
IF NOT saas.store_tool_is_licensed(p_store,'order_bump',p_now)THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_kind IS NULL OR p_kind NOT IN('product','category','variant') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_search IS NOT NULL AND(p_search<>btrim(p_search) OR char_length(p_search) NOT BETWEEN 1 AND 120 OR p_search~'[[:cntrl:]]')
 OR p_product IS NOT NULL AND p_kind<>'variant'
 OR p_ids IS NOT NULL AND(cardinality(p_ids) NOT BETWEEN 1 AND 400 OR array_position(p_ids,NULL) IS NOT NULL OR p_page<>1 OR p_search IS NOT NULL OR p_product IS NOT NULL OR(SELECT count(DISTINCT x) FROM unnest(p_ids) x)<>cardinality(p_ids))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH candidates AS MATERIALIZED(
  SELECT p.id,p.title label,NULL::uuid product_id,p.status='active' active_source FROM saas.products p WHERE p_kind='product' AND p.store_id=p_store AND(p_ids IS NOT NULL AND p.id=ANY(p_ids) OR p_ids IS NULL AND p.status='active')
  UNION ALL SELECT c.id,c.name,NULL::uuid,c.status='active' FROM saas.catalog_categories c WHERE p_kind='category' AND c.store_id=p_store AND(p_ids IS NOT NULL AND c.id=ANY(p_ids) OR p_ids IS NULL AND c.status='active')
  UNION ALL SELECT v.id,v.title,v.product_id,v.status='active' AND p.status='active' AND p.currency='TRY'
  FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id
  WHERE p_kind='variant' AND v.store_id=p_store AND(p_product IS NULL OR v.product_id=p_product) AND(p_ids IS NOT NULL AND v.id=ANY(p_ids) OR p_ids IS NULL AND v.status='active' AND p.status='active' AND p.currency='TRY')
 ),filtered AS MATERIALIZED(SELECT * FROM candidates WHERE p_ids IS NOT NULL OR p_search IS NULL OR strpos(lower(label),lower(p_search))>0),page AS MATERIALIZED(
  SELECT * FROM filtered ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id LIMIT CASE WHEN p_ids IS NULL THEN 20 ELSE 400 END OFFSET CASE WHEN p_ids IS NULL THEN(p_page-1)*20 ELSE 0 END
 ),projected AS(
  SELECT page.*,CASE WHEN p_kind='variant' AND r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 THEN r.price_cents END price_cents,
  coalesce(page.active_source AND(p_kind<>'variant' OR r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 AND coalesce(saas.storefront_available_stock(p_store,page.id,p_now,NULL),0)>0),false) available
  FROM page LEFT JOIN LATERAL saas.resolve_effective_variant_price(p_store,page.id,'storefront',p_now,NULL) r ON p_kind='variant'
 ) SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'productId',product_id,'priceCents',price_cents,'available',available) ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id) FROM projected),'[]'::jsonb),(SELECT count(*) FROM filtered) INTO items,total;
 RETURN QUERY SELECT 'ok',jsonb_build_object('items',items,'page',p_page,'totalCount',total);
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'4b3e99c7b2e916e3d0cd94f5dd0d4d84d6c64a7611e2a70653cfb6e891c86a1d'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: order_bump_settings_get';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(oid),'4b3e99c7b2e916e3d0cd94f5dd0d4d84d6c64a7611e2a70653cfb6e891c86a1d',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.order_bump_settings_get(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;s saas.order_bump_settings;BEGIN
IF NOT saas.store_tool_is_licensed(p_store,'order_bump',p_now)THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store;
 RETURN QUERY SELECT 'ok',saas.order_bump_workspace(s);
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'394b1cdd933660944a2efb20f465d325613e2def9cf3e16af05ec8bd9d2f47e9'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: order_bump_settings_save';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)',pg_get_functiondef(oid),'394b1cdd933660944a2efb20f465d325613e2def9cf3e16af05ec8bd9d2f47e9',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.order_bump_settings_save(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_expected_version bigint, p_config jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;s saas.order_bump_settings;op saas.order_bump_operations;request jsonb;result jsonb;r jsonb;k text;item jsonb;found_ref boolean;prior jsonb;
BEGIN
IF NOT saas.store_tool_is_licensed(p_store,'order_bump',p_now)THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
 OR p_now IS NULL OR NOT isfinite(p_now) OR saas.order_bump_config_valid(p_config) IS DISTINCT FROM true OR pg_column_size(p_config)>65536 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('action','save_order_bumps','expectedVersion',p_expected_version,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('order-bump-settings:'||p_store::text,223));
 SELECT * INTO op FROM saas.order_bump_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF s.store_id IS NOT NULL AND p_now<s.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Existing unavailable selections may be retained while editing/disabling; new references must be active and same-store.
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rules') LOOP
  FOREACH k IN ARRAY ARRAY['productIds','categoryIds','variantIds'] LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(r->k) LOOP
    prior:=coalesce(s.config->'rules','[]'::jsonb);
    IF k='productIds' THEN SELECT EXISTS(SELECT 1 FROM saas.products x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSIF k='categoryIds' THEN SELECT EXISTS(SELECT 1 FROM saas.catalog_categories x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSE SELECT EXISTS(SELECT 1 FROM saas.product_variants x JOIN saas.products p ON p.store_id=x.store_id AND p.id=x.product_id WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' AND p.status='active' AND p.currency='TRY' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;END IF;
    IF NOT found_ref THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 INSERT INTO saas.order_bump_settings(store_id,version,config,created_by,updated_by,created_at,updated_at)
 VALUES(p_store,p_expected_version+1,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now))
 ON CONFLICT(store_id) DO UPDATE SET version=EXCLUDED.version,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING * INTO s;
 result:=saas.order_bump_workspace(s);
 INSERT INTO saas.order_bump_operations(store_id,operation_id,principal_id,membership_id,fingerprint,request_payload,result_payload,created_at) VALUES(p_store,p_operation,p_principal,p_membership,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'00421eef632d5a1b014d7bb7f42c4d808bee2ca86a52843b42410a11bc6479ac'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: store_engagement_campaign_list';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(oid),'00421eef632d5a1b014d7bb7f42c4d808bee2ca86a52843b42410a11bc6479ac',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.store_engagement_campaign_list(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text; BEGIN
IF NOT saas.store_tool_is_licensed(p_store,'cart_capture',p_now)AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools')THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',coalesce(jsonb_agg(saas.store_engagement_projection(c) ORDER BY c.kind,c.created_at,c.id),'[]'::jsonb) FROM saas.store_engagement_campaigns c WHERE c.store_id=p_store AND((c.kind='cart_capture'AND saas.store_tool_is_licensed(p_store,'cart_capture',p_now))OR(c.kind='popup'AND saas.commercial_plan_has_capability(p_plan,'growth_tools')));
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'46b9195ef8acf6e338bf746ef7c04159e1a981d574d205a33e1bf4ad795a0381'THEN RAISE EXCEPTION 'STORE_TOOL263_PREDECESSOR_DRIFT: store_engagement_campaign_save';END IF;INSERT INTO saas.store_tools263_functions SELECT 'saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)',pg_get_functiondef(oid),'46b9195ef8acf6e338bf746ef7c04159e1a981d574d205a33e1bf4ad795a0381',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.store_engagement_campaign_save(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_campaign uuid, p_expected_version bigint, p_kind text, p_name text, p_enabled boolean, p_config jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;op saas.store_engagement_admin_operations;c saas.store_engagement_campaigns;request jsonb;result jsonb;
BEGIN
IF(p_kind='cart_capture'AND NOT saas.store_tool_is_licensed(p_store,'cart_capture',p_now))OR(p_kind='popup'AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools'))THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT isfinite(p_now)
 OR p_kind IS NULL OR p_kind NOT IN('popup','cart_capture') OR p_name IS NULL OR p_name<>btrim(p_name) OR char_length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]'
 OR p_enabled IS NULL OR(p_campaign IS NULL)<>(p_expected_version IS NULL) OR p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991
 OR saas.store_engagement_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version,'kind',p_kind,'name',p_name,'enabled',p_enabled,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-save:'||p_store::text,215));
 SELECT * INTO op FROM saas.store_engagement_admin_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 IF p_config?'image' AND saas.store_engagement_image_url(p_store,p_config) IS NULL
 AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->'image'=p_config->'image'))
 THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
 -- Turning off an existing campaign remains possible after its linked coupon expires.
 IF p_config?'promotionId' THEN
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store AND id=(p_config->>'promotionId')::uuid AND NOT saas.promotion_is_deleted_v1(p_store,(p_config->>'promotionId')::uuid))
  AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->'promotionId'=p_config->'promotionId'))
  THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
  IF p_enabled AND saas.store_engagement_coupon(p_store,(p_config->>'promotionId')::uuid,p_now) IS NULL THEN RETURN QUERY SELECT 'promotion_unavailable',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_campaign IS NULL THEN
  IF p_kind='popup' AND(SELECT count(*) FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='popup')>=20 THEN RETURN QUERY SELECT 'limit_exceeded',NULL::jsonb;RETURN;END IF;
  IF p_kind='cart_capture' AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='cart_capture') THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.store_engagement_campaigns(store_id,kind,name,enabled,config,created_by,updated_by,created_at,updated_at) VALUES(p_store,p_kind,p_name,p_enabled,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now)) RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM saas.store_engagement_campaigns WHERE store_id=p_store AND id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF c.version<>p_expected_version OR c.kind<>p_kind THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF c.version>=9007199254740991 OR p_now<c.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.store_engagement_campaigns SET name=p_name,enabled=p_enabled,config=p_config,version=version+1,updated_by=p_principal,updated_at=date_trunc('milliseconds',p_now) WHERE store_id=p_store AND id=c.id RETURNING * INTO c;
 END IF;
 result:=saas.store_engagement_projection(c);
 INSERT INTO saas.store_engagement_admin_operations VALUES(p_store,p_operation,p_principal,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $function$;
UPDATE saas.store_tools263_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
-- ADMIN263_END
DO $f$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'store_tool_%'OR proname IN('platform_tool_purchases_read','platform_tool_purchase_settle'))LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.identity);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM celebix_saas_app,celebix_saas_platform_operator,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator',r.identity);
 END LOOP;END $f$;
GRANT EXECUTE ON FUNCTION saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.platform_tool_purchases_read(uuid,jsonb),saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)TO celebix_saas_platform_operator;
COMMIT;
