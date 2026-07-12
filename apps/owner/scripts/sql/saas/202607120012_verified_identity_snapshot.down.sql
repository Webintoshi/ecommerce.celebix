-- Remove only Phase 2B1B1 verified-identity objects.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP TRIGGER registration_verified_identity_transition_guard ON saas.registration_workflows;
DROP TRIGGER registration_verified_identities_pair_guard ON saas.registration_verified_identities;
DROP TRIGGER registration_verified_identities_immutable_guard ON saas.registration_verified_identities;
DROP TRIGGER registration_verified_identities_insert_guard ON saas.registration_verified_identities;
DROP FUNCTION saas.assert_registration_verified_identity_pair();
DROP FUNCTION saas.guard_registration_verified_identity_transition();
DROP FUNCTION saas.guard_registration_verified_identity_mutation();
DROP FUNCTION saas.guard_registration_verified_identity_insert();
DROP TABLE saas.registration_verified_identities;

COMMIT;
