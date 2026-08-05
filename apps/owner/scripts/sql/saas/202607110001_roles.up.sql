-- Phase 2A1 disposable role prototype. No login, password, database target, or credential is embedded.
-- Apply once to a newly created disposable PostgreSQL cluster before the foundation migration.

BEGIN;

DO $phase2a1_roles_precondition$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'celebix_saas_owner',
    'celebix_saas_migrator',
    'celebix_saas_bootstrap',
    'celebix_saas_app',
    'celebix_saas_workflow',
    'celebix_saas_host_resolver',
    'celebix_saas_observability'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      RAISE EXCEPTION 'PHASE2A1_ROLE_PRECONDITION_FAILED: role % already exists', role_name;
    END IF;
  END LOOP;
END
$phase2a1_roles_precondition$;

CREATE ROLE celebix_saas_owner
  NOLOGIN NOINHERIT BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_migrator
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_bootstrap
  NOLOGIN NOINHERIT BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_app
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_workflow
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_host_resolver
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

CREATE ROLE celebix_saas_observability
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

-- The executor may explicitly SET ROLE to the NOLOGIN owner during a reviewed migration.
-- NOINHERIT prevents owner authority from becoming ambient executor authority.
GRANT celebix_saas_owner TO celebix_saas_migrator;

DO $phase2a1_database_create_grant$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT CREATE ON DATABASE %I TO celebix_saas_owner',
    pg_catalog.current_database()
  );
END
$phase2a1_database_create_grant$;

COMMIT;
