-- Phase 3R: one explicitly managed active provider payment method per store.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $f$
BEGIN
  IF EXISTS(
    SELECT method.store_id
    FROM saas.payment_methods AS method
    WHERE method.kind='provider' AND method.state='active'
    GROUP BY method.store_id
    HAVING pg_catalog.count(*)>1
  ) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_MULTIPLE_ACTIVE_PROVIDERS_EXIST';
  END IF;
END
$f$;

CREATE UNIQUE INDEX payment_methods_one_active_provider_per_store_idx
  ON saas.payment_methods(store_id)
  WHERE kind='provider' AND state='active';

ALTER FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) RENAME TO payment_method_set_state_without_single_active_provider;
REVOKE ALL ON FUNCTION saas.payment_method_set_state_without_single_active_provider(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.payment_method_set_state(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
  p_state text,p_emergency_reason text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE violated_constraint text;
BEGIN
  BEGIN
    RETURN QUERY SELECT *
    FROM saas.payment_method_set_state_without_single_active_provider(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,
      p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,
      p_method_id,p_expected_version,p_state,p_emergency_reason
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
    IF violated_constraint='payment_methods_one_active_provider_per_store_idx' THEN
      RETURN QUERY SELECT 'provider_already_active',NULL::jsonb;
      RETURN;
    END IF;
    RAISE;
  END;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.payment_method_set_state(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text
) TO celebix_saas_app;

ALTER FUNCTION saas.paytr_iframe_test_payment_method_activate(
  uuid,uuid,timestamptz
) RENAME TO paytr_iframe_test_payment_method_activate_without_single_active_provider;
REVOKE ALL ON FUNCTION saas.paytr_iframe_test_payment_method_activate_without_single_active_provider(
  uuid,uuid,timestamptz
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.paytr_iframe_test_payment_method_activate(
  p_store_id uuid,p_profile_id uuid,p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE violated_constraint text;
BEGIN
  BEGIN
    PERFORM saas.paytr_iframe_test_payment_method_activate_without_single_active_provider(
      p_store_id,p_profile_id,p_now
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
    IF violated_constraint='payment_methods_one_active_provider_per_store_idx' THEN
      PERFORM saas.paytr_iframe_test_payment_method_stage(
        p_store_id,p_profile_id,p_now
      );
      RETURN;
    END IF;
    RAISE;
  END;
END
$f$;

REVOKE ALL ON FUNCTION saas.paytr_iframe_test_payment_method_activate(
  uuid,uuid,timestamptz
)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER FUNCTION saas.paytr_iframe_activation_preflight()
  RENAME TO paytr_iframe_activation_preflight_without_single_active_provider;
REVOKE ALL ON FUNCTION saas.paytr_iframe_activation_preflight_without_single_active_provider()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.paytr_iframe_activation_preflight()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE signature text; expected_hash text; allowed_role text; function_oid oid;
  allowed_oid oid; owner_oid oid:='celebix_saas_owner'::regrole;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_provider_definitions
    WHERE provider_code='paytr_iframe' AND capability='payment_processing' AND enabled
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_SEED_INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND relation.relowner=owner_oid AND relation.relrowsecurity AND relation.relforcerowsecurity
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
    ) AS privilege
    WHERE relation.oid='saas.merchant_provider_execution_authorities'::regclass
      AND privilege.grantee<>owner_oid
  ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_RELATION_INVALID'; END IF;
  FOR signature,expected_hash,allowed_role IN SELECT * FROM (VALUES
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)','c89a8ab0d23d470a1603e6ceebf11b68',NULL::text),
    ('saas.merchant_provider_execution_authority_invalidate_bound(text,text,text,integer,text,timestamp with time zone)','63fff1fd8ae86ce49a93907c4691f0c4',NULL::text),
    ('saas.merchant_provider_execution_authority_approve(text,text,text,integer,text,text,timestamp with time zone)','ba897c60b87da7da38ba3bdba5fd70c4',NULL::text),
    ('saas.merchant_provider_execution_authority_revoke(text,text,text,integer,text,timestamp with time zone)','ec0c71ee813e7e09c9cf099896f06ada',NULL::text),
    ('saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,text,integer,text,bigint)','842a1aca1b8a6e7fd21c3931fea8403f','celebix_saas_app'),
    ('saas.merchant_provider_profile_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','055fe95458610ea1b303a17378c4cdbb','celebix_saas_app'),
    ('saas.merchant_provider_profile_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','2ece1621c3c3e4f328be7ba8aff0b417','celebix_saas_app'),
    ('saas.merchant_provider_profile_claim_validation(text,text,text,text,integer,text,timestamp with time zone,timestamp with time zone,uuid)','91f745428286afb832d3d4dbdb958ceb','celebix_saas_workflow'),
    ('saas.merchant_provider_profile_mark_validation(uuid,text,text,text,integer,text,text,timestamp with time zone,uuid,bigint,bigint,text,text)','df7af69139c4d91d03827bfa540a52fb','celebix_saas_workflow'),
    ('saas.paytr_iframe_test_payment_method_activate(uuid,uuid,timestamp with time zone)','c24c1f62f2b79a7a726d0345f982ea04',NULL::text),
    ('saas.paytr_iframe_test_payment_method_activate_without_single_active_provider(uuid,uuid,timestamp with time zone)','30e26c27e400a13a7bf342af5e524d82',NULL::text),
    ('saas.paytr_iframe_test_payment_method_stage(uuid,uuid,timestamp with time zone)','3fd4bd200149045eeb5c8bb8a0e85b10',NULL::text),
    ('saas.paytr_iframe_test_payment_method_disable(uuid,uuid,timestamp with time zone)','53b634d4f85a99fa63defe229e5865f8',NULL::text),
    ('saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','9c05565cbcf4707c0c91ea8d181160a0','celebix_saas_app'),
    ('saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','3cf9d59ea9baeed367aa63c9545650e6',NULL::text),
    ('saas.payment_method_set_state_without_execution_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)','4e9eb9b14d0bb0bd12e40d520d38ce74',NULL::text),
    ('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','27bc9a3e5ad2996e4aff04140a9ddf3f','celebix_saas_workflow'),
    ('saas.payment_attempt_begin_without_execution_authority(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)','e5439203d385e21cecf9a49826229d3c',NULL::text),
    ('saas.paytr_iframe_activation_preflight_without_single_active_provider()','0302d768e4b58bc06c9a1947ca0bc6dd',NULL::text)
  ) AS expected(signature,expected_hash,allowed_role) LOOP
    function_oid:=signature::regprocedure;
    allowed_oid:=CASE allowed_role
      WHEN 'celebix_saas_app' THEN 'celebix_saas_app'::regrole
      WHEN 'celebix_saas_workflow' THEN 'celebix_saas_workflow'::regrole
      ELSE NULL END;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_INVALID: %',signature; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=function_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR (
          privilege.grantee<>owner_oid
          AND (allowed_oid IS NULL OR privilege.grantee<>allowed_oid)
        )
      )
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
      OR (allowed_oid IS NULL AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=function_oid AND privilege.grantee<>owner_oid
      ))
      OR (allowed_oid IS NOT NULL AND NOT pg_catalog.has_function_privilege(allowed_oid,function_oid,'EXECUTE'))
    THEN RAISE EXCEPTION 'PAYTR_IFRAME_ACTIVATION_PREFLIGHT_FUNCTION_ACL_INVALID: %',signature; END IF;
  END LOOP;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.paytr_iframe_activation_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.paytr_iframe_activation_preflight()
TO celebix_saas_app,celebix_saas_workflow;

CREATE FUNCTION saas.payment_method_single_active_provider_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  index_oid oid;
  public_function_oid oid;
  delegate_function_oid oid;
  paytr_preflight_oid oid;
  preflight_function_oid oid;
  store_attribute smallint;
BEGIN
  IF EXISTS(
    SELECT method.store_id
    FROM saas.payment_methods AS method
    WHERE method.kind='provider' AND method.state='active'
    GROUP BY method.store_id
    HAVING pg_catalog.count(*)>1
  ) THEN RETURN false; END IF;

  index_oid:=pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx');
  SELECT attribute.attnum INTO store_attribute
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid='saas.payment_methods'::regclass
    AND attribute.attname='store_id' AND attribute.attnum>0 AND NOT attribute.attisdropped;
  IF index_oid IS NULL OR store_attribute IS NULL OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_index AS index
    JOIN pg_catalog.pg_class AS relation ON relation.oid=index.indexrelid
    WHERE index.indexrelid=index_oid
      AND index.indrelid='saas.payment_methods'::regclass
      AND relation.relowner=owner_oid
      AND index.indisunique AND index.indisvalid AND index.indisready
      AND index.indnkeyatts=1 AND index.indnatts=1
      AND index.indkey[0]=store_attribute
      AND pg_catalog.pg_get_expr(index.indpred,index.indrelid)=
        '((kind = ''provider''::text) AND (state = ''active''::text))'
  ) THEN RETURN false; END IF;

  public_function_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
  );
  delegate_function_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
  );
  paytr_preflight_oid:=pg_catalog.to_regprocedure(
    'saas.paytr_iframe_activation_preflight()'
  );
  preflight_function_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_single_active_provider_preflight()'
  );
  IF public_function_oid IS NULL OR delegate_function_oid IS NULL
    OR paytr_preflight_oid IS NULL OR preflight_function_oid IS NULL
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=public_function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='9c05565cbcf4707c0c91ea8d181160a0'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=delegate_function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='3cf9d59ea9baeed367aa63c9545650e6'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=paytr_preflight_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)='e2fa7803e6d46741d33117e504436cf8'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid=preflight_function_oid AND procedure.proowner=owner_oid
        AND procedure.prosecdef
        AND procedure.provolatile='s'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    )
  THEN RETURN false; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,public_function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,public_function_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,public_function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,delegate_function_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,delegate_function_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,delegate_function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(owner_oid,paytr_preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,paytr_preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,paytr_preflight_oid,'EXECUTE')
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=public_function_oid AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(owner_oid,app_oid)
    )
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=delegate_function_oid AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid OR privilege.grantee<>owner_oid
    )
  ) OR EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=paytr_preflight_oid AND (
      privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
      OR privilege.grantor<>owner_oid
      OR privilege.grantee NOT IN(owner_oid,app_oid,workflow_oid)
    )
  ) THEN RETURN false; END IF;

  BEGIN
    IF saas.paytr_iframe_activation_preflight() IS NOT TRUE THEN RETURN false; END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.payment_method_single_active_provider_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.payment_method_single_active_provider_preflight()
TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
