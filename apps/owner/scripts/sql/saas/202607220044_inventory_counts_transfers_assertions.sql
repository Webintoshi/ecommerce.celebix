BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  relation_name text;
  function_signature text;
  function_definition text;
  entity_position integer;
  location_position integer;
  variant_position integer;
  balance_position integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'inventory_counts','inventory_count_lines',
    'inventory_transfers','inventory_transfer_lines'
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
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_RLS_INVALID: %',relation_name;
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM information_schema.columns
    WHERE table_schema='saas'
      AND table_name=ANY(ARRAY[
        'inventory_counts','inventory_count_lines',
        'inventory_transfers','inventory_transfer_lines'
      ])
      AND column_name='store_id'
  )<>4 THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_STORE_SCOPE_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_counts'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, location_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_count_lines'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, inventory_count_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_count_lines'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, variant_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfers'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, source_location_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfers'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, destination_location_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfer_lines'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, inventory_transfer_id)%'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfer_lines'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%FOREIGN KEY (store_id, variant_id)%'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_COMPOSITE_FK_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_count_lines'::regclass
      AND conname='inventory_count_lines_count_variant_key'
      AND contype='u'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfer_lines'::regclass
      AND conname='inventory_transfer_lines_transfer_variant_key'
      AND contype='u'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_transfers'::regclass
      AND conname='inventory_transfers_distinct_locations_check'
      AND contype='c' AND convalidated
  ) THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_FINITE_CONSTRAINT_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.inventory_operations'::regclass
      AND attname='result_purchase_id' AND attgenerated='s'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.inventory_operations'::regclass
      AND attname='result_count_id' AND attgenerated='s'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.inventory_operations'::regclass
      AND attname='result_transfer_id' AND attgenerated='s'
  ) OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_operations'::regclass
      AND conname IN(
        'inventory_operations_purchase_entity_fk',
        'inventory_operations_count_entity_fk',
        'inventory_operations_transfer_entity_fk'
      )
      AND contype='f'
  )<>3 OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.inventory_operations'::regclass
      AND conname='inventory_operations_entity_check'
      AND contype='c' AND convalidated
  ) THEN
    RAISE EXCEPTION 'INVENTORY_OPERATION_ENTITY_CONSTRAINT_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_operations'::regclass
    AND conname='inventory_operations_kind_check';
  FOREACH function_signature IN ARRAY ARRAY[
    'purchase_save','purchase_transition','purchase_receive',
    'count_save','count_start','count_commit','count_cancel',
    'transfer_save','transfer_dispatch','transfer_receive','transfer_cancel'
  ] LOOP
    IF function_definition NOT LIKE '%'||function_signature||'%' THEN
      RAISE EXCEPTION 'INVENTORY_OPERATION_KIND_INVALID: %',function_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_movements'::regclass
    AND conname='inventory_movements_kind_check';
  FOREACH function_signature IN ARRAY ARRAY[
    'opening','catalog_adjustment','purchase_receipt','count_adjustment',
    'transfer_out','transfer_in','transfer_return','checkout_sale'
  ] LOOP
    IF function_definition NOT LIKE '%'||function_signature||'%' THEN
      RAISE EXCEPTION 'INVENTORY_MOVEMENT_KIND_INVALID: %',function_signature;
    END IF;
  END LOOP;
  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_movements'::regclass
    AND conname='inventory_movements_source_check';
  IF function_definition NOT LIKE '%count_adjustment%'
     OR function_definition NOT LIKE '%transfer%' THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_SOURCE_INVALID';
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
  ) THEN
    RAISE EXCEPTION 'INVENTORY_LEDGER_IMMUTABILITY_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  ) INTO function_definition;
  IF function_definition NOT LIKE '%ORDER BY location.id FOR UPDATE%'
     OR function_definition NOT LIKE '%ORDER BY variant.id FOR UPDATE%'
     OR function_definition NOT LIKE '%ORDER BY balance.variant_id FOR UPDATE%'
     OR function_definition NOT LIKE '%expected_quantity=balance.quantity%'
     OR function_definition NOT LIKE '%counted_quantity=NULL%' THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_START_LOCK_INVALID';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  ) INTO function_definition;
  entity_position:=pg_catalog.strpos(function_definition,'FOR UPDATE;');
  location_position:=pg_catalog.strpos(
    function_definition,'ORDER BY location.id FOR UPDATE'
  );
  variant_position:=pg_catalog.strpos(
    function_definition,'ORDER BY variant.id FOR UPDATE'
  );
  balance_position:=pg_catalog.strpos(
    function_definition,'ORDER BY balance.variant_id FOR UPDATE'
  );
  IF entity_position=0 OR location_position<=entity_position
     OR variant_position<=location_position OR balance_position<=variant_position
     OR function_definition NOT LIKE '%balance.quantity<>line.expected_quantity%'
     OR function_definition NOT LIKE '%inventory_conflict%'
     OR function_definition NOT LIKE '%active_hold_conflict%'
     OR function_definition NOT LIKE '%status=''held''%'
     OR function_definition NOT LIKE '%inventory_managed%'
     OR function_definition NOT LIKE '%count_adjustment%'
     OR function_definition NOT LIKE '%ORDER BY line.variant_id%' THEN
    RAISE EXCEPTION 'INVENTORY_COUNT_COMMIT_LOCK_INVALID';
  END IF;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(function_signature::regprocedure)
    INTO function_definition;
    entity_position:=pg_catalog.strpos(function_definition,'FOR UPDATE;');
    location_position:=pg_catalog.strpos(
      function_definition,'ORDER BY location.id FOR UPDATE'
    );
    variant_position:=pg_catalog.strpos(
      function_definition,'ORDER BY variant.id FOR UPDATE'
    );
    balance_position:=pg_catalog.strpos(
      function_definition,
      'ORDER BY balance.location_id,balance.variant_id FOR UPDATE'
    );
    IF entity_position=0 OR location_position<=entity_position
       OR variant_position<=location_position OR balance_position<=variant_position
       OR function_definition NOT LIKE '%inventory_managed%'
       OR function_definition NOT LIKE '%ORDER BY line.variant_id%' THEN
      RAISE EXCEPTION 'INVENTORY_TRANSFER_LOCK_ORDER_INVALID: %',function_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  ) INTO function_definition;
  IF function_definition NOT LIKE '%insufficient_stock%'
     OR function_definition NOT LIKE '%active_hold_conflict%'
     OR function_definition NOT LIKE '%status=''held''%'
     OR function_definition NOT LIKE '%transfer_out%' THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_DISPATCH_INVALID';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  ) INTO function_definition;
  IF function_definition NOT LIKE '%transfer_in%'
     OR function_definition NOT LIKE '%destination_location_id%' THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_RECEIVE_INVALID';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  ) INTO function_definition;
  IF function_definition NOT LIKE '%transfer_return%'
     OR function_definition NOT LIKE '%source_location_id%' THEN
    RAISE EXCEPTION 'INVENTORY_TRANSFER_CANCEL_INVALID';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'inventory_counts','inventory_count_lines',
    'inventory_transfers','inventory_transfer_lines'
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
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_DIRECT_DML_INVALID: %',relation_name;
    END IF;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)',
    'saas.inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,uuid,jsonb)',
    'saas.inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)'
  ] LOOP
    IF pg_catalog.to_regprocedure(function_signature) IS NULL
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
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_FUNCTION_ACL_INVALID: %',
        function_signature;
    END IF;
  END LOOP;
END
$assertions$;

ROLLBACK;
