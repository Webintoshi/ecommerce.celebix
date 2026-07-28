BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

LOCK TABLE
  saas.iyzico_iframe_tenant_evidence_runs,
  saas.iyzico_iframe_tenant_evidence_cases,
  saas.iyzico_iframe_tenant_evidence_events,
  saas.iyzico_iframe_tenant_evidence_attestations,
  saas.iyzico_iframe_tenant_activation_fences
IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_runs)
    OR EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_cases)
    OR EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_events)
    OR EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_attestations)
    OR EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_activation_fences)
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_SANDBOX_EVIDENCE_EXISTS'; END IF;
END
$f$;

DROP TRIGGER iyzico_iframe_tenant_payment_method_active_guard ON saas.payment_methods;
DROP TRIGGER iyzico_iframe_tenant_profile_binding_guard ON saas.merchant_provider_profiles;
DROP TRIGGER iyzico_iframe_tenant_attestation_insert_guard
  ON saas.iyzico_iframe_tenant_evidence_attestations;

DROP FUNCTION saas.iyzico_iframe_tenant_evidence_preflight();
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_activate(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint
);
DROP FUNCTION saas.iyzico_iframe_tenant_payment_method_active_guard();
DROP FUNCTION saas.iyzico_iframe_tenant_profile_binding_guard();
DROP FUNCTION saas.iyzico_iframe_tenant_attestation_insert_guard();
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_finalize(
  uuid,uuid,text,uuid,text,timestamptz
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_record_event(
  uuid,uuid,text,uuid,text,text,uuid,text,text,timestamptz
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_claim(
  uuid,text,uuid,timestamptz,timestamptz
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_begin(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_run_current(uuid);

DROP TABLE saas.iyzico_iframe_tenant_activation_fences;
DROP TABLE saas.iyzico_iframe_tenant_evidence_attestations;
DROP TABLE saas.iyzico_iframe_tenant_evidence_events;
DROP TABLE saas.iyzico_iframe_tenant_evidence_cases;
DROP TABLE saas.iyzico_iframe_tenant_evidence_runs;

COMMIT;
