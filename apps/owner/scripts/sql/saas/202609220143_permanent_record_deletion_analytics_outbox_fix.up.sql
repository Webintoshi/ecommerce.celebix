BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION saas.order_deletion_impact(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.orders%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.delete'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object(
    'resourceKind','order','resourceId',selected.id,'expectedVersion',selected.version,
    'confirmationLabel',selected.order_number,'effects',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('kind','order_items','count',(SELECT pg_catalog.count(*) FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','notes','count',(SELECT pg_catalog.count(*) FROM saas.order_notes WHERE store_id=p_store_id AND order_id=p_order_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','notifications','count',(SELECT pg_catalog.count(*) FROM saas.order_email_deliveries WHERE store_id=p_store_id AND order_id=p_order_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','shipping_records','count',(SELECT pg_catalog.count(*) FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','draft_links','count',(SELECT pg_catalog.count(*) FROM saas.order_drafts WHERE store_id=p_store_id AND converted_order_id=p_order_id),'disposition','detach'),
      pg_catalog.jsonb_build_object('kind','cart_links','count',(SELECT pg_catalog.count(*) FROM saas.abandoned_carts WHERE store_id=p_store_id AND recovered_order_id=p_order_id),'disposition','detach'),
      pg_catalog.jsonb_build_object('kind','analytics_events','count',(SELECT pg_catalog.count(*) FROM saas.analytics_delivery_outbox WHERE store_id=p_store_id AND order_id=p_order_id),'disposition','delete'),
      pg_catalog.jsonb_build_object('kind','external_payment','count',CASE WHEN selected.payment_status IN('processing','completed','refunded') THEN 1 ELSE 0 END,'disposition','external_unchanged'),
      pg_catalog.jsonb_build_object('kind','external_fulfillment','count',(SELECT pg_catalog.count(*) FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id AND provider_shipment_id IS NOT NULL),'disposition','external_unchanged')
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION saas.delete_order(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,
  p_fingerprint text,p_order_id uuid,p_expected_version bigint,p_confirmation text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected saas.orders%ROWTYPE; existing saas.record_deletion_operations%ROWTYPE; result jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.delete'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_confirmation IS NULL OR p_confirmation<>pg_catalog.btrim(p_confirmation)
     OR pg_catalog.char_length(p_confirmation) NOT BETWEEN 1 AND 200 OR p_confirmation~'[[:cntrl:]]'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM saas.record_deletion_operation_lock(p_store_id,p_operation_id);
  SELECT * INTO existing FROM saas.record_deletion_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.resource_kind<>'order' OR existing.resource_id<>p_order_id OR existing.request_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object(
      'resourceKind','order','resourceId',existing.resource_id,'deleted',true,
      'auditId',existing.operation_id,'replayed',true
    ); END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF selected.order_number<>p_confirmation THEN RETURN QUERY SELECT 'invalid_confirmation'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.set_config('saas.permanent_delete_order',p_store_id::text||':'||p_order_id::text,true);
  PERFORM 1 FROM saas.order_drafts WHERE store_id=p_store_id AND converted_order_id=p_order_id FOR UPDATE;
  PERFORM 1 FROM saas.abandoned_carts WHERE store_id=p_store_id AND recovered_order_id=p_order_id FOR UPDATE;
  UPDATE saas.order_drafts
  SET status='archived',converted_order_id=NULL,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND converted_order_id=p_order_id;
  UPDATE saas.abandoned_carts SET recovered_order_id=NULL WHERE store_id=p_store_id AND recovered_order_id=p_order_id;
  UPDATE saas.abandoned_cart_episodes SET linked_order_id=NULL WHERE store_id=p_store_id AND linked_order_id=p_order_id;
  DELETE FROM saas.storefront_account_order_links WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.storefront_order_receipts WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_commerce_attribution WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.manual_order_inventory_commitments WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.analytics_delivery_outbox WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_email_provider_events WHERE delivery_id IN(
    SELECT id FROM saas.order_email_deliveries WHERE store_id=p_store_id AND order_id=p_order_id
  );
  DELETE FROM saas.order_email_deliveries WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_archive_state WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_archive_operations WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_notes WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_operations WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_events WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id;
  DELETE FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_DELETION_TARGET_DISAPPEARED'; END IF;
  INSERT INTO saas.record_deletion_operations(
    store_id,operation_id,resource_kind,resource_id,principal_id,membership_id,
    committed_at,request_fingerprint,outcome,replay_count
  ) VALUES(
    p_store_id,p_operation_id,'order',p_order_id,p_principal_id,p_membership_id,
    p_now,p_fingerprint,'deleted',0
  );
  result:=pg_catalog.jsonb_build_object(
    'resourceKind','order','resourceId',p_order_id,'deleted',true,
    'auditId',p_operation_id,'replayed',false
  );
  RETURN QUERY SELECT 'deleted'::text,result;
END
$function$;

REVOKE ALL ON FUNCTION saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;

COMMIT;
