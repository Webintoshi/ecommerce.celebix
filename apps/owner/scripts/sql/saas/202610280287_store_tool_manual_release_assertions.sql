BEGIN READ ONLY;
DO $assert$DECLARE b record;p record;r record;t text;BEGIN
 FOR b IN SELECT *FROM saas.store_tool_manual287_predecessors LOOP
  SELECT x.*,pg_get_functiondef(x.oid)definition INTO p FROM pg_proc x WHERE oid=to_regprocedure(b.signature);
  IF NOT FOUND OR p.oid<>b.function_oid OR p.proowner<>b.proowner OR p.proacl IS DISTINCT FROM b.proacl OR p.proconfig IS DISTINCT FROM b.proconfig OR p.prosecdef<>b.prosecdef OR p.provolatile<>b.provolatile OR p.proisstrict<>b.proisstrict OR p.proparallel<>b.proparallel OR p.prolang<>b.prolang
   OR(b.signature<>'saas.platform_tool_purchase_released282(uuid,uuid)'AND p.definition<>b.definition)THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_ROUTINE_DRIFT:%',b.signature;END IF;
 END LOOP;
 IF(SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>(SELECT count(*)+1 FROM saas.store_tool_manual287_predecessors)THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_ROUTINE_SCOPE';END IF;
 SELECT *INTO p FROM pg_proc WHERE oid='saas.platform_tool_purchase_manual_release287(uuid,uuid,uuid,bigint,uuid,text,boolean)'::regprocedure;
 IF p.proowner<>'celebix_saas_owner'::regrole OR p.prosecdef OR p.provolatile<>'v'OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))WHERE grantee=0)THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_RPC_METADATA';END IF;
 FOREACH t IN ARRAY ARRAY['store_tool_manual287_predecessors','store_tool_manual_releases287']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('saas.'||t)AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_TABLE_METADATA';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_table_privilege(r.rolname,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_function_privilege(r.rolname,p.oid,'EXECUTE')THEN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_RUNTIME_GRANT';END IF;
  END LOOP;
 END LOOP;
END $assert$;
COMMIT;
