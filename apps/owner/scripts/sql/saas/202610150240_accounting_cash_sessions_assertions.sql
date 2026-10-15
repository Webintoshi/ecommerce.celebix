BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assertions$
DECLARE t text;role_name text;f record;v jsonb;
BEGIN
 WITH schema_definition AS(
SELECT jsonb_object_agg(c.relname,jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)ORDER BY k.conname),'[]')FROM pg_constraint k WHERE k.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid)ORDER BY ic.relname),'[]')FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'type',t.tgtype,'enabled',t.tgenabled)ORDER BY t.tgname),'[]')FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal))) AS schema
 FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind='r'AND c.relname IN('accounting_cash_sessions','accounting_cash_operations')
) SELECT schema INTO v FROM schema_definition;
 IF encode(sha256(convert_to(v::text,'UTF8')),'hex') IS DISTINCT FROM '5623dd3e2a82e66e71ab336fcdb7829a92f65593b51c638ba67077c8e168db02'
 THEN RAISE EXCEPTION 'ACCOUNTING240_SCHEMA_DEFINITION_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_cash_session_%')<>6
 THEN RAISE EXCEPTION 'ACCOUNTING240_FUNCTION_COUNT_INVALID';END IF;
 FOREACH t IN ARRAY ARRAY['accounting_cash_sessions','accounting_cash_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'ACCOUNTING240_TABLE_AUTHORITY_INVALID: %',t;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_table_privilege(role_name,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'ACCOUNTING240_TABLE_EXPOSED: %:%',t,role_name;END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_journal_write'
   AND tgfoid='saas.platform_support_journal_write()'::regprocedure AND tgtype=29 AND tgenabled='O' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'ACCOUNTING240_AUDIT_MISSING: %',t;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.accounting_cash_sessions'::regclass AND tgname='accounting_cash_session_guard'
   AND tgfoid='saas.accounting_cash_session_guard()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.accounting_cash_operations'::regclass AND tgname='accounting_immutable'
   AND tgfoid='saas.accounting_immutable()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'ACCOUNTING240_IMMUTABILITY_MISSING';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='saas.accounting_cash_one_open'::regclass AND indisunique AND indisvalid
  AND pg_get_expr(indpred,indrelid)='(status = ''open''::text)')
 THEN RAISE EXCEPTION 'ACCOUNTING240_ONE_OPEN_GUARD_MISSING';END IF;
 FOR f IN SELECT * FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_cash_session_%' LOOP
  IF f.proowner<>'celebix_saas_owner'::regrole OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR f.prosecdef IS DISTINCT FROM(f.proname NOT IN('accounting_cash_session_guard','accounting_cash_session_intent_valid'))
   OR f.provolatile::text<>(CASE WHEN f.proname='accounting_cash_session_intent_valid' THEN 'i'
    WHEN f.proname IN('accounting_cash_session_guard','accounting_cash_session_mutate') THEN 'v' ELSE 's' END)
  THEN RAISE EXCEPTION 'ACCOUNTING240_FUNCTION_AUTHORITY_INVALID: %',f.proname;END IF;
  IF has_function_privilege('celebix_saas_app',f.oid,'EXECUTE') IS DISTINCT FROM
    (f.proname IN('accounting_cash_session_list','accounting_cash_session_mutate','accounting_cash_session_get_operation'))
  THEN RAISE EXCEPTION 'ACCOUNTING240_RPC_SCOPE_INVALID: %',f.proname;END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
   WHERE a.grantor<>'celebix_saas_owner'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable
    OR a.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_app'::regrole))
  THEN RAISE EXCEPTION 'ACCOUNTING240_UNEXPECTED_FUNCTION_GRANT: %',f.proname;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_function_privilege(role_name,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'ACCOUNTING240_FUNCTION_EXPOSED: %:%',f.proname,role_name;END IF;
  END LOOP;
 END LOOP;
 v:='{"accountId":"11111111-1111-4111-8111-111111111111","expectedVersion":1,"expectedLastSessionId":null,"countedCents":0,"note":null}';
 IF NOT saas.accounting_cash_session_intent_valid('open',v)
  OR NOT saas.accounting_cash_session_intent_valid('close',v-'expectedLastSessionId'||'{"sessionId":"22222222-2222-4222-8222-222222222222"}'::jsonb)
  OR saas.accounting_cash_session_intent_valid('open',v-'expectedLastSessionId')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"extra":true}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"countedCents":9007199254740992}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"countedCents":-1}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"countedCents":0.5}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"countedCents":"1"}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"expectedVersion":0}')
  OR saas.accounting_cash_session_intent_valid('open',v||'{"note":"  "}')
  OR saas.accounting_cash_session_intent_valid('close',v)
  OR saas.accounting_cash_session_intent_valid('open','[]')
  OR saas.accounting_cash_session_intent_valid('open','1')
  OR saas.accounting_cash_session_intent_valid('other',v)
 THEN RAISE EXCEPTION 'ACCOUNTING240_STRICT_INPUT_INVALID';END IF;
END $assertions$;
ROLLBACK;
