-- Select only this worker's enabled, reviewed execution authorities before LIMIT.
-- Historical attempts and the legacy selector retain their original contracts.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE source record;
BEGIN
  IF pg_catalog.to_regclass('saas.payment_attempts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL
    OR pg_catalog.to_regclass('saas.merchant_provider_execution_authorities') IS NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace
      AND proname='storefront_hosted_checkout_reconciliation_candidates_scoped')
  THEN RAISE EXCEPTION 'SCOPED_HOSTED_RECONCILIATION_SOURCE_INVALID'; END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class relation
      WHERE relation.oid IN('saas.payment_attempts'::regclass,
        'saas.storefront_hosted_checkout_sessions'::regclass,
        'saas.merchant_provider_execution_authorities'::regclass)
        AND relation.relowner='celebix_saas_owner'::regrole
        AND relation.relrowsecurity AND relation.relforcerowsecurity)<>3
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid='saas.payment_attempts'::regclass
        AND attname='reconciliation_lease_expires_at' AND atttypid='timestamptz'::regtype
        AND NOT attisdropped)
  THEN RAISE EXCEPTION 'SCOPED_HOSTED_RECONCILIATION_RELATIONS_INVALID'; END IF;
  FOR source IN SELECT * FROM (VALUES
    ('saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer)',
      '5efc259384e5c2bfa727914cc218f9bf1f899ae11f062f8a9956b8b592ac559b',
      '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}','s','sql'),
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)',
      '8c928d237e67e799742de6c6abe3e7f32d58b8e10b9fa8914eaa2a10b314bff1',
      '{celebix_saas_owner=X/celebix_saas_owner}','v','plpgsql')
  ) AS reviewed(signature,body_hash,acl,volatility,language_name) LOOP
    IF pg_catalog.to_regprocedure(source.signature) IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_language language ON language.oid=procedure.prolang
      WHERE procedure.oid=pg_catalog.to_regprocedure(source.signature)
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')=source.body_hash
        AND procedure.proowner='celebix_saas_owner'::regrole
        AND procedure.proacl::text=source.acl AND procedure.prosecdef
        AND procedure.provolatile::text=source.volatility AND procedure.prokind='f'
        AND language.lanname=source.language_name
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'SCOPED_HOSTED_RECONCILIATION_PREDECESSOR_INVALID'; END IF;
  END LOOP;
END $preflight$;

CREATE FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates_scoped(
  p_now timestamptz,p_limit integer,p_authorities jsonb
)
RETURNS TABLE(
  attempt_id uuid,attempt_version bigint,attempt_status text,
  credential_version bigint,provider_reference text,provider_code text,
  environment text,adapter_version integer,evidence_digest text,candidate_position integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  item jsonb;
  item_keys text[];
  version_number numeric;
  scope_key text;
  seen_scopes text[]:=ARRAY[]::text[];
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
    OR p_authorities IS NULL
  THEN RETURN; END IF;
  IF pg_catalog.jsonb_typeof(p_authorities)<>'array' THEN RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_authorities) NOT BETWEEN 1 AND 4 THEN RETURN; END IF;
  FOR item IN SELECT scope.value FROM pg_catalog.jsonb_array_elements(p_authorities) scope(value) LOOP
    IF pg_catalog.jsonb_typeof(item)<>'object' THEN RETURN; END IF;
    SELECT pg_catalog.array_agg(field.name ORDER BY field.name) INTO item_keys
      FROM pg_catalog.jsonb_object_keys(item) field(name);
    IF item_keys IS DISTINCT FROM ARRAY['adapterVersion','environment','evidenceDigest','providerCode']::text[]
      OR pg_catalog.jsonb_typeof(item->'providerCode')<>'string'
      OR pg_catalog.jsonb_typeof(item->'environment')<>'string'
      OR pg_catalog.jsonb_typeof(item->'adapterVersion')<>'number'
      OR pg_catalog.jsonb_typeof(item->'evidenceDigest')<>'string'
    THEN RETURN; END IF;
    IF (item->>'providerCode') NOT IN('paytr_iframe','iyzico_iframe')
      OR (item->>'environment') NOT IN('test','live')
      OR (item->>'evidenceDigest')!~'^sha256:[a-f0-9]{64}$'
    THEN RETURN; END IF;
    version_number:=(item->>'adapterVersion')::numeric;
    IF version_number NOT BETWEEN 1 AND 2147483647
      OR pg_catalog.trunc(version_number)<>version_number
    THEN RETURN; END IF;
    scope_key:=(item->>'providerCode')||':'||(item->>'environment');
    IF scope_key=ANY(seen_scopes) THEN RETURN; END IF;
    seen_scopes:=pg_catalog.array_append(seen_scopes,scope_key);
  END LOOP;
  RETURN QUERY
  WITH scopes AS (
    SELECT scope.value->>'providerCode' AS provider_code,
      scope.value->>'environment' AS environment,
      (scope.value->>'adapterVersion')::numeric::integer AS adapter_version,
      scope.value->>'evidenceDigest' AS evidence_digest
    FROM pg_catalog.jsonb_array_elements(p_authorities) scope(value)
  ), candidates AS (
    SELECT attempt.id,attempt.version,attempt.status,attempt.credential_version,
      attempt.safe_provider_reference,attempt.provider_code,attempt.environment,
      attempt.execution_adapter_version,attempt.execution_evidence_digest,attempt.updated_at
    FROM saas.payment_attempts attempt
    JOIN saas.storefront_hosted_checkout_sessions session
      ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id
    JOIN scopes scope
      ON scope.provider_code=attempt.provider_code AND scope.environment=attempt.environment
        AND scope.adapter_version=attempt.execution_adapter_version
        AND scope.evidence_digest=attempt.execution_evidence_digest
    JOIN saas.merchant_provider_execution_authorities authority
      ON authority.provider_code=attempt.provider_code AND authority.capability='payment_processing'
        AND authority.environment=attempt.environment
        AND authority.adapter_version=attempt.execution_adapter_version
        AND authority.evidence_digest=attempt.execution_evidence_digest
        AND authority.readiness=CASE WHEN attempt.environment='test' THEN 'sandbox_ready' ELSE 'production_ready' END
        AND authority.enabled
    WHERE session.status IN('active','provider_ready','processing')
      AND session.hold_expires_at<=p_now
      AND attempt.status IN(
        'awaiting_customer','submitted','authorized','provider_outcome_unknown','reconciliation_required'
      )
      AND (attempt.reconciliation_lease_expires_at IS NULL
        OR attempt.reconciliation_lease_expires_at<=p_now)
    ORDER BY attempt.updated_at,attempt.id
    LIMIT p_limit
  )
  SELECT candidate.id,candidate.version,candidate.status,candidate.credential_version,
    candidate.safe_provider_reference,candidate.provider_code,candidate.environment,
    candidate.execution_adapter_version,candidate.execution_evidence_digest,
    (pg_catalog.row_number() OVER(ORDER BY candidate.updated_at,candidate.id))::integer
  FROM candidates candidate
  ORDER BY candidate.updated_at,candidate.id;
END $fn$;

REVOKE ALL ON FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)
TO celebix_saas_workflow;

COMMIT;
