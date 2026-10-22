-- Only an explicitly reviewed rollback before any standalone purchase is safe.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store_tool.public.release264',0));
LOCK TABLE saas.store_tool_licenses,saas.store_tool_purchases,saas.store_tool_public264_functions IN SHARE ROW EXCLUSIVE MODE;
DO $guard$DECLARE r record;BEGIN
 IF current_setting('celebix.allow_native264_down',true)IS DISTINCT FROM'on'THEN RAISE EXCEPTION 'STORE_TOOL264_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_purchases)OR EXISTS(SELECT 1 FROM saas.store_tool_licenses WHERE source='purchase')THEN RAISE EXCEPTION 'STORE_TOOL264_ROLLBACK_IN_USE';END IF;
 IF(SELECT count(*)FROM saas.store_tool_public264_functions)<>14 OR(SELECT count(*)FROM saas.store_tool_public264_functions WHERE is_new)<>1 THEN RAISE EXCEPTION 'STORE_TOOL264_ROLLBACK_BACKUP';END IF;
 FOR r IN SELECT * FROM saas.store_tool_public264_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature)AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND p.prosecdef=r.function_security AND p.provolatile=r.function_volatility AND p.proisstrict=r.function_strict AND p.proparallel=r.function_parallel AND p.prolang=r.function_language)OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'STORE_TOOL264_ROLLBACK_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
END $guard$;
DO $restore$DECLARE r record;BEGIN
 FOR r IN SELECT * FROM saas.store_tool_public264_functions WHERE NOT is_new LOOP EXECUTE r.definition;END LOOP;
END $restore$;
DROP FUNCTION saas.restock_enabled(uuid,timestamptz);
DROP TABLE saas.store_tool_public264_functions;
COMMIT;
