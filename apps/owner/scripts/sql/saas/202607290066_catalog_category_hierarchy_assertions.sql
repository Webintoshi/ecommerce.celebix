BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $function$
DECLARE
  procedure pg_catalog.pg_proc%ROWTYPE;
  function_definition text;
  app_oid oid;
BEGIN
  SELECT role.oid INTO app_oid FROM pg_catalog.pg_roles role WHERE role.rolname='celebix_saas_app';
  IF app_oid IS NULL THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: missing app role'; END IF;

  SELECT * INTO procedure
  FROM pg_catalog.pg_proc
  WHERE oid='saas.catalog_migration_category_manifest_valid(jsonb)'::regprocedure;
  IF NOT FOUND
     OR pg_catalog.pg_get_userbyid(procedure.proowner)<>'celebix_saas_owner'
     OR procedure.prosecdef
     OR procedure.provolatile<>'i'
     OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR EXISTS(
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
       WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>procedure.proowner
     )
     OR pg_catalog.has_function_privilege('celebix_saas_app',procedure.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: validation helper authority'; END IF;
  function_definition:=pg_catalog.pg_get_functiondef(procedure.oid);
  IF pg_catalog.strpos(function_definition,'parentSlug')=0
     OR pg_catalog.strpos(function_definition,'selected_depth>8')=0
     OR pg_catalog.strpos(function_definition,'known_slugs,selected_slug')=0
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: validation helper definition'; END IF;

  SELECT * INTO procedure
  FROM pg_catalog.pg_proc
  WHERE oid='saas.catalog_migration_category_manifest_matches(uuid,jsonb)'::regprocedure;
  IF NOT FOUND
     OR pg_catalog.pg_get_userbyid(procedure.proowner)<>'celebix_saas_owner'
     OR procedure.prosecdef
     OR procedure.provolatile<>'s'
     OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR EXISTS(
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
       WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>procedure.proowner
     )
     OR pg_catalog.has_function_privilege('celebix_saas_app',procedure.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: comparison helper authority'; END IF;
  function_definition:=pg_catalog.pg_get_functiondef(procedure.oid);
  IF pg_catalog.strpos(function_definition,'persisted_parent_slug IS DISTINCT FROM')=0
     OR pg_catalog.strpos(function_definition,'parentSlug')=0
     OR pg_catalog.strpos(function_definition,'category.store_id=p_store_id')=0
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: comparison helper definition'; END IF;

  SELECT * INTO procedure
  FROM pg_catalog.pg_proc
  WHERE oid='saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,integer,integer,jsonb,jsonb)'::regprocedure;
  IF NOT FOUND
     OR pg_catalog.pg_get_userbyid(procedure.proowner)<>'celebix_saas_owner'
     OR NOT procedure.prosecdef
     OR procedure.provolatile<>'v'
     OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR EXISTS(
       SELECT 1
       FROM pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
       WHERE acl.privilege_type='EXECUTE' AND acl.grantee NOT IN(procedure.proowner,app_oid)
     )
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app',procedure.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: begin authority'; END IF;
  function_definition:=pg_catalog.pg_get_functiondef(procedure.oid);
  IF pg_catalog.strpos(function_definition,'parentSlug')=0
     OR pg_catalog.strpos(function_definition,'existing_category.parent_id IS DISTINCT FROM requested_parent_id')=0
     OR pg_catalog.strpos(function_definition,'catalog_migration_category_manifest_matches(p_store_id,p_categories)')=0
     OR pg_catalog.strpos(function_definition,'saas.catalog.migration.operation:')=0
     OR pg_catalog.strpos(function_definition,'saas.catalog.store:')=0
  THEN RAISE EXCEPTION 'CATALOG_CATEGORY_HIERARCHY_ASSERTION_FAILED: begin definition'; END IF;
END
$function$;

COMMIT;
