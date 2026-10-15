-- Restore only executable authority. Deleted grants stay deleted and audit stays durable.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $rollback$
DECLARE saved record;current_function record;
BEGIN
 IF to_regclass('saas.merchant_phone_237_backup') IS NULL THEN RETURN;END IF;
 IF (SELECT count(*) FROM saas.merchant_phone_237_backup)<>1 THEN RAISE EXCEPTION 'MERCHANT237_BACKUP_INVALID';END IF;
 SELECT * INTO STRICT saved FROM saas.merchant_phone_237_backup;
 SELECT * INTO current_function FROM pg_proc WHERE oid=saved.function_oid;
 IF current_function.proowner IS DISTINCT FROM saved.function_owner OR current_function.proacl IS DISTINCT FROM saved.function_acl
 THEN RAISE EXCEPTION 'MERCHANT237_ROLLBACK_AUTHORITY_DRIFT';END IF;
 IF to_regprocedure(saved.signature) IS DISTINCT FROM saved.function_oid
  OR encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
  OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
 THEN RAISE EXCEPTION 'MERCHANT237_ROLLBACK_SOURCE_DRIFT';END IF;
 EXECUTE saved.definition;
 IF encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
 THEN RAISE EXCEPTION 'MERCHANT237_ROLLBACK_RESTORE_MISMATCH';END IF;
 DROP TABLE saas.merchant_phone_237_backup;
END $rollback$;
COMMIT;
