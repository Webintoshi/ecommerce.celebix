-- Explicit cashier order access. Existing grants remain denied; older staff DTOs stay exact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cashier.orders.release259',0));
DO $pre$DECLARE f record;BEGIN
 IF to_regclass('saas.accounting_cashier_commission_sales') IS NULL OR to_regclass('saas.whatsapp_commerce_258_backup') IS NULL OR to_regprocedure('saas.orders_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz)') IS NOT NULL THEN RAISE EXCEPTION 'CASHIER_ORDERS259_PREDECESSOR';END IF;
 SELECT p.*,pg_get_functiondef(p.oid) definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure;
 IF NOT EXISTS(SELECT 1 FROM saas.cashier_238_function_backup b WHERE b.function_oid=f.oid AND b.published_sha256=encode(sha256(convert_to(f.definition,'UTF8')),'hex') AND b.function_owner=f.proowner AND b.function_acl IS NOT DISTINCT FROM f.proacl)
 OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT f.prosecdef OR f.provolatile<>'s' OR f.proisstrict OR f.proparallel<>'u' THEN RAISE EXCEPTION 'CASHIER_ORDERS259_PREDECESSOR_DRIFT';END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('saas.in_store_sales_set_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer)'::regprocedure),'UTF8')),'hex')<>'3dc299f8d88aab2adf58f00a1f0010195f7f5ac5385b4442776c03e0f90cdaa9' THEN RAISE EXCEPTION 'CASHIER_ORDERS259_STAFF_PREDECESSOR_DRIFT';END IF;
END $pre$;
CREATE TABLE saas.cashier_orders259_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text NOT NULL,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL,function_language oid NOT NULL,is_new boolean NOT NULL);
ALTER TABLE saas.cashier_orders259_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cashier_orders259_functions FORCE ROW LEVEL SECURITY;
CREATE POLICY cashier_orders259_owner ON saas.cashier_orders259_functions TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.cashier_orders259_functions FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON saas.cashier_orders259_functions FROM %I',r.rolname);END LOOP;END $acl$;
INSERT INTO saas.cashier_orders259_functions
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,false
 FROM pg_proc p WHERE p.oid='saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure;
ALTER TABLE saas.in_store_staff_grants ADD COLUMN can_manage_orders boolean NOT NULL DEFAULT false;

CREATE FUNCTION saas.orders259_can_manage(p_store uuid,p_member uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.platform_authorized_memberships m JOIN saas.in_store_staff_grants g ON g.store_id=m.store_id AND g.membership_id=m.id WHERE m.store_id=p_store AND m.id=p_member AND m.status='active' AND m.role='cashier' AND g.enabled AND g.can_manage_orders)
$f$;
DO $patch$DECLARE saved record;definition text;old_piece text:=$old$(membership_role='cashier' AND p_required_action IN ('in_store.read','in_store.sell','in_store.discount','analytics.read','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete'))$old$;
 new_piece text:=$new$(membership_role='cashier' AND p_required_action IN ('in_store.read','in_store.sell','in_store.discount','analytics.read','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete'))
    OR (membership_role='cashier' AND p_required_action IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note') AND saas.commercial_plan_has_capability(p_plan_id,'cashier') AND saas.orders259_can_manage(p_store_id,p_membership_id))$new$;
BEGIN
 SELECT * INTO STRICT saved FROM saas.cashier_orders259_functions WHERE NOT is_new;
 IF (length(saved.definition)-length(replace(saved.definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'CASHIER_ORDERS259_SOURCE_ANCHOR_DRIFT';END IF;
 definition:=replace(saved.definition,old_piece,new_piece);EXECUTE definition;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.proowner=saved.function_owner AND p.proacl IS NOT DISTINCT FROM saved.function_acl AND p.proconfig IS NOT DISTINCT FROM saved.function_config AND p.prosecdef=saved.function_security AND p.provolatile=saved.function_volatility AND p.proisstrict=saved.function_strict AND p.proparallel=saved.function_parallel AND p.prolang=saved.function_language) THEN RAISE EXCEPTION 'CASHIER_ORDERS259_PUBLISH_METADATA_DRIFT';END IF;
 UPDATE saas.cashier_orders259_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') WHERE signature=saved.signature;
END $patch$;

CREATE FUNCTION saas.orders_access_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;manage boolean;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','orders.read');
 -- A valid ungranted cashier may read only this boolean; ordinary order APIs remain denied.
 IF err='membership_denied' AND EXISTS(SELECT 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active' AND role='cashier') THEN
  err:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','in_store.read');
 END IF;
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 manage:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','orders.manage') IS NULL;
 RETURN QUERY SELECT 'found',jsonb_build_object('canManageOrders',manage);
END $f$;
CREATE FUNCTION saas.in_store_staff_projection_v7(p_store uuid,p_member uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.in_store_staff_projection_v6(p_store,p_member)||jsonb_build_object('canManageOrders',coalesce((SELECT can_manage_orders FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false))
$f$;
CREATE FUNCTION saas.in_store_sales_list_staff_v7(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('staff',coalesce(jsonb_agg(saas.in_store_staff_projection_v7(p_store_id,m.id) ORDER BY m.id),'[]'::jsonb)) FROM (SELECT id FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND status='active' ORDER BY id LIMIT 100) m;
END $function$;
CREATE FUNCTION saas.in_store_sales_recover_staff_v7(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff_v7' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canManageOrders',coalesce((prior.result_payload->>'canManageOrders')::boolean,false),'commissionEnabled',coalesce((prior.result_payload->>'commissionEnabled')::boolean,false),'commissionRateBps',coalesce((prior.result_payload->>'commissionRateBps')::integer,0),'canManageAccounting',coalesce((prior.result_payload->>'canManageAccounting')::boolean,false),'canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false),'canSellOnCredit',coalesce((prior.result_payload->>'canSellOnCredit')::boolean,false),'canCollectReceivables',coalesce((prior.result_payload->>'canCollectReceivables')::boolean,false));
END $function$;
CREATE FUNCTION saas.in_store_sales_set_staff_v7(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_target_member uuid, p_expected_version bigint, p_enabled boolean, p_locations uuid[], p_discount_limit integer, p_can_edit_price boolean, p_can_sell_on_credit boolean, p_can_collect_receivables boolean, p_can_manage_accounting boolean, p_commission_enabled boolean, p_commission_rate_bps integer, p_can_manage_orders boolean)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;current_version bigint;projected jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_set_staff_v7');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_target_member IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_can_edit_price IS NULL OR p_can_sell_on_credit IS NULL OR p_can_collect_receivables IS NULL OR p_can_manage_accounting IS NULL OR p_can_manage_orders IS NULL OR p_commission_enabled IS NULL OR p_commission_rate_bps IS NULL OR p_commission_rate_bps NOT BETWEEN 0 AND 10000 OR (p_commission_enabled AND p_commission_rate_bps<1) OR p_enabled IS NULL OR p_locations IS NULL OR cardinality(p_locations)>100 OR array_position(p_locations,NULL) IS NOT NULL OR p_discount_limit IS NULL OR p_discount_limit NOT BETWEEN 0 AND 9999 OR cardinality(p_locations)<>(SELECT count(DISTINCT id) FROM unnest(p_locations) id) OR (p_enabled AND cardinality(p_locations)=0) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 -- Lock durable authority and recheck after any wait on the store writer lock.
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id FOR SHARE;
 PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND id=p_target_member FOR SHARE;
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;

 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id=p_store_id AND prior.operation_kind='set_staff_v7' AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF ((p_can_manage_accounting OR p_commission_enabled OR p_can_manage_orders) AND NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role='cashier')) OR NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role IN('store_owner','admin','cashier')) OR EXISTS(SELECT 1 FROM unnest(p_locations) assigned(id) WHERE NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE id=assigned.id AND store_id=p_store_id AND status='active')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_target_member FOR UPDATE;
 IF coalesce(current_version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_edit_price,can_collect_receivables,can_sell_on_credit,can_manage_accounting,commission_enabled,commission_rate_bps,can_manage_orders) VALUES(p_store_id,p_target_member,p_enabled,p_locations,p_discount_limit,1,p_now,p_can_edit_price,p_can_collect_receivables,p_can_sell_on_credit,p_can_manage_accounting,p_commission_enabled,p_commission_rate_bps,p_can_manage_orders)
 ON CONFLICT(membership_id) DO UPDATE SET can_manage_orders=excluded.can_manage_orders,commission_enabled=excluded.commission_enabled,commission_rate_bps=excluded.commission_rate_bps,can_manage_accounting=excluded.can_manage_accounting,can_collect_receivables=excluded.can_collect_receivables,can_sell_on_credit=excluded.can_sell_on_credit,can_edit_price=excluded.can_edit_price,enabled=excluded.enabled,location_ids=excluded.location_ids,discount_limit_bps=excluded.discount_limit_bps,version=saas.in_store_staff_grants.version+1,updated_at=p_now;
 projected:=saas.in_store_staff_projection_v7(p_store_id,p_target_member);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,NULL,'set_staff_v7',p_fingerprint,projected,p_now);
 RETURN QUERY SELECT 'committed',projected;
END $function$;

DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('orders259_can_manage','orders_access_read','in_store_staff_projection_v7','in_store_sales_list_staff_v7','in_store_sales_set_staff_v7','in_store_sales_recover_staff_v7') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.oid::regprocedure);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.oid::regprocedure,r.rolname);END LOOP;
  IF f.proname NOT IN('orders259_can_manage','in_store_staff_projection_v7') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.oid::regprocedure);END IF;
 END LOOP;
END $acl$;
INSERT INTO saas.cashier_orders259_functions
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,true
 FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('orders259_can_manage','orders_access_read','in_store_staff_projection_v7','in_store_sales_list_staff_v7','in_store_sales_set_staff_v7','in_store_sales_recover_staff_v7');
DO $post$BEGIN IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_manage_orders) OR (SELECT count(*) FROM saas.cashier_orders259_functions)<>7 THEN RAISE EXCEPTION 'CASHIER_ORDERS259_POSTCONDITION';END IF;END $post$;
COMMIT;
