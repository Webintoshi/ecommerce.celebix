DO $assertions$
DECLARE function_count integer; app_execute integer; list_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid='saas.inventory_location_operations'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN RAISE EXCEPTION 'inventory location operation RLS missing'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_location_operations'::regclass
      AND conname='inventory_location_operations_operation_id_key'
      AND contype='u'
  ) THEN RAISE EXCEPTION 'inventory location global operation identity missing'; END IF;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'::regprocedure
  ) INTO list_definition;
  IF list_definition NOT LIKE '%archiveEligibility%'
     OR list_definition NOT LIKE '%positive_on_hand%'
     OR list_definition NOT LIKE '%reserved%'
     OR list_definition NOT LIKE '%open_purchase%'
     OR list_definition NOT LIKE '%open_count%'
     OR list_definition NOT LIKE '%open_transfer%' THEN
    RAISE EXCEPTION 'inventory location archive eligibility projection drift';
  END IF;
  SELECT pg_catalog.count(*) INTO function_count
  FROM pg_catalog.pg_proc
  WHERE oid IN(
    'saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure,
    'saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure,
    'saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure
  ) AND prosecdef AND proowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner');
  IF function_count<>3 THEN RAISE EXCEPTION 'inventory location function authority drift'; END IF;
  SELECT pg_catalog.count(*) INTO app_execute FROM (VALUES
    ('saas.inventory_locations_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure),
    ('saas.inventory_locations_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure),
    ('saas.inventory_locations_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure)
  ) AS functions(oid)
  WHERE pg_catalog.has_function_privilege('celebix_saas_app',functions.oid,'EXECUTE');
  IF app_execute<>3 OR pg_catalog.has_table_privilege('celebix_saas_app','saas.inventory_location_operations','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'inventory location ACL drift';
  END IF;
END
$assertions$;
