-- Explicit cashier Overview access, independent of every existing permission.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cashier.overview.release262',0));
DO $pre$BEGIN
 IF to_regclass('saas.order_delete_debt261_restore')IS NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('overview262_authority_error','overview_access_read','overview_get_dashboard','in_store_staff_projection_v8','in_store_sales_list_staff_v8','in_store_sales_set_staff_v8','in_store_sales_recover_staff_v8'))THEN RAISE EXCEPTION 'OVERVIEW262_PREDECESSOR_REQUIRED';END IF;
 IF(SELECT count(*)<>4 OR NOT bool_and(p.oid IS NOT NULL AND p.oid=b.function_oid AND p.proowner=b.function_owner AND p.proacl IS NOT DISTINCT FROM b.function_acl AND p.proconfig IS NOT DISTINCT FROM b.function_config AND p.prosecdef=b.security_definer AND p.provolatile=b.function_volatility AND p.proisstrict=b.function_strict AND p.proparallel=b.function_parallel AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=b.after_hash)FROM saas.order_delete_debt261_restore b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.signature))THEN RAISE EXCEPTION 'OVERVIEW262_NATIVE261_DRIFT';END IF;
END $pre$;
CREATE TABLE saas.cashier_overview262_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text NOT NULL,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL,function_language oid NOT NULL,is_new boolean NOT NULL);
ALTER TABLE saas.cashier_overview262_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cashier_overview262_functions FORCE ROW LEVEL SECURITY;
CREATE POLICY cashier_overview262_owner ON saas.cashier_overview262_functions TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.cashier_overview262_functions FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.cashier_overview262_functions FROM %I',r.rolname);END LOOP;END $acl$;
DO $reviewed$DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
  ('saas.in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,boolean)','9570f4eaca3ee2c80063bee0ad4967a036f5b09a07f71c25ddb030c6077a19fa',false,'s'),
  ('saas.in_store_sales_list_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','ce42fa9f77c760fd0033103924aecea502f5af631689ced74330f395ff3f4699',true,'s'),
  ('saas.in_store_sales_recover_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)','791a8fc0c2b9773264ed8206cd3b36aeea6a47c1c65d9c190dd80ab5f83eb03f',true,'s'),
  ('saas.in_store_sales_set_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer,boolean)','ccc1479439418fc1ea3088cec906b2582ea77900f7960d324f6c6194d3e4f97c',true,'v'),
  ('saas.in_store_staff_projection_v7(uuid,uuid)','491a9b55f864ed695a73c5c834e215d16e0828c139b86609d4e364c6be477373',false,'s'),
  ('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)','871426d31a1776f890f6e96fcfd527edef1c73d40cf9468724f3099a94214853',false,'s'),
  ('saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','89d53b7ff9b09dd92effe428ed6a3235e26952ac542da249dd8a848f8adb8542',true,'s')
 )v(signature,sha,public_entry,volatility)LOOP
  SELECT f.*,pg_get_functiondef(f.oid)definition INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(p.definition,'UTF8')),'hex')<>r.sha OR p.proowner<>'celebix_saas_owner'::regrole
   OR p.proacl IS DISTINCT FROM(CASE WHEN r.public_entry THEN'{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] ELSE'{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[]END)
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT p.prosecdef OR p.provolatile::text<>r.volatility OR p.proisstrict OR p.proparallel<>'u'
  THEN RAISE EXCEPTION 'OVERVIEW262_PREDECESSOR_DRIFT:%',r.signature;END IF;
  INSERT INTO saas.cashier_overview262_functions VALUES(r.signature,p.definition,r.sha,r.sha,p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,false);
 END LOOP;
END $reviewed$;
ALTER TABLE saas.in_store_staff_grants ADD COLUMN can_view_overview boolean NOT NULL DEFAULT false;

CREATE FUNCTION saas.overview262_authority_error(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_require_overview boolean DEFAULT true)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE actor_role text;err text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)OR p_require_overview IS NULL THEN RETURN'invalid_input';END IF;
 SELECT role INTO actor_role FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active';
 IF actor_role='cashier'THEN
  err:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','in_store.read');
  IF err IS NOT NULL THEN RETURN err;END IF;
  IF p_require_overview AND(NOT saas.commercial_plan_has_capability(p_plan,'cashier')OR NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND can_view_overview))THEN RETURN'membership_denied';END IF;
  RETURN NULL;
 END IF;
 -- Existing noncashier analytics authority is unchanged, including package scope.
 RETURN saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'analytics','analytics.read');
END $f$;
CREATE FUNCTION saas.overview_access_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;BEGIN
 err:=saas.overview262_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT'found',jsonb_build_object('canViewOverview',saas.overview262_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,true)IS NULL);
END $f$;
CREATE FUNCTION saas.in_store_staff_projection_v8(p_store uuid,p_member uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.in_store_staff_projection_v7(p_store,p_member)||jsonb_build_object('canViewOverview',coalesce((SELECT can_view_overview FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false))
$f$;

-- Derive additive v8 entrypoints from the exact reviewed v7 definitions. No
-- historical setter, frozen operation receipt or DTO is rewritten.
DO $create$DECLARE d text;change jsonb;anchor text;BEGIN
 SELECT definition INTO STRICT d FROM saas.cashier_overview262_functions WHERE signature LIKE'saas.in_store_sales_list_staff_v7(%';
 EXECUTE replace(d,'_v7','_v8');
 SELECT definition INTO STRICT d FROM saas.cashier_overview262_functions WHERE signature LIKE'saas.in_store_sales_recover_staff_v7(%';
 d:=replace(d,'_v7','_v8');anchor:='prior.result_payload||jsonb_build_object(''canManageOrders''';
 IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'OVERVIEW262_RECOVERY_ANCHOR';END IF;
 EXECUTE replace(d,anchor,'prior.result_payload||jsonb_build_object(''canViewOverview'',coalesce((prior.result_payload->>''canViewOverview'')::boolean,false),''canManageOrders''');
 SELECT definition INTO STRICT d FROM saas.cashier_overview262_functions WHERE signature LIKE'saas.in_store_sales_set_staff_v7(%';
 d:=replace(d,'_v7','_v8');
 FOR change IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_array('p_can_manage_orders boolean)','p_can_manage_orders boolean, p_can_view_overview boolean)'),
  jsonb_build_array('p_can_manage_orders IS NULL','p_can_manage_orders IS NULL OR p_can_view_overview IS NULL'),
  jsonb_build_array('(p_can_manage_accounting OR p_commission_enabled OR p_can_manage_orders)','(p_can_manage_accounting OR p_commission_enabled OR p_can_manage_orders OR p_can_view_overview)'),
  jsonb_build_array('commission_rate_bps,can_manage_orders) VALUES','commission_rate_bps,can_manage_orders,can_view_overview) VALUES'),
  jsonb_build_array('p_commission_rate_bps,p_can_manage_orders)','p_commission_rate_bps,p_can_manage_orders,p_can_view_overview)'),
  jsonb_build_array('DO UPDATE SET can_manage_orders=excluded.can_manage_orders','DO UPDATE SET can_view_overview=excluded.can_view_overview,can_manage_orders=excluded.can_manage_orders'),
  jsonb_build_array(' PERFORM pg_advisory_xact_lock(hashtextextended(''saas.in_store.operation:''',' PERFORM pg_advisory_xact_lock_shared(hashtextextended(''saas.cashier.overview.release262'',0));'||E'\n'||' PERFORM pg_advisory_xact_lock(hashtextextended(''saas.in_store.operation:''')
 ))LOOP
  anchor:=change->>0;IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'OVERVIEW262_STAFF_ANCHOR:%',anchor;END IF;d:=replace(d,anchor,change->>1);
 END LOOP;
 EXECUTE d;
 -- The overview read has its own authority. Enabling it changes no analytics,
 -- customer, cart, catalogue or order action authorization.
 SELECT definition INTO STRICT d FROM saas.cashier_overview262_functions WHERE signature LIKE'saas.merchant_analytics_dashboard(%';
 anchor:='FUNCTION saas.merchant_analytics_dashboard(';IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'OVERVIEW262_DASHBOARD_NAME_ANCHOR';END IF;
 d:=replace(d,anchor,'FUNCTION saas.overview_get_dashboard(');
 anchor:='saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,''analytics'',''analytics.read'')';
 IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'OVERVIEW262_DASHBOARD_AUTHORITY_ANCHOR';END IF;
 d:=replace(d,anchor,'saas.overview262_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true)');
 anchor:='''resolved''';IF(length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'OVERVIEW262_DASHBOARD_RESULT_ANCHOR';END IF;
 EXECUTE replace(d,anchor,'''found''');
END $create$;

DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('overview262_authority_error','overview_access_read','overview_get_dashboard','in_store_staff_projection_v8','in_store_sales_list_staff_v8','in_store_sales_set_staff_v8','in_store_sales_recover_staff_v8')LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.oid::regprocedure);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.oid::regprocedure,r.rolname);END LOOP;
  IF f.proname NOT IN('overview262_authority_error','in_store_staff_projection_v8')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.oid::regprocedure);END IF;
 END LOOP;
END $acl$;
INSERT INTO saas.cashier_overview262_functions
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proisstrict,p.proparallel,p.prolang,true FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('overview262_authority_error','overview_access_read','overview_get_dashboard','in_store_staff_projection_v8','in_store_sales_list_staff_v8','in_store_sales_set_staff_v8','in_store_sales_recover_staff_v8');
DO $post$BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_view_overview)OR(SELECT count(*)FROM saas.cashier_overview262_functions)<>14 OR(SELECT count(*)FROM saas.cashier_overview262_functions WHERE is_new)<>7 THEN RAISE EXCEPTION 'OVERVIEW262_POSTCONDITION';END IF;
END $post$;
COMMIT;
