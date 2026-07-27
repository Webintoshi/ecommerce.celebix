BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid);

COMMIT;
