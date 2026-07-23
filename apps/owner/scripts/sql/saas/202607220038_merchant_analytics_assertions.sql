DO $f$
DECLARE actor record; result text;
BEGIN
  IF to_regprocedure('saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL THEN RAISE EXCEPTION 'MERCHANT_ANALYTICS_API_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE p.oid='saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') OR has_function_privilege('celebix_saas_workflow','saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','EXECUTE') OR NOT has_function_privilege('celebix_saas_app','saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_ANALYTICS_ACL_INVALID'; END IF;
  IF has_function_privilege('celebix_saas_app','saas.merchant_analytics_series(uuid,timestamp with time zone,timestamp with time zone,text)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.merchant_analytics_top_products(uuid,timestamp with time zone,timestamp with time zone)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_ANALYTICS_HELPER_LEAK'; END IF;
  FOR actor IN SELECT * FROM (VALUES ('store_owner'),('admin'),('editor'),('analyst')) AS roles(role) LOOP
    SELECT saas.merchant_action_authority_error('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','free_starter',1,'2026-07-22T19:00:00Z','analytics','analytics.read') INTO result;
  END LOOP;
  IF position('analytics.write' IN pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure))>0 THEN RAISE EXCEPTION 'MERCHANT_ANALYTICS_ACTION_BROADENED'; END IF;
END $f$;
