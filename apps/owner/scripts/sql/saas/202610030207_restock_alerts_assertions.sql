BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$
DECLARE row record;
BEGIN
 FOR row IN SELECT * FROM saas.restock_alerts_207_backup WHERE function_owner IS NOT NULL LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(row.identity) AND proowner=row.function_owner AND proacl::text IS NOT DISTINCT FROM row.function_acl AND pg_get_functiondef(oid)=row.migrated_definition) THEN RAISE EXCEPTION 'RESTOCK_207_PREDECESSOR_AUTHORITY_DRIFT';END IF;
 END LOOP;
 FOR row IN SELECT oid,relname FROM pg_class WHERE relnamespace='saas'::regnamespace AND relname IN('restock_subscriptions','restock_deliveries','restock_request_limits','restock_alerts_207_backup') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=row.oid AND relrowsecurity AND relforcerowsecurity) OR has_table_privilege('celebix_saas_app',row.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_workflow',row.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver',row.oid,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'RESTOCK_207_TABLE_AUTHORITY_DRIFT';END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_host_resolver','saas.public_restock_alerts_get(text,timestamptz)','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','saas.restock_claim(timestamptz,text,integer)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.restock_subscribe(text,uuid,text,text,text,text,timestamptz)','EXECUTE') OR saas.merchant_admin_required_action('restock_alerts',true)<>'configuration.manage' THEN RAISE EXCEPTION 'RESTOCK_207_FUNCTION_AUTHORITY_DRIFT';END IF;
END $assert$;
SELECT 'RESTOCK_ALERTS_207_ASSERTIONS_PASS';
ROLLBACK;
