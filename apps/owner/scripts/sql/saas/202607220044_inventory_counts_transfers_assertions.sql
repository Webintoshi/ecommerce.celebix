BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  relation_name text;
  function_signature text;
  function_definition text;
  operation_vocabulary text[];
  entity_vocabulary text[];
  movement_vocabulary text[];
  movement_source_vocabulary text[];
  role_name text;
  privilege_name text;
  table_privilege boolean;
  function_execute boolean;
  entity_position integer;
  location_position integer;
  variant_position integer;
  balance_position integer;
  checkout_attempt_position integer;
  checkout_link_position integer;
  checkout_store_lock_position integer;
  checkout_store_lock_end_position integer;
  checkout_product_position integer;
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
  SELECT pg_catalog.array_agg(DISTINCT capture[1] ORDER BY capture[1])
  INTO operation_vocabulary
  FROM pg_catalog.regexp_matches(
    function_definition,$vocabulary$'([^']+)'$vocabulary$,'g'
  ) AS capture;
  IF operation_vocabulary IS DISTINCT FROM ARRAY[
    'count_cancel','count_commit','count_save','count_start',
    'purchase_receive','purchase_save','purchase_transition',
    'transfer_cancel','transfer_dispatch','transfer_receive','transfer_save'
  ]::text[] THEN
    RAISE EXCEPTION 'INVENTORY_OPERATION_KIND_INVALID: %',operation_vocabulary;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_operations'::regclass
    AND conname='inventory_operations_entity_check';
  SELECT pg_catalog.array_agg(DISTINCT capture[1] ORDER BY capture[1])
  INTO entity_vocabulary
  FROM pg_catalog.regexp_matches(
    function_definition,$vocabulary$'([^']+)'$vocabulary$,'g'
  ) AS capture;
  IF entity_vocabulary IS DISTINCT FROM ARRAY[
    'count_cancel','count_commit','count_save','count_start',
    'purchase_receive','purchase_save','purchase_transition',
    'transfer_cancel','transfer_dispatch','transfer_receive','transfer_save'
  ]::text[] THEN
    RAISE EXCEPTION 'INVENTORY_OPERATION_ENTITY_VOCABULARY_INVALID: %',
      entity_vocabulary;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_movements'::regclass
    AND conname='inventory_movements_kind_check';
  SELECT pg_catalog.array_agg(DISTINCT capture[1] ORDER BY capture[1])
  INTO movement_vocabulary
  FROM pg_catalog.regexp_matches(
    function_definition,$vocabulary$'([^']+)'$vocabulary$,'g'
  ) AS capture;
  IF movement_vocabulary IS DISTINCT FROM ARRAY[
    'catalog_adjustment','checkout_sale','count_adjustment','opening',
    'purchase_receipt','transfer_in','transfer_out','transfer_return'
  ]::text[] THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_KIND_INVALID: %',movement_vocabulary;
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(oid)
  INTO function_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='saas.inventory_movements'::regclass
    AND conname='inventory_movements_source_check';
  SELECT pg_catalog.array_agg(DISTINCT capture[1] ORDER BY capture[1])
  INTO movement_source_vocabulary
  FROM pg_catalog.regexp_matches(
    function_definition,$vocabulary$'([^']+)'$vocabulary$,'g'
  ) AS capture;
  IF movement_source_vocabulary IS DISTINCT FROM ARRAY[
    'catalog_adjustment','checkout_sale','count_adjustment','opening',
    'purchase_receipt','transfer'
  ]::text[] THEN
    RAISE EXCEPTION 'INVENTORY_MOVEMENT_SOURCE_INVALID: %',
      movement_source_vocabulary;
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
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure
  ) INTO function_definition;
  checkout_attempt_position:=pg_catalog.strpos(
    function_definition,'WHERE attempt.id=p_attempt_id FOR UPDATE OF attempt'
  );
  checkout_link_position:=pg_catalog.strpos(
    function_definition,'WHERE link.store_id=current_attempt.store_id AND link.id=current_attempt.quick_order_link_id FOR UPDATE OF link'
  );
  checkout_store_lock_position:=pg_catalog.strpos(
    function_definition,'inventory checkout store lock begin'
  );
  checkout_store_lock_end_position:=pg_catalog.strpos(
    function_definition,'inventory checkout store lock end'
  );
  checkout_product_position:=pg_catalog.strpos(
    function_definition,'PERFORM product.id FROM saas.products AS product'
  );
  IF checkout_attempt_position=0
     OR checkout_link_position<=checkout_attempt_position
     OR checkout_store_lock_position<=checkout_link_position
     OR checkout_store_lock_end_position<=checkout_store_lock_position
     OR checkout_product_position<=checkout_store_lock_end_position
     OR (
       pg_catalog.length(function_definition)-pg_catalog.length(
         pg_catalog.replace(
           function_definition,'inventory checkout store lock begin',''
         )
       )
     )/pg_catalog.length('inventory checkout store lock begin')<>1
     OR (
       pg_catalog.length(function_definition)-pg_catalog.length(
         pg_catalog.replace(
           function_definition,'inventory checkout store lock end',''
         )
       )
     )/pg_catalog.length('inventory checkout store lock end')<>1
     OR (
       pg_catalog.length(function_definition)-pg_catalog.length(
         pg_catalog.replace(function_definition,'saas.catalog.store:','')
       )
     )/pg_catalog.length('saas.catalog.store:')<>1
     OR (
       pg_catalog.length(function_definition)-pg_catalog.length(
         pg_catalog.replace(
           function_definition,'pg_catalog.pg_advisory_xact_lock(',''
         )
       )
     )/pg_catalog.length('pg_catalog.pg_advisory_xact_lock(')<>1
     OR function_definition NOT LIKE
       E'%PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(\n      ''saas.catalog.store:''||current_attempt.store_id::text,0\n    )\n  );%'
     OR pg_catalog.pg_get_userbyid(
       (
         SELECT proc.proowner FROM pg_catalog.pg_proc AS proc
         WHERE proc.oid=
           'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure
       )
     )<>'celebix_saas_owner' THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_INVALID';
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
    IF (
      SELECT pg_catalog.count(*)
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
      WHERE acl.grantee='celebix_saas_owner'::regrole
        AND acl.privilege_type=ANY(
          ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
        )
    )<>7 OR EXISTS(
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
      WHERE acl.grantee<>'celebix_saas_owner'::regrole
    ) THEN
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_TABLE_ACL_INVALID: %',relation_name;
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
    ] LOOP
      table_privilege:=pg_catalog.has_table_privilege(
        'celebix_saas_owner',pg_catalog.format('saas.%I',relation_name),
        privilege_name
      );
      IF table_privilege IS DISTINCT FROM true
         OR pg_catalog.has_table_privilege(
           0::oid,pg_catalog.format('saas.%I',relation_name)::regclass,
           privilege_name
         ) THEN
        RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_TABLE_ACL_INVALID: % %',
          relation_name,privilege_name;
      END IF;
      FOREACH role_name IN ARRAY ARRAY[
        'celebix_saas_app','celebix_saas_identity','celebix_saas_workflow',
        'celebix_saas_host_resolver','celebix_saas_bootstrap',
        'celebix_saas_observability','celebix_saas_migrator'
      ] LOOP
        table_privilege:=pg_catalog.has_table_privilege(
          role_name,pg_catalog.format('saas.%I',relation_name),privilege_name
        );
        IF table_privilege IS DISTINCT FROM false THEN
          RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_TABLE_ACL_INVALID: % % %',
            relation_name,role_name,privilege_name;
        END IF;
      END LOOP;
    END LOOP;
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
    IF pg_catalog.to_regprocedure(function_signature) IS NULL OR (
         SELECT pg_catalog.pg_get_userbyid(proowner)
         FROM pg_catalog.pg_proc
         WHERE oid=function_signature::regprocedure
       )<>'celebix_saas_owner'
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_proc AS proc,
           LATERAL pg_catalog.aclexplode(
             COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
           ) AS acl
         WHERE proc.oid=function_signature::regprocedure
           AND acl.privilege_type='EXECUTE'
           AND acl.grantee IN(
             'celebix_saas_owner'::regrole,'celebix_saas_app'::regrole
           )
       )<>2 OR EXISTS(
         SELECT 1
         FROM pg_catalog.pg_proc AS proc,
           LATERAL pg_catalog.aclexplode(
             COALESCE(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
           ) AS acl
         WHERE proc.oid=function_signature::regprocedure
           AND acl.privilege_type='EXECUTE'
           AND acl.grantee NOT IN(
             'celebix_saas_owner'::regrole,'celebix_saas_app'::regrole
           )
       ) THEN
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_FUNCTION_ACL_INVALID: %',
        function_signature;
    END IF;
    function_execute:=pg_catalog.has_function_privilege(
      'celebix_saas_owner',function_signature,'EXECUTE'
    ) AND pg_catalog.has_function_privilege(
      'celebix_saas_app',function_signature,'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      0::oid,function_signature,'EXECUTE'
    );
    IF function_execute IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_FUNCTION_ACL_INVALID: %',
        function_signature;
    END IF;
    FOREACH role_name IN ARRAY ARRAY[
      'celebix_saas_identity','celebix_saas_workflow',
      'celebix_saas_host_resolver','celebix_saas_bootstrap',
      'celebix_saas_observability','celebix_saas_migrator'
    ] LOOP
      function_execute:=pg_catalog.has_function_privilege(
        role_name,function_signature,'EXECUTE'
      );
      IF function_execute IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_FUNCTION_ACL_INVALID: % %',
          function_signature,role_name;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.inventory_count_lines_valid(jsonb)',
    'saas.inventory_transfer_lines_valid(jsonb)',
    'saas.inventory_count_projection(uuid,uuid)',
    'saas.inventory_transfer_projection(uuid,uuid)',
    'saas.inventory_count_mutation_projection(uuid,uuid,boolean)',
    'saas.inventory_transfer_mutation_projection(uuid,uuid,boolean)',
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'
  ] LOOP
    function_execute:=pg_catalog.has_function_privilege(
      'celebix_saas_owner',function_signature,'EXECUTE'
    ) AND NOT pg_catalog.has_function_privilege(
      0::oid,function_signature,'EXECUTE'
    );
    FOREACH role_name IN ARRAY ARRAY[
      'celebix_saas_app','celebix_saas_identity','celebix_saas_workflow',
      'celebix_saas_host_resolver','celebix_saas_bootstrap',
      'celebix_saas_observability','celebix_saas_migrator'
    ] LOOP
      function_execute:=function_execute AND NOT pg_catalog.has_function_privilege(
        role_name,function_signature,'EXECUTE'
      );
    END LOOP;
    IF function_execute IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'INVENTORY_COUNT_TRANSFER_PRIVATE_FUNCTION_ACL_INVALID: %',
        function_signature;
    END IF;
  END LOOP;
END
$assertions$;

ROLLBACK;
