DO $f$
DECLARE n text;r record;BEGIN
 FOREACH n IN ARRAY ARRAY['review_collection_settings','review_collection_requests','review_collection_optouts','review_collection_operations','review_collection_206_backup'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='saas' AND c.relname=n AND c.relrowsecurity AND c.relforcerowsecurity) OR has_table_privilege('celebix_saas_app','saas.'||n,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver','saas.'||n,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_workflow','saas.'||n,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'REVIEW_COLLECTION_TABLE_AUTHORITY_INVALID:%',n;END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.review_collection_admin_overview(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE') OR NOT has_function_privilege('celebix_saas_workflow','saas.review_collection_work_claim(timestamptz,uuid)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.review_collection_work_claim(timestamptz,uuid)','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','saas.review_collection_admin_overview(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'REVIEW_COLLECTION_FUNCTION_AUTHORITY_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='review_collection_order_event' AND tgrelid='saas.order_events'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'REVIEW_COLLECTION_HOOK_MISSING';END IF;
END $f$;
