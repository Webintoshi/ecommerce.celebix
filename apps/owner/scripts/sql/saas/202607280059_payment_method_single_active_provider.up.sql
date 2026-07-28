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
  preflight_function_oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_single_active_provider_preflight()'
  );
  IF public_function_oid IS NULL OR delegate_function_oid IS NULL OR preflight_function_oid IS NULL
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
  ) THEN RETURN false; END IF;

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
