-- Phase 2B1B1 exact verified-identity privileges.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON saas.registration_verified_identities FROM PUBLIC;
REVOKE ALL ON saas.registration_verified_identities FROM celebix_saas_identity;
REVOKE ALL ON saas.registration_tenant_completions FROM PUBLIC;
REVOKE ALL ON saas.registration_tenant_completions FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.assert_registration_verified_identity_pair() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_tenant_completion_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_tenant_completion_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.assert_registration_tenant_completion_pair() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz) FROM celebix_saas_identity;

GRANT SELECT, INSERT ON saas.registration_verified_identities TO celebix_saas_identity;
GRANT SELECT, INSERT ON saas.registration_tenant_completions TO celebix_saas_identity;
GRANT UPDATE (state, version, started_at, updated_at, commit_unknown_at, recovery_absent_at)
  ON saas.registration_tenant_completions TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz)
  TO celebix_saas_identity;

COMMIT;
