-- Refuse rollback after any v8 receipt or explicit Overview grant.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cashier.overview.release262',0));
LOCK TABLE saas.in_store_staff_grants,saas.in_store_operations IN SHARE ROW EXCLUSIVE MODE;
DO $guard$DECLARE r record;BEGIN
 IF current_setting('celebix.allow_native262_down',true)IS DISTINCT FROM'on'THEN RAISE EXCEPTION 'OVERVIEW262_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_view_overview)OR EXISTS(SELECT 1 FROM saas.in_store_operations WHERE operation_kind='set_staff_v8')THEN RAISE EXCEPTION 'OVERVIEW262_ROLLBACK_IN_USE';END IF;
 IF(SELECT count(*)FROM saas.cashier_overview262_functions)<>14 OR(SELECT count(*)FROM saas.cashier_overview262_functions WHERE is_new)<>7 THEN RAISE EXCEPTION 'OVERVIEW262_ROLLBACK_BACKUP';END IF;
 FOR r IN SELECT * FROM saas.cashier_overview262_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature)AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND p.prosecdef=r.function_security AND p.provolatile=r.function_volatility AND p.proisstrict=r.function_strict AND p.proparallel=r.function_parallel AND p.prolang=r.function_language)OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'OVERVIEW262_ROLLBACK_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
END $guard$;
DROP FUNCTION saas.in_store_sales_set_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer,boolean,boolean);
DROP FUNCTION saas.in_store_sales_recover_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.in_store_sales_list_staff_v8(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.in_store_staff_projection_v8(uuid,uuid);
DROP FUNCTION saas.overview_get_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.overview_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.overview262_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean);
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_view_overview;
DROP TABLE saas.cashier_overview262_functions;
COMMIT;
