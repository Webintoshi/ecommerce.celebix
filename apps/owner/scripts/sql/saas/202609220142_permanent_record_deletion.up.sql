BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

CREATE TABLE saas.record_deletion_operations (
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  operation_id uuid NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('order', 'product', 'category')),
  resource_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES saas.principals(id),
  membership_id uuid NOT NULL REFERENCES saas.memberships(id),
  committed_at timestamptz NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome = 'deleted'),
  replay_count bigint NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  PRIMARY KEY (store_id, operation_id)
);

CREATE INDEX record_deletion_operations_resource_idx
  ON saas.record_deletion_operations(store_id, resource_kind, resource_id, committed_at DESC);

ALTER TABLE saas.record_deletion_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.record_deletion_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY record_deletion_operations_owner
  ON saas.record_deletion_operations
  TO celebix_saas_owner
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE saas.record_deletion_operations FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;

CREATE FUNCTION saas.guard_record_deletion_operation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'RECORD_DELETION_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER record_deletion_operations_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON saas.record_deletion_operations
FOR EACH STATEMENT EXECUTE FUNCTION saas.guard_record_deletion_operation_immutable();

CREATE FUNCTION saas.record_deletion_operation_lock(
  p_store_id uuid,
  p_operation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'RECORD_DELETION_OPERATION_IDENTITY_REQUIRED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.record-deletion:' || p_store_id::text || ':' || p_operation_id::text,
      0
    )
  );
END
$function$;

CREATE FUNCTION saas.record_deletion_operation_replay(
  p_store_id uuid,
  p_operation_id uuid,
  p_resource_kind text,
  p_resource_id uuid,
  p_request_fingerprint text
)
RETURNS TABLE(outcome text, audit_id uuid, replay_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  operation saas.record_deletion_operations%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_resource_id IS NULL
     OR p_resource_kind IS NULL OR p_resource_kind NOT IN ('order', 'product', 'category')
     OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::uuid, 0::bigint;
    RETURN;
  END IF;

  SELECT selected.*
  INTO operation
  FROM saas.record_deletion_operations AS selected
  WHERE selected.store_id = p_store_id
    AND selected.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_not_found'::text, NULL::uuid, 0::bigint;
    RETURN;
  END IF;

  IF operation.resource_kind <> p_resource_kind
     OR operation.resource_id <> p_resource_id
     OR operation.request_fingerprint <> p_request_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::uuid, operation.replay_count;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'operation_replayed'::text, operation.operation_id, operation.replay_count + 1;
END
$function$;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
    OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
    OR p_required_action IS NULL OR p_required_action NOT IN (
      'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','orders.delete',
      'shipping.read','shipping.manage','carts.read','carts.manage','customers.read','customers.manage','customers.archive',
      'catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete','catalog_admin.import','catalog_admin.moderate',
      'promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive',
      'marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive',
      'integrations.read','integrations.manage','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read','pricing.manage'
    ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active')
  THEN RETURN 'store_inactive'; END IF;
  SELECT membership.role INTO membership_role FROM saas.memberships membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
    AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions subscription
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.plan_features feature
    WHERE feature.plan_id=p_plan_id AND feature.enabled AND feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN (
      'orders.read','orders.fulfill','orders.note','shipping.read','shipping.manage','carts.read','customers.read',
      'customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read'
    ))
    OR (membership_role='analyst' AND p_required_action IN (
      'orders.read','shipping.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','purchasing.read','pricing.read'
    ))
  ) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END
$function$;

CREATE FUNCTION saas.permanent_order_deletion_context(p_store_id uuid,p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.current_setting('saas.permanent_delete_order',true)
    = p_store_id::text||':'||p_order_id::text
$function$;

CREATE OR REPLACE FUNCTION saas.guard_order_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' AND saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'ORDER_EVENT_IMMUTABLE';
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_order_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' AND saas.permanent_order_deletion_context(OLD.store_id,OLD.order_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'ORDER_OPERATION_IMMUTABLE';
END
$function$;

CREATE OR REPLACE FUNCTION saas.order_archive_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.current_setting('saas.permanent_delete_order',true) IS NOT NULL THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'ORDER_ARCHIVE_AUDIT_IMMUTABLE';
END
$function$;

CREATE FUNCTION saas.order_deletion_impact(
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
      pg_catalog.jsonb_build_object('kind','external_payment','count',CASE WHEN selected.payment_status IN('processing','completed','refunded') THEN 1 ELSE 0 END,'disposition','external_unchanged'),
      pg_catalog.jsonb_build_object('kind','external_fulfillment','count',(SELECT pg_catalog.count(*) FROM saas.shipping_shipments WHERE store_id=p_store_id AND order_id=p_order_id AND provider_shipment_id IS NOT NULL),'disposition','external_unchanged')
    )
  );
END
$function$;

CREATE FUNCTION saas.delete_order(
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

CREATE FUNCTION saas.delete_order_recover(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.record_deletion_operations%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.delete'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.record_deletion_operations
  WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing.resource_kind<>'order' OR existing.request_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object(
    'resourceKind','order','resourceId',existing.resource_id,'deleted',true,
    'auditId',existing.operation_id,'replayed',true
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_record_deletion_operation_immutable() FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.record_deletion_operation_lock(uuid, uuid) FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.record_deletion_operation_replay(uuid, uuid, text, uuid, text) FROM PUBLIC, celebix_saas_app, celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.permanent_order_deletion_context(uuid,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.delete_order_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.delete_order_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
