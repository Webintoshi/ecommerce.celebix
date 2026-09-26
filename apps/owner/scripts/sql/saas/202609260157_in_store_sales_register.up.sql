-- Durable manual bank-POS register. Migration 158 enables the narrow cashier role.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.in_store_migration_restore (signature text PRIMARY KEY, definition text NOT NULL);
CREATE TABLE saas.in_store_staff_grants (
 store_id uuid NOT NULL REFERENCES saas.stores(id),membership_id uuid PRIMARY KEY,
 enabled boolean NOT NULL,location_ids uuid[] NOT NULL DEFAULT '{}',
 discount_limit_bps integer NOT NULL CHECK(discount_limit_bps BETWEEN 0 AND 9999),
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id)
);
CREATE TABLE saas.in_store_sales (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),sale_number text NOT NULL,
 status text NOT NULL CHECK(status IN('draft','held','payment_pending','payment_received','completed','cancelled')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 owner_membership_id uuid NOT NULL,location_id uuid NOT NULL,location_name text NOT NULL,
 intent jsonb NOT NULL CHECK(jsonb_typeof(intent)='object'),price_provenance jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(price_provenance)='array'),items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
 subtotal_cents bigint NOT NULL CHECK(subtotal_cents BETWEEN 0 AND 9007199254740991),
 eligible_subtotal_cents bigint NOT NULL CHECK(eligible_subtotal_cents BETWEEN 0 AND subtotal_cents),
 discount_cents bigint NOT NULL CHECK(discount_cents>=0),total_cents bigint NOT NULL CHECK(total_cents=subtotal_cents-discount_cents AND total_cents>=0),
 payment_received_at timestamptz,completed_at timestamptz,order_id uuid,order_number text,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
 UNIQUE(store_id,id),UNIQUE(store_id,sale_number),
 FOREIGN KEY(store_id,owner_membership_id) REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(store_id,location_id) REFERENCES saas.inventory_locations(store_id,id),
 CONSTRAINT in_store_sales_lifecycle CHECK(
  (status IN('draft','held','payment_pending','cancelled') AND payment_received_at IS NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL)
  OR(status='payment_received' AND payment_received_at IS NOT NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL)
  OR(status='completed' AND payment_received_at IS NOT NULL AND completed_at IS NOT NULL AND order_number IS NOT NULL)
 )
);
CREATE INDEX in_store_sales_actor_list ON saas.in_store_sales(store_id,owner_membership_id,status,updated_at DESC,id DESC);
CREATE TABLE saas.in_store_payment_attestations (
 sale_id uuid PRIMARY KEY,store_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0),slip_reference text CHECK(slip_reference IS NULL OR (length(slip_reference) BETWEEN 1 AND 100 AND slip_reference=btrim(slip_reference) AND slip_reference!~'[[:cntrl:]]')),
 received_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
CREATE TABLE saas.in_store_inventory_reservations (
 id uuid PRIMARY KEY,store_id uuid NOT NULL,sale_id uuid NOT NULL,location_id uuid NOT NULL,
 product_id uuid NOT NULL,variant_id uuid NOT NULL,quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 9999),
 stock_tracked boolean NOT NULL,status text NOT NULL CHECK(status IN('held','consumed','released')),
 held_at timestamptz NOT NULL,consumed_at timestamptz,released_at timestamptz,
 updated_at timestamptz NOT NULL,version bigint NOT NULL DEFAULT 1,
 UNIQUE(sale_id,variant_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id),
 FOREIGN KEY(store_id,location_id) REFERENCES saas.inventory_locations(store_id,id)
);
CREATE INDEX in_store_reservations_held ON saas.in_store_inventory_reservations(store_id,variant_id,location_id) WHERE status='held' AND stock_tracked;
CREATE TABLE saas.in_store_operations (
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,
 sale_id uuid,operation_kind text NOT NULL,payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL,committed_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
CREATE TABLE saas.in_store_sale_events (
 id uuid PRIMARY KEY,store_id uuid NOT NULL,sale_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
 event_type text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
CREATE TABLE saas.in_store_discount_allocations (
 store_id uuid NOT NULL,sale_id uuid NOT NULL,variant_id uuid NOT NULL,order_item_id uuid NOT NULL,
 quantity integer NOT NULL,gross_cents bigint NOT NULL,discount_cents bigint NOT NULL,net_cents bigint NOT NULL,
 unit_discount_cents bigint NOT NULL,remainder_unit_count integer NOT NULL,
 PRIMARY KEY(sale_id,variant_id),UNIQUE(order_item_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id),
 CHECK(net_cents=gross_cents-discount_cents AND discount_cents>=0 AND net_cents>=0),
 CHECK(discount_cents=unit_discount_cents*quantity+remainder_unit_count AND remainder_unit_count>=0 AND remainder_unit_count<quantity)
);
-- Immutable private audit evidence for every successful payment preparation.
CREATE TABLE saas.in_store_price_snapshots (
 store_id uuid NOT NULL,sale_id uuid NOT NULL,prepare_operation_id uuid NOT NULL,variant_id uuid NOT NULL,
 provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object'),prepared_at timestamptz NOT NULL,
 PRIMARY KEY(prepare_operation_id,variant_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES saas.in_store_sales(store_id,id)
);

CREATE VIEW saas.all_inventory_reservations AS
 SELECT id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,
 held_at,consumed_at,released_at,expired_at,version,updated_at,NULL::uuid AS location_id,NULL::uuid AS sale_id,payment_attempt_id,storefront_hosted_session_id
 FROM saas.checkout_inventory_reservations
 UNION ALL
 SELECT id,store_id,NULL::uuid,NULL::uuid,product_id,variant_id,quantity,stock_tracked,status,
 held_at,consumed_at,released_at,NULL::timestamptz,version,updated_at,location_id,sale_id,NULL::uuid,NULL::uuid
 FROM saas.in_store_inventory_reservations;

CREATE FUNCTION saas.in_store_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$
BEGIN
 -- Only the existing authorized permanent-order-delete boundary can sanitize personal copies.
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('in_store_operations','in_store_payment_attestations')
  AND current_setting('saas.in_store.redact_sale',true)=OLD.store_id::text||':'||OLD.sale_id::text
  AND current_setting('saas.in_store.redact_order',true)=current_setting('saas.permanent_delete_order',true)
  AND current_setting('saas.in_store.redact_order',true) LIKE OLD.store_id::text||':%'
  AND EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=OLD.store_id AND id=OLD.sale_id AND status='completed' AND order_id IS NULL AND intent->'customerName'='null'::jsonb AND intent->'note'='null'::jsonb)
 THEN
  IF TG_TABLE_NAME='in_store_operations' THEN
   IF to_jsonb(NEW)-'result_payload'=to_jsonb(OLD)-'result_payload'
    AND NEW.result_payload=jsonb_set(jsonb_set(jsonb_set(OLD.result_payload,'{sale,customerName}','null'),'{sale,note}','null'),'{sale,orderId}','null') THEN RETURN NEW;END IF;
  ELSE
   IF to_jsonb(NEW)-'slip_reference'=to_jsonb(OLD)-'slip_reference' AND NEW.slip_reference IS NULL THEN RETURN NEW;END IF;
  END IF;
 END IF;
 RAISE EXCEPTION 'IN_STORE_IMMUTABLE';
END $fn$;
CREATE TRIGGER in_store_payment_immutable BEFORE UPDATE OR DELETE ON saas.in_store_payment_attestations FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();
CREATE TRIGGER in_store_operation_immutable BEFORE UPDATE OR DELETE ON saas.in_store_operations FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();
CREATE TRIGGER in_store_event_immutable BEFORE UPDATE OR DELETE ON saas.in_store_sale_events FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();
CREATE TRIGGER in_store_price_snapshot_immutable BEFORE UPDATE OR DELETE ON saas.in_store_price_snapshots FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();
CREATE TRIGGER in_store_discount_immutable BEFORE UPDATE OR DELETE ON saas.in_store_discount_allocations FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();

CREATE FUNCTION saas.in_store_authority_error(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_location uuid DEFAULT NULL,p_owner_only boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE actor_role text;
BEGIN
 IF p_store IS NULL OR p_principal IS NULL OR p_member IS NULL OR p_plan IS NULL OR p_code IS NULL OR p_version IS NULL OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active' AND currency='TRY') THEN RETURN 'store_inactive'; END IF;
 SELECT role INTO actor_role FROM saas.memberships WHERE id=p_member AND store_id=p_store AND principal_id=p_principal AND status='active';
 IF actor_role IS NULL OR actor_role NOT IN('store_owner','admin','cashier') OR (p_owner_only AND actor_role='cashier') THEN RETURN 'membership_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store AND s.plan_id=p_plan AND s.plan_code=p_code AND s.plan_version=p_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=p_plan AND enabled AND feature_key='orders') THEN RETURN 'feature_not_enabled'; END IF;
 IF p_location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE store_id=p_store AND id=p_location AND status='active') THEN RETURN 'inventory_conflict'; END IF;
 IF actor_role='cashier' AND NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND cardinality(location_ids)>0 AND (p_location IS NULL OR p_location=ANY(location_ids))) THEN RETURN 'membership_denied'; END IF;
 RETURN NULL;
END $fn$;
CREATE FUNCTION saas.in_store_is_manager(p_store uuid,p_member uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=p_store AND id=p_member AND status='active' AND role IN('store_owner','admin'))
$fn$;
CREATE FUNCTION saas.in_store_held_quantity(p_store uuid,p_variant uuid,p_location uuid DEFAULT NULL,p_exclude_sale uuid DEFAULT NULL) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT coalesce(sum(quantity),0)::bigint FROM saas.all_inventory_reservations WHERE store_id=p_store AND variant_id=p_variant AND status='held' AND stock_tracked AND (p_location IS NULL OR location_id=p_location) AND (p_exclude_sale IS NULL OR sale_id IS DISTINCT FROM p_exclude_sale)
$fn$;
CREATE FUNCTION saas.in_store_sales_projection(p_store uuid,p_sale uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT jsonb_build_object('id',s.id,'saleNumber',s.sale_number,'status',s.status,'version',s.version,
 'locationId',s.location_id,'locationName',s.location_name,'ownerMembershipId',s.owner_membership_id,
 'ownerLabel',coalesce(p.email,'Kasiyer'),'customerName',s.intent->'customerName','note',s.intent->'note','discount',s.intent->'discount','items',s.items,
 'totals',jsonb_build_object('subtotalCents',s.subtotal_cents,'eligibleSubtotalCents',s.eligible_subtotal_cents,'discountCents',s.discount_cents,'totalCents',s.total_cents),
 'createdAt',saas.orders_json_timestamp(s.created_at),'updatedAt',saas.orders_json_timestamp(s.updated_at),
 'paymentReceivedAt',CASE WHEN s.payment_received_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(s.payment_received_at) END,
 'completedAt',CASE WHEN s.completed_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(s.completed_at) END,
 'orderId',s.order_id,'orderNumber',s.order_number)
 FROM saas.in_store_sales s JOIN saas.memberships m ON m.store_id=s.store_id AND m.id=s.owner_membership_id JOIN saas.principals p ON p.id=m.principal_id WHERE s.store_id=p_store AND s.id=p_sale
$fn$;

-- Quote accepts only sale intent. All prices, eligibility and allocations are server-owned.
CREATE FUNCTION saas.in_store_quote(p_store uuid,p_member uuid,p_now timestamptz,p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE item jsonb; v record; price record; base_price record; provenance jsonb:='[]'; lines jsonb:='[]'; gross numeric:=0; eligible numeric:=0; deduction numeric:=0; limit_bps integer; line_gross bigint; share bigint; remainder bigint; idx integer; alloc jsonb:='[]'; eligible_line boolean;
BEGIN
 IF p_intent IS NULL OR jsonb_typeof(p_intent)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_intent))<>5 OR NOT(p_intent ?& ARRAY['locationId','items','discount','customerName','note']) OR pg_column_size(p_intent)>65536 OR jsonb_typeof(p_intent->'items')<>'array' OR jsonb_array_length(p_intent->'items')>100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF (p_intent->>'locationId')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR (p_intent->'customerName'<>'null'::jsonb AND (jsonb_typeof(p_intent->'customerName')<>'string' OR length(p_intent->>'customerName') NOT BETWEEN 1 AND 200 OR p_intent->>'customerName'<>btrim(p_intent->>'customerName') OR p_intent->>'customerName'~'[[:cntrl:]]')) OR (p_intent->'note'<>'null'::jsonb AND (jsonb_typeof(p_intent->'note')<>'string' OR length(p_intent->>'note') NOT BETWEEN 1 AND 2000 OR p_intent->>'note'<>btrim(p_intent->>'note') OR regexp_replace(p_intent->>'note',E'[\n\r\t]','','g')~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_intent->'items') e GROUP BY e->>'variantId' HAVING count(*)>1) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_intent->'items') LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR NOT(item ?& ARRAY['variantId','quantity']) OR item->>'variantId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(item->'quantity')<>'number' OR (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) OR (item->>'quantity')::numeric NOT BETWEEN 1 AND 9999 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT variant.*,product.title AS product_name,product.version AS product_version INTO v FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store AND variant.id=(item->>'variantId')::uuid AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO price FROM saas.resolve_effective_variant_price(p_store,v.id,'in_store',p_now,NULL);
  IF price.outcome<>'found' OR price.price_cents IS NULL THEN RETURN QUERY SELECT 'pricing_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT * INTO base_price FROM saas.pricing_calculate_variant_price(p_store,v.id,NULL::uuid);
  provenance:=provenance||jsonb_build_array(jsonb_build_object('variantId',v.id,'unitPriceCents',price.price_cents,'sourceKind',price.source_kind,
   'priceListId',price.price_list_id,'priceListVersion',(SELECT version FROM saas.price_lists WHERE store_id=p_store AND id=price.price_list_id),
   'variantVersion',v.version,'productVersion',v.product_version,'policyVersion',base_price.policy_version,
   'referenceSetId',base_price.trace->'setId','referenceSetVersion',(SELECT version FROM saas.pricing_reference_sets WHERE store_id=p_store AND id=(base_price.trace->>'setId')::uuid),
   'referenceStateVersion',(SELECT version FROM saas.pricing_reference_state WHERE store_id=p_store),'trace',base_price.trace));
  line_gross:=(price.price_cents::numeric*(item->>'quantity')::numeric)::bigint;gross:=gross+line_gross;
  eligible_line:=saas.pricing_variant_discount_allowed(p_store,v.id);IF eligible_line THEN eligible:=eligible+line_gross;END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',v.product_id,'variantId',v.id,'productName',v.product_name,'variantName',v.title,'sku',v.sku,'barcode',v.barcode,'imageUrl',NULL,'unitPriceCents',price.price_cents,'quantity',(item->>'quantity')::integer,'discountEligible',eligible_line,'lineSubtotalCents',line_gross,'allocatedDiscountCents',0,'lineNetCents',line_gross));
 END LOOP;
 IF gross>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_intent->'discount'<>'null'::jsonb THEN
  IF jsonb_typeof(p_intent->'discount')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_intent->'discount'))<>2 OR eligible<=0 THEN RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN; END IF;
  IF p_intent->'discount'->>'kind'='percentage' AND jsonb_typeof(p_intent->'discount'->'percentageBps')='number' AND (p_intent->'discount'->>'percentageBps')::numeric=trunc((p_intent->'discount'->>'percentageBps')::numeric) AND (p_intent->'discount'->>'percentageBps')::numeric BETWEEN 1 AND 9999 THEN deduction:=floor(eligible*(p_intent->'discount'->>'percentageBps')::numeric/10000);
  ELSIF p_intent->'discount'->>'kind'='fixed_amount' AND jsonb_typeof(p_intent->'discount'->'amountCents')='number' AND (p_intent->'discount'->>'amountCents')::numeric=trunc((p_intent->'discount'->>'amountCents')::numeric) AND (p_intent->'discount'->>'amountCents')::numeric>0 THEN deduction:=(p_intent->'discount'->>'amountCents')::numeric;
  ELSE RETURN QUERY SELECT 'discount_invalid',NULL::jsonb;RETURN;END IF;
  IF deduction>=eligible THEN RETURN QUERY SELECT 'discount_invalid',NULL::jsonb;RETURN;END IF;
  limit_bps:=9999;IF NOT saas.in_store_is_manager(p_store,p_member) THEN SELECT discount_limit_bps INTO limit_bps FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled;END IF;
  IF coalesce(limit_bps,0)=0 OR deduction>floor(eligible*limit_bps/10000) OR (p_intent->'discount'->>'kind'='percentage' AND (p_intent->'discount'->>'percentageBps')::integer>limit_bps) THEN RETURN QUERY SELECT 'discount_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 remainder:=deduction::bigint;
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  share:=CASE WHEN (item->>'discountEligible')::boolean AND eligible>0 THEN floor(deduction*(item->>'lineSubtotalCents')::numeric/eligible)::bigint ELSE 0 END;
  remainder:=remainder-share;alloc:=alloc||jsonb_build_array(item||jsonb_build_object('allocatedDiscountCents',share,'lineNetCents',(item->>'lineSubtotalCents')::bigint-share));
 END LOOP;
 idx:=0;WHILE remainder>0 AND idx<jsonb_array_length(alloc) LOOP
  item:=alloc->idx;IF (item->>'discountEligible')::boolean AND (item->>'lineSubtotalCents')::bigint>0 THEN share:=(item->>'allocatedDiscountCents')::bigint+1;alloc:=jsonb_set(alloc,ARRAY[idx::text],item||jsonb_build_object('allocatedDiscountCents',share,'lineNetCents',(item->>'lineSubtotalCents')::bigint-share));remainder:=remainder-1;END IF;idx:=idx+1;
 END LOOP;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',alloc,'priceProvenance',provenance,'subtotalCents',gross,'eligibleSubtotalCents',eligible,'discountCents',deduction,'totalCents',gross-deduction);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $fn$;

CREATE FUNCTION saas.in_store_sales_mutate(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_kind text,p_args jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','cancel','takeover') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.version<>p_expected_version OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  SELECT * INTO quote FROM saas.in_store_quote(p_store_id,p_membership_id,p_now,intent_payload);
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind<>'complete' OR selected.status<>'payment_received' THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,p_now,p_now);
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET location_id=selected_location,location_name=selected_location_name,intent=intent_payload,price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET status='payment_pending',price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status<>'payment_pending' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'slipReference') OR (p_args->'slipReference'<>'null'::jsonb AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_payment_attestations(sale_id,store_id,actor_membership_id,amount_cents,slip_reference,received_at) VALUES(p_sale_id,p_store_id,p_membership_id,selected.total_cents,p_args->>'slipReference',p_now);
  UPDATE saas.in_store_sales SET status='payment_received',payment_received_at=p_now WHERE id=p_sale_id;
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.status<>'payment_received' OR NOT EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id AND amount_cents=selected.total_cents) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,selected.sale_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at);
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod','manual_bank_pos'),p_now);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=selected.sale_number WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft' WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status='completed' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;
END $fn$;

CREATE FUNCTION saas.in_store_sales_create(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,NULL::bigint,'create',jsonb_build_object('intent',p_intent))
$fn$;

CREATE FUNCTION saas.in_store_sales_update(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'update',jsonb_build_object('intent',p_intent))
$fn$;

CREATE FUNCTION saas.in_store_sales_hold(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_held boolean) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'hold',jsonb_build_object('held',p_held))
$fn$;

CREATE FUNCTION saas.in_store_sales_prepare(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_expected_total bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'prepare',jsonb_build_object('expectedTotalCents',p_expected_total))
$fn$;

CREATE FUNCTION saas.in_store_sales_confirm_payment(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_slip_reference text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'confirm_payment',jsonb_build_object('slipReference',p_slip_reference))
$fn$;

CREATE FUNCTION saas.in_store_sales_complete(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'complete','{}'::jsonb)
$fn$;

CREATE FUNCTION saas.in_store_sales_cancel(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_confirm_unpaid boolean) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'cancel',jsonb_build_object('confirmUnpaid',p_confirm_unpaid))
$fn$;

CREATE FUNCTION saas.in_store_sales_takeover(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'takeover','{}'::jsonb)
$fn$;

CREATE FUNCTION saas.in_store_sales_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_sale_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;selected saas.in_store_sales%ROWTYPE;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF selected.owner_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.in_store_sales_projection(p_store_id,p_sale_id);
END $fn$;
CREATE FUNCTION saas.in_store_sales_get_operation(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_expected_fingerprint text DEFAULT NULL)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=prior.result_payload||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $fn$;
CREATE FUNCTION saas.in_store_sales_search_products(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_location_id uuid,p_barcode text,p_query text,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_location_id);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR (p_barcode IS NULL)=(p_query IS NULL) OR (p_barcode IS NOT NULL AND (length(p_barcode) NOT BETWEEN 1 AND 128 OR p_barcode<>btrim(p_barcode) OR p_barcode~'[[:cntrl:]]')) OR (p_query IS NOT NULL AND (length(p_query) NOT BETWEEN 1 AND 100 OR p_query<>btrim(p_query) OR p_query~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_barcode IS NOT NULL AND (SELECT count(*) FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store_id AND v.status='active' AND p.status='active' AND v.barcode=p_barcode)>1 THEN RETURN QUERY SELECT 'ambiguous_barcode',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('products',coalesce(jsonb_agg(jsonb_build_object(
  'productId',v.product_id,'variantId',v.id,'productName',v.product_name,'variantName',v.title,'sku',v.sku,'barcode',v.barcode,'imageUrl',NULL,
  'unitPriceCents',CASE WHEN price.outcome='found' THEN price.price_cents ELSE NULL END,'pricingUnavailable',price.outcome<>'found' OR price.price_cents IS NULL,
  'availableQuantity',CASE WHEN v.stock_tracking THEN greatest(0,least(coalesce(b.quantity,0)-saas.in_store_held_quantity(p_store_id,v.id,p_location_id),v.stock_quantity-saas.in_store_held_quantity(p_store_id,v.id))) ELSE 2147483647 END,
  'stockTracking',v.stock_tracking,'discountEligible',saas.pricing_variant_discount_allowed(p_store_id,v.id)) ORDER BY v.product_name,v.title,v.id),'[]'::jsonb))
 FROM (SELECT variant.*,product.title AS product_name FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store_id AND variant.status='active' AND product.status='active' AND ((p_barcode IS NOT NULL AND variant.barcode=p_barcode) OR (p_query IS NOT NULL AND (strpos(lower(product.title),lower(p_query))>0 OR strpos(lower(variant.title),lower(p_query))>0 OR strpos(lower(coalesce(variant.sku,'')),lower(p_query))>0))) ORDER BY product.title,variant.title,variant.id LIMIT p_limit) v
 LEFT JOIN saas.inventory_balances b ON b.store_id=p_store_id AND b.location_id=p_location_id AND b.variant_id=v.id
 CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,v.id,'in_store',p_now,NULL) price;
END $fn$;
CREATE INDEX product_variants_exact_barcode_idx ON saas.product_variants(store_id,barcode,id) WHERE status='active' AND barcode IS NOT NULL;
CREATE FUNCTION saas.in_store_sales_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_page_size integer,p_cursor text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;manager boolean;cursor_time timestamptz;cursor_id uuid;rows jsonb;next_cursor text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_status IS NULL OR p_status NOT IN('draft','held','pending','completed') OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_cursor IS NOT NULL THEN
  IF length(p_cursor)>100 OR split_part(p_cursor,'|',3)<>'' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  BEGIN cursor_time:=split_part(p_cursor,'|',1)::timestamptz;cursor_id:=split_part(p_cursor,'|',2)::uuid;EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
  IF cursor_time IS NULL OR NOT isfinite(cursor_time) OR cursor_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 SELECT coalesce(jsonb_agg(saas.in_store_sales_projection(p_store_id,id) ORDER BY updated_at DESC,id DESC),'[]'::jsonb) INTO rows FROM (SELECT id,updated_at FROM saas.in_store_sales WHERE store_id=p_store_id AND (manager OR owner_membership_id=p_membership_id) AND (status=p_status OR p_status='pending' AND status IN('payment_pending','payment_received')) AND (p_cursor IS NULL OR (updated_at,id)<(cursor_time,cursor_id)) ORDER BY updated_at DESC,id DESC LIMIT p_page_size+1) s;
 IF jsonb_array_length(rows)>p_page_size THEN rows:=rows-(p_page_size);next_cursor:=(rows->(p_page_size-1)->>'updatedAt')||'|'||(rows->(p_page_size-1)->>'id');END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('sales',rows,'nextCursor',next_cursor);
END $fn$;
CREATE FUNCTION saas.in_store_sales_bootstrap(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;manager boolean;cap integer;active jsonb;held jsonb;pending jsonb;recent jsonb;locations jsonb;summary jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);cap:=9999;
 IF NOT manager THEN SELECT discount_limit_bps INTO cap FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled;END IF;
 SELECT saas.in_store_sales_projection(p_store_id,id) INTO active FROM saas.in_store_sales WHERE store_id=p_store_id AND owner_membership_id=p_membership_id AND status='draft' ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT listing.result_payload->'sales' INTO held FROM saas.in_store_sales_list(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'held',50,NULL) listing;
 SELECT listing.result_payload->'sales' INTO pending FROM saas.in_store_sales_list(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'pending',50,NULL) listing;
 SELECT listing.result_payload->'sales' INTO recent FROM saas.in_store_sales_list(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'completed',10,NULL) listing;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'isDefault',l.is_default) ORDER BY l.is_default DESC,l.name,l.id),'[]'::jsonb) INTO locations FROM saas.inventory_locations l WHERE l.store_id=p_store_id AND l.status='active' AND (manager OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants g WHERE g.store_id=p_store_id AND g.membership_id=p_membership_id AND g.enabled AND l.id=ANY(g.location_ids)));
 SELECT jsonb_build_object('completedCount',count(*) FILTER(WHERE status='completed'),'grossCents',coalesce(sum(subtotal_cents) FILTER(WHERE status='completed'),0),'discountCents',coalesce(sum(discount_cents) FILTER(WHERE status='completed'),0),'netCents',coalesce(sum(total_cents) FILTER(WHERE status='completed'),0),'pendingPaymentCount',count(*) FILTER(WHERE status IN('payment_pending','payment_received'))) INTO summary FROM saas.in_store_sales WHERE store_id=p_store_id AND (manager OR owner_membership_id=p_membership_id) AND (status IN('payment_pending','payment_received') OR completed_at>=date_trunc('day',p_now AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul');
 RETURN QUERY SELECT 'found',jsonb_build_object('scopeKey',p_store_id::text||':'||p_membership_id::text,'locations',locations,'permissions',jsonb_build_object('canSell',true,'canDiscount',coalesce(cap,0)>0,'discountLimitBps',coalesce(cap,0),'canResolve',manager,'canManageStaff',manager),'activeDraft',active,'heldSales',held,'pendingSales',pending,'recentSales',recent,'summary',summary);
END $fn$;
CREATE FUNCTION saas.in_store_staff_projection(p_store uuid,p_member uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT jsonb_build_object('membershipId',m.id,'label',coalesce(p.email,'Kasiyer'),'role',m.role,'enabled',coalesce(g.enabled,false),'locationIds',to_jsonb(coalesce(g.location_ids,'{}'::uuid[])),'discountLimitBps',coalesce(g.discount_limit_bps,0),'version',coalesce(g.version,0)) FROM saas.memberships m JOIN saas.principals p ON p.id=m.principal_id LEFT JOIN saas.in_store_staff_grants g ON g.store_id=m.store_id AND g.membership_id=m.id WHERE m.store_id=p_store AND m.id=p_member
$fn$;
CREATE FUNCTION saas.in_store_sales_list_staff(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('staff',coalesce(jsonb_agg(saas.in_store_staff_projection(p_store_id,m.id) ORDER BY m.id),'[]'::jsonb)) FROM (SELECT id FROM saas.memberships WHERE store_id=p_store_id AND status='active' ORDER BY id LIMIT 100) m;
END $fn$;
CREATE FUNCTION saas.in_store_sales_recover_staff(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload;
END $fn$;

CREATE FUNCTION saas.in_store_sales_set_staff(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_target_member uuid,p_expected_version bigint,p_enabled boolean,p_locations uuid[],p_discount_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;current_version bigint;projected jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_target_member IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_enabled IS NULL OR p_locations IS NULL OR cardinality(p_locations)>100 OR array_position(p_locations,NULL) IS NOT NULL OR p_discount_limit IS NULL OR p_discount_limit NOT BETWEEN 0 AND 9999 OR cardinality(p_locations)<>(SELECT count(DISTINCT id) FROM unnest(p_locations) id) OR (p_enabled AND cardinality(p_locations)=0) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id=p_store_id AND prior.operation_kind='set_staff' AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role IN('store_owner','admin','cashier')) OR EXISTS(SELECT 1 FROM unnest(p_locations) assigned(id) WHERE NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE id=assigned.id AND store_id=p_store_id AND status='active')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_target_member FOR UPDATE;
 IF coalesce(current_version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.in_store_staff_grants VALUES(p_store_id,p_target_member,p_enabled,p_locations,p_discount_limit,1,p_now)
 ON CONFLICT(membership_id) DO UPDATE SET enabled=excluded.enabled,location_ids=excluded.location_ids,discount_limit_bps=excluded.discount_limit_bps,version=saas.in_store_staff_grants.version+1,updated_at=p_now;
 projected:=saas.in_store_staff_projection(p_store_id,p_target_member);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,NULL,'set_staff',p_fingerprint,projected,p_now);
 RETURN QUERY SELECT 'committed',projected;
END $fn$;

ALTER TABLE saas.orders DROP CONSTRAINT orders_source_check;
ALTER TABLE saas.orders ADD CONSTRAINT orders_source_check CHECK(source IN('storefront','quick_link','marketplace','manual_import','manual','in_store'));
ALTER TABLE saas.orders ALTER COLUMN customer_name DROP NOT NULL,ALTER COLUMN customer_email DROP NOT NULL,ALTER COLUMN shipping_address DROP NOT NULL;
ALTER TABLE saas.orders ADD CONSTRAINT orders_non_store_customer_check CHECK(source='in_store' OR (customer_name IS NOT NULL AND customer_email IS NOT NULL AND shipping_address IS NOT NULL));
ALTER TABLE saas.price_list_rules DROP CONSTRAINT price_list_rules_channel_check;
ALTER TABLE saas.price_list_rules ADD CONSTRAINT price_list_rules_channel_check CHECK(channel IN('storefront','quick_order','in_store'));
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_kind_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_kind_check CHECK(movement_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer_out','transfer_in','transfer_return','checkout_sale','in_store_sale'));
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_source_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_source_check CHECK(source_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer','checkout_sale','in_store_sale'));

CREATE FUNCTION saas.in_store_inventory_balance_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE total_after bigint;active_location boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.quantity>=OLD.quantity THEN RETURN NEW;END IF;
 SELECT status='active' INTO active_location FROM saas.inventory_locations WHERE store_id=OLD.store_id AND id=OLD.location_id;
 IF coalesce(CASE WHEN TG_OP='DELETE' THEN 0 ELSE NEW.quantity END,0)<saas.in_store_held_quantity(OLD.store_id,OLD.variant_id,OLD.location_id) THEN RAISE check_violation USING MESSAGE='INVENTORY_LOCATION_ACTIVE_HOLD_VIOLATION';END IF;
 IF active_location THEN
  total_after:=saas.inventory_active_balance_total(OLD.store_id,OLD.variant_id)-OLD.quantity+CASE WHEN TG_OP='DELETE' THEN 0 ELSE NEW.quantity END;
  IF total_after<saas.in_store_held_quantity(OLD.store_id,OLD.variant_id) THEN RAISE check_violation USING MESSAGE='INVENTORY_ACTIVE_HOLD_VIOLATION';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $fn$;
CREATE TRIGGER in_store_inventory_balance_guard BEFORE UPDATE OF quantity OR DELETE ON saas.inventory_balances FOR EACH ROW EXECUTE FUNCTION saas.in_store_inventory_balance_guard();
CREATE FUNCTION saas.in_store_catalog_hold_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 IF TG_TABLE_NAME='inventory_locations' THEN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations WHERE store_id=OLD.store_id AND location_id=OLD.id AND status='held') THEN RAISE check_violation USING MESSAGE='INVENTORY_LOCATION_ACTIVE_HOLD_VIOLATION';END IF;
 ELSIF TG_TABLE_NAME='product_variants' THEN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.stock_tracking=OLD.stock_tracking THEN RETURN NEW;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations WHERE store_id=OLD.store_id AND variant_id=OLD.id AND status='held') THEN RAISE check_violation USING MESSAGE='INVENTORY_ACTIVE_HOLD_VIOLATION';END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations WHERE store_id=OLD.store_id AND product_id=OLD.id AND status='held') THEN RAISE check_violation USING MESSAGE='INVENTORY_ACTIVE_HOLD_VIOLATION';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $fn$;
CREATE TRIGGER in_store_location_hold_guard BEFORE UPDATE OF status OR DELETE ON saas.inventory_locations FOR EACH ROW EXECUTE FUNCTION saas.in_store_catalog_hold_guard();
CREATE TRIGGER in_store_product_hold_guard BEFORE UPDATE OF status OR DELETE ON saas.products FOR EACH ROW EXECUTE FUNCTION saas.in_store_catalog_hold_guard();
CREATE TRIGGER in_store_variant_hold_guard BEFORE UPDATE OF status,stock_tracking OR DELETE ON saas.product_variants FOR EACH ROW EXECUTE FUNCTION saas.in_store_catalog_hold_guard();
-- Final hold admission protects every existing online provider path, including gifts.
CREATE FUNCTION saas.in_store_reservation_admission_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE stock bigint;held bigint;location_stock bigint;
BEGIN
 IF NEW.status<>'held' OR NOT NEW.stock_tracked THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||NEW.store_id::text,0));
 SELECT stock_quantity INTO stock FROM saas.product_variants WHERE store_id=NEW.store_id AND id=NEW.variant_id FOR UPDATE;
 SELECT coalesce(sum(quantity),0)::bigint INTO held FROM saas.all_inventory_reservations WHERE store_id=NEW.store_id AND variant_id=NEW.variant_id AND status='held' AND stock_tracked AND id<>NEW.id;
 IF stock IS NULL OR stock-held<NEW.quantity THEN RAISE check_violation USING MESSAGE='INVENTORY_ACTIVE_HOLD_VIOLATION';END IF;
 IF TG_TABLE_NAME='in_store_inventory_reservations' THEN
  SELECT quantity INTO location_stock FROM saas.inventory_balances WHERE store_id=NEW.store_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id;
  SELECT coalesce(sum(quantity),0)::bigint INTO held FROM saas.in_store_inventory_reservations WHERE store_id=NEW.store_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id AND status='held' AND stock_tracked AND id<>NEW.id;
  IF coalesce(location_stock,0)-held<NEW.quantity THEN RAISE check_violation USING MESSAGE='INVENTORY_LOCATION_ACTIVE_HOLD_VIOLATION';END IF;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER in_store_online_hold_admission BEFORE INSERT OR UPDATE OF quantity,status,stock_tracked ON saas.checkout_inventory_reservations FOR EACH ROW EXECUTE FUNCTION saas.in_store_reservation_admission_guard();
CREATE TRIGGER in_store_pos_hold_admission BEFORE INSERT OR UPDATE OF quantity,status,stock_tracked ON saas.in_store_inventory_reservations FOR EACH ROW EXECUTE FUNCTION saas.in_store_reservation_admission_guard();

CREATE FUNCTION saas.in_store_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 IF OLD.source='in_store' AND (NEW.source<>OLD.source OR NEW.status<>OLD.status OR NEW.payment_status<>OLD.payment_status OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address OR NEW.tracking IS DISTINCT FROM OLD.tracking OR NEW.subtotal_cents<>OLD.subtotal_cents OR NEW.discount_cents<>OLD.discount_cents OR NEW.total_cents<>OLD.total_cents) THEN RAISE check_violation USING MESSAGE='IN_STORE_ORDER_IMMUTABLE';END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER in_store_order_guard BEFORE UPDATE ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.in_store_order_guard();
CREATE FUNCTION saas.in_store_order_tombstone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_sale uuid;
BEGIN
 SELECT id INTO selected_sale FROM saas.in_store_sales WHERE store_id=OLD.store_id AND order_id=OLD.id AND status='completed' FOR UPDATE;
 IF selected_sale IS NULL THEN RETURN OLD;END IF;
 IF NOT saas.permanent_order_deletion_context(OLD.store_id,OLD.id) THEN RAISE EXCEPTION 'IN_STORE_PERMANENT_DELETE_CONTEXT_REQUIRED';END IF;
 PERFORM set_config('saas.in_store.redact_sale',OLD.store_id::text||':'||selected_sale::text,true);
 PERFORM set_config('saas.in_store.redact_order',OLD.store_id::text||':'||OLD.id::text,true);
 UPDATE saas.in_store_sales SET order_id=NULL,intent=jsonb_set(jsonb_set(intent,'{customerName}','null'),'{note}','null'),version=version+1,updated_at=greatest(updated_at,date_trunc('milliseconds',clock_timestamp())) WHERE id=selected_sale;
 UPDATE saas.in_store_operations SET result_payload=jsonb_set(jsonb_set(jsonb_set(result_payload,'{sale,customerName}','null'),'{sale,note}','null'),'{sale,orderId}','null') WHERE store_id=OLD.store_id AND sale_id=selected_sale;
 UPDATE saas.in_store_payment_attestations SET slip_reference=NULL WHERE store_id=OLD.store_id AND sale_id=selected_sale AND slip_reference IS NOT NULL;
 PERFORM set_config('saas.in_store.redact_sale','',true);PERFORM set_config('saas.in_store.redact_order','',true);
 RETURN OLD;
END $fn$;
CREATE TRIGGER in_store_order_tombstone AFTER DELETE ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.in_store_order_tombstone();
CREATE FUNCTION saas.in_store_order_item_net(p_item uuid,p_gross bigint) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT coalesce((SELECT net_cents FROM saas.in_store_discount_allocations WHERE order_item_id=p_item),p_gross)
$fn$;

-- Capture exact previous definitions for checked, fail-closed rollback. Patch only read-side
-- reservation aggregates; checkout writes and expiry lifecycle stay on their existing table.
DO $patch$
DECLARE fn record;original text;changed text;
BEGIN
 FOR fn IN SELECT p.oid,p.proname,p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.prokind='f' AND p.proname NOT LIKE 'in_store_%' LOOP
  original:=pg_get_functiondef(fn.oid);changed:=original;
  IF fn.proname IN('resolve_effective_variant_price','price_list_rules_valid','price_lists_preview','pricing_preview') OR (fn.proname LIKE 'pricing_%' AND original LIKE '%channel%NOT IN%storefront%quick_order%') THEN
   changed:=replace(changed,'''storefront'',''quick_order''','''storefront'',''quick_order'',''in_store''');
   changed:=replace(changed,'''storefront'', ''quick_order''','''storefront'', ''quick_order'', ''in_store''');
   changed:=replace(changed,'p_channel=''storefront'' AND p_customer_email IS NOT NULL','p_channel IN (''storefront'',''in_store'') AND p_customer_email IS NOT NULL');
  END IF;
  IF fn.proname='pricing_variant_policy_preview' THEN changed:=replace(changed,$replacement$p_channel IS DISTINCT FROM 'storefront'$replacement$,$replacement$(p_channel IS NULL OR p_channel NOT IN('storefront','quick_order','in_store'))$replacement$);END IF;
  IF fn.proname='inventory_reconcile_variant_delta' THEN
   changed:=replace(changed,'FROM saas.checkout_inventory_reservations AS reservation','FROM saas.all_inventory_reservations AS reservation');
   changed:=replace(changed,'consumed:=LEAST(remaining,balance_record.quantity);','consumed:=LEAST(remaining,GREATEST(0,balance_record.quantity-saas.in_store_held_quantity(p_store_id,p_variant_id,balance_record.location_id)));');
  ELSIF fn.proname LIKE 'checkout%begin%' OR fn.proname IN('inventory_counts_commit','inventory_transfers_dispatch') THEN
   changed:=replace(changed,'FROM saas.checkout_inventory_reservations AS reservation','FROM saas.all_inventory_reservations AS reservation');
  END IF;
  changed:=regexp_replace(changed,'(SELECT[^;]{0,255}?(?:sum|SUM)\(reservation[.]quantity[^;]{0,255}?FROM[[:space:]]+)saas[.]checkout_inventory_reservations','\1saas.all_inventory_reservations','g');
  IF fn.proname='inventory_counts_commit' THEN
   IF position($replacement$  UPDATE saas.inventory_balances AS balance
  SET quantity=line.counted_quantity,$replacement$ IN changed)=0 THEN RAISE EXCEPTION 'IN_STORE_COUNT_LOCATION_PRECHECK_ANCHOR_MISSING';END IF;
   changed:=replace(changed,$replacement$  UPDATE saas.inventory_balances AS balance
  SET quantity=line.counted_quantity,$replacement$,$replacement$  IF EXISTS(
    SELECT 1 FROM saas.inventory_count_lines AS line
    WHERE line.store_id=p_store_id AND line.inventory_count_id=p_count_id
      AND line.counted_quantity<saas.in_store_held_quantity(p_store_id,line.variant_id,current_count.location_id)
  ) THEN
    RETURN QUERY SELECT 'active_hold_conflict',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.inventory_balances AS balance
  SET quantity=line.counted_quantity,$replacement$);
  ELSIF fn.proname='inventory_transfers_dispatch' THEN
   IF position($replacement$  UPDATE saas.inventory_balances AS balance
  SET quantity=balance.quantity-line.quantity,$replacement$ IN changed)=0 THEN RAISE EXCEPTION 'IN_STORE_TRANSFER_LOCATION_PRECHECK_ANCHOR_MISSING';END IF;
   changed:=replace(changed,$replacement$  UPDATE saas.inventory_balances AS balance
  SET quantity=balance.quantity-line.quantity,$replacement$,$replacement$  IF EXISTS(
    SELECT 1 FROM saas.inventory_transfer_lines AS line
    JOIN saas.inventory_balances AS balance
      ON balance.store_id=line.store_id
     AND balance.location_id=current_transfer.source_location_id
     AND balance.variant_id=line.variant_id
    WHERE line.store_id=p_store_id AND line.inventory_transfer_id=p_transfer_id
      AND balance.quantity-line.quantity<saas.in_store_held_quantity(p_store_id,line.variant_id,current_transfer.source_location_id)
  ) THEN
    RETURN QUERY SELECT 'active_hold_conflict',NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.inventory_balances AS balance
  SET quantity=balance.quantity-line.quantity,$replacement$);
  END IF;
  IF fn.proname='storefront_available_stock' THEN changed:=replace(changed,'(reservation.attempt_id IS NOT NULL AND EXISTS(', '(reservation.sale_id IS NOT NULL) OR (reservation.attempt_id IS NOT NULL AND EXISTS(');END IF;
  IF original LIKE '%SUM(item.line_total_cents)%' OR original LIKE '%sum(item.line_total_cents)%' THEN
   changed:=replace(changed,'SUM(item.line_total_cents)','SUM(saas.in_store_order_item_net(item.id,item.line_total_cents))');
   changed:=replace(changed,'sum(item.line_total_cents)','sum(saas.in_store_order_item_net(item.id,item.line_total_cents))');
  END IF;
  IF fn.proname='order_email_enqueue' THEN changed:=replace(changed,'  delivery_id:=', $replacement$  IF NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id AND customer_email IS NOT NULL) AND p_recipient_kind='customer' THEN RETURN;END IF;
  delivery_id:=$replacement$);END IF;
  IF fn.proname IN('public_storefront_hosted_checkout_begin','public_storefront_hosted_checkout_begin_v2') THEN
   changed:=replace(changed,$replacement$'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));$replacement$, $replacement$'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||$replacement$||CASE WHEN fn.proname='public_storefront_hosted_checkout_begin' THEN 'selected_store' ELSE 'v_store_id' END||$replacement$::text,0));$replacement$);
  ELSIF fn.proname='storefront_checkout_begin_hosted' THEN
   changed:=replace(changed,$replacement$  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);$replacement$,$replacement$  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||selected_store_id::text,0));$replacement$);
  END IF;
  IF fn.proname IN('orders_detail_projection','orders_list') THEN
   -- Preserve mandatory nullable customer/address fields after existing strip-null projection.
   changed:=replace(changed,$replacement$'shippingAddress', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object($replacement$,$replacement$'shippingAddress', CASE WHEN selected_order.shipping_address IS NULL THEN NULL ELSE pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object($replacement$);
   changed:=replace(changed,$replacement$'country',selected_order.shipping_address->>'country'
    )),$replacement$,$replacement$'country',selected_order.shipping_address->>'country'
    )) END,$replacement$);
   changed:=replace(changed,$replacement$  ))
  FROM saas.orders AS selected_order$replacement$,$replacement$  )) || CASE WHEN selected_order.source='in_store' THEN pg_catalog.jsonb_build_object('customerName',selected_order.customer_name,'customerEmail',selected_order.customer_email,'shippingAddress',NULL) ELSE '{}'::jsonb END
  FROM saas.orders AS selected_order$replacement$);
  END IF;
  IF fn.proname IN('orders_transition_status','orders_transition_payment','orders_update_shipping') THEN
   changed:=replace(changed,$replacement$  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;$replacement$,$replacement$  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.source='in_store' THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;$replacement$);
  END IF;
  IF changed<>original THEN INSERT INTO saas.in_store_migration_restore VALUES(fn.signature,original);EXECUTE changed;END IF;
 END LOOP;
END $patch$;

DO $seal$
DECLARE table_name text;fn record;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['in_store_migration_restore','in_store_staff_grants','in_store_sales','in_store_payment_attestations','in_store_inventory_reservations','in_store_operations','in_store_sale_events','in_store_discount_allocations','in_store_price_snapshots'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY in_store_owner_only ON saas.%I TO celebix_saas_owner USING (true) WITH CHECK (true)',table_name);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',table_name);
 END LOOP;
 REVOKE ALL ON saas.all_inventory_reservations FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
 FOR fn IN SELECT p.oid::regprocedure::text AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'in_store_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',fn.signature);
  IF fn.proname IN('in_store_sales_bootstrap','in_store_sales_search_products','in_store_sales_list','in_store_sales_get','in_store_sales_get_operation','in_store_sales_create','in_store_sales_update','in_store_sales_hold','in_store_sales_prepare','in_store_sales_confirm_payment','in_store_sales_complete','in_store_sales_cancel','in_store_sales_takeover','in_store_sales_list_staff','in_store_sales_set_staff','in_store_sales_recover_staff') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',fn.signature);END IF;
 END LOOP;
END $seal$;
COMMIT;
