-- Remove only the store lifecycle hook; preserve all durable inventory data.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.stores'::pg_catalog.regclass
      AND tgname='stores_default_inventory_location'
      AND NOT tgisinternal
      AND tgenabled='O'
      AND tgfoid='saas.create_store_default_inventory_location()'::pg_catalog.regprocedure
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
    WHERE procedure.oid='saas.create_store_default_inventory_location()'::pg_catalog.regprocedure
      AND owner.rolname='celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_LIFECYCLE_ROLLBACK_DRIFT';
  END IF;
END
$precondition$;

DROP TRIGGER stores_default_inventory_location ON saas.stores;
DROP FUNCTION saas.create_store_default_inventory_location();

COMMIT;
