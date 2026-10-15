BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE saved record;table_name text;
BEGIN
 IF (SELECT count(*) FROM saas.cashier_238_function_backup)<>2 THEN RAISE EXCEPTION 'CASHIER238_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.cashier_238_function_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature) AND p.proowner=saved.function_owner
   AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s' AND p.proacl IS NOT DISTINCT FROM saved.function_acl
   AND (p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[] OR p.proconfig=ARRAY['search_path=pg_catalog,saas']::text[])
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.published_sha256)
  THEN RAISE EXCEPTION 'CASHIER238_FUNCTION_AUTHORITY_INVALID: %',saved.signature;END IF;
 END LOOP;
 IF position($needle$(membership_role='cashier' AND p_required_action IN ('in_store.read','in_store.sell','in_store.discount','analytics.read','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete'))$needle$
  IN pg_get_functiondef('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'CASHIER238_ACTION_MATRIX_INVALID';END IF;
 FOREACH table_name IN ARRAY ARRAY['cashier_238_function_backup','cashier_238_grant_backup'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||table_name)::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='celebix_saas_owner'::regrole)
   OR has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('celebix_saas_identity','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'CASHIER238_PRIVATE_BACKUP_INVALID: %',table_name;END IF;
 END LOOP;
 IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='saas.in_store_staff_grants'::regclass AND a.attname='can_collect_receivables' AND NOT a.attisdropped) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'CASHIER238_COLLECTION_DEFAULT_INVALID';END IF;
END $assertions$;
COMMIT;
