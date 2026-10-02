-- Read-only invariants for POS V3 ABI, grants and durable snapshot protections.
DO $assert$
DECLARE entry record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.in_store_staff_grants'::regclass AND attname='can_sell_on_credit' AND attnotnull AND NOT attisdropped) OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.in_store_staff_grants'::regclass AND attname='can_collect_receivables' AND attnotnull AND NOT attisdropped) THEN RAISE EXCEPTION 'POS_V3_GRANTS_ABSENT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.in_store_sales'::regclass AND tgname='in_store_credit_snapshot_guard' AND tgenabled='O') THEN RAISE EXCEPTION 'POS_V3_SNAPSHOT_GUARD_ABSENT';END IF;
 FOR entry IN SELECT p.oid,p.proname,p.prosecdef,p.proconfig,p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE 'in_store_sales_%_v3' OR p.proname IN('in_store_sales_search_customers','in_store_sales_create_customer','in_store_sales_recover_customer')) LOOP
  IF NOT entry.prosecdef OR NOT('search_path=pg_catalog, saas'=ANY(entry.proconfig)) THEN RAISE EXCEPTION 'POS_V3_AUTHORITY_CONFIGURATION:%',entry.proname;END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(entry.proacl,acldefault('f',entry.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') OR has_function_privilege('celebix_saas_identity',entry.oid,'EXECUTE') OR has_function_privilege('celebix_saas_workflow',entry.oid,'EXECUTE') THEN RAISE EXCEPTION 'POS_V3_FUNCTION_GRANT_LEAK:%',entry.proname;END IF;
  IF entry.proname NOT IN('in_store_sales_mutate_v3','in_store_sales_projection_v3') AND NOT has_function_privilege('celebix_saas_app',entry.oid,'EXECUTE') THEN RAISE EXCEPTION 'POS_V3_RPC_GRANT_ABSENT:%',entry.proname;END IF;
 END LOOP;
 IF has_function_privilege('celebix_saas_app','saas.in_store_can_sell_on_credit(uuid,uuid)','EXECUTE') OR has_table_privilege('celebix_saas_app','saas.in_store_sales','UPDATE') OR has_table_privilege('celebix_saas_app','saas.customers','INSERT') THEN RAISE EXCEPTION 'POS_V3_DIRECT_WRITE_GRANT_LEAK';END IF;
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE contract_version=3 AND initial_collection_cents<total_cents AND (customer_id IS NULL OR customer_snapshot->>'phone' IS NULL)) THEN RAISE EXCEPTION 'POS_V3_UNNAMED_CREDIT';END IF;
END $assert$;
