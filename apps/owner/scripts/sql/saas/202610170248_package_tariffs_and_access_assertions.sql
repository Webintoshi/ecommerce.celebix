-- Read-only stage/active witnesses; compatible with revision246 histories and revision247.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $verify$
DECLARE r record;n integer;enabled boolean;
BEGIN
 SELECT s.enabled INTO STRICT enabled FROM saas.commercial248_release_state s WHERE singleton;
 IF (SELECT count(*)FROM saas.commercial248_release_state)<>1 OR (SELECT count(*)FROM saas.commercial248_original_functions)<>24 THEN RAISE EXCEPTION 'COMMERCIAL248_STATE_COUNT';END IF;
 FOR r IN SELECT * FROM(VALUES
 ('00000000-0000-4000-8000-000000000007'::uuid,'free_starter',3,0::bigint,0::bigint,25::bigint,50::bigint),
 ('00000000-0000-4000-8000-000000000008'::uuid,'starter',2,258700,2587000,1000,1000),
 ('00000000-0000-4000-8000-000000000009'::uuid,'growth',2,453700,4537000,5000,5000),
 ('00000000-0000-4000-8000-000000000010'::uuid,'professional',2,778700,7787000,10000,20000)
 )x(id,code,version,monthly,annual,products,orders) LOOP
  IF NOT EXISTS(SELECT 1 FROM saas.plans p JOIN saas.platform_plan_prices prices ON prices.plan_id=p.id WHERE p.id=r.id AND p.plan_code=r.code AND p.version=r.version AND p.status='active' AND prices.monthly_price_cents=r.monthly AND prices.yearly_price_cents=r.annual) OR (SELECT effective_limit FROM saas.plan_limits WHERE plan_id=r.id AND limit_key='products')<>r.products OR (SELECT effective_limit FROM saas.plan_limits WHERE plan_id=r.id AND limit_key='monthlyOrders')<>r.orders OR (SELECT count(*)FROM saas.plan_features WHERE plan_id=r.id)<>13 OR (SELECT count(*)FROM saas.plan_limits WHERE plan_id=r.id)<>5 THEN RAISE EXCEPTION 'COMMERCIAL248_PLAN_DRIFT:%',r.code;END IF;
  IF saas.commercial_plan_has_capability(r.id,'manual_orders') IS DISTINCT FROM(r.code='professional') OR saas.commercial_plan_has_capability(r.id,'cashier') IS DISTINCT FROM(r.code='professional') OR saas.commercial248_plan_selectable(r.id) IS DISTINCT FROM enabled THEN RAISE EXCEPTION 'COMMERCIAL248_CAPABILITY_DRIFT:%',r.code;END IF;
 END LOOP;
 IF saas.commercial_default_starter_version() IS DISTINCT FROM(CASE WHEN(SELECT assignments_enabled FROM saas.commercial_package_release_state WHERE singleton)THEN CASE WHEN enabled THEN 3::bigint ELSE 2::bigint END ELSE 1::bigint END) THEN RAISE EXCEPTION 'COMMERCIAL248_DEFAULT_DRIFT';END IF;
 IF saas.commercial_plan_has_capability('ffffffff-ffff-4fff-8fff-ffffffffffff','manual_orders') IS DISTINCT FROM false THEN RAISE EXCEPTION 'COMMERCIAL248_UNKNOWN_FAIL_OPEN';END IF;
 FOR r IN SELECT * FROM saas.commercial248_original_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature) AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND p.prosecdef=r.function_security AND p.provolatile=r.function_volatility AND p.proisstrict=r.function_strict AND p.proparallel=r.function_parallel) OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'COMMERCIAL248_FUNCTION_DRIFT:%',r.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'commercial248_%' AND (has_function_privilege('public',p.oid,'EXECUTE') OR has_function_privilege('celebix_saas_app',p.oid,'EXECUTE') OR has_function_privilege('celebix_saas_identity',p.oid,'EXECUTE') OR has_function_privilege('celebix_saas_workflow',p.oid,'EXECUTE') OR has_function_privilege('celebix_saas_platform_operator',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'COMMERCIAL248_HELPER_ACL';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname IN('commercial248_release_state','commercial248_original_functions') AND(NOT relrowsecurity OR NOT relforcerowsecurity OR has_table_privilege('celebix_saas_app',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_platform_operator',oid,'SELECT,INSERT,UPDATE,DELETE'))) THEN RAISE EXCEPTION 'COMMERCIAL248_TABLE_ACL';END IF;
 IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true OR saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true OR saas.shipping_provider_preflight() IS DISTINCT FROM true THEN RAISE EXCEPTION 'COMMERCIAL248_PAYMENT_PREFLIGHT';END IF;
END $verify$;
ROLLBACK;
