BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assertions$
DECLARE t text;role_name text;f record;v jsonb;
BEGIN
 WITH schema_definition AS(
  SELECT jsonb_object_agg(c.relname,jsonb_build_object(
   'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'columns',(SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) ORDER BY k.conname),'[]') FROM pg_constraint k WHERE k.conrelid=c.oid),
   'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ic.relname),'[]') FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
   'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',g.tgname,'definition',pg_get_triggerdef(g.oid),'type',g.tgtype,'enabled',g.tgenabled) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=c.oid AND NOT g.tgisinternal))) schema
  FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind='r'
   AND c.relname IN('accounting_profitability_line_costs','accounting_profitability_cost_invalidations')
 ) SELECT schema INTO v FROM schema_definition;
 IF encode(sha256(convert_to(v::text,'UTF8')),'hex') IS DISTINCT FROM 'e73d5ab14748415499e0ef60eab6ab131e5f34795d09aa8e2e2b680fe4186342'
 THEN RAISE EXCEPTION 'PROFITABILITY242_SCHEMA_DEFINITION_DRIFT';END IF;
 WITH expected(signature,source_sha256) AS(VALUES
  ('saas.accounting_profitability_capture_line()','79163261cf67619a0d9a807ecb1df00fb33e83fde79580a23fa7f92d8219e6cb'),
  ('saas.accounting_profitability_filters_valid(jsonb)','8dd8f94270783aff34e7fc6ef15e76604f36e6353b1e36dd462ac5b09d10ca6f'),
  ('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)','e2c07b6da26d462879fda7d168649d1bfd6fc51bd101562e71d99c15bec18272')
 ) SELECT jsonb_build_object('valid',count(*)=3 AND bool_and(coalesce(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.source_sha256,false))) INTO v
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
 IF v->>'valid' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'PROFITABILITY242_FUNCTION_DEFINITION_DRIFT';END IF;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_profitability_%')<>3
 THEN RAISE EXCEPTION 'PROFITABILITY242_FUNCTION_COUNT_INVALID';END IF;
 FOREACH t IN ARRAY ARRAY['accounting_profitability_line_costs','accounting_profitability_cost_invalidations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'PROFITABILITY242_TABLE_AUTHORITY_INVALID: %',t;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_table_privilege(role_name,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'PROFITABILITY242_TABLE_EXPOSED: %:%',t,role_name;END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='accounting_immutable'
    AND tgfoid='saas.accounting_immutable()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_journal_write'
    AND tgfoid='saas.platform_support_journal_write()'::regprocedure AND tgtype=29 AND tgenabled='O' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'PROFITABILITY242_IMMUTABLE_AUDIT_MISSING: %',t;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.order_items'::regclass AND tgname='accounting_profitability_capture_line'
   AND tgfoid='saas.accounting_profitability_capture_line()'::regprocedure AND tgtype=29 AND tgenabled='O' AND NOT tgisinternal
   AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0
   AND pg_get_triggerdef(oid)='CREATE TRIGGER accounting_profitability_capture_line AFTER INSERT OR DELETE OR UPDATE ON saas.order_items FOR EACH ROW EXECUTE FUNCTION saas.accounting_profitability_capture_line()')
 THEN RAISE EXCEPTION 'PROFITABILITY242_ORDER_CAPTURE_TRIGGER_DRIFT';END IF;
 FOR f IN SELECT * FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_profitability_%' LOOP
  IF f.proowner<>'celebix_saas_owner'::regrole OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR f.prosecdef IS DISTINCT FROM(f.proname<>'accounting_profitability_filters_valid')
   OR f.provolatile::text<>(CASE f.proname WHEN 'accounting_profitability_filters_valid' THEN 'i' WHEN 'accounting_profitability_capture_line' THEN 'v' ELSE 's' END)
  THEN RAISE EXCEPTION 'PROFITABILITY242_FUNCTION_AUTHORITY_INVALID: %',f.proname;END IF;
  IF has_function_privilege('celebix_saas_app',f.oid,'EXECUTE') IS DISTINCT FROM(f.proname='accounting_profitability_read')
  THEN RAISE EXCEPTION 'PROFITABILITY242_RPC_SCOPE_INVALID: %',f.proname;END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
   WHERE a.grantor<>'celebix_saas_owner'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable
    OR a.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_app'::regrole))
  THEN RAISE EXCEPTION 'PROFITABILITY242_UNEXPECTED_FUNCTION_GRANT: %',f.proname;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_function_privilege(role_name,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'PROFITABILITY242_FUNCTION_EXPOSED: %:%',f.proname,role_name;END IF;
  END LOOP;
 END LOOP;
 v:='{"dateFrom":"2026-01-01","dateTo":"2026-12-31"}';
 IF NOT saas.accounting_profitability_filters_valid(v)
  OR NOT saas.accounting_profitability_filters_valid(v||'{"currency":"TRY"}')
  OR NOT saas.accounting_profitability_filters_valid('{"dateFrom":"2024-01-01","dateTo":"2024-12-31"}')
  OR saas.accounting_profitability_filters_valid(v-'dateTo')
  OR saas.accounting_profitability_filters_valid(v||'{"channel":"POS"}')
  OR saas.accounting_profitability_filters_valid(v||'{"dateTo":"2027-01-02"}')
  OR saas.accounting_profitability_filters_valid(v||'{"dateTo":"2025-12-31"}')
  OR saas.accounting_profitability_filters_valid(v||'{"dateFrom":"2026-02-30"}')
  OR saas.accounting_profitability_filters_valid(v||'{"dateFrom":"0000-01-01"}')
  OR saas.accounting_profitability_filters_valid(v||'{"dateFrom":null}')
  OR saas.accounting_profitability_filters_valid(v||'{"currency":"try"}')
 THEN RAISE EXCEPTION 'PROFITABILITY242_FILTER_VALIDATION_INVALID';END IF;
 SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) INTO v
  FROM saas.accounting_profitability_read(NULL,NULL,NULL,NULL,NULL,NULL,clock_timestamp(),'{"dateFrom":"2026-10-01","dateTo":"2026-10-15"}');
 IF v IS DISTINCT FROM '{"outcome":"membership_denied","payload":null}'::jsonb
 THEN RAISE EXCEPTION 'PROFITABILITY242_UNAUTHENTICATED_ACCESS';END IF;
END $assertions$;
ROLLBACK;
