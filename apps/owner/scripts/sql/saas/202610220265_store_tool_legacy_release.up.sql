-- Administrative release of grandfathered free rights. Original grants and payments stay immutable.
-- Wire responses and application privileges remain unchanged; no app deployment is required.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store-tools.release265',265));
DO $guard$ BEGIN
 IF to_regclass('saas.store_tool_public264_functions')IS NULL OR to_regclass('saas.store_tool_legacy_releases')IS NOT NULL THEN RAISE EXCEPTION 'STORE_TOOL265_PREDECESSOR_INVALID';END IF;
END $guard$;
CREATE TABLE saas.store_tool_legacy_releases(
 store_id uuid NOT NULL,
 tool_key text NOT NULL,
 operation_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason=btrim(reason)AND length(reason)BETWEEN 1 AND 2000 AND reason!~'[[:cntrl:]]'),
 authorization_ref text NOT NULL CHECK(authorization_ref=btrim(authorization_ref)AND length(authorization_ref)BETWEEN 1 AND 512 AND authorization_ref!~'[[:cntrl:]]'),
 executed_by name NOT NULL DEFAULT session_user,
 executed_role name NOT NULL DEFAULT current_user,
 released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,tool_key),
 FOREIGN KEY(store_id,tool_key)REFERENCES saas.store_tool_licenses(store_id,tool_key)
);
CREATE TABLE saas.store_tool_legacy265_functions(LIKE saas.store_tools263_functions INCLUDING ALL);
ALTER TABLE saas.store_tool_legacy265_functions ADD COLUMN is_new boolean NOT NULL DEFAULT false;
DO $private$ DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['store_tool_legacy_releases','store_tool_legacy265_functions']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY store_tool_legacy265_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
CREATE FUNCTION saas.store_tool_legacy_release_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||NEW.store_id::text,263));
 IF NOT EXISTS(SELECT 1 FROM saas.store_tool_licenses l WHERE l.store_id=NEW.store_id AND l.tool_key=NEW.tool_key AND l.source='grandfathered')THEN RAISE EXCEPTION 'LEGACY_RELEASE_NOT_GRANDFATHERED';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_purchases p WHERE p.store_id=NEW.store_id AND p.status='settled'AND NEW.tool_key=ANY(p.tool_keys))THEN RAISE EXCEPTION 'LEGACY_RELEASE_PAID_RIGHT';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_purchases p WHERE p.store_id=NEW.store_id AND p.status='pending'AND NEW.tool_key=ANY(p.tool_keys))THEN RAISE EXCEPTION 'LEGACY_RELEASE_PENDING_PURCHASE';END IF;
 NEW.released_at:=clock_timestamp();NEW.executed_by:=session_user;NEW.executed_role:=current_user;
 RETURN NEW;
END $f$;
CREATE TRIGGER store_tool_legacy_release_validate BEFORE INSERT ON saas.store_tool_legacy_releases FOR EACH ROW EXECUTE FUNCTION saas.store_tool_legacy_release_guard();
CREATE TRIGGER store_tool_legacy_release_immutable BEFORE UPDATE OR DELETE ON saas.store_tool_legacy_releases FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
-- A paid replacement grant is already recorded by the immutable settled purchase and receipt.
-- The original grandfathered row remains intact as historical evidence.
CREATE FUNCTION saas.store_tool_effective_licenses(p_store uuid,p_now timestamptz)
RETURNS TABLE(tool_key text,source text,granted_at timestamptz)LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT DISTINCT ON(q.tool_key)q.tool_key,q.source,q.granted_at FROM(
  SELECT l.tool_key,l.source,l.granted_at FROM saas.store_tool_licenses l
  WHERE p_now IS NOT NULL AND isfinite(p_now)AND l.store_id=p_store AND l.granted_at<=p_now
   AND NOT EXISTS(SELECT 1 FROM saas.store_tool_legacy_releases w WHERE w.store_id=l.store_id AND w.tool_key=l.tool_key AND w.released_at<=p_now)
  UNION ALL
  SELECT l.tool_key,'purchase'::text,p.settled_at FROM saas.store_tool_licenses l
  JOIN saas.store_tool_legacy_releases w ON w.store_id=l.store_id AND w.tool_key=l.tool_key
  JOIN saas.store_tool_purchases p ON p.store_id=l.store_id AND l.tool_key=ANY(p.tool_keys)AND p.status='settled'AND p.settled_at>=w.released_at
  JOIN saas.store_tool_receipts r ON r.store_id=p.store_id AND r.purchase_id=p.id AND r.amount_cents=p.total_cents
  WHERE p_now IS NOT NULL AND isfinite(p_now)AND l.store_id=p_store AND l.source='grandfathered'AND w.released_at<=p_now AND p.settled_at<=p_now
 )q ORDER BY q.tool_key,q.granted_at DESC
$f$;
REVOKE ALL ON FUNCTION saas.store_tool_effective_licenses(uuid,timestamptz),saas.store_tool_legacy_release_guard()FROM PUBLIC;
DO $private$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION saas.store_tool_effective_licenses(uuid,timestamptz),saas.store_tool_legacy_release_guard()FROM %I',r.rolname);
END LOOP;END $private$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'0db0b181924cb10c761c740895fccf19a753387882b7f442b60c41d08332b056'THEN RAISE EXCEPTION 'STORE_TOOL265_PREDECESSOR_DRIFT';END IF;INSERT INTO saas.store_tool_legacy265_functions SELECT 'saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)',pg_get_functiondef(oid),'0db0b181924cb10c761c740895fccf19a753387882b7f442b60c41d08332b056',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.platform_tool_purchase_settle(p_operator uuid, p_purchase uuid, p_expected_version bigint, p_operation text, p_receipt jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE p saas.store_tool_purchases;sid uuid;request jsonb;prior saas.platform_command_results;result jsonb;moment timestamptz;BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_purchase IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_operation IS NULL OR length(p_operation)NOT BETWEEN 1 AND 128 OR p_operation<>btrim(p_operation)OR p_operation~'[[:cntrl:]]'OR saas.catalog_onboarding_json_exact(p_receipt,ARRAY['storeId','amountCents','method','reference','reason'],ARRAY[]::text[])IS DISTINCT FROM true OR saas.store_engagement_uuid_valid(p_receipt->'storeId')IS DISTINCT FROM true OR jsonb_typeof(p_receipt->'amountCents')<>'number'OR(p_receipt->>'amountCents')!~'^[1-9][0-9]{0,14}$'OR p_receipt->>'method'NOT IN('bank_transfer','cash','card')OR saas.store_engagement_text_valid(p_receipt->'reference',1,200)IS DISTINCT FROM true OR saas.store_engagement_text_valid(p_receipt->'reason',1,2000)IS DISTINCT FROM true THEN RAISE EXCEPTION 'invalid_input';END IF;
 sid:=(p_receipt->>'storeId')::uuid;request:=jsonb_build_object('action','tool.purchase.settle','purchaseId',p_purchase,'expectedVersion',p_expected_version,'receipt',p_receipt);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-tool-settle:'||p_operator::text||':'||p_operation,263));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_operation;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||sid::text,263));PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||sid::text,256));moment:=clock_timestamp();
 SELECT * INTO p FROM saas.store_tool_purchases WHERE store_id=sid AND id=p_purchase FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
 IF p.status='settled'THEN RAISE EXCEPTION 'already_settled';END IF;IF p.version<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=sid AND status='active')THEN RAISE EXCEPTION 'store_inactive';END IF;
 IF (p_receipt->>'amountCents')::bigint<>p.total_cents THEN RAISE EXCEPTION 'amount_mismatch';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(sid,moment)WHERE tool_key=ANY(p.tool_keys))THEN RAISE EXCEPTION 'already_owned';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE method=p_receipt->>'method'AND lower(reference)=lower(p_receipt->>'reference'))THEN RAISE EXCEPTION 'receipt_used';END IF;
 BEGIN INSERT INTO saas.store_tool_receipts(store_id,purchase_id,amount_cents,method,reference,reason,operator_id,created_at)VALUES(sid,p.id,p.total_cents,p_receipt->>'method',p_receipt->>'reference',p_receipt->>'reason',p_operator,moment);EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'receipt_used';END;
 UPDATE saas.store_tool_purchases SET status='settled',version=version+1,settled_at=moment WHERE store_id=sid AND id=p.id;
 INSERT INTO saas.store_tool_licenses(store_id,tool_key,source,purchase_id,granted_at)SELECT sid,k,'purchase',p.id,moment FROM unnest(p.tool_keys)k WHERE NOT EXISTS(SELECT 1 FROM saas.store_tool_legacy_releases w WHERE w.store_id=sid AND w.tool_key=k);
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload,created_at)VALUES(p_operator,sid,'tool.purchase.settle',jsonb_build_object('purchaseId',p.id,'offerId',p.offer_id,'totalCents',p.total_cents,'method',p_receipt->>'method','reference',p_receipt->>'reference','reason',p_receipt->>'reason'),moment);
 result:=jsonb_build_object('ok',true,'purchase',saas.store_tool_purchase_projection(sid,p.id),'replayed',false);INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result,created_at)VALUES(p_operator,p_operation,request,result,moment);RETURN result;
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.store_tool_is_licensed(uuid,text,timestamp with time zone)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'8ab17501ef0c159f53abe02df5f21a9a71869430d0a52f42c54cb0b5543ee206'THEN RAISE EXCEPTION 'STORE_TOOL265_PREDECESSOR_DRIFT';END IF;INSERT INTO saas.store_tool_legacy265_functions SELECT 'saas.store_tool_is_licensed(uuid,text,timestamp with time zone)',pg_get_functiondef(oid),'8ab17501ef0c159f53abe02df5f21a9a71869430d0a52f42c54cb0b5543ee206',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.store_tool_is_licensed(p_store uuid, p_tool text, p_now timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT p_now IS NOT NULL AND isfinite(p_now)AND EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(p_store,p_now)l JOIN saas.stores st ON st.id=p_store AND st.status='active' WHERE l.tool_key=p_tool AND EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version AND p.status='active' AND p.valid_from<=p_now AND(p.valid_until IS NULL OR p.valid_until>p_now)WHERE s.store_id=p_store AND s.status='active'AND s.valid_from<=p_now AND(s.valid_until IS NULL OR s.valid_until>p_now)))
$function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'841c500ca181a6010b70c030e32ed642b806f6afff2d83552cc4cd482157d8cd'THEN RAISE EXCEPTION 'STORE_TOOL265_PREDECESSOR_DRIFT';END IF;INSERT INTO saas.store_tool_legacy265_functions SELECT 'saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)',pg_get_functiondef(oid),'841c500ca181a6010b70c030e32ed642b806f6afff2d83552cc4cd482157d8cd',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.store_tool_purchase_request(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_operation uuid, p_offer text, p_quote text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;o saas.store_tool_offers;prior saas.store_tool_purchases;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_offer IS NULL OR p_quote IS NULL OR p_quote!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||p_store::text,263));
 SELECT * INTO prior FROM saas.store_tool_purchases WHERE store_id=p_store AND id=p_operation;
 IF FOUND THEN IF prior.principal_id<>p_principal OR prior.offer_id<>p_offer OR prior.quote_fingerprint<>p_quote THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',saas.store_tool_purchase_projection(p_store,p_operation);END IF;RETURN;END IF;
 SELECT * INTO o FROM saas.store_tool_offers WHERE id=p_offer;IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF o.quote_fingerprint<>p_quote THEN RETURN QUERY SELECT 'quote_changed',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_effective_licenses(p_store,clock_timestamp())WHERE tool_key=ANY(o.tool_keys))THEN RETURN QUERY SELECT 'already_owned',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_purchases WHERE store_id=p_store AND status='pending'AND tool_keys&&o.tool_keys)THEN RETURN QUERY SELECT 'purchase_pending',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.store_tool_purchases(store_id,id,principal_id,offer_id,offer_name,quote_fingerprint,tool_keys,net_cents,vat_bps,vat_cents,total_cents)VALUES(p_store,p_operation,p_principal,o.id,o.name,o.quote_fingerprint,o.tool_keys,o.net_cents,o.vat_bps,round(o.net_cents::numeric*o.vat_bps/10000)::bigint,o.net_cents+round(o.net_cents::numeric*o.vat_bps/10000)::bigint);
 RETURN QUERY SELECT 'ok',saas.store_tool_purchase_projection(p_store,p_operation);
END $function$;
DO $backup$DECLARE o oid;BEGIN o:=to_regprocedure('saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');IF o IS NULL OR encode(sha256(convert_to(pg_get_functiondef(o),'UTF8')),'hex')<>'a44a4a72cdbc77af618fe2f16637e802ea9b79ac4388452f3545b52e9bcb3f48'THEN RAISE EXCEPTION 'STORE_TOOL265_PREDECESSOR_DRIFT';END IF;INSERT INTO saas.store_tool_legacy265_functions SELECT 'saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(oid),'a44a4a72cdbc77af618fe2f16637e802ea9b79ac4388452f3545b52e9bcb3f48',NULL,oid,proowner,proacl,proconfig,prosecdef,provolatile,proisstrict,proparallel,prolang FROM pg_proc WHERE oid=o;END $backup$;
CREATE OR REPLACE FUNCTION saas.store_tool_workspace_read(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;tz text;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 tz:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=tz)THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',jsonb_build_object('storeId',p_store,'timezone',tz,'offers',(SELECT jsonb_agg(saas.store_tool_offer_projection(id)ORDER BY net_cents)FROM saas.store_tool_offers),'licenses',coalesce((SELECT jsonb_agg(jsonb_build_object('toolKey',tool_key,'source',source,'grantedAt',saas.merchant_admin_timestamp(granted_at))ORDER BY tool_key)FROM saas.store_tool_effective_licenses(p_store,p_now)WHERE saas.store_tool_is_licensed(p_store,tool_key,p_now)),'[]'::jsonb),'purchases',coalesce((SELECT jsonb_agg(saas.store_tool_purchase_projection(p_store,id)ORDER BY created_at DESC,id)FROM(SELECT id,created_at FROM saas.store_tool_purchases WHERE store_id=p_store ORDER BY created_at DESC,id LIMIT 100)q),'[]'::jsonb),'canRequestPurchase',EXISTS(SELECT 1 FROM saas.platform_authorized_memberships WHERE id=p_member AND store_id=p_store AND principal_id=p_principal AND status='active'AND role IN('store_owner','admin')));
END $function$;
SET LOCAL search_path=pg_catalog;
INSERT INTO saas.store_tool_legacy265_functions SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),NULL,p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,true FROM pg_proc p WHERE p.oid IN('saas.store_tool_effective_licenses(uuid,timestamptz)'::regprocedure,'saas.store_tool_legacy_release_guard()'::regprocedure);
UPDATE saas.store_tool_legacy265_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
COMMIT;
