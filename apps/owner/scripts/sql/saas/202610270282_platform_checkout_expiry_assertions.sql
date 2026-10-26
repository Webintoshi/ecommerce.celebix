BEGIN READ ONLY;
DO $assertions$DECLARE b record;p record;t text;r record;n integer:=0;BEGIN
 FOR b IN SELECT *FROM saas.platform_checkout282_predecessors LOOP
  SELECT x.*,pg_get_userbyid(x.proowner)owner_name,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(b.signature)),'UTF8')),'hex')digest INTO p FROM pg_proc x WHERE x.oid=to_regprocedure(b.signature);
  IF NOT FOUND OR p.digest IS DISTINCT FROM b.published_sha256 OR p.owner_name<>b.owner_name OR p.proacl::text IS DISTINCT FROM b.acl OR p.proconfig IS DISTINCT FROM b.config OR p.prosecdef<>b.security_definer OR p.provolatile<>b.volatility THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_ROUTINE_DRIFT:%',b.signature;END IF;
  IF b.definition_sha256<>b.published_sha256 THEN
   n:=n+1;
   IF b.signature<>ALL(ARRAY['saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)','saas.platform_tool_purchases_read(uuid,jsonb)','saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)','saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)'])THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_UNREVIEWED_ROUTINE_CHANGE';END IF;
  END IF;
 END LOOP;
 IF n<>5 OR(SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>(SELECT count(*)+2 FROM saas.platform_checkout282_predecessors)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_ROUTINE_SCOPE_INVALID';END IF;
 FOREACH t IN ARRAY ARRAY['platform_checkout282_predecessors','platform_tool_purchase_origins282','platform_tool_purchase_releases282']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('saas.'||t)AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_RELATION_INVALID';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_table_privilege(r.rolname,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PRIVATE_TABLE_GRANT';END IF;
  END LOOP;
 END LOOP;
 FOR p IN SELECT *FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('platform_tool_purchase_released282','platform_checkout_expire282')LOOP
  IF p.proowner<>'celebix_saas_owner'::regrole OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))WHERE grantee=0)THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_HELPER_METADATA';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP IF has_function_privilege(r.rolname,p.oid,'EXECUTE')THEN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_PRIVATE_ROUTINE_GRANT';END IF;END LOOP;
 END LOOP;
END $assertions$;
COMMIT;
