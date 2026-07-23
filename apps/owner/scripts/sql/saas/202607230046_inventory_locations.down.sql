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

CREATE OR REPLACE FUNCTION saas.inventory_list_locations(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE authority_error text;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','inventory.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY
  SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        saas.inventory_location_projection(p_store_id,location.id)
        ORDER BY location.is_default DESC,location.id
      )
      FROM saas.inventory_locations AS location
      WHERE location.store_id=p_store_id
    ),'[]'::jsonb)
  );
END
$f$;

COMMIT;
