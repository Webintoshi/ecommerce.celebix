BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE before_function pg_catalog.pg_proc%ROWTYPE;
BEGIN
 SELECT routine.* INTO before_function FROM pg_catalog.pg_proc routine
 WHERE routine.oid=pg_catalog.to_regprocedure('saas.storefront_design_editor_payload(uuid)');
 IF NOT FOUND OR before_function.proowner IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
  OR before_function.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
  OR NOT before_function.prosecdef OR before_function.provolatile<>'s'
  OR before_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(before_function.proacl,pg_catalog.acldefault('f',before_function.proowner))) privilege
    WHERE privilege.privilege_type='EXECUTE' AND privilege.grantee<>before_function.proowner)
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_function.prosrc,'UTF8')),'hex')<>'2bd7f7318005cf46efbe2da36bf8dedada2ec7d3e95d5bf267aa3eff2e448b48' THEN
  RAISE EXCEPTION 'DESIGN_EDITOR_MATERIALIZATION_ASSERTIONS_FAILED';
 END IF;
END $assertions$;
ROLLBACK;
