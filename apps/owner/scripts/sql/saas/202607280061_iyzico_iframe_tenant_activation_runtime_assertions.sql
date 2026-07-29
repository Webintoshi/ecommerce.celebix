BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure(
      'saas.iyzico_iframe_tenant_activation_runtime_preflight()'
    ) IS NULL
    OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_FUNCTION_DRIFT';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.iyzico_iframe_tenant_evidence_begin_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.iyzico_iframe_tenant_evidence_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.iyzico_iframe_tenant_evidence_activate_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.iyzico_iframe_tenant_evidence_claim_next(text,uuid,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.iyzico_iframe_tenant_evidence_claimed_profile(uuid,uuid,text,timestamp with time zone)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_ACTIVATION_RUNTIME_PRIVILEGE_DRIFT';
  END IF;
END
$f$;

ROLLBACK;
