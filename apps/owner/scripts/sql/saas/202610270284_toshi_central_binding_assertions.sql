DO $assert$DECLARE b record;p record;r record;BEGIN
 FOR b IN SELECT *FROM saas.toshi_central284_predecessors LOOP
  SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')digest,pg_get_userbyid(proowner)owner_name,proacl,proconfig,prosecdef,provolatile INTO p FROM pg_proc WHERE oid=to_regprocedure(b.signature);
  IF NOT FOUND OR p.digest<>b.definition_sha256 OR p.owner_name<>b.owner_name OR p.proacl::text IS DISTINCT FROM b.acl OR p.proconfig IS DISTINCT FROM b.config OR p.prosecdef<>b.security_definer OR p.provolatile<>b.volatility THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_LEGACY_DRIFT:%',b.signature;END IF;
 END LOOP;
 FOR p IN SELECT *FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('toshi_central_envelope_valid284','toshi_central_binding_command')LOOP
  IF p.proowner<>'celebix_saas_owner'::regrole OR p.prosecdef IS DISTINCT FROM(p.proname='toshi_central_binding_command')OR p.provolatile<>(CASE WHEN p.proname='toshi_central_binding_command'THEN 'v'::"char"ELSE 'i'::"char"END)OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))WHERE grantee=0)THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_ROUTINE_METADATA';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_function_privilege(r.rolname,p.oid,'EXECUTE')IS DISTINCT FROM(r.rolname='celebix_saas_app'AND p.proname='toshi_central_binding_command')THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_ROUTINE_GRANT';END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.toshi_central284_predecessors'::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_PRIVATE_METADATA';END IF;
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP IF has_table_privilege(r.rolname,'saas.toshi_central284_predecessors','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'TOSHI_CENTRAL284_PRIVATE_GRANT';END IF;END LOOP;
END $assert$;
