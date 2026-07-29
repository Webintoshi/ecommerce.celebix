BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  preflight_oid oid:=pg_catalog.to_regprocedure(
    'saas.payment_method_single_active_provider_preflight()'
  );
BEGIN
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=preflight_oid AND procedure.proowner=owner_oid
      AND procedure.prosecdef AND procedure.provolatile='s'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='4d2e4b456b88573c83de9bd47ce05f62'
  ) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_PREFLIGHT_BODY_INVALID';
  END IF;

  IF saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_PREFLIGHT_INVALID'; END IF;

  IF EXISTS(
    SELECT method.store_id
    FROM saas.payment_methods AS method
    WHERE method.kind='provider' AND method.state='active'
    GROUP BY method.store_id
    HAVING pg_catalog.count(*)>1
  ) THEN RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_DATA_INVALID'; END IF;

  IF pg_catalog.to_regclass('saas.payment_methods_one_active_provider_per_store_idx') IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
    ) IS NULL
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_OBJECT_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,preflight_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=preflight_oid AND (
        privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR privilege.grantee NOT IN(owner_oid,app_oid,workflow_oid)
      )
    )
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_PREFLIGHT_ACL_INVALID'; END IF;

  IF pg_catalog.has_table_privilege(app_oid,'saas.payment_methods','INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(workflow_oid,'saas.payment_methods','INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'PAYMENT_METHOD_SINGLE_ACTIVE_PROVIDER_TABLE_ACL_INVALID'; END IF;
END
$f$;

COMMIT;
