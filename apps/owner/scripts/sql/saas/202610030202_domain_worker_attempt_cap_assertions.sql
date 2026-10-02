BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE saved record; routine pg_catalog.pg_proc%ROWTYPE;
 old_fragment constant text:='attempt_count=attempt_count+1';
 new_fragment constant text:='attempt_count=LEAST(attempt_count+1,1000)';
BEGIN
 IF pg_catalog.to_regclass('saas.domain_worker_attempt_cap_backup_202') IS NULL
  OR (SELECT count(*) FROM saas.domain_worker_attempt_cap_backup_202)<>2 THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_ASSERTION_BACKUP_MISSING';
 END IF;
 FOR saved IN SELECT * FROM saas.domain_worker_attempt_cap_backup_202 LOOP
  SELECT p.* INTO routine FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(saved.signature);
  IF NOT FOUND OR routine.prosrc IS DISTINCT FROM saved.patched_source
   OR saved.patched_source IS DISTINCT FROM pg_catalog.replace(saved.original_source,old_fragment,new_fragment)
   OR (pg_catalog.length(saved.original_source)-pg_catalog.length(pg_catalog.replace(saved.original_source,old_fragment,'')))/pg_catalog.length(old_fragment)<>1
   OR pg_catalog.to_jsonb(routine)-'prosrc' IS DISTINCT FROM saved.authority
   OR NOT pg_catalog.has_function_privilege('celebix_saas_workflow',routine.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('celebix_saas_app',routine.oid,'EXECUTE') THEN
   RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_ASSERTION_AUTHORITY_CHANGED';
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='saas.domain_worker_attempt_cap_backup_202'::regclass AND c.relrowsecurity AND c.relforcerowsecurity
  AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) privilege
   WHERE c.oid='saas.domain_worker_attempt_cap_backup_202'::regclass AND privilege.grantee<>c.relowner)
  OR EXISTS(SELECT 1 FROM saas.store_domain_provisioning WHERE attempt_count<0 OR attempt_count>1000)
  OR EXISTS(SELECT 1 FROM saas.admin_domains WHERE attempt_count<0 OR attempt_count>1000) THEN
  RAISE EXCEPTION 'DOMAIN_WORKER_ATTEMPT_CAP_ASSERTION_PRIVATE_BOUNDARY_FAILED';
 END IF;
END $assertions$;
ROLLBACK;
