BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$ DECLARE r record;BEGIN
 FOR r IN SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relname LIKE 'accounting_%' AND c.relkind='r' LOOP
 IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.owner<>'celebix_saas_owner' OR has_table_privilege('celebix_saas_app',r.oid,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'ACCOUNTING_TABLE_AUTHORITY:%',r.relname;END IF;END LOOP;
 FOR r IN SELECT p.oid,p.proname,p.prosecdef,p.proconfig,p.proowner FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'accounting_%' LOOP
 IF pg_get_userbyid(r.proowner)<>'celebix_saas_owner' OR NOT(r.proconfig @> ARRAY['search_path=pg_catalog, saas']) THEN RAISE EXCEPTION 'ACCOUNTING_FUNCTION_AUTHORITY:%',r.proname;END IF;
 IF r.proname NOT IN('accounting_read','accounting_mutate','accounting_get_operation') AND has_function_privilege('celebix_saas_app',r.oid,'EXECUTE') THEN RAISE EXCEPTION 'ACCOUNTING_INTERNAL_EXPOSED:%',r.proname;END IF;
 IF has_function_privilege('celebix_saas_identity',r.oid,'EXECUTE') OR has_function_privilege('celebix_saas_workflow',r.oid,'EXECUTE') THEN RAISE EXCEPTION 'ACCOUNTING_SESSION_WORKFLOW_SEPARATION:%',r.proname;END IF;END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.accounting_events'::regclass AND tgname='accounting_immutable') THEN RAISE EXCEPTION 'ACCOUNTING_IMMUTABILITY_MISSING';END IF;
END $assertions$;
ROLLBACK;
