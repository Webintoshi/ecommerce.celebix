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
