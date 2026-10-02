-- Periodic health checks must not starve every tenant when one counter reaches 1000.
-- This counter saturates; versions and lifecycle timestamps still identify each check.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('celebix.domain_worker_attempt_cap.202',0));

CREATE TABLE IF NOT EXISTS saas.domain_worker_attempt_cap_backup_202 (
 signature text PRIMARY KEY,
 original_definition text NOT NULL,
 original_source text NOT NULL,
 patched_source text NOT NULL,
 authority jsonb NOT NULL,
 CHECK(original_source<>patched_source)
);
ALTER TABLE saas.domain_worker_attempt_cap_backup_202 ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.domain_worker_attempt_cap_backup_202 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.domain_worker_attempt_cap_backup_202 FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DO $cap$
DECLARE
 target_signature text; target oid; before_function pg_catalog.pg_proc%ROWTYPE; after_function pg_catalog.pg_proc%ROWTYPE;
 saved saas.domain_worker_attempt_cap_backup_202%ROWTYPE; definition text; next_source text;
 old_fragment constant text:='attempt_count=attempt_count+1';
 new_fragment constant text:='attempt_count=LEAST(attempt_count+1,1000)';
BEGIN
 IF EXISTS(SELECT 1 FROM saas.domain_worker_attempt_cap_backup_202 b WHERE b.signature NOT IN (
  'saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)',
  'saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)')) THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_BACKUP_INVALID';
 END IF;
 FOREACH target_signature IN ARRAY ARRAY[
  'saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)',
  'saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)'
 ] LOOP
  target:=pg_catalog.to_regprocedure(target_signature);
  SELECT p.* INTO before_function FROM pg_catalog.pg_proc p WHERE p.oid=target;
  IF NOT FOUND OR before_function.proowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
   OR before_function.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
   OR NOT before_function.prosecdef OR before_function.provolatile<>'v'
   OR before_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_PRECONDITION_FAILED';
  END IF;
  SELECT b.* INTO saved FROM saas.domain_worker_attempt_cap_backup_202 b WHERE b.signature=target_signature;
  IF FOUND THEN
   IF saved.patched_source IS DISTINCT FROM pg_catalog.replace(saved.original_source,old_fragment,new_fragment)
    OR (pg_catalog.length(saved.original_source)-pg_catalog.length(pg_catalog.replace(saved.original_source,old_fragment,'')))/pg_catalog.length(old_fragment)<>1
    OR saved.authority IS DISTINCT FROM pg_catalog.to_jsonb(before_function)-'prosrc'
    OR before_function.prosrc IS DISTINCT FROM saved.patched_source THEN
    RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_SOURCE_DRIFT';
   END IF;
   CONTINUE;
  END IF;
  IF (pg_catalog.length(before_function.prosrc)-pg_catalog.length(pg_catalog.replace(before_function.prosrc,old_fragment,'')))/pg_catalog.length(old_fragment)<>1
   OR pg_catalog.strpos(before_function.prosrc,new_fragment)>0 THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_SOURCE_DRIFT';
  END IF;
  definition:=pg_catalog.pg_get_functiondef(target);
  next_source:=pg_catalog.replace(before_function.prosrc,old_fragment,new_fragment);
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,before_function.prosrc,'')))/pg_catalog.length(before_function.prosrc)<>1 THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_DEFINITION_INVALID';
  END IF;
  INSERT INTO saas.domain_worker_attempt_cap_backup_202(signature,original_definition,original_source,patched_source,authority)
   VALUES(target_signature,definition,before_function.prosrc,next_source,pg_catalog.to_jsonb(before_function)-'prosrc');
  EXECUTE pg_catalog.replace(definition,before_function.prosrc,next_source);
  SELECT p.* INTO after_function FROM pg_catalog.pg_proc p WHERE p.oid=target;
  IF NOT FOUND OR after_function.prosrc IS DISTINCT FROM next_source
   OR pg_catalog.to_jsonb(after_function)-'prosrc' IS DISTINCT FROM pg_catalog.to_jsonb(before_function)-'prosrc' THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_AUTHORITY_CHANGED';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM saas.domain_worker_attempt_cap_backup_202)<>2 THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_BACKUP_INVALID';
 END IF;
END $cap$;
COMMIT;
