-- A committed noncash debt closure is immutable; use a reviewed forward change.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $guard$DECLARE r record;p record;BEGIN
 IF current_setting('celebix.allow_native261_down',true)IS DISTINCT FROM'on'
 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_events WHERE metadata->>'permanentOrderDebtClosure'='true')
 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_COMMITTED_CLOSURES';END IF;
 IF (SELECT count(*)FROM saas.order_delete_debt261_restore)<>4
 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_RESTORE_INCOMPLETE';END IF;
 FOR r IN SELECT * FROM saas.order_delete_debt261_restore LOOP
  SELECT f.* INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR p.oid<>r.function_oid
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')IS DISTINCT FROM r.after_hash
   OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.before_hash
   OR p.proowner<>r.function_owner OR p.proacl IS DISTINCT FROM r.function_acl
   OR p.proconfig IS DISTINCT FROM r.function_config OR p.prosecdef<>r.security_definer
   OR p.provolatile<>r.function_volatility OR p.proisstrict<>r.function_strict OR p.proparallel<>r.function_parallel
  THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.order_delete_debt261_restore LOOP EXECUTE r.definition;END LOOP;
END $guard$;
DROP FUNCTION saas.permanent_order_close_debt(uuid,uuid,uuid,uuid,timestamptz);
DROP TABLE saas.order_delete_debt261_restore;
COMMIT;
