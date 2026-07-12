-- Phase 2B1B1 exact verified-identity privileges.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

REVOKE ALL ON saas.registration_verified_identities FROM PUBLIC;
REVOKE ALL ON saas.registration_verified_identities FROM celebix_saas_identity;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_registration_verified_identity_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.assert_registration_verified_identity_pair() FROM PUBLIC;

GRANT SELECT, INSERT ON saas.registration_verified_identities TO celebix_saas_identity;

COMMIT;
