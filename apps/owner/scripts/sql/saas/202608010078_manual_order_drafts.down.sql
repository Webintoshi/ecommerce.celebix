BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $rollback_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.orders WHERE source='manual') OR EXISTS(SELECT 1 FROM saas.order_drafts) THEN
    RAISE EXCEPTION 'MANUAL_ORDER_DRAFTS_ROLLBACK_DATA_PRESENT';
  END IF;
END
$rollback_guard$;

CREATE OR REPLACE FUNCTION saas.orders_transition_status(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_expected_version bigint, p_next_status text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $function$
DECLARE authority_error text; required_action text; stored_action text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb;
BEGIN
  required_action := CASE WHEN p_next_status IN ('cancelled','refunded') THEN 'orders.manage' ELSE 'orders.fulfill' END;
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',required_action);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_next_status IS NULL OR p_next_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN
    stored_action:=CASE
      WHEN existing.operation_kind='transition_status' AND existing.result_payload->>'status' IN ('cancelled','refunded') THEN 'orders.manage'
      WHEN existing.operation_kind='transition_status' THEN 'orders.fulfill'
      WHEN existing.operation_kind='transition_payment' THEN 'orders.payment'
      WHEN existing.operation_kind='update_shipping' THEN 'orders.fulfill'
      ELSE 'orders.note'
    END;
    authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',stored_action);
    IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
    IF existing.operation_kind='transition_status' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF NOT ((current_order.status='pending' AND p_next_status IN ('confirmed','cancelled')) OR (current_order.status='confirmed' AND p_next_status IN ('preparing','cancelled')) OR (current_order.status='preparing' AND p_next_status IN ('shipped','cancelled')) OR (current_order.status='shipped' AND p_next_status='delivered') OR (current_order.status='delivered' AND p_next_status='refunded')) THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.orders SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'status_transition',current_order.status,p_next_status,'Order status changed to '||p_next_status,pg_catalog.jsonb_build_object('from',current_order.status,'to',p_next_status),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'transition_status',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

DROP FUNCTION saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb);
DROP FUNCTION saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb);
DROP FUNCTION saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,uuid);
DROP FUNCTION saas.order_drafts_detail_projection(uuid,uuid);
DROP FUNCTION saas.order_drafts_list_projection(uuid,uuid);
DROP FUNCTION saas.order_drafts_replace_lines(uuid,uuid,jsonb,timestamptz);
DROP FUNCTION saas.order_drafts_intent_valid(jsonb,boolean);
DROP TRIGGER order_draft_operations_immutable ON saas.order_draft_operations;
DROP FUNCTION saas.guard_order_draft_operation_mutation();

DROP TABLE saas.manual_order_inventory_commitments;
DROP TABLE saas.order_draft_operations;
DROP TABLE saas.order_draft_lines;
DROP TABLE saas.order_drafts;

ALTER TABLE saas.orders DROP CONSTRAINT orders_source_check;
ALTER TABLE saas.orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('storefront','quick_link','marketplace','manual_import'));

ALTER FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;

COMMIT;
