-- Remove only Phase 2B1B1 verified-identity objects.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz);
DROP TRIGGER registration_verified_identity_transition_guard ON saas.registration_workflows;
DROP TRIGGER registration_tenant_completions_pair_guard ON saas.registration_tenant_completions;
DROP TRIGGER registration_tenant_completions_transition_guard ON saas.registration_tenant_completions;
DROP TRIGGER registration_tenant_completions_insert_guard ON saas.registration_tenant_completions;
DROP TRIGGER registration_verified_identities_pair_guard ON saas.registration_verified_identities;
DROP TRIGGER registration_verified_identities_immutable_guard ON saas.registration_verified_identities;
DROP TRIGGER registration_verified_identities_insert_guard ON saas.registration_verified_identities;
DROP FUNCTION saas.assert_registration_verified_identity_pair();
DROP FUNCTION saas.assert_registration_tenant_completion_pair();
DROP FUNCTION saas.guard_registration_tenant_completion_mutation();
DROP FUNCTION saas.guard_registration_tenant_completion_insert();
DROP FUNCTION saas.guard_registration_verified_identity_transition();
DROP FUNCTION saas.guard_registration_verified_identity_mutation();
DROP FUNCTION saas.guard_registration_verified_identity_insert();
DROP VIEW saas.registration_tenant_operation_proofs;
DROP TABLE saas.registration_tenant_completions;
DROP TABLE saas.registration_verified_identities;
ALTER TABLE saas.registration_workflows
  DROP COLUMN tenant_idempotency_digest;

COMMIT;
