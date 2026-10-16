-- No historical costs are changed by this migration; active fallback readers must be disabled first.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $restore$ DECLARE f record;
BEGIN
 LOCK TABLE saas.accounting_release_state,saas.accounting_cost_244_backup IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.accounting_release_state WHERE cost_catalog_fallback_enabled)
 THEN RAISE EXCEPTION 'ACCOUNTING244_DOWN_ACTIVE_READER';END IF;
 IF(SELECT count(*) FROM saas.accounting_cost_244_backup)<>1 THEN RAISE EXCEPTION 'ACCOUNTING244_DOWN_BACKUP_INVALID';END IF;
 FOR f IN SELECT * FROM saas.accounting_cost_244_backup LOOP
  IF f.signature<>'saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)' OR f.original_sha256<>'7215040bfe2ae1c186505a1e13bf57a2a9ecb0df78e7dced354899fe08bd68ad' OR f.published_sha256<>'1f23a5d92126be51dc9e664f8d90d410912589ded0ea7049d34802047cbee230'
   OR encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>f.original_sha256
   OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.function_oid AND p.oid=to_regprocedure(f.signature) AND p.proowner=f.function_owner AND p.proacl IS NOT DISTINCT FROM f.function_acl
    AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f.published_sha256)
  THEN RAISE EXCEPTION 'ACCOUNTING244_DOWN_FUNCTION_OR_BACKUP_DRIFT';END IF;
  EXECUTE f.definition;
 END LOOP;
END $restore$;
ALTER TABLE saas.accounting_release_state DROP COLUMN cost_catalog_fallback_enabled;
DROP TABLE saas.accounting_cost_244_backup;
COMMIT;
