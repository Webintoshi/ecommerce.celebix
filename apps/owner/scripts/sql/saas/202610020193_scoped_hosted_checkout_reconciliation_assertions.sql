-- Exact scoped selector, reviewed predecessors and unchanged table security.
DO $assertions$
DECLARE source record;
BEGIN
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
      '{celebix_saas_owner=X/celebix_saas_owner}','v','plpgsql'),
    ('saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)',
      'fd0466a2bcf8f534c1f07e428f0b78a943b166b96dcfb22f3eb0564c06ce14cb',
      '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}','s','plpgsql')
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
        AND NOT procedure.proleakproof AND NOT procedure.proisstrict
        AND procedure.proparallel='u' AND language.lanname=source.language_name
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'SCOPED_HOSTED_RECONCILIATION_REVIEWED_FUNCTION_INVALID'; END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc procedure
      WHERE procedure.pronamespace='saas'::regnamespace
        AND procedure.proname='storefront_hosted_checkout_reconciliation_candidates_scoped')<>1
    OR pg_catalog.pg_get_function_result(
      'saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)'::regprocedure)
      <> 'TABLE(attempt_id uuid, attempt_version bigint, attempt_status text, credential_version bigint, provider_reference text, provider_code text, environment text, adapter_version integer, evidence_digest text, candidate_position integer)'
    OR pg_catalog.has_function_privilege('public',
      'saas.storefront_hosted_checkout_reconciliation_candidates_scoped(timestamptz,integer,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'SCOPED_HOSTED_RECONCILIATION_CONTRACT_INVALID'; END IF;
END $assertions$;
