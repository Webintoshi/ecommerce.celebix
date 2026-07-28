BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
DECLARE owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
BEGIN
  IF saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
    OR saas.iyzico_iframe_tenant_evidence_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_PREFLIGHT_INVALID'; END IF;

  IF pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx') IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)'
    ) IS NULL
  THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_OBJECT_INVALID'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation ON relation.oid=attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname LIKE 'iyzico_iframe_tenant_%'
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND attribute.attname~'(secret|token|body|header|email|phone|address|identity|name)'
  ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_FORBIDDEN_COLUMN'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname LIKE 'iyzico_iframe_tenant_%'
      AND relation.relkind='r' AND (
        relation.relowner<>owner_oid OR NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity
        OR pg_catalog.has_table_privilege(app_oid,relation.oid,'SELECT,INSERT,UPDATE,DELETE')
        OR pg_catalog.has_table_privilege(workflow_oid,relation.oid,'SELECT,INSERT,UPDATE,DELETE')
      )
  ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_RELATION_SECURITY_INVALID'; END IF;

  IF EXISTS(
    SELECT run.id FROM saas.iyzico_iframe_tenant_evidence_runs AS run
    LEFT JOIN saas.iyzico_iframe_tenant_evidence_cases AS scenario ON scenario.run_id=run.id
    GROUP BY run.id HAVING pg_catalog.count(scenario.case_kind)<>4
  ) OR EXISTS(
    SELECT attestation.id
    FROM saas.iyzico_iframe_tenant_evidence_attestations AS attestation
    JOIN saas.iyzico_iframe_tenant_evidence_runs AS run ON run.id=attestation.run_id
    WHERE run.status<>'attested'
      OR (run.store_id,run.profile_id,run.provider_code,run.capability,run.environment,
          run.adapter_version,run.candidate_evidence_digest,run.profile_version,run.credential_version)
         IS DISTINCT FROM
         (attestation.store_id,attestation.profile_id,attestation.provider_code,
          attestation.capability,attestation.environment,attestation.adapter_version,
          attestation.candidate_evidence_digest,attestation.profile_version,
          attestation.credential_version)
  ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_DATA_INVALID'; END IF;
END
$f$;

COMMIT;
