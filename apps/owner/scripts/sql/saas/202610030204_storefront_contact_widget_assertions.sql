-- Read-only, transaction-bound proof of authority and installed generation.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='10s';
DO $assertions$
DECLARE row record; current_proc record;
BEGIN
 IF to_regclass('saas.contact_widget_204_backup') IS NULL OR (SELECT count(*) FROM saas.contact_widget_204_backup)<>7
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.contact_widget_204_backup'::regclass AND relrowsecurity AND relforcerowsecurity)
  OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('saas.merchant_admin_contact_widget_singleton_204') AND indisunique AND indisvalid AND indpred IS NOT NULL)
 THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_SCHEMA_ASSERTION_FAILED';END IF;
 FOR row IN SELECT * FROM saas.contact_widget_204_backup WHERE function_owner IS NOT NULL LOOP
  SELECT * INTO current_proc FROM pg_proc WHERE oid=to_regprocedure(row.identity);
  IF NOT FOUND OR pg_get_functiondef(current_proc.oid) IS DISTINCT FROM row.migrated_definition OR current_proc.proowner<>row.function_owner OR current_proc.proacl::text IS DISTINCT FROM row.function_acl
  THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_AUTHORITY_ASSERTION_FAILED: %',row.identity;END IF;
 END LOOP;
 IF saas.merchant_admin_required_action('contact_widget',false) IS DISTINCT FROM 'configuration.read'
  OR saas.merchant_admin_required_action('contact_widget',true) IS DISTINCT FROM 'configuration.manage'
  OR has_table_privilege('celebix_saas_app','saas.merchant_admin_records','INSERT,UPDATE,DELETE')
  OR has_table_privilege('celebix_saas_host_resolver','saas.merchant_admin_records','SELECT')
  OR NOT has_function_privilege('celebix_saas_host_resolver','saas.public_contact_widget_get(text,timestamptz)','EXECUTE')
  OR has_function_privilege('celebix_saas_app','saas.public_contact_widget_get(text,timestamptz)','EXECUTE')
  OR has_function_privilege('celebix_saas_workflow','saas.public_contact_widget_get(text,timestamptz)','EXECUTE')
  OR has_function_privilege('celebix_saas_host_resolver','saas.contact_widget_config_valid(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_LEAST_PRIVILEGE_ASSERTION_FAILED';END IF;
 FOR row IN SELECT oid,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE '%\_before\_contact\_widget\_204' ESCAPE '\' LOOP
  IF has_function_privilege('celebix_saas_app',row.oid,'EXECUTE') OR has_function_privilege('celebix_saas_host_resolver',row.oid,'EXECUTE') OR has_function_privilege('celebix_saas_workflow',row.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_PRIVATE_PREDECESSOR_ASSERTION_FAILED: %',row.proname;END IF;
 END LOOP;
END $assertions$;
SELECT 'CONTACT_WIDGET_204_ASSERTIONS_PASS' AS proof;
ROLLBACK;
