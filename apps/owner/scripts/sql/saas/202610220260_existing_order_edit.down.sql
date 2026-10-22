-- Rollback is allowed only before the first committed order revision.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $guard$DECLARE r record;p record;BEGIN
 IF current_setting('celebix.allow_native260_down',true)IS DISTINCT FROM'on'THEN RAISE EXCEPTION 'ORDER_EDIT260_DOWN_REQUIRES_EXPLICIT_OPERATOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.order_edit_revisions)OR EXISTS(SELECT 1 FROM saas.order_edit_baselines)THEN RAISE EXCEPTION 'ORDER_EDIT260_COMMITTED_EDITS';END IF;
 FOR r IN SELECT * FROM saas.order_edit260_restore LOOP
  SELECT f.* INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.after_hash OR p.proowner<>r.function_owner OR p.proacl IS DISTINCT FROM r.function_acl THEN RAISE EXCEPTION 'ORDER_EDIT260_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.order_edit260_restore LOOP EXECUTE r.definition;END LOOP;
END $guard$;
ALTER TABLE saas.order_discount_allocations DROP CONSTRAINT order_discount_allocations_line_store_fk;
ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_line_store_fk FOREIGN KEY(store_id,order_id,line_id)REFERENCES saas.order_items(store_id,order_id,id);
ALTER TABLE saas.review_collection_requests DROP CONSTRAINT review_collection_requests_order_item_id_fkey;
ALTER TABLE saas.review_collection_requests ADD CONSTRAINT review_collection_requests_order_item_id_fkey FOREIGN KEY(order_item_id)REFERENCES saas.order_items(id)ON DELETE RESTRICT;
ALTER TABLE saas.shipping_shipment_items DROP CONSTRAINT shipping_shipment_items_order_item_fk;
ALTER TABLE saas.shipping_shipment_items ADD CONSTRAINT shipping_shipment_items_order_item_fk FOREIGN KEY(store_id,order_id,order_item_id)REFERENCES saas.order_items(store_id,order_id,id)ON DELETE RESTRICT;
ALTER TABLE saas.order_items DROP CONSTRAINT order_items_store_id_order_id_position_key;
ALTER TABLE saas.order_items ADD CONSTRAINT order_items_store_id_order_id_position_key UNIQUE(store_id,order_id,position);
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_kind_check,DROP CONSTRAINT inventory_movements_source_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_kind_check CHECK(movement_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer_out','transfer_in','transfer_return','checkout_sale','in_store_sale')),
 ADD CONSTRAINT inventory_movements_source_check CHECK(source_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer','checkout_sale','in_store_sale'));
ALTER TABLE saas.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE saas.order_events ADD CONSTRAINT order_events_event_type_check CHECK(event_type IN('order_created','status_transition','payment_transition','shipping_updated','note_added','note_archived'));
ALTER TABLE saas.manual_order_inventory_commitments DROP CONSTRAINT manual_order_inventory_commitments_quantity_check;
ALTER TABLE saas.manual_order_inventory_commitments ADD CONSTRAINT manual_order_inventory_commitments_quantity_check CHECK(quantity BETWEEN 1 AND 9999);
DROP TRIGGER order_edit260_capture_item ON saas.order_items;
DROP TRIGGER orders_edit_cancel_event ON saas.order_events;
DROP TABLE saas.order_edit_stock_state,saas.order_edit_unmanaged_stock,saas.order_edit_contact_overrides,saas.order_edit_cost_snapshots,saas.order_edit_original_items,saas.order_edit_revisions,saas.order_edit_baselines,saas.order_edit260_restore;
DO $drop$DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE'orders_edit_%'OR proname LIKE'order_edit260_%')LOOP EXECUTE format('DROP FUNCTION %s',r.signature);END LOOP;
END $drop$;
COMMIT;
