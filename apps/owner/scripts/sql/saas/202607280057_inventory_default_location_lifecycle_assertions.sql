-- Fail closed on migration-057 trigger, function, ACL, and lifecycle drift.
DO $assertions$
DECLARE
  lifecycle_function pg_catalog.regprocedure:=
    'saas.create_store_default_inventory_location()'::pg_catalog.regprocedure;
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.stores'::pg_catalog.regclass
      AND tgname='stores_default_inventory_location'
      AND NOT tgisinternal
      AND tgenabled='O'
      AND tgtype=5
      AND tgfoid=lifecycle_function
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_TRIGGER_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    JOIN pg_catalog.pg_language AS language ON language.oid=procedure.prolang
    WHERE procedure.oid=lifecycle_function
      AND owner.rolname='celebix_saas_owner'
      AND language.lanname='plpgsql'
      AND procedure.prosecdef
      AND procedure.provolatile='v'
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_FUNCTION_AUTHORITY_DRIFT';
  END IF;

  IF pg_catalog.has_function_privilege('public',lifecycle_function,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',lifecycle_function,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_identity',lifecycle_function,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_workflow',lifecycle_function,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',lifecycle_function,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_bootstrap',lifecycle_function,'EXECUTE') THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_FUNCTION_ACL_DRIFT';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname='saas'
      AND tablename='inventory_locations'
      AND indexname='inventory_locations_one_default_per_store_idx'
      AND indexdef LIKE '%WHERE (is_default AND (status = ''active''::text))%'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_UNIQUENESS_DRIFT';
  END IF;

  IF EXISTS(
    SELECT store.id
    FROM saas.stores AS store
    LEFT JOIN saas.inventory_locations AS location
      ON location.store_id=store.id
     AND location.is_default
     AND location.status='active'
    GROUP BY store.id
    HAVING pg_catalog.count(location.id)<>1
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_LIFECYCLE_INVALID';
  END IF;
END
$assertions$;
