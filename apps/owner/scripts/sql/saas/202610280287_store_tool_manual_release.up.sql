-- Explicit owner-maintenance close of an attested unpaid manual request.
-- Purchases, receipts, licenses, checkout intents and prospective282 origins stay intact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store-tool.manual-release287',0));
DO $guard$DECLARE p record;BEGIN
 IF to_regclass('saas.platform_checkout282_predecessors')IS NULL OR to_regclass('saas.store_tool_manual_releases287')IS NOT NULL THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_PREDECESSOR_INVALID';END IF;
 SELECT x.*,pg_get_userbyid(x.proowner)owner_name INTO p FROM pg_proc x WHERE oid='saas.platform_tool_purchase_released282(uuid,uuid)'::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>'f84a1f5143f737d31eef9bf5874f782b4fefc57c84cd5dbd19df1328c7883244'
  OR p.owner_name<>'celebix_saas_owner'OR p.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]OR NOT p.prosecdef OR p.provolatile<>'s'
 THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_ROUTINE_DRIFT';END IF;
END $guard$;
CREATE TABLE saas.store_tool_manual287_predecessors AS SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid)definition,p.oid function_oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace;
ALTER TABLE saas.store_tool_manual287_predecessors ADD PRIMARY KEY(signature);
CREATE TABLE saas.store_tool_manual_releases287(
 store_id uuid NOT NULL,purchase_id uuid NOT NULL,operator_id uuid NOT NULL REFERENCES saas.platform_operators(id),operation_id uuid NOT NULL UNIQUE,
 expected_version bigint NOT NULL CHECK(expected_version>=1),reason text NOT NULL CHECK(reason=btrim(reason)AND length(reason)BETWEEN 1 AND 2000 AND reason!~'[[:cntrl:]]'),
 confirmed_unpaid boolean NOT NULL CHECK(confirmed_unpaid),linked_order_ids uuid[] NOT NULL,
 executed_by name NOT NULL DEFAULT session_user,executed_role name NOT NULL DEFAULT current_user,released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,purchase_id),FOREIGN KEY(store_id,purchase_id)REFERENCES saas.store_tool_purchases(store_id,id)
);
CREATE TRIGGER store_tool_manual_release_immutable287 BEFORE UPDATE OR DELETE ON saas.store_tool_manual_releases287 FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE TRIGGER store_tool_manual_release_no_truncate287 BEFORE TRUNCATE ON saas.store_tool_manual_releases287 FOR EACH STATEMENT EXECUTE FUNCTION saas.platform_append_only();
DO $private$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['store_tool_manual287_predecessors','store_tool_manual_releases287']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY store_tool_manual287_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
CREATE OR REPLACE FUNCTION saas.platform_tool_purchase_released282(p_store uuid,p_purchase uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.platform_tool_purchase_releases282 WHERE store_id=p_store AND purchase_id=p_purchase)
 OR EXISTS(SELECT 1 FROM saas.store_tool_manual_releases287 WHERE store_id=p_store AND purchase_id=p_purchase)
$f$;
CREATE FUNCTION saas.platform_tool_purchase_manual_release287(p_operator uuid,p_store uuid,p_purchase uuid,p_expected_version bigint,p_operation uuid,p_reason text,p_confirmed_unpaid boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,saas AS $f$
DECLARE prior saas.store_tool_manual_releases287;p saas.store_tool_purchases;q saas.platform_checkout_orders;candidate record;moment timestamptz;orders uuid[];BEGIN
 IF current_user<>'celebix_saas_owner'THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';END IF;
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_store IS NULL OR p_purchase IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_operation IS NULL OR p_confirmed_unpaid IS DISTINCT FROM true
  OR p_reason IS NULL OR p_reason<>btrim(p_reason)OR length(p_reason)NOT BETWEEN 1 AND 2000 OR p_reason~'[[:cntrl:]]'THEN RAISE EXCEPTION 'invalid_input';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tool.manual-release.operation287:'||p_operation,0));
 SELECT *INTO prior FROM saas.store_tool_manual_releases287 WHERE operation_id=p_operation;
 IF FOUND THEN
  IF prior.operator_id<>p_operator OR prior.store_id<>p_store OR prior.purchase_id<>p_purchase OR prior.expected_version<>p_expected_version OR prior.reason<>p_reason OR prior.confirmed_unpaid IS DISTINCT FROM p_confirmed_unpaid THEN RAISE EXCEPTION 'operation_mismatch';END IF;
  RETURN jsonb_build_object('released',true,'replayed',true,'storeId',prior.store_id,'purchaseId',prior.purchase_id,'operationId',prior.operation_id,'releasedAt',saas.merchant_admin_timestamp(prior.released_at));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active')THEN RAISE EXCEPTION 'store_inactive';END IF;
 -- Same upstream order as checkout create/finish. The tool lock also excludes manual settlement.
 INSERT INTO saas.platform_store_versions(store_id)VALUES(p_store)ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.platform_store_versions WHERE store_id=p_store FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:'||p_store,263));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||p_store,256));
 FOR candidate IN SELECT id FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=p_purchase ORDER BY id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:'||candidate.id,0));
  PERFORM 1 FROM saas.platform_checkout_orders WHERE id=candidate.id AND store_id=p_store FOR UPDATE;
 END LOOP;
 -- New statement snapshots after every wait: never authorize from an earlier read or clock.
 SELECT *INTO p FROM saas.store_tool_purchases WHERE store_id=p_store AND id=p_purchase FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
 moment:=clock_timestamp();PERFORM saas.platform_operator_require_active(p_operator);
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active')THEN RAISE EXCEPTION 'store_inactive';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_manual_releases287 WHERE store_id=p_store AND purchase_id=p_purchase)THEN RAISE EXCEPTION 'already_released';END IF;
 IF p.status<>'pending'THEN RAISE EXCEPTION 'not_pending';END IF;IF p.version<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_tool_purchase_origins282 WHERE store_id=p_store AND purchase_id=p_purchase)THEN RAISE EXCEPTION 'prospective_provenance';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE store_id=p_store AND purchase_id=p_purchase)THEN RAISE EXCEPTION 'receipt_present';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p.tool_keys)k WHERE saas.store_tool_is_licensed(p_store,k,moment))THEN RAISE EXCEPTION 'already_licensed';END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders o JOIN saas.platform_checkout_attempts a ON a.order_id=o.id WHERE o.store_id=p_store AND o.tool_purchase_id=p_purchase)THEN RAISE EXCEPTION 'provider_attempt_present';END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=p_purchase AND expires_at>moment)THEN RAISE EXCEPTION 'quote_live';END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=p_purchase AND status NOT IN('pending','processing','failed','expired'))THEN RAISE EXCEPTION 'quote_not_unpaid';END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[])INTO orders FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=p_purchase;
 FOR q IN SELECT *FROM saas.platform_checkout_orders WHERE store_id=p_store AND tool_purchase_id=p_purchase AND status IN('pending','processing','failed')ORDER BY id LOOP
  -- Reviewed282 expiry transition, scoped to this one purchase. Expired status defeats stale-time begin.
  UPDATE saas.platform_checkout_orders SET status='expired',updated_at=moment WHERE id=q.id AND store_id=p_store;
  INSERT INTO saas.platform_checkout_audit(order_id,actor_kind,principal_id,action,payload,created_at)VALUES(q.id,'machine',NULL,'quote_expired',jsonb_build_object('reason','unpaid_quote_expired','previousStatus',q.status,'manualReleaseOperationId',p_operation,'operatorId',p_operator),moment);
 END LOOP;
 INSERT INTO saas.store_tool_manual_releases287(store_id,purchase_id,operator_id,operation_id,expected_version,reason,confirmed_unpaid,linked_order_ids,released_at)VALUES(p_store,p_purchase,p_operator,p_operation,p_expected_version,p_reason,true,orders,moment);
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload,created_at)VALUES(p_operator,p_store,'tool.purchase.manual_release',jsonb_build_object('purchaseId',p_purchase,'operationId',p_operation,'expectedVersion',p_expected_version,'reason',p_reason,'confirmedUnpaid',true,'linkedOrderIds',to_jsonb(orders)),moment);
 RETURN jsonb_build_object('released',true,'replayed',false,'storeId',p_store,'purchaseId',p_purchase,'operationId',p_operation,'releasedAt',saas.merchant_admin_timestamp(moment));
END $f$;
REVOKE ALL ON FUNCTION saas.platform_tool_purchase_manual_release287(uuid,uuid,uuid,bigint,uuid,text,boolean)FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.platform_tool_purchase_manual_release287(uuid,uuid,uuid,bigint,uuid,text,boolean)FROM %I',r.rolname);END LOOP;END $acl$;
COMMIT;
