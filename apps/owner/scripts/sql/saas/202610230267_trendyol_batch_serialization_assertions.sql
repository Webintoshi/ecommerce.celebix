BEGIN;
DO $assert$DECLARE r record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.trendyol267_backup'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='celebix_saas_owner'::regrole)OR has_table_privilege('celebix_saas_app','saas.trendyol267_backup','SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow','saas.trendyol267_backup','SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'TRENDYOL267_TABLE_AUTHORITY';END IF;
 IF(SELECT count(*)FROM saas.trendyol267_backup)<>2 OR to_regclass('saas.trendyol_jobs_pending_batch')IS NULL THEN RAISE EXCEPTION 'TRENDYOL267_MISSING';END IF;
 FOR r IN SELECT * FROM saas.trendyol267_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'TRENDYOL267_PUBLISHED_DRIFT';END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','EXECUTE')OR has_function_privilege('celebix_saas_app','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')OR NOT has_function_privilege('celebix_saas_workflow','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')THEN RAISE EXCEPTION 'TRENDYOL267_RPC_AUTHORITY';END IF;
 FOR r IN SELECT oid FROM pg_proc WHERE oid IN('saas.trendyol_variant_pending_batch(uuid,uuid)'::regprocedure,'saas.trendyol_rebase_batches(uuid,timestamptz)'::regprocedure)LOOP
  IF has_function_privilege('celebix_saas_app',r.oid,'EXECUTE')OR has_function_privilege('celebix_saas_workflow',r.oid,'EXECUTE')THEN RAISE EXCEPTION 'TRENDYOL267_HELPER_AUTHORITY';END IF;
 END LOOP;
END $assert$;
ROLLBACK;
