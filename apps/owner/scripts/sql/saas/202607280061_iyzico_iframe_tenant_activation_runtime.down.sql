BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

LOCK TABLE saas.iyzico_iframe_tenant_evidence_runs,
  saas.payment_methods,
  saas.merchant_provider_profiles
IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.iyzico_iframe_tenant_evidence_runs) THEN
    RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_STATE_EXISTS';
  END IF;
END
$f$;

DROP FUNCTION saas.iyzico_iframe_tenant_activation_runtime_preflight();
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_activate_current(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_claimed_profile(
  uuid,uuid,text,timestamptz
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_claim_next(
  text,uuid,timestamptz,timestamptz
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_current(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
);
DROP FUNCTION saas.iyzico_iframe_tenant_evidence_begin_current(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,text,integer
);

COMMIT;
