BEGIN;
DO $assert$DECLARE r record;BEGIN
 FOR r IN SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas'AND c.relkind='r'AND c.relname LIKE 'trendyol_%'LOOP
  IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR has_table_privilege('celebix_saas_app',r.oid,'SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow',r.oid,'SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'TRENDYOL266_TABLE_AUTHORITY';END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','EXECUTE')OR has_function_privilege('celebix_saas_app','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')OR NOT has_function_privilege('celebix_saas_workflow','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')THEN RAISE EXCEPTION 'TRENDYOL266_RPC_AUTHORITY';END IF;
 FOR r IN SELECT * FROM saas.trendyol266_backup LOOP IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')<>r.published_sha256 THEN RAISE EXCEPTION 'TRENDYOL266_PUBLISHED_DRIFT';END IF;END LOOP;
END $assert$;
ROLLBACK;
