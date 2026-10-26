BEGIN READ ONLY;
DO $assertions$DECLARE before record;actual record;relation text;routine record;role_name text;expected_role text;BEGIN
 FOR before IN SELECT *FROM saas.platform_checkout281_predecessors LOOP
  SELECT p.*,pg_get_userbyid(p.proowner)owner_name,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(before.signature)),'UTF8')),'hex')definition_sha256 INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(before.signature);
  IF NOT FOUND OR actual.definition_sha256<>before.definition_sha256 OR actual.owner_name<>before.owner_name OR actual.proacl::text IS DISTINCT FROM before.acl OR actual.proconfig IS DISTINCT FROM before.config OR actual.prosecdef<>before.security_definer OR actual.provolatile<>before.volatility
  THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_PREDECESSOR_DRIFT:%',before.signature;END IF;
 END LOOP;
 IF(SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>(SELECT count(*)+9 FROM saas.platform_checkout281_predecessors)THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_ROUTINE_COUNT_INVALID';END IF;
 FOREACH relation IN ARRAY ARRAY['platform_checkout281_predecessors','platform_checkout_orders','platform_checkout_intents','platform_checkout_attempts','platform_checkout_audit']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('saas.'||relation)AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
  THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_PRIVATE_RELATION_INVALID:%',relation;END IF;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_table_privilege(role_name,'saas.'||relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_TABLE_GRANT_INVALID:%:%',role_name,relation;END IF;
  END LOOP;
 END LOOP;
 FOR routine IN SELECT p.*,p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.proname LIKE 'platform_checkout_%281'OR p.proname IN('platform_checkout_create','platform_checkout_machine'))LOOP
  IF routine.proowner<>'celebix_saas_owner'::regrole OR routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR EXISTS(SELECT 1 FROM aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))a WHERE a.grantee=0)
  THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_ROUTINE_METADATA_INVALID:%',routine.signature;END IF;
  expected_role:=CASE routine.proname WHEN 'platform_checkout_create'THEN 'celebix_saas_app'WHEN 'platform_checkout_machine'THEN 'celebix_saas_platform_operator'END;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_function_privilege(role_name,routine.oid,'EXECUTE')IS DISTINCT FROM coalesce(role_name=expected_role,false)THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_ROUTINE_GRANT_INVALID:%:%',role_name,routine.signature;END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.store_tool_receipts'::regclass AND conname='store_tool_receipt_actor281'AND convalidated)
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.store_tool_receipts'::regclass AND conname='store_tool_receipt_checkout281'AND convalidated)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.store_tool_receipts'::regclass AND tgname='store_tool_receipt_validate281'AND tgenabled='O'AND NOT tgisinternal)
  OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='saas.platform_checkout_one_active_attempt281'::regclass AND indisunique AND indisvalid)
 THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_SETTLEMENT_BOUNDARY_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_receipts WHERE operator_id IS NULL AND checkout_order_id IS NULL)THEN RAISE EXCEPTION 'PLATFORM_COMMERCE281_RECEIPT_PROVENANCE_INVALID';END IF;
END $assertions$;
COMMIT;
