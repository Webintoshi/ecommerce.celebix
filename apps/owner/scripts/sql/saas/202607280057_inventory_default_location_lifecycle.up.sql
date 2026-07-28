-- Bind every store lifecycle to one durable default inventory location.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

LOCK TABLE saas.stores IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE saas.inventory_locations IN SHARE ROW EXCLUSIVE MODE;

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regclass('saas.inventory_locations') IS NULL
     OR pg_catalog.to_regprocedure('saas.inventory_deterministic_uuid(text,text)') IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_DEFAULT_LOCATION_LIFECYCLE_PREREQUISITE_MISSING';
  END IF;
END
$precondition$;

CREATE FUNCTION saas.create_store_default_inventory_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  INSERT INTO saas.inventory_locations(
    id,store_id,name,is_default,status,version,created_at,updated_at
  ) VALUES (
    saas.inventory_deterministic_uuid('inventory-default-location',NEW.id::text),
    NEW.id,
    'Ana Depo',
    true,
    'active',
    1,
    NEW.created_at,
    NEW.updated_at
  );
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION saas.create_store_default_inventory_location()
  FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TRIGGER stores_default_inventory_location
AFTER INSERT ON saas.stores
FOR EACH ROW EXECUTE FUNCTION saas.create_store_default_inventory_location();

INSERT INTO saas.inventory_locations(
  id,store_id,name,is_default,status,version,created_at,updated_at
)
SELECT
  saas.inventory_deterministic_uuid('inventory-default-location',store.id::text),
  store.id,
  'Ana Depo',
  true,
  'active',
  1,
  store.created_at,
  store.updated_at
FROM saas.stores AS store
WHERE NOT EXISTS(
  SELECT 1
  FROM saas.inventory_locations AS location
  WHERE location.store_id=store.id
    AND location.is_default
    AND location.status='active'
)
ORDER BY store.id;

DO $postcondition$
BEGIN
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
$postcondition$;

COMMIT;
