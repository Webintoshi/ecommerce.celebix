BEGIN;
DO $assert$DECLARE r record;source text;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.trendyol269_backup'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='celebix_saas_owner'::regrole)OR has_table_privilege('celebix_saas_app','saas.trendyol269_backup','SELECT,INSERT,UPDATE,DELETE')OR has_table_privilege('celebix_saas_workflow','saas.trendyol269_backup','SELECT,INSERT,UPDATE,DELETE')THEN RAISE EXCEPTION 'TRENDYOL269_TABLE_AUTHORITY';END IF;
 IF(SELECT count(*)FROM saas.trendyol269_backup)<>3 THEN RAISE EXCEPTION 'TRENDYOL269_MISSING';END IF;
 FOR r IN SELECT * FROM saas.trendyol269_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'TRENDYOL269_PUBLISHED_DRIFT';END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','EXECUTE')OR has_function_privilege('celebix_saas_app','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')OR NOT has_function_privilege('celebix_saas_workflow','saas.trendyol_workflow(text,jsonb,timestamptz)','EXECUTE')THEN RAISE EXCEPTION 'TRENDYOL269_RPC_AUTHORITY';END IF;
 FOR r IN SELECT oid FROM pg_proc WHERE oid IN('saas.trendyol_canonical_tax_issue(uuid,uuid)'::regprocedure,'saas.trendyol_canonical_vat_rate(uuid,uuid)'::regprocedure,'saas.trendyol_product_tax(uuid,uuid,timestamptz)'::regprocedure)LOOP
  IF has_function_privilege('celebix_saas_app',r.oid,'EXECUTE')OR has_function_privilege('celebix_saas_workflow',r.oid,'EXECUTE')OR r.oid IN(SELECT p.oid FROM pg_proc p WHERE p.proowner<>'celebix_saas_owner'::regrole OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[])THEN RAISE EXCEPTION 'TRENDYOL269_HELPER_AUTHORITY';END IF;
 END LOOP;
 SELECT pg_get_functiondef('saas.trendyol_workflow(text,jsonb,timestamptz)'::regprocedure)INTO source;
 IF strpos(source,'trendyol_variant_pending_batch')=0 OR strpos(source,'dispatchStarted')=0 OR strpos(source,'trendyol_product_tax')=0 OR strpos(source,'tax_conflict')=0 OR strpos(source,'provider_outcome_unknown')=0 THEN RAISE EXCEPTION 'TRENDYOL269_WORKFLOW_GUARDS';END IF;
 IF strpos(pg_get_functiondef('saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)'::regprocedure),'trendyol_rebase_batches')=0 OR strpos(pg_get_functiondef('saas.trendyol_import(uuid,text,jsonb,boolean,timestamptz)'::regprocedure),'product_tax_external_prepare')=0 THEN RAISE EXCEPTION 'TRENDYOL269_INTEGRATION_GUARDS';END IF;
 IF(SELECT count(*)FROM pg_trigger WHERE tgname IN('trendyol_variant_tax_changed','trendyol_product_tax_changed')AND NOT tgisinternal)<>2 THEN RAISE EXCEPTION 'TRENDYOL269_TAX_TRIGGERS';END IF;
END $assert$;
ROLLBACK;
