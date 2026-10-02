-- Emergency rollback only: refuse to restore queue starvation for capped jobs.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('celebix.domain_worker_attempt_cap.202',0));
DO $rollback$
DECLARE saved record; target oid; routine pg_catalog.pg_proc%ROWTYPE; signature text;
BEGIN
 IF pg_catalog.to_regclass('saas.domain_worker_attempt_cap_backup_202') IS NULL THEN
  FOREACH signature IN ARRAY ARRAY[
   'saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)',
   'saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)'
  ] LOOP
   SELECT p.* INTO routine FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(signature);
   IF NOT FOUND OR pg_catalog.strpos(routine.prosrc,'attempt_count=attempt_count+1')=0
    OR pg_catalog.strpos(routine.prosrc,'attempt_count=LEAST(attempt_count+1,1000)')>0 THEN
    RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_DOWN_BACKUP_MISSING';
   END IF;
  END LOOP;
  RETURN;
 END IF;
 IF (SELECT count(*) FROM saas.domain_worker_attempt_cap_backup_202)<>2 THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_BACKUP_INVALID';
 END IF;
 -- Keep the safety scan and restoration atomic against both workers' claims.
 -- A concurrent 999->1000 claim must wait until this transaction commits.
 LOCK TABLE saas.store_domain_provisioning,saas.admin_domains IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.store_domain_provisioning WHERE provider_hostname_id IS NOT NULL
   AND (hostname_status<>'deleted' OR ssl_status<>'deleted') AND (attempt_count>=1000 OR lease_expires_at>pg_catalog.statement_timestamp()))
  OR EXISTS(SELECT 1 FROM saas.admin_domains WHERE kind='custom_alias' AND provider_hostname_id IS NOT NULL
   AND (hostname_status<>'deleted' OR ssl_status<>'deleted') AND (attempt_count>=1000 OR lease_expires_at>pg_catalog.statement_timestamp())) THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_ROLLBACK_UNSAFE';
 END IF;
 FOR saved IN SELECT * FROM saas.domain_worker_attempt_cap_backup_202 ORDER BY signature LOOP
  target:=pg_catalog.to_regprocedure(saved.signature);
  SELECT p.* INTO routine FROM pg_catalog.pg_proc p WHERE p.oid=target;
  IF NOT FOUND OR routine.prosrc IS DISTINCT FROM saved.patched_source
   OR pg_catalog.to_jsonb(routine)-'prosrc' IS DISTINCT FROM saved.authority THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_DOWN_SOURCE_DRIFT';
  END IF;
  EXECUTE saved.original_definition;
  SELECT p.* INTO routine FROM pg_catalog.pg_proc p WHERE p.oid=target;
  IF NOT FOUND OR routine.prosrc IS DISTINCT FROM saved.original_source
   OR pg_catalog.to_jsonb(routine)-'prosrc' IS DISTINCT FROM saved.authority THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_DOWN_AUTHORITY_CHANGED';
  END IF;
 END LOOP;
 DROP TABLE saas.domain_worker_attempt_cap_backup_202;
END $rollback$;
COMMIT;
