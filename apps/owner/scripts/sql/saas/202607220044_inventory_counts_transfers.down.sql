BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.inventory_counts)
     OR EXISTS(SELECT 1 FROM saas.inventory_transfers)
     OR EXISTS(
       SELECT 1 FROM saas.inventory_operations
       WHERE operation_kind IN(
         'count_save','count_start','count_commit','count_cancel',
         'transfer_save','transfer_dispatch','transfer_receive','transfer_cancel'
       )
     ) OR EXISTS(
       SELECT 1 FROM saas.inventory_movements
       WHERE source_kind IN('count_adjustment','transfer')
     ) THEN
    RAISE EXCEPTION 'INVENTORY_COUNTS_TRANSFERS_ROLLBACK_BLOCKED';
  END IF;
END
$precondition$;

DO $checkout_store_lock_restore$
DECLARE
  target regprocedure:=
    'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'::regprocedure;
  definition text;
  stripped text;
  definition_after text;
  expected_fragment text:=$fragment$
  -- inventory checkout store lock begin
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.catalog.store:'||current_attempt.store_id::text,0
    )
  );
  -- inventory checkout store lock end
$fragment$;
  owner_before oid;
  owner_after oid;
  acl_before aclitem[];
  acl_after aclitem[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner,proc.proacl
  INTO definition,owner_before,acl_before
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid=target;
  IF definition IS NULL
     OR (
       pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,expected_fragment,'')
       )
     )/pg_catalog.length(expected_fragment)<>1
     OR (
       pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,'inventory checkout store lock begin','')
       )
     )/pg_catalog.length('inventory checkout store lock begin')<>1
     OR (
       pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,'inventory checkout store lock end','')
       )
     )/pg_catalog.length('inventory checkout store lock end')<>1 THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_DRIFT';
  END IF;
  stripped:=pg_catalog.replace(definition,expected_fragment,E'\n');
  IF stripped LIKE '%inventory checkout store lock begin%'
     OR stripped LIKE '%inventory checkout store lock end%'
     OR stripped LIKE '%saas.catalog.store:%' THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_RESIDUE';
  END IF;
  EXECUTE stripped;
  SELECT pg_catalog.pg_get_functiondef(proc.oid),proc.proowner,proc.proacl
  INTO definition_after,owner_after,acl_after
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid=target;
  IF definition_after IS DISTINCT FROM stripped
     OR owner_after IS DISTINCT FROM owner_before
     OR acl_after IS DISTINCT FROM acl_before THEN
    RAISE EXCEPTION 'INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_DRIFT';
  END IF;
END
$checkout_store_lock_restore$;

DROP FUNCTION saas.inventory_transfers_cancel(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_transfers_receive(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_transfers_dispatch(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_transfers_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,uuid,jsonb
);
DROP FUNCTION saas.inventory_transfers_get(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
);
DROP FUNCTION saas.inventory_transfers_list(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz
);
DROP FUNCTION saas.inventory_counts_cancel(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_counts_commit(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_counts_start(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint
);
DROP FUNCTION saas.inventory_counts_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,jsonb
);
DROP FUNCTION saas.inventory_counts_get(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid
);
DROP FUNCTION saas.inventory_counts_list(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz
);

DROP FUNCTION saas.inventory_transfer_mutation_projection(uuid,uuid,boolean);
DROP FUNCTION saas.inventory_count_mutation_projection(uuid,uuid,boolean);
DROP FUNCTION saas.inventory_transfer_projection(uuid,uuid);
DROP FUNCTION saas.inventory_count_projection(uuid,uuid);
DROP FUNCTION saas.inventory_transfer_lines_valid(jsonb);
DROP FUNCTION saas.inventory_count_lines_valid(jsonb);

ALTER TABLE saas.inventory_operations
  DROP CONSTRAINT inventory_operations_entity_check,
  DROP CONSTRAINT inventory_operations_transfer_entity_fk,
  DROP CONSTRAINT inventory_operations_count_entity_fk,
  DROP CONSTRAINT inventory_operations_purchase_entity_fk,
  DROP CONSTRAINT inventory_operations_kind_check;

ALTER TABLE saas.inventory_operations
  DROP COLUMN result_transfer_id,
  DROP COLUMN result_count_id,
  DROP COLUMN result_purchase_id;

DROP TABLE saas.inventory_transfer_lines;
DROP TABLE saas.inventory_transfers;
DROP TABLE saas.inventory_count_lines;
DROP TABLE saas.inventory_counts;

ALTER TABLE saas.inventory_operations
  ADD CONSTRAINT inventory_operations_purchase_store_fk
    FOREIGN KEY (store_id,result_entity_id)
    REFERENCES saas.purchase_orders(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inventory_operations_kind_check CHECK (
    operation_kind IN('purchase_save','purchase_transition','purchase_receive')
  );

COMMIT;
