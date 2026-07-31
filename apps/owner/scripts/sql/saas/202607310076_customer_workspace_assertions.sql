BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $customer_workspace_assertions$
DECLARE
  function_oid oid;
  function_definition text;
  function_owner text;
  function_config text[];
BEGIN
  SELECT procedure.oid,
         pg_catalog.pg_get_functiondef(procedure.oid),
         owner.rolname,
         procedure.proconfig
    INTO function_oid,function_definition,function_owner,function_config
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
  WHERE procedure.oid = 'saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure;

  IF function_oid IS NULL
     OR function_owner <> 'celebix_saas_owner'
     OR function_definition !~ 'SECURITY DEFINER'
     OR NOT ('search_path=pg_catalog, saas' = ANY(function_config))
     OR pg_catalog.has_function_privilege('public', function_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'customer_workspace_contract_invalid';
  END IF;
END
$customer_workspace_assertions$;

COMMIT;
