BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $manual_order_uuid_contract_invalid$
DECLARE
  convert_signature regprocedure := pg_catalog.to_regprocedure('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)');
  transition_signature regprocedure := pg_catalog.to_regprocedure('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)');
  convert_definition text;
  transition_definition text;
  candidate uuid;
BEGIN
  IF convert_signature IS NULL OR transition_signature IS NULL THEN
    RAISE EXCEPTION 'manual_order_uuid_contract_invalid: function missing';
  END IF;
  convert_definition := pg_catalog.pg_get_functiondef(convert_signature);
  transition_definition := pg_catalog.pg_get_functiondef(transition_signature);
  IF convert_definition !~ 'inventory_deterministic_uuid\(''saas[.]manual-order''' OR
     convert_definition !~ 'inventory_deterministic_uuid\(''saas[.]manual-order-item''' OR
     convert_definition !~ 'inventory_deterministic_uuid\(''saas[.]manual-order-event''' OR
     transition_definition !~ 'inventory_deterministic_uuid\(''saas[.]order[.]event''' OR
     convert_definition ~ 'md5\(''saas[.]manual-order' OR
     transition_definition ~ 'md5\(''saas[.]order[.]event' THEN
    RAISE EXCEPTION 'manual_order_uuid_contract_invalid: unsafe identifier source';
  END IF;
  FOREACH candidate IN ARRAY ARRAY[
    saas.inventory_deterministic_uuid('saas.manual-order','90000000-0000-4000-8000-000000000080'),
    saas.inventory_deterministic_uuid('saas.manual-order-item','80000000-0000-4000-8000-000000000078'),
    saas.inventory_deterministic_uuid('saas.manual-order-event','90000000-0000-4000-8000-000000000080'),
    saas.inventory_deterministic_uuid('saas.order.event','90000000-0000-4000-8000-000000000081')
  ] LOOP
    IF candidate::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'manual_order_uuid_contract_invalid: noncanonical uuid %',candidate;
    END IF;
  END LOOP;
  IF (SELECT role.rolname FROM pg_catalog.pg_proc AS procedure JOIN pg_catalog.pg_roles AS role ON role.oid=procedure.proowner WHERE procedure.oid=convert_signature)<>'celebix_saas_owner'
     OR NOT (SELECT procedure.prosecdef FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=convert_signature)
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app',convert_signature,'EXECUTE')
     OR pg_catalog.has_function_privilege('public',convert_signature,'EXECUTE') THEN
    RAISE EXCEPTION 'manual_order_uuid_contract_invalid: conversion acl';
  END IF;
END
$manual_order_uuid_contract_invalid$;

COMMIT;
