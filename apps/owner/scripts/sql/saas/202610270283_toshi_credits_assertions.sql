BEGIN READ ONLY;
DO $assertions$DECLARE t text;r record;f record;b record;s text;expected text;BEGIN
 IF(SELECT count(*)FROM saas.toshi_credit283_predecessors)<>3 THEN RAISE EXCEPTION 'TOSHI_CREDITS283_PREDECESSOR_SCOPE';END IF;
 FOR b IN SELECT *FROM saas.toshi_credit283_predecessors WHERE signature<>'saas.platform_checkout_machine(text,jsonb)'LOOP
  s:=CASE WHEN b.signature LIKE 'saas.platform_checkout_create(%'THEN replace(b.signature,'platform_checkout_create(','platform_checkout_create283_baseline(')ELSE replace(b.signature,'platform_checkout_fulfill281(','platform_checkout_fulfill283_baseline(')END;
  SELECT p.*,pg_get_userbyid(p.proowner)owner_name INTO f FROM pg_proc p WHERE p.oid=to_regprocedure(s);
  expected:=replace(b.definition,CASE WHEN b.signature LIKE 'saas.platform_checkout_create(%'THEN 'FUNCTION saas.platform_checkout_create('ELSE 'FUNCTION saas.platform_checkout_fulfill281('END,CASE WHEN b.signature LIKE 'saas.platform_checkout_create(%'THEN 'FUNCTION saas.platform_checkout_create283_baseline('ELSE 'FUNCTION saas.platform_checkout_fulfill283_baseline('END);
  IF NOT FOUND OR pg_get_functiondef(f.oid)<>expected OR f.owner_name<>b.owner_name OR f.proconfig IS DISTINCT FROM b.config OR f.prosecdef<>b.security_definer OR f.provolatile<>b.volatility THEN RAISE EXCEPTION 'TOSHI_CREDITS283_BASELINE_DRIFT:%',s;END IF;
 END LOOP;
 SELECT *INTO b FROM saas.toshi_credit283_predecessors WHERE signature='saas.platform_checkout_machine(text,jsonb)';
 SELECT p.*,pg_get_userbyid(p.proowner)owner_name INTO f FROM pg_proc p WHERE p.oid='saas.platform_checkout_machine(text,jsonb)'::regprocedure;
 IF pg_get_functiondef(f.oid)<>replace(b.definition,'(o.kind=''tool''AND role=''admin'')','(o.kind IN(''tool'',''toshi_credit'')AND role=''admin'')')OR f.owner_name<>b.owner_name OR f.proacl::text IS DISTINCT FROM b.acl OR f.proconfig IS DISTINCT FROM b.config OR f.prosecdef<>b.security_definer OR f.provolatile<>b.volatility THEN RAISE EXCEPTION 'TOSHI_CREDITS283_MACHINE_DRIFT';END IF;
 FOREACH t IN ARRAY ARRAY['toshi_credit283_predecessors','toshi_credit_wallets','toshi_credit_operations','toshi_credit_ledger']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('saas.'||t)AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)THEN RAISE EXCEPTION 'TOSHI_CREDITS283_RELATION_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('saas.'||t)AND polroles<>ARRAY['celebix_saas_owner'::regrole::oid])THEN RAISE EXCEPTION 'TOSHI_CREDITS283_POLICY_INVALID';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP IF has_table_privilege(r.rolname,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'TOSHI_CREDITS283_PRIVATE_TABLE_GRANT';END IF;END LOOP;
 END LOOP;
 FOR f IN SELECT *FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'toshi_credit_%283'OR proname IN('toshi_credit_command','platform_toshi_credit_grant','platform_checkout_create283_baseline','platform_checkout_fulfill283_baseline','platform_checkout_create','platform_checkout_fulfill281'))LOOP
  IF f.proowner<>'celebix_saas_owner'::regrole OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]OR NOT f.prosecdef OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))WHERE grantee=0)THEN RAISE EXCEPTION 'TOSHI_CREDITS283_ROUTINE_METADATA';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_function_privilege(r.rolname,f.oid,'EXECUTE')IS DISTINCT FROM((r.rolname='celebix_saas_app'AND f.proname IN('toshi_credit_command','platform_checkout_create'))OR(r.rolname='celebix_saas_platform_operator'AND f.proname='platform_toshi_credit_grant'))THEN RAISE EXCEPTION 'TOSHI_CREDITS283_ROUTINE_GRANT:%:%',f.proname,r.rolname;END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.platform_checkout_orders'::regclass AND conname='platform_checkout_shape283'AND convalidated)THEN RAISE EXCEPTION 'TOSHI_CREDITS283_CHECKOUT_SHAPE';END IF;
 IF EXISTS(SELECT 1 FROM saas.toshi_credit_wallets w WHERE w.balance<>(SELECT coalesce(sum(balance_delta),0)FROM saas.toshi_credit_ledger WHERE store_id=w.store_id)OR w.reserved<>(SELECT coalesce(sum(reserved_delta),0)FROM saas.toshi_credit_ledger WHERE store_id=w.store_id)OR w.reserved<>(SELECT coalesce(sum(cost),0)FROM saas.toshi_credit_operations WHERE store_id=w.store_id AND status='reserved'))THEN RAISE EXCEPTION 'TOSHI_CREDITS283_LEDGER_MISMATCH';END IF;
END $assertions$;
COMMIT;
