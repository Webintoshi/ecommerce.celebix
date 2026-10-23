BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release267',0));
DO $safe$DECLARE r saas.trendyol267_backup;BEGIN
 IF EXISTS(SELECT 1 FROM saas.trendyol_connections)OR EXISTS(SELECT 1 FROM saas.trendyol_jobs)OR EXISTS(SELECT 1 FROM saas.trendyol_operations)OR EXISTS(SELECT 1 FROM saas.trendyol_orders)THEN RAISE EXCEPTION 'TRENDYOL267_COMMITTED_DATA';END IF;
 FOR r IN SELECT * FROM saas.trendyol267_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'TRENDYOL267_DOWN_SOURCE_DRIFT';END IF;
  EXECUTE r.definition;
 END LOOP;
END $safe$;
DROP FUNCTION saas.trendyol_rebase_batches(uuid,timestamptz),saas.trendyol_variant_pending_batch(uuid,uuid);
DROP INDEX saas.trendyol_jobs_pending_batch;
DROP TABLE saas.trendyol267_backup;
COMMIT;
