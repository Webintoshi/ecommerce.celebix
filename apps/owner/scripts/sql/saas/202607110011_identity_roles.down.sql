-- Phase 2B1 disposable identity role cleanup after table rollback.
BEGIN;

DO $phase2b1_identity_role_cleanup$
BEGIN
  IF pg_catalog.to_regclass('saas.registration_workflows') IS NOT NULL
     OR pg_catalog.to_regclass('saas.oidc_transactions') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE2B1_ROLE_CLEANUP_BLOCKED';
  END IF;
END
$phase2b1_identity_role_cleanup$;

DROP ROLE celebix_saas_identity;
COMMIT;
