BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.store-tools.release265',265));
LOCK TABLE saas.store_tool_legacy_releases IN SHARE ROW EXCLUSIVE MODE;
DO $restore$DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_tool_legacy_releases)THEN RAISE EXCEPTION 'STORE_TOOL265_DOWN_HAS_RELEASES';END IF;
 IF current_setting('celebix.allow_native265_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'STORE_TOOL265_DOWN_REQUIRES_REVIEW';END IF;
 FOR r IN SELECT *FROM saas.store_tool_legacy265_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256)THEN RAISE EXCEPTION 'STORE_TOOL265_DOWN_SOURCE_DRIFT';END IF;
  IF NOT r.is_new THEN EXECUTE r.definition;END IF;
 END LOOP;
END $restore$;
DROP TABLE saas.store_tool_legacy_releases,saas.store_tool_legacy265_functions;
DROP FUNCTION saas.store_tool_legacy_release_guard(),saas.store_tool_effective_licenses(uuid,timestamptz);
COMMIT;
