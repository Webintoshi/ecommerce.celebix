-- Phase 2A1 disposable cluster-role cleanup.
-- Run only after the saas schema has been rolled back from every disposable database in the cluster.

BEGIN;

DO $phase2a1_revoke_database_create$
DECLARE
  database_name text;
BEGIN
  FOR database_name IN
    SELECT database.datname
    FROM pg_catalog.pg_database AS database
    WHERE pg_catalog.has_database_privilege('celebix_saas_owner', database.datname, 'CREATE')
      AND NOT database.datistemplate
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE CREATE ON DATABASE %I FROM celebix_saas_owner',
      database_name
    );
  END LOOP;
END
$phase2a1_revoke_database_create$;

REVOKE celebix_saas_owner FROM celebix_saas_migrator;

DROP ROLE celebix_saas_observability;
DROP ROLE celebix_saas_host_resolver;
DROP ROLE celebix_saas_workflow;
DROP ROLE celebix_saas_app;
DROP ROLE celebix_saas_bootstrap;
DROP ROLE celebix_saas_migrator;
DROP ROLE celebix_saas_owner;

COMMIT;
