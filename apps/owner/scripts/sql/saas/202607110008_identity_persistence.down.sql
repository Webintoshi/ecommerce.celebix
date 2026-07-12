-- Phase 2B1 deterministic rollback; Phase 2A objects remain intact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP TRIGGER oidc_transactions_guard ON saas.oidc_transactions;
DROP TRIGGER registration_workflows_guard ON saas.registration_workflows;
DROP FUNCTION saas.guard_oidc_transaction_mutation();
DROP FUNCTION saas.guard_registration_workflow_mutation();
DROP TABLE saas.oidc_transactions;
DROP TABLE saas.registration_workflows;

COMMIT;
