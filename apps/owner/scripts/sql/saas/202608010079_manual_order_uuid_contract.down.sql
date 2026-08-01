-- Restore the 078 identifier expressions during an ordered rollback.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $manual_order_uuid_contract_rollback$
DECLARE
  convert_signature regprocedure := pg_catalog.to_regprocedure('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)');
  transition_signature regprocedure := pg_catalog.to_regprocedure('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)');
  convert_definition text;
  transition_definition text;
  old_order_id text := 'pg_catalog.md5(''saas.manual-order:''||p_operation_id::text)::uuid';
  old_item_id text := 'pg_catalog.md5(''saas.manual-order-item:''||stored_line.id::text)::uuid';
  old_created_event_id text := 'pg_catalog.md5(''saas.manual-order-event:''||p_operation_id::text)::uuid';
  old_transition_event_id text := 'pg_catalog.md5(''saas.order.event:''||p_operation_id::text)::uuid';
  new_order_id text := 'saas.inventory_deterministic_uuid(''saas.manual-order'',p_operation_id::text)';
  new_item_id text := 'saas.inventory_deterministic_uuid(''saas.manual-order-item'',stored_line.id::text)';
  new_created_event_id text := 'saas.inventory_deterministic_uuid(''saas.manual-order-event'',p_operation_id::text)';
  new_transition_event_id text := 'saas.inventory_deterministic_uuid(''saas.order.event'',p_operation_id::text)';
BEGIN
  IF convert_signature IS NULL OR transition_signature IS NULL THEN
    RAISE EXCEPTION 'MANUAL_ORDER_UUID_CONTRACT_ROLLBACK_PRECONDITION';
  END IF;
  convert_definition := pg_catalog.pg_get_functiondef(convert_signature);
  transition_definition := pg_catalog.pg_get_functiondef(transition_signature);
  IF pg_catalog.strpos(convert_definition,new_order_id)=0
     OR pg_catalog.strpos(convert_definition,new_item_id)=0
     OR pg_catalog.strpos(convert_definition,new_created_event_id)=0
     OR pg_catalog.strpos(transition_definition,new_transition_event_id)=0
     OR pg_catalog.strpos(convert_definition,old_order_id)>0
     OR pg_catalog.strpos(convert_definition,old_item_id)>0
     OR pg_catalog.strpos(convert_definition,old_created_event_id)>0
     OR pg_catalog.strpos(transition_definition,old_transition_event_id)>0 THEN
    RAISE EXCEPTION 'MANUAL_ORDER_UUID_CONTRACT_ROLLBACK_SOURCE_MISMATCH';
  END IF;
  convert_definition := pg_catalog.replace(convert_definition,new_order_id,old_order_id);
  convert_definition := pg_catalog.replace(convert_definition,new_item_id,old_item_id);
  convert_definition := pg_catalog.replace(convert_definition,new_created_event_id,old_created_event_id);
  transition_definition := pg_catalog.replace(transition_definition,new_transition_event_id,old_transition_event_id);
  EXECUTE convert_definition;
  EXECUTE transition_definition;
END
$manual_order_uuid_contract_rollback$;

ALTER FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;

COMMIT;
