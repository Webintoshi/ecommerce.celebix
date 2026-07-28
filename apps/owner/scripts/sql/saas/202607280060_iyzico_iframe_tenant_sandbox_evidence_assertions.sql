BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
DECLARE owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  routine_name text;
  expected_hash text;
  expected_volatility "char";
  routine_oid oid;
BEGIN
  FOR routine_name,expected_hash,expected_volatility IN SELECT * FROM (VALUES
    ('iyzico_iframe_tenant_evidence_run_current(uuid)',
      '5fe4d9440ef1515177b9dc1b6a84ab6d','v'::"char"),
    ('iyzico_iframe_tenant_attestation_insert_guard()',
      '2afeaf8f1b7cd2dcec7ce0d331ffc579','v'::"char"),
    ('iyzico_iframe_tenant_profile_binding_guard()',
      'dfae8b1528dacd52223417e73e7c16b2','v'::"char"),
    ('iyzico_iframe_tenant_payment_method_active_guard()',
      'd0dc31eb01af4f223b4fbe480fa97af4','v'::"char"),
    ('iyzico_iframe_tenant_evidence_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,text,integer)',
      'e69d443c49db87d21e600af5640a8978','v'::"char"),
    ('iyzico_iframe_tenant_evidence_claim(uuid,text,uuid,timestamp with time zone,timestamp with time zone)',
      '6dc66159a4641740b1b845342e475fb0','v'::"char"),
    ('iyzico_iframe_tenant_evidence_record_event(uuid,uuid,text,uuid,text,text,uuid,text,text,timestamp with time zone)',
      'b864d8ecfeae0f0640fc0ca249645a72','v'::"char"),
    ('iyzico_iframe_tenant_evidence_finalize(uuid,uuid,text,uuid,text,timestamp with time zone)',
      '15ef290167f9cade90851583323f9295','v'::"char"),
    ('iyzico_iframe_tenant_evidence_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',
      '27b9164b08b7ea218858deda78f60f2a','v'::"char"),
    ('iyzico_iframe_tenant_evidence_preflight()',
      '0e35038de18265ce39163ca035a2286e','s'::"char")
  ) AS expected(signature,body_hash,volatility) LOOP
    routine_oid:=pg_catalog.to_regprocedure('saas.'||routine_name);
    IF routine_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=routine_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.provolatile=expected_volatility AND procedure.proparallel='u'
        AND NOT procedure.proleakproof AND procedure.prokind='f'
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) THEN RAISE EXCEPTION 'IYZICO_IFRAME_TENANT_EVIDENCE_FUNCTION_DRIFT'; END IF;
  END LOOP;

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
