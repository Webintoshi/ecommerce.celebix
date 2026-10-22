-- Refuse rollback after an explicit grant or durable v7 receipt, and preserve exact predecessor metadata.
BEGIN;SET LOCAL ROLE celebix_saas_owner;SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cashier.orders.release259',0));
LOCK TABLE saas.in_store_staff_grants,saas.in_store_operations IN SHARE ROW EXCLUSIVE MODE;
DO $guard$DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_manage_orders) OR EXISTS(SELECT 1 FROM saas.in_store_operations WHERE operation_kind='set_staff_v7') THEN RAISE EXCEPTION 'CASHIER_ORDERS259_ROLLBACK_IN_USE';END IF;
 IF (SELECT count(*) FROM saas.cashier_orders259_functions)<>7 OR (SELECT count(*) FROM saas.cashier_orders259_functions WHERE NOT is_new)<>1 THEN RAISE EXCEPTION 'CASHIER_ORDERS259_ROLLBACK_BACKUP';END IF;
 FOR r IN SELECT * FROM saas.cashier_orders259_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature) AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND p.prosecdef=r.function_security AND p.provolatile=r.function_volatility AND p.proisstrict=r.function_strict AND p.proparallel=r.function_parallel AND p.prolang=r.function_language) OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'CASHIER_ORDERS259_ROLLBACK_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.cashier_orders259_functions WHERE NOT is_new LOOP
  EXECUTE r.definition;
  IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(r.signature)),'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'CASHIER_ORDERS259_RESTORE_MISMATCH:%',r.signature;END IF;
 END LOOP;
END $guard$;
DROP FUNCTION saas.in_store_sales_set_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer,boolean);
DROP FUNCTION saas.in_store_sales_recover_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.in_store_sales_list_staff_v7(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.in_store_staff_projection_v7(uuid,uuid);
DROP FUNCTION saas.orders_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.orders259_can_manage(uuid,uuid);
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_manage_orders;
DROP TABLE saas.cashier_orders259_functions;
COMMIT;
