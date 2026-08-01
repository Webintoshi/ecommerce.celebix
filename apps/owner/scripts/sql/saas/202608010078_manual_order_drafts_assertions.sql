BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $manual_order_drafts_contract_invalid$
DECLARE
  table_name text;
  signature text;
  procedure_oid regprocedure;
  source_definition text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['order_drafts','order_draft_lines','order_draft_operations','manual_order_inventory_commitments'] LOOP
    IF pg_catalog.to_regclass('saas.'||table_name) IS NULL THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: table %',table_name; END IF;
    IF NOT (SELECT relation.relrowsecurity AND relation.relforcerowsecurity FROM pg_catalog.pg_class AS relation WHERE relation.oid=pg_catalog.to_regclass('saas.'||table_name)) THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: rls %',table_name; END IF;
    IF pg_catalog.has_table_privilege('celebix_saas_app','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
      OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
      OR EXISTS(
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) AS privilege
        WHERE relation.oid=pg_catalog.to_regclass('saas.'||table_name)
          AND privilege.grantee=0
          AND privilege.privilege_type IN('SELECT','INSERT','UPDATE','DELETE')
      )
    THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: table acl %',table_name; END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)',
    'saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)',
    'saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)',
    'saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    procedure_oid:=pg_catalog.to_regprocedure(signature);
    IF procedure_oid IS NULL THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: function %',signature; END IF;
    IF (SELECT role.rolname FROM pg_catalog.pg_proc AS procedure JOIN pg_catalog.pg_roles AS role ON role.oid=procedure.proowner WHERE procedure.oid=procedure_oid)<>'celebix_saas_owner'
      OR NOT (SELECT procedure.prosecdef FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=procedure_oid)
      OR NOT pg_catalog.has_function_privilege('celebix_saas_app',procedure_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',procedure_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_workflow',procedure_oid,'EXECUTE')
    THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: function acl %',signature; END IF;
    IF (SELECT procedure.proconfig FROM pg_catalog.pg_proc AS procedure WHERE procedure.oid=procedure_oid) IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: search path %',signature; END IF;
  END LOOP;

  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.order_draft_operations'::regclass AND tgname='order_draft_operations_immutable' AND NOT tgisinternal) THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: immutable operation'; END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) FROM pg_catalog.pg_constraint AS constraint_row WHERE constraint_row.conrelid='saas.orders'::regclass AND constraint_row.conname='orders_source_check')!~'''manual''' THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: manual source'; END IF;
  source_definition:=pg_catalog.pg_get_functiondef('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure);
  IF source_definition!~'checkout_sale' OR source_definition!~'manual_order_inventory_commitments' OR source_definition!~'operation_replayed' THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: conversion authority'; END IF;
  source_definition:=pg_catalog.pg_get_functiondef('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure);
  IF source_definition!~'restoration_operation_id IS NULL' OR source_definition!~'catalog_adjustment' OR pg_catalog.strpos(source_definition,'operation_replayed')>pg_catalog.strpos(source_definition,'restoration_operation_id IS NULL') THEN RAISE EXCEPTION 'manual_order_drafts_contract_invalid: cancellation replay ordering'; END IF;
END
$manual_order_drafts_contract_invalid$;

COMMIT;
