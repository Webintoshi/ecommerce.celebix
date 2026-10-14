BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $rollback$
DECLARE saved record;current_function record;moment timestamptz:=clock_timestamp();
BEGIN
 IF to_regclass('saas.google_merchant_236_backup') IS NULL THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.google_merchant_outbox'::regclass AND attname='next_status_check_at' AND NOT attisdropped)
  THEN RAISE EXCEPTION 'MERCHANT236_BACKUP_MISSING';END IF;
  RETURN;
 END IF;
 IF (SELECT count(*) FROM saas.google_merchant_236_backup)<>2 THEN RAISE EXCEPTION 'MERCHANT236_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.google_merchant_236_backup LOOP
  SELECT * INTO current_function FROM pg_proc WHERE oid=saved.function_oid;
  IF current_function.proowner IS DISTINCT FROM saved.function_owner OR current_function.proacl IS DISTINCT FROM saved.function_acl
  THEN RAISE EXCEPTION 'MERCHANT236_ROLLBACK_AUTHORITY_DRIFT';END IF;
  IF to_regprocedure(saved.signature) IS DISTINCT FROM saved.function_oid
   OR encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  THEN RAISE EXCEPTION 'MERCHANT236_ROLLBACK_SOURCE_DRIFT';END IF;
 END LOOP;
 FOR saved IN SELECT * FROM saas.google_merchant_236_backup LOOP
  EXECUTE saved.definition;
  IF encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  THEN RAISE EXCEPTION 'MERCHANT236_ROLLBACK_RESTORE_MISMATCH';END IF;
 END LOOP;
 -- Preserve every live submission/approval receipt; only restore legacy scheduling.
 UPDATE saas.google_merchant_outbox SET next_action=CASE WHEN state IN('approved','limited') THEN 'upsert' ELSE 'status' END,
  next_attempt_at=CASE WHEN state IN('approved','limited') THEN last_submitted_at+interval '25 days'
   WHEN state='disapproved' THEN least(moment+interval '1 day',last_submitted_at+interval '25 days')
   ELSE least(moment+interval '15 minutes',last_submitted_at+interval '25 days') END
 WHERE state IN('submitted','approved','limited','disapproved') AND next_status_check_at IS NOT NULL
  AND last_submitted_at IS NOT NULL AND google_product_id IS NOT NULL AND last_export_fingerprint IS NOT NULL AND last_submission_connection_version=connection_version;
 ALTER TABLE saas.google_merchant_outbox DROP COLUMN next_status_check_at;
 DROP TABLE saas.google_merchant_236_backup;
END $rollback$;
COMMIT;
