-- Phase 2B1 disposable identity-persistence authority role.
BEGIN;

DO $phase2b1_identity_role_precondition$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity') THEN
    RAISE EXCEPTION 'PHASE2B1_ROLE_PRECONDITION_FAILED';
  END IF;
END
$phase2b1_identity_role_precondition$;

CREATE ROLE celebix_saas_identity
  NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

COMMIT;
