-- Phase 3B1 order ownership, constraints, tenant authority, ACL and immutability assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b1_order_management_assertions$
DECLARE
  checked_table text;
  checked_index text;
  authority_function regprocedure := 'saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure;
  function_definition text;
BEGIN
  FOREACH checked_table IN ARRAY ARRAY[
    'orders','order_items','order_events','order_notes','order_operations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = relation.relowner
      WHERE namespace.nspname = 'saas'
        AND relation.relname = checked_table
        AND relation.relkind = 'r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner_role.rolname = 'celebix_saas_owner'
    ) THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: ownership/RLS drift on %', checked_table;
    END IF;

    IF EXISTS (
         SELECT 1
         FROM pg_catalog.pg_class AS relation,
              LATERAL pg_catalog.aclexplode(
                COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
              ) AS privilege
         WHERE relation.oid = ('saas.' || checked_table)::regclass
           AND privilege.grantee = 0
       )
       OR pg_catalog.has_table_privilege(
         'celebix_saas_app', 'saas.' || checked_table,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: broad table privilege on %', checked_table;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, ''),
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'orders'
  ) IS DISTINCT FROM
    'id:uuid:NO:,store_id:uuid:NO:,order_number:text:NO:,source:text:NO:,customer_name:text:NO:,customer_email:text:NO:,customer_phone:text:YES:,currency:text:NO:,subtotal_cents:bigint:NO:,shipping_cents:bigint:NO:,discount_cents:bigint:NO:,total_cents:bigint:NO:,status:text:NO:,payment_status:text:NO:,shipping_address:jsonb:NO:,tracking:jsonb:YES:,version:bigint:NO:1,created_at:timestamp with time zone:NO:,updated_at:timestamp with time zone:NO:'
  THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: orders column drift';
  END IF;

  IF (
    SELECT pg_catalog.string_agg(
      column_name || ':' || data_type || ':' || is_nullable,
      ',' ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'saas' AND table_name = 'order_items'
  ) IS DISTINCT FROM
    'id:uuid:NO,store_id:uuid:NO,order_id:uuid:NO,product_id:uuid:YES,variant_id:uuid:YES,position:integer:NO,product_name:text:NO,variant_name:text:YES,sku:text:YES,unit_price_cents:bigint:NO,quantity:integer:NO,discount_cents:bigint:NO,line_total_cents:bigint:NO,created_at:timestamp with time zone:NO'
  THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: order_items column drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.orders'::regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'source.*storefront.*quick_link.*marketplace.*manual_import'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.orders'::regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'total_cents = .*subtotal_cents \+ shipping_cents.*discount_cents.*total_cents >= 0'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.order_items'::regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'line_total_cents = .*unit_price_cents.*quantity.*discount_cents.*line_total_cents >= 0'
  ) THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: exact money/source constraint drift';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid IN (
      'saas.order_items'::regclass,
      'saas.order_events'::regclass,
      'saas.order_notes'::regclass,
      'saas.order_operations'::regclass
    )
      AND contype = 'f'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, order_id\) REFERENCES saas.orders\(store_id, id\)'
  ) <> 4 THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: composite order/store authority drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.order_items'::regclass
      AND contype = 'f'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, product_id\) REFERENCES saas.products\(store_id, id\)'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'saas.order_items'::regclass
      AND contype = 'f'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(store_id, variant_id\) REFERENCES saas.product_variants\(store_id, id\)'
  )
  OR (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
    WHERE conrelid IN ('saas.order_events'::regclass, 'saas.order_notes'::regclass)
      AND contype = 'f'
      AND pg_catalog.pg_get_constraintdef(oid) ~ 'REFERENCES saas.memberships\(store_id, id\)'
  ) <> 2 THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: composite catalog/author authority drift';
  END IF;

  FOREACH checked_index IN ARRAY ARRAY[
    'orders_store_list_idx',
    'orders_store_status_list_idx',
    'order_items_order_list_idx',
    'order_events_order_list_idx',
    'order_notes_active_list_idx',
    'order_operations_store_committed_idx'
  ] LOOP
    IF pg_catalog.to_regclass('saas.' || checked_index) IS NULL THEN
      RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: bounded index missing: %', checked_index;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.order_events'::regclass
      AND tgname = 'order_events_immutable'
      AND NOT tgisinternal
      AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16
      AND tgfoid = 'saas.guard_order_event_mutation()'::regprocedure
  )
  OR pg_catalog.pg_get_functiondef('saas.guard_order_event_mutation()'::regprocedure)
     !~ 'ORDER_EVENT_IMMUTABLE' THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: event immutability drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'saas.order_operations'::regclass
      AND tgname = 'order_operations_immutable'
      AND NOT tgisinternal
      AND (tgtype & 2) = 2
      AND (tgtype & 8) = 8
      AND (tgtype & 16) = 16
      AND tgfoid = 'saas.guard_order_operation_mutation()'::regprocedure
  )
  OR pg_catalog.pg_get_functiondef('saas.guard_order_operation_mutation()'::regprocedure)
     !~ 'ORDER_OPERATION_IMMUTABLE' THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: operation immutability drift';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(authority_function)
    INTO function_definition;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = authority_function
      AND owner_role.rolname = 'celebix_saas_owner'
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: authority definer/volatility/search_path drift';
  END IF;

  IF pg_catalog.has_function_privilege('public', authority_function, 'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app', authority_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: authority helper ACL drift';
  END IF;

  IF function_definition !~ 'membership[.]store_id = p_store_id'
     OR function_definition !~ 'membership[.]principal_id = p_principal_id'
     OR function_definition !~ 'subscription[.]store_id = p_store_id'
     OR function_definition !~ 'feature[.]plan_id = p_plan_id'
     OR function_definition !~ 'ORDER BY feature[.]feature_ordinal'
     OR function_definition !~ '''store_owner'',''admin'''
     OR function_definition !~ '''editor'' AND p_required_action IN \(''orders[.]read'',''orders[.]fulfill'',''orders[.]note''\)'
     OR function_definition !~ '''analyst'' AND p_required_action = ''orders[.]read'''
  THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: authority tenant/feature/role matrix drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure,
         LATERAL pg_catalog.aclexplode(
           COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
         ) AS privilege
    WHERE procedure.oid IN (
      authority_function::oid,
      'saas.guard_order_event_mutation()'::regprocedure::oid,
      'saas.guard_order_operation_mutation()'::regprocedure::oid
    )
      AND privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PHASE3B1_ORDER_ASSERTION_FAILED: PUBLIC function ACL drift';
  END IF;
END
$phase3b1_order_management_assertions$;

ROLLBACK;
