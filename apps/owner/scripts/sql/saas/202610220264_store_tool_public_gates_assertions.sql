-- Read-only publication evidence: every changed entrypoint retains its authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assert$DECLARE r record;BEGIN
 IF(SELECT count(*)FROM saas.store_tool_public264_functions)<>14 OR(SELECT count(*)FROM saas.store_tool_public264_functions WHERE is_new)<>1 THEN RAISE EXCEPTION 'STORE_TOOL264_FUNCTION_INVENTORY';END IF;
 FOR r IN SELECT * FROM saas.store_tool_public264_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature)AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND p.prosecdef=r.function_security AND p.provolatile=r.function_volatility AND p.proisstrict=r.function_strict AND p.proparallel=r.function_parallel AND p.prolang=r.function_language)OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'STORE_TOOL264_FUNCTION_DRIFT:%',r.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles role_row WHERE role_row.rolname LIKE'celebix_saas_%'AND role_row.rolname<>'celebix_saas_owner'AND has_function_privilege(role_row.oid,'saas.restock_enabled(uuid,timestamptz)','EXECUTE'))THEN RAISE EXCEPTION 'STORE_TOOL264_PRIVATE_HELPER_EXPOSED';END IF;
 IF EXISTS(SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid='saas.restock_enabled(uuid,timestamptz)'::regprocedure))WHERE grantee=0 AND privilege_type='EXECUTE')THEN RAISE EXCEPTION 'STORE_TOOL264_PUBLIC_HELPER_EXPOSED';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_tool_public264_functions f JOIN pg_proc p ON p.oid=f.function_oid WHERE p.proname IN('restock_subscribe','restock_manage','restock_claim','restock_authorize')AND p.prosrc~'saas.restock_enabled\((st|s.store_id)\)')THEN RAISE EXCEPTION 'STORE_TOOL264_WORKER_TIME_AUTHORITY';END IF;
 IF saas.store_tool_is_licensed(NULL,'restock',statement_timestamp())IS DISTINCT FROM false THEN RAISE EXCEPTION 'STORE_TOOL264_NULL_STORE_AUTHORITY';END IF;
END $assert$;
COMMIT;
