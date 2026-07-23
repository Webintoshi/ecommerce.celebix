DO $pricing_preview_assertions$
DECLARE
  target regprocedure:=
    'saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])'::regprocedure;
  definition text;
  function_owner oid;
  app_role oid;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner
  INTO definition,function_owner
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid=target
    AND proc.provolatile='s'
    AND proc.prosecdef
    AND proc.proconfig=ARRAY['search_path=pg_catalog, saas']::text[];
  IF definition IS NULL
     OR function_owner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
     OR definition NOT LIKE '%merchant_action_authority_error%'
     OR definition NOT LIKE '%resolve_effective_variant_price%'
     OR definition NOT LIKE '%NULL::text%'
     OR definition NOT LIKE '%ORDER BY selected.variant_id::text%' THEN
    RAISE EXCEPTION 'pricing preview authority drift';
  END IF;

  SELECT oid INTO app_role FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_app';
  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',target,'EXECUTE'
  ) OR pg_catalog.has_function_privilege('public',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_identity',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_workflow',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_bootstrap',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_observability',target,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_migrator',target,'EXECUTE') THEN
    RAISE EXCEPTION 'pricing preview ACL drift';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
    ) AS privilege
    WHERE proc.oid=target
      AND privilege.privilege_type='EXECUTE'
      AND privilege.grantee NOT IN(function_owner,app_role)
  ) THEN
    RAISE EXCEPTION 'pricing preview ACL contains an unexpected grantee';
  END IF;
END
$pricing_preview_assertions$;
