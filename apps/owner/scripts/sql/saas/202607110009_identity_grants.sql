-- Phase 2B1 exact identity-store privileges.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON saas.registration_workflows FROM PUBLIC;
REVOKE ALL ON saas.oidc_transactions FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_workflow_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_oidc_transaction_mutation() FROM PUBLIC;

GRANT USAGE ON SCHEMA saas TO celebix_saas_identity;
GRANT SELECT, INSERT, DELETE ON saas.registration_workflows TO celebix_saas_identity;
GRANT UPDATE (
  status, version, canonical_fingerprint, updated_at, consumed_at, failure_code, terminal_at
) ON saas.registration_workflows TO celebix_saas_identity;
GRANT SELECT, INSERT, DELETE ON saas.oidc_transactions TO celebix_saas_identity;
GRANT UPDATE (status, updated_at, consumed_at, discarded_at)
  ON saas.oidc_transactions TO celebix_saas_identity;

COMMIT;
