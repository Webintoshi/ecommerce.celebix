BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  relation_name text;
  function_signature text;
  function_definition text;
  expected_marker text;
  expected_source_id text;
  marker_set text;
  source_id_set text;
  source_time_set text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_time'',p_now::text,true);';
  marker_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_marker'','''',true);';
  source_id_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_id'','''',true);';
  source_time_clear text:=
    'PERFORM pg_catalog.set_config(''saas.inventory.source_time'','''',true);';
  begin_position integer;
  end_position integer;
  marker_set_position integer;
  source_id_set_position integer;
  source_time_set_position integer;
  marker_clear_position integer;
  source_id_clear_position integer;
  source_time_clear_position integer;
  receive_definition text;
  purchase_lock_position integer;
  variant_lock_position integer;
  balance_lock_position integer;
  action_definition text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'inventory_locations',
    'inventory_balances',
    'inventory_movements',
    'purchase_orders',
    'purchase_order_lines',
    'inventory_operations'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname=relation_name
        AND relation.relkind='r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND pg_catalog.pg_get_userbyid(relation.relowner)='celebix_saas_owner'
    ) THEN
      RAISE EXCEPTION 'INVENTORY_RELATION_RLS_INVALID: %',relation_name;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM information_schema.columns
    WHERE table_schema='saas'
      AND table_name=ANY(ARRAY[
        'inventory_locations','inventory_balances','inventory_movements',
        'purchase_orders','purchase_order_lines','inventory_operations'
      ])
      AND column_name='store_id'
  )<>6 THEN
    RAISE EXCEPTION 'INVENTORY_STORE_SCOPE_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_balances'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, location_id)%'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_balances'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, variant_id)%'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.purchase_order_lines'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, purchase_order_id)%'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_operations'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, result_entity_id)%'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COMPOSITE_FOREIGN_KEY_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_movements'::regclass
      AND conname='inventory_movements_source_key'
      AND contype='u'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_movements'::regclass
      AND conname='inventory_movements_delta_check'
      AND contype='c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_CONSTRAINT_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.inventory_movements'::regclass
      AND tgname='inventory_movements_immutable'
      AND tgenabled='O' AND NOT tgisinternal
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.inventory_operations'::regclass
      AND tgname='inventory_operations_immutable'
      AND tgenabled='O' AND NOT tgisinternal
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.product_variants'::regclass
      AND tgname='product_variants_inventory_reconcile'
      AND tgenabled='O' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'INVENTORY_TRIGGER_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_reconcile_variant_delta(uuid,uuid,bigint,bigint,boolean)'::regprocedure
  ) INTO function_definition;
  IF function_definition NOT LIKE '%INVENTORY_STOCK_SOURCE_REQUIRED%'
     OR function_definition NOT LIKE '%catalog_adjustment%'
     OR function_definition NOT LIKE '%checkout_sale%'
     OR function_definition NOT LIKE '%inventory_managed%'
     OR function_definition NOT LIKE '%INVENTORY_BALANCE_AGGREGATE_MISMATCH%'
     OR function_definition NOT LIKE '%status=''held''%'
     OR function_definition NOT LIKE '%ORDER BY location.is_default DESC,balance.location_id%' THEN
    RAISE EXCEPTION 'INVENTORY_RECONCILIATION_INVALID';
  END IF;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)',
    'saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',
    'saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(function_signature::regprocedure)
    INTO function_definition;
    IF function_signature LIKE 'saas.quick_checkout_settle_success_core(%' THEN
      expected_marker:='checkout_sale';
      expected_source_id:='current_attempt.id::text';
    ELSE
      expected_marker:='catalog_adjustment';
      expected_source_id:='p_operation_id::text';
    END IF;
    marker_set:=pg_catalog.format(
      'PERFORM pg_catalog.set_config(''saas.inventory.source_marker'',''%s'',true);',
      expected_marker
    );
    source_id_set:=pg_catalog.format(
      'PERFORM pg_catalog.set_config(''saas.inventory.source_id'',%s,true);',
      expected_source_id
    );
    begin_position:=pg_catalog.strpos(
      function_definition,'-- inventory marker begin'
    );
    end_position:=pg_catalog.strpos(
      function_definition,'-- inventory marker end'
    );
    marker_set_position:=pg_catalog.strpos(function_definition,marker_set);
    source_id_set_position:=pg_catalog.strpos(function_definition,source_id_set);
    source_time_set_position:=pg_catalog.strpos(function_definition,source_time_set);
    marker_clear_position:=pg_catalog.strpos(function_definition,marker_clear);
    source_id_clear_position:=pg_catalog.strpos(function_definition,source_id_clear);
    source_time_clear_position:=pg_catalog.strpos(function_definition,source_time_clear);
    IF (
      pg_catalog.length(function_definition)-
      pg_catalog.length(
        pg_catalog.replace(function_definition,'-- inventory marker begin','')
      )
    )/pg_catalog.length('-- inventory marker begin')<>1
    OR (
      pg_catalog.length(function_definition)-
      pg_catalog.length(
        pg_catalog.replace(function_definition,'-- inventory marker end','')
      )
    )/pg_catalog.length('-- inventory marker end')<>1
    OR (
      pg_catalog.length(function_definition)-
      pg_catalog.length(pg_catalog.replace(
        function_definition,
        'PERFORM pg_catalog.set_config(''saas.inventory.',
        ''
      ))
    )/pg_catalog.length('PERFORM pg_catalog.set_config(''saas.inventory.')<>6
    OR (
      pg_catalog.length(function_definition)-
      pg_catalog.length(pg_catalog.replace(
        function_definition,
        'PERFORM pg_catalog.set_config(''saas.inventory.source_marker''',
        ''
      ))
    )/pg_catalog.length(
      'PERFORM pg_catalog.set_config(''saas.inventory.source_marker'''
    )<>2
    OR (
      pg_catalog.length(function_definition)-
      pg_catalog.length(pg_catalog.replace(
        function_definition,
        'PERFORM pg_catalog.set_config(''saas.inventory.source_id''',
        ''
      ))
    )/pg_catalog.length(
      'PERFORM pg_catalog.set_config(''saas.inventory.source_id'''
    )<>2
    OR (
      pg_catalog.length(function_definition)-
      pg_catalog.length(pg_catalog.replace(
        function_definition,
        'PERFORM pg_catalog.set_config(''saas.inventory.source_time''',
        ''
      ))
    )/pg_catalog.length(
      'PERFORM pg_catalog.set_config(''saas.inventory.source_time'''
    )<>2
    OR NOT(
      begin_position<marker_set_position
      AND marker_set_position<source_id_set_position
      AND source_id_set_position<source_time_set_position
      AND source_time_set_position<marker_clear_position
      AND marker_clear_position<source_id_clear_position
      AND source_id_clear_position<source_time_clear_position
      AND source_time_clear_position<end_position
    ) THEN
      RAISE EXCEPTION 'INVENTORY_WRITER_GUC_SHAPE_INVALID: %',function_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure
  ) INTO action_definition;
  FOREACH function_signature IN ARRAY ARRAY[
    'analytics.read','inventory.read','inventory.manage','purchasing.read',
    'purchasing.manage','pricing.read','pricing.manage'
  ] LOOP
    IF action_definition NOT LIKE '%'||function_signature||'%' THEN
      RAISE EXCEPTION 'INVENTORY_ACTION_POLICY_INVALID: %',function_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)'::regprocedure
  ) INTO receive_definition;
  purchase_lock_position:=pg_catalog.strpos(
    receive_definition,
    'WHERE purchase.store_id=p_store_id AND purchase.id=p_order_id FOR UPDATE'
  );
  variant_lock_position:=pg_catalog.strpos(
    receive_definition,
    'WHERE variant.store_id=p_store_id AND variant.id=ANY(p_variant_ids)'
  );
  balance_lock_position:=pg_catalog.strpos(
    receive_definition,
    'WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id'
  );
  IF purchase_lock_position=0
     OR variant_lock_position<=purchase_lock_position
     OR balance_lock_position<=variant_lock_position
     OR receive_definition NOT LIKE '%ORDER BY variant.id FOR UPDATE%'
     OR receive_definition NOT LIKE '%ORDER BY balance.variant_id FOR UPDATE%'
     OR receive_definition NOT LIKE '%checkout_inventory_reservations%'
     OR receive_definition NOT LIKE '%over_receipt%'
     OR receive_definition NOT LIKE '%inventory_managed%'
     OR receive_definition NOT LIKE '%purchase_receipt%' THEN
    RAISE EXCEPTION 'INVENTORY_RECEIVE_LOCK_ORDER_INVALID';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'inventory_locations','inventory_balances','inventory_movements',
    'purchase_orders','purchase_order_lines','inventory_operations'
  ] LOOP
    IF EXISTS(
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (
            SELECT relation.relacl
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid=relation.relnamespace
            WHERE namespace.nspname='saas' AND relation.relname=relation_name
          ),
          pg_catalog.acldefault('r','celebix_saas_owner'::regrole)
        )
      ) AS acl
      WHERE acl.grantee IN(
        'celebix_saas_app'::regrole,
        'celebix_saas_workflow'::regrole,
        'celebix_saas_host_resolver'::regrole,
        'celebix_saas_bootstrap'::regrole
      )
      AND acl.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE')
    ) THEN
      RAISE EXCEPTION 'INVENTORY_DIRECT_DML_INVALID: %',relation_name;
    END IF;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,text,jsonb)',
    'saas.purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)',
    'saas.inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    IF to_regprocedure(function_signature) IS NULL
       OR NOT pg_catalog.has_function_privilege(
         'celebix_saas_app',function_signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'celebix_saas_workflow',function_signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'celebix_saas_host_resolver',function_signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
         'celebix_saas_bootstrap',function_signature,'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(0::oid,function_signature,'EXECUTE')
       OR (
         SELECT pg_catalog.pg_get_userbyid(proowner)
         FROM pg_catalog.pg_proc
         WHERE oid=function_signature::regprocedure
       )<>'celebix_saas_owner' THEN
      RAISE EXCEPTION 'INVENTORY_FUNCTION_ACL_INVALID: %',function_signature;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM saas.product_variants AS variant
    WHERE variant.status='active'
      AND saas.inventory_active_balance_total(variant.store_id,variant.id)
        <>variant.stock_quantity
  )<>0 THEN
    RAISE EXCEPTION 'INVENTORY_OPENING_AGGREGATE_INVALID';
  END IF;
END
$assertions$;

ROLLBACK;
