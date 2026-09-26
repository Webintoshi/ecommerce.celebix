BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE entry record;routine oid;table_name text;role_name text;definition text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['order_number_migration_restore','order_number_counters','order_number_allocations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace JOIN pg_roles owner ON owner.oid=relation.relowner
    WHERE namespace.nspname='saas' AND relation.relname=table_name AND relation.relrowsecurity AND relation.relforcerowsecurity AND owner.rolname='celebix_saas_owner')
   OR NOT EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid=to_regclass('saas.'||table_name) AND policy.polname='owner_only'
    AND policy.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner')] AND pg_get_expr(policy.polqual,policy.polrelid)='true' AND pg_get_expr(policy.polwithcheck,policy.polrelid)='true')
  THEN RAISE EXCEPTION 'ORDER_NUMBER_TABLE_AUTHORITY_INVALID:%',table_name;END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_table_privilege(role_name,'saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'ORDER_NUMBER_TABLE_PRIVILEGE_LEAK:%:%',table_name,role_name;END IF;
  END LOOP;
 END LOOP;
 FOR entry IN SELECT * FROM (VALUES
  ('saas.order_number_existing_max(uuid,text)',true),('saas.order_number_allocate(uuid,uuid,text,timestamp with time zone)',true),
  ('saas.order_number_assign_before_insert()',true),('saas.order_number_immutable_after_allocation()',true),('saas.order_number_allocation_immutable()',false)
 ) functions(signature,security_definer) LOOP
  routine:=to_regprocedure(entry.signature);
  IF NOT EXISTS(SELECT 1 FROM pg_proc proc JOIN pg_roles owner ON owner.oid=proc.proowner WHERE proc.oid=routine
   AND owner.rolname='celebix_saas_owner' AND proc.prosecdef=entry.security_definer AND 'search_path=pg_catalog, saas'=ANY(proc.proconfig))
  THEN RAISE EXCEPTION 'ORDER_NUMBER_HELPER_AUTHORITY_INVALID:%',entry.signature;END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_function_privilege(role_name,routine,'EXECUTE') THEN RAISE EXCEPTION 'ORDER_NUMBER_HELPER_PRIVILEGE_LEAK:%:%',entry.signature,role_name;END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc proc CROSS JOIN LATERAL aclexplode(proc.proacl) access WHERE proc.oid=routine AND access.grantee=0 AND access.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'ORDER_NUMBER_HELPER_PUBLIC_PRIVILEGE_LEAK:%',entry.signature;END IF;
 END LOOP;
 IF (SELECT count(*) FROM saas.order_number_migration_restore)<>10 THEN RAISE EXCEPTION 'ORDER_NUMBER_CREATOR_RESTORE_INCOMPLETE';END IF;
 FOR entry IN SELECT * FROM saas.order_number_migration_restore LOOP
  routine:=to_regprocedure(entry.signature);definition:=pg_get_functiondef(routine);
  IF encode(sha256(convert_to(definition,'UTF8')),'hex') IS DISTINCT FROM entry.after_hash
   OR (SELECT role.rolname FROM pg_proc proc JOIN pg_roles role ON role.oid=proc.proowner WHERE proc.oid=routine) IS DISTINCT FROM entry.owner_name::text
   OR (SELECT proc.proacl FROM pg_proc proc WHERE proc.oid=routine) IS DISTINCT FROM entry.original_acl
   OR definition NOT LIKE '%ORDER_NUMBER_CREATOR_V161%'
   OR definition NOT LIKE '%saas.order_number_allocate(%'
   OR definition NOT LIKE '%RETURNING orders.order_number INTO %'
  THEN RAISE EXCEPTION 'ORDER_NUMBER_CREATOR_CHANGED:%',entry.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc proc JOIN pg_namespace namespace ON namespace.oid=proc.pronamespace
  WHERE namespace.nspname='saas' AND proc.prokind='f' AND pg_get_functiondef(proc.oid) LIKE '%INSERT INTO saas.orders%'
  AND NOT EXISTS(SELECT 1 FROM saas.order_number_migration_restore saved WHERE to_regprocedure(saved.signature)=proc.oid))
 THEN RAISE EXCEPTION 'ORDER_NUMBER_UNKNOWN_CREATOR';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.orders'::regclass AND tgname='order_number_assign_before_insert' AND tgenabled='O' AND tgfoid='saas.order_number_assign_before_insert()'::regprocedure)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.orders'::regclass AND tgname='order_number_immutable_after_allocation' AND tgenabled='O' AND tgfoid='saas.order_number_immutable_after_allocation()'::regprocedure)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.order_number_allocations'::regclass AND tgname='order_number_allocation_immutable' AND tgenabled='O' AND tgfoid='saas.order_number_allocation_immutable()'::regprocedure)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.order_number_migration_restore'::regclass AND tgname='order_number_restore_immutable' AND tgenabled='O' AND tgfoid='saas.order_number_allocation_immutable()'::regprocedure)
  OR to_regclass('saas.in_store_sales_completed_order_number_v161') IS NULL
 THEN RAISE EXCEPTION 'ORDER_NUMBER_GUARD_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM saas.order_number_allocations allocation LEFT JOIN saas.order_number_counters counter
  ON counter.store_id=allocation.store_id AND counter.series=allocation.series WHERE counter.last_value IS NULL OR counter.last_value<allocation.ordinal)
 THEN RAISE EXCEPTION 'ORDER_NUMBER_COUNTER_BEHIND_ALLOCATION';END IF;
 IF 'POS-12345678901234567890123456789012'~'^POS-[0-9]{7,19}$' THEN RAISE EXCEPTION 'ORDER_NUMBER_LEGACY_UUID_NOT_EXCLUDED';END IF;
END $assertions$;
ROLLBACK;
