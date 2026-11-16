BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
BEGIN
  IF saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true
    OR (SELECT pg_catalog.count(*) FROM saas.iyzico_live_activation507_predecessors)<>4
    OR EXISTS(SELECT 1 FROM saas.iyzico_live_activation507_predecessors AS predecessor
      LEFT JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=predecessor.signature
      WHERE pg_catalog.md5(procedure.prosrc) IS DISTINCT FROM predecessor.published_body_md5)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles AS role
      WHERE pg_catalog.left(role.rolname,13)='celebix_saas_'
        AND role.rolname<>'celebix_saas_owner'
        AND (pg_catalog.has_function_privilege(role.oid,'saas.iyzico_live_bind_profile(uuid,uuid,bigint,bigint,text,timestamptz)','EXECUTE')
          OR pg_catalog.has_function_privilege(role.oid,'saas.iyzico_live_profile_authorized(saas.merchant_provider_profiles)','EXECUTE')
          OR pg_catalog.has_function_privilege(role.oid,'saas.iyzico_live_method_authorized(uuid,uuid)','EXECUTE')
          OR pg_catalog.has_table_privilege(role.oid,'saas.iyzico_live_activation507_predecessors','SELECT,INSERT,UPDATE,DELETE')))
  THEN RAISE EXCEPTION 'IYZICO_LIVE_ACTIVATION507_ASSERTION_FAILED'; END IF;
END
$assertions$;

ROLLBACK;
