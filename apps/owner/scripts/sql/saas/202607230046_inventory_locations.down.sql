BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.inventory_locations WHERE NOT is_default)
     OR EXISTS(SELECT 1 FROM saas.inventory_location_operations) THEN
    RAISE EXCEPTION 'INVENTORY_LOCATION_ROLLBACK_BLOCKED';
  END IF;
END
$precondition$;

DROP FUNCTION saas.inventory_locations_recover(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text
);
DROP FUNCTION saas.inventory_locations_archive(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_locations_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text
);
DROP FUNCTION saas.inventory_location_mutation_projection(uuid,uuid,boolean);
DROP TABLE saas.inventory_location_operations;

COMMIT;
