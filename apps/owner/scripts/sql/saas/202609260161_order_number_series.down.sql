-- Rollback is safe only before a new number has been assigned. Keeping the
-- ledger after use is necessary to prevent deleted numbers from being reused.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.orders IN SHARE ROW EXCLUSIVE MODE;

DO $restore$
DECLARE entry record;routine oid;grant_entry record;role_name text;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.order_number_allocations) THEN RAISE EXCEPTION 'ORDER_NUMBER_ROLLBACK_HAS_ALLOCATIONS';END IF;
 IF (SELECT count(*) FROM saas.order_number_migration_restore)<>10 THEN RAISE EXCEPTION 'ORDER_NUMBER_ROLLBACK_RESTORE_INCOMPLETE';END IF;
 FOR entry IN SELECT * FROM saas.order_number_migration_restore ORDER BY signature LOOP
  routine:=to_regprocedure(entry.signature);
  IF routine IS NULL OR encode(sha256(convert_to(pg_get_functiondef(routine),'UTF8')),'hex') IS DISTINCT FROM entry.after_hash
  THEN RAISE EXCEPTION 'ORDER_NUMBER_ROLLBACK_CREATOR_DRIFT:%',entry.signature;END IF;
  EXECUTE entry.definition;
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',entry.signature,entry.owner_name);
  -- Restore the captured effective ACL explicitly, including any grant option.
  FOR grant_entry IN SELECT DISTINCT access.grantee FROM pg_proc proc CROSS JOIN LATERAL aclexplode(proc.proacl) access WHERE proc.oid=routine LOOP
   role_name:=CASE WHEN grant_entry.grantee=0 THEN 'PUBLIC' ELSE quote_ident((SELECT rolname FROM pg_roles WHERE oid=grant_entry.grantee)) END;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',entry.signature,role_name);
  END LOOP;
  FOR grant_entry IN SELECT * FROM aclexplode(entry.original_acl) LOOP
   role_name:=CASE WHEN grant_entry.grantee=0 THEN 'PUBLIC' ELSE quote_ident((SELECT rolname FROM pg_roles WHERE oid=grant_entry.grantee)) END;
   IF grant_entry.privilege_type<>'EXECUTE' THEN RAISE EXCEPTION 'ORDER_NUMBER_ROLLBACK_UNEXPECTED_PRIVILEGE';END IF;
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s',entry.signature,role_name,CASE WHEN grant_entry.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
  IF encode(sha256(convert_to(pg_get_functiondef(routine),'UTF8')),'hex')<>entry.before_hash
   OR (SELECT role.rolname FROM pg_proc proc JOIN pg_roles role ON role.oid=proc.proowner WHERE proc.oid=routine) IS DISTINCT FROM entry.owner_name::text
   OR (SELECT proc.proacl FROM pg_proc proc WHERE proc.oid=routine) IS DISTINCT FROM entry.original_acl
  THEN RAISE EXCEPTION 'ORDER_NUMBER_ROLLBACK_RESTORE_DRIFT:%',entry.signature;END IF;
 END LOOP;
END $restore$;

DROP TRIGGER order_number_assign_before_insert ON saas.orders;
DROP TRIGGER order_number_immutable_after_allocation ON saas.orders;
DROP TRIGGER order_number_allocation_immutable ON saas.order_number_allocations;
DROP TRIGGER IF EXISTS order_number_restore_immutable ON saas.order_number_migration_restore;
DROP FUNCTION saas.order_number_assign_before_insert();
DROP FUNCTION saas.order_number_immutable_after_allocation();
DROP FUNCTION saas.order_number_allocation_immutable();
DROP FUNCTION saas.order_number_allocate(uuid,uuid,text,timestamptz);
DROP FUNCTION saas.order_number_existing_max(uuid,text);
DROP INDEX saas.in_store_sales_completed_order_number_v161;
DROP TABLE saas.order_number_allocations;
DROP TABLE saas.order_number_counters;
DROP TABLE saas.order_number_migration_restore;
COMMIT;
