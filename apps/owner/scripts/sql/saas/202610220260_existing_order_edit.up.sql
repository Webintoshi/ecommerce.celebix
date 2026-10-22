-- Existing orders are revised atomically. Original payments, sale snapshots and
-- inventory evidence remain intact; this boundary never executes a payment.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));

CREATE TABLE saas.order_edit260_restore(signature text PRIMARY KEY,definition text NOT NULL,before_hash text NOT NULL,after_hash text,function_owner oid NOT NULL,function_acl aclitem[]);
DO $predecessors$DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
 ('saas.in_store_order_guard()','2e237a5b2dc4a5859cc0f5fd471695b9ddce5c2bbcdea55598e5c95b0c949056'),
 ('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','adee19ea63fa7e6da4fcc9b121e1fda1d0cc7aad88a71ec2d5c40b7f94c541a2'),
 ('saas.pricing_manual_order_item_guard()','9904762899bda327d7c22dce4cf8b03b2b01979e3a8f723208b9a4751d94dec8'),
 ('saas.in_store_order_item_net(uuid,bigint)','eca64c8af31dcef3aeb2f100924314369dbe3ac470fb98a1684f18ad72a6ce55'),
 ('saas.orders_detail_projection_v2(uuid,uuid)','1196e4279c4c4bbe7c0d31846562617cb108c5dedd337d33562bf5e949f28929'),
 ('saas.accounting_web_payment_evidence(uuid)','42ff066a0797310e3df1f941493b2435b36b013bd02d120dfb039adad0936f76'),
 ('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)','0ddb22bcbccaf7f27fd36da1ce2a9f2f74be0986ad6c4d39a0a5efd0a5574d77'),
 ('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)','b0f616812582cbf4f78e79ccde20a48dbbdbc58b9916669d7d229751f9b755d7'),
 ('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)','f34ea324c4217a9123cac4ee3c09d387d06a92e618b65b5ecd9cc789114690d5'),
 ('saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)','c3bda68f3696db6b7fd83d049177508e5991ebe643430faa3bb19824f573bda0'),
 ('saas.accounting_commission251_balance_projection(uuid,uuid)','d76d2b89cf861f8a5f8286654e2689dcbb655f8305b0cb812cf8ff170dd520d7')
 )x(signature,hash)LOOP
  SELECT f.*,pg_get_functiondef(f.oid)definition INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(p.definition,'UTF8')),'hex')<>r.hash OR p.proowner<>'celebix_saas_owner'::regrole THEN RAISE EXCEPTION 'ORDER_EDIT260_PREDECESSOR_DRIFT:%',r.signature;END IF;
  INSERT INTO saas.order_edit260_restore VALUES(r.signature,p.definition,r.hash,r.hash,p.proowner,p.proacl);
 END LOOP;
END $predecessors$;
CREATE FUNCTION saas.order_edit260_patch(p_signature text,p_from text,p_to text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE saved saas.order_edit260_restore%ROWTYPE;definition text;BEGIN
 SELECT * INTO STRICT saved FROM saas.order_edit260_restore WHERE signature=p_signature;
 definition:=pg_get_functiondef(to_regprocedure(p_signature));
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>saved.after_hash OR position(p_from IN definition)=0 THEN RAISE EXCEPTION 'ORDER_EDIT260_PATCH_DRIFT:%',p_signature;END IF;
 EXECUTE replace(definition,p_from,p_to);
 UPDATE saas.order_edit260_restore SET after_hash=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(p_signature)),'UTF8')),'hex')WHERE signature=p_signature;
END $f$;
CREATE FUNCTION saas.order_edit260_patch_many(p_signature text,p_changes jsonb)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE saved saas.order_edit260_restore%ROWTYPE;definition text;change jsonb;BEGIN
 SELECT * INTO STRICT saved FROM saas.order_edit260_restore WHERE signature=p_signature;definition:=pg_get_functiondef(to_regprocedure(p_signature));
 IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>saved.after_hash THEN RAISE EXCEPTION 'ORDER_EDIT260_PATCH_DRIFT:%',p_signature;END IF;
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes)LOOP IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'ORDER_EDIT260_PATCH_ANCHOR:%',p_signature;END IF;definition:=replace(definition,change->>0,change->>1);END LOOP;
 EXECUTE definition;UPDATE saas.order_edit260_restore SET after_hash=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(p_signature)),'UTF8')),'hex')WHERE signature=p_signature;
END $f$;
CREATE TABLE saas.order_edit_baselines(
 store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,
 original_payload jsonb NOT NULL,original_finance jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,order_id)
);
CREATE TABLE saas.order_edit_revisions(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
 before_payload jsonb NOT NULL,after_payload jsonb NOT NULL,preview jsonb NOT NULL,result_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL,FOREIGN KEY(store_id,actor_membership_id)REFERENCES saas.memberships(store_id,id)
);
CREATE INDEX order_edit_revisions_order ON saas.order_edit_revisions(store_id,order_id,created_at,operation_id);
-- Historical promotion and review references identify the original line, even
-- after that line is removed from the current order.
CREATE TABLE saas.order_edit_original_items(LIKE saas.order_items INCLUDING DEFAULTS);
ALTER TABLE saas.order_edit_original_items ADD PRIMARY KEY(id),ADD UNIQUE(store_id,order_id,id);
INSERT INTO saas.order_edit_original_items SELECT * FROM saas.order_items;
ALTER TABLE saas.order_discount_allocations DROP CONSTRAINT order_discount_allocations_line_store_fk;
ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_line_store_fk FOREIGN KEY(store_id,order_id,line_id)REFERENCES saas.order_edit_original_items(store_id,order_id,id);
ALTER TABLE saas.review_collection_requests DROP CONSTRAINT review_collection_requests_order_item_id_fkey;
ALTER TABLE saas.review_collection_requests ADD CONSTRAINT review_collection_requests_order_item_id_fkey FOREIGN KEY(order_item_id)REFERENCES saas.order_edit_original_items(id);
ALTER TABLE saas.shipping_shipment_items DROP CONSTRAINT shipping_shipment_items_order_item_fk;
ALTER TABLE saas.shipping_shipment_items ADD CONSTRAINT shipping_shipment_items_order_item_fk FOREIGN KEY(store_id,order_id,order_item_id)REFERENCES saas.order_edit_original_items(store_id,order_id,id);
ALTER TABLE saas.order_items DROP CONSTRAINT order_items_store_id_order_id_position_key;
ALTER TABLE saas.order_items ADD CONSTRAINT order_items_store_id_order_id_position_key UNIQUE(store_id,order_id,position)DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE saas.inventory_movements DROP CONSTRAINT inventory_movements_kind_check,DROP CONSTRAINT inventory_movements_source_check;
ALTER TABLE saas.inventory_movements ADD CONSTRAINT inventory_movements_kind_check CHECK(movement_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer_out','transfer_in','transfer_return','checkout_sale','in_store_sale','order_edit')),
 ADD CONSTRAINT inventory_movements_source_check CHECK(source_kind IN('opening','catalog_adjustment','purchase_receipt','count_adjustment','transfer','checkout_sale','in_store_sale','order_edit'));
ALTER TABLE saas.order_events DROP CONSTRAINT order_events_event_type_check;
ALTER TABLE saas.order_events ADD CONSTRAINT order_events_event_type_check CHECK(event_type IN('order_created','status_transition','payment_transition','shipping_updated','note_added','note_archived','order_edited'));
ALTER TABLE saas.manual_order_inventory_commitments DROP CONSTRAINT manual_order_inventory_commitments_quantity_check;
ALTER TABLE saas.manual_order_inventory_commitments ADD CONSTRAINT manual_order_inventory_commitments_quantity_check CHECK(quantity BETWEEN 1 AND 2147483647);
CREATE TABLE saas.order_edit_stock_state(
 store_id uuid NOT NULL,order_id uuid NOT NULL,variant_id uuid NOT NULL,location_id uuid NOT NULL,
 quantity bigint NOT NULL CHECK(quantity BETWEEN 0 AND 2147483647),
 PRIMARY KEY(store_id,order_id,variant_id,location_id),
 FOREIGN KEY(store_id,location_id)REFERENCES saas.inventory_locations(store_id,id),
 FOREIGN KEY(store_id,variant_id)REFERENCES saas.product_variants(store_id,id)
);
CREATE TABLE saas.order_edit_unmanaged_stock(
 store_id uuid NOT NULL,order_id uuid NOT NULL,variant_id uuid NOT NULL,quantity bigint NOT NULL CHECK(quantity>=0),
 PRIMARY KEY(store_id,order_id,variant_id)
);
CREATE TABLE saas.order_edit_contact_overrides(store_id uuid NOT NULL,order_id uuid NOT NULL,customer_name text,customer_email text,customer_phone text,PRIMARY KEY(store_id,order_id));
CREATE TABLE saas.order_edit_cost_snapshots(store_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,revision_version bigint NOT NULL,variant_id uuid,currency text NOT NULL,quantity integer NOT NULL,unit_cost_cents bigint,known boolean NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(store_id,order_id,item_id,revision_version));

CREATE FUNCTION saas.order_edit260_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN RAISE EXCEPTION 'ORDER_EDIT_HISTORY_IMMUTABLE';END $f$;
CREATE FUNCTION saas.order_edit260_capture_item()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN INSERT INTO saas.order_edit_original_items SELECT NEW.* ON CONFLICT(id)DO NOTHING;RETURN NEW;END $f$;
CREATE TRIGGER order_edit260_capture_item AFTER INSERT ON saas.order_items FOR EACH ROW EXECUTE FUNCTION saas.order_edit260_capture_item();
DO $tables$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['order_edit260_restore','order_edit_baselines','order_edit_revisions','order_edit_original_items','order_edit_stock_state','order_edit_unmanaged_stock','order_edit_contact_overrides','order_edit_cost_snapshots']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY order_edit260_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
  IF t IN('order_edit_baselines','order_edit_revisions','order_edit_original_items','order_edit_cost_snapshots')THEN EXECUTE format('CREATE TRIGGER order_edit260_immutable BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.order_edit260_immutable()',t);END IF;
 END LOOP;
END $tables$;
CREATE FUNCTION saas.orders_edit_contacts(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN x.order_id IS NOT NULL THEN jsonb_build_object('customerName',x.customer_name,'customerEmail',x.customer_email,'customerPhone',x.customer_phone)WHEN c.id IS NOT NULL THEN jsonb_build_object('customerName',concat_ws(' ',c.first_name,c.last_name),'customerEmail',c.email,'customerPhone',c.phone)ELSE jsonb_build_object('customerName',o.customer_name,'customerEmail',o.customer_email,'customerPhone',o.customer_phone)END FROM saas.orders o LEFT JOIN saas.customers c ON c.store_id=o.store_id AND c.id=o.customer_id LEFT JOIN saas.order_edit_contact_overrides x ON x.store_id=o.store_id AND x.order_id=o.id WHERE o.store_id=p_store AND o.id=p_order
$f$;
CREATE FUNCTION saas.orders_edit_contact_metadata(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce((SELECT jsonb_build_object('currentCustomer',CASE WHEN c.id IS NULL OR x.customer_name IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'name',x.customer_name,'email',x.customer_email,'phone',x.customer_phone,'archived',c.status='archived')END)FROM saas.order_edit_contact_overrides x JOIN saas.orders o ON o.store_id=x.store_id AND o.id=x.order_id LEFT JOIN saas.customers c ON c.store_id=o.store_id AND c.id=o.customer_id WHERE x.store_id=p_store AND x.order_id=p_order),'{}'::jsonb)
$f$;

CREATE FUNCTION saas.orders_edit_intent_valid(p_intent jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE x jsonb;k text;n numeric;BEGIN
 IF p_intent IS NULL OR jsonb_typeof(p_intent)<>'object' OR pg_column_size(p_intent)>65536
 OR NOT(p_intent?&ARRAY['expectedVersion','customerName','customerEmail','customerPhone','shippingAddress','billingAddress','shippingCents','discountCents','reason','lines'])
 OR (SELECT count(*)FROM jsonb_object_keys(p_intent))<>10 THEN RETURN false;END IF;
 FOR k IN SELECT unnest(ARRAY['expectedVersion','shippingCents','discountCents'])LOOP
  IF jsonb_typeof(p_intent->k)<>'number' OR p_intent->>k!~'^(0|[1-9][0-9]{0,15})$' OR (p_intent->>k)::numeric>9007199254740991 OR k='expectedVersion'AND(p_intent->>k)::numeric<1 THEN RETURN false;END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['customerName','customerEmail','customerPhone'])LOOP
  x:=p_intent->k;IF x='null'::jsonb THEN CONTINUE;END IF;
  IF jsonb_typeof(x)<>'string' OR length(x#>>'{}')NOT BETWEEN 1 AND(CASE k WHEN 'customerName'THEN 201 WHEN 'customerEmail'THEN 320 ELSE 32 END)OR x#>>'{}'<>btrim(x#>>'{}') OR x#>>'{}'~'[[:cntrl:]]' THEN RETURN false;END IF;
  IF k='customerEmail'AND x#>>'{}'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'OR k='customerPhone'AND length(x#>>'{}')<3 THEN RETURN false;END IF;
 END LOOP;
 IF p_intent->'shippingAddress'<>'null'::jsonb AND NOT saas.orders_address_valid(p_intent->'shippingAddress') OR p_intent->'billingAddress'<>'null'::jsonb AND NOT saas.orders_address_valid(p_intent->'billingAddress')THEN RETURN false;END IF;
 IF jsonb_typeof(p_intent->'reason')<>'string' OR length(p_intent->>'reason')NOT BETWEEN 1 AND 500 OR p_intent->>'reason'<>btrim(p_intent->>'reason') OR p_intent->>'reason'~'[[:cntrl:]]' OR jsonb_typeof(p_intent->'lines')<>'array' OR jsonb_array_length(p_intent->'lines')NOT BETWEEN 1 AND 100 THEN RETURN false;END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_intent->'lines')LOOP
  IF jsonb_typeof(x)<>'object' OR(SELECT count(*)FROM jsonb_object_keys(x))<>6 OR NOT(x?&ARRAY['lineId','productId','variantId','quantity','unitPriceCents','discountCents']) OR x->>'lineId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'THEN RETURN false;END IF;
  FOR k IN SELECT unnest(ARRAY['productId','variantId'])LOOP IF x->k<>'null'::jsonb AND(jsonb_typeof(x->k)<>'string' OR x->>k!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')THEN RETURN false;END IF;END LOOP;
  FOR k IN SELECT unnest(ARRAY['quantity','unitPriceCents','discountCents'])LOOP IF jsonb_typeof(x->k)<>'number' OR x->>k!~'^(0|[1-9][0-9]{0,15})$' OR(x->>k)::numeric>9007199254740991 THEN RETURN false;END IF;END LOOP;
  IF(x->>'quantity')::numeric NOT BETWEEN 1 AND 9999 OR(x->>'discountCents')::numeric>(x->>'quantity')::numeric*(x->>'unitPriceCents')::numeric OR(x->>'quantity')::numeric*(x->>'unitPriceCents')::numeric>9007199254740991 THEN RETURN false;END IF;
 END LOOP;
 IF(SELECT count(DISTINCT value->>'lineId')FROM jsonb_array_elements(p_intent->'lines'))<>jsonb_array_length(p_intent->'lines')THEN RETURN false;END IF;RETURN true;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $f$;
CREATE FUNCTION saas.orders_edit_capture_costs(p_store uuid,p_order uuid,p_intent jsonb,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE line jsonb;old_line saas.order_items%ROWTYPE;frozen saas.accounting_profitability_line_costs%ROWTYPE;previous saas.order_edit_cost_snapshots%ROWTYPE;cost_value bigint;known_value boolean;BEGIN
 FOR line IN SELECT value FROM jsonb_array_elements(p_intent->'lines')LOOP
  cost_value:=NULL;known_value:=false;
  SELECT * INTO old_line FROM saas.order_items WHERE store_id=p_store AND order_id=p_order AND id=(line->>'lineId')::uuid;
  IF old_line.id IS NOT NULL AND old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.product_id IS NOT DISTINCT FROM(line->>'productId')::uuid THEN
   SELECT * INTO previous FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order AND item_id=old_line.id ORDER BY revision_version DESC LIMIT 1;
   IF previous.item_id IS NOT NULL THEN cost_value:=previous.unit_cost_cents;known_value:=previous.known AND previous.variant_id IS NOT DISTINCT FROM old_line.variant_id AND previous.quantity=old_line.quantity;
   ELSE
    SELECT * INTO frozen FROM saas.accounting_profitability_line_costs WHERE store_id=p_store AND order_id=p_order AND item_id=old_line.id;
    cost_value:=frozen.unit_cost_cents;known_value:=cost_value IS NOT NULL AND frozen.quantity=old_line.quantity AND frozen.currency='TRY'AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=p_order AND bad.item_id=old_line.id);
   END IF;
  ELSE
   SELECT v.cost_cents INTO cost_value FROM saas.product_variants v JOIN saas.products product ON product.store_id=v.store_id AND product.id=v.product_id WHERE v.store_id=p_store AND v.id=(line->>'variantId')::uuid AND product.id=(line->>'productId')::uuid AND product.currency='TRY';known_value:=cost_value IS NOT NULL;
  END IF;
  INSERT INTO saas.order_edit_cost_snapshots VALUES(p_store,p_order,(line->>'lineId')::uuid,(p_intent->>'expectedVersion')::bigint+1,(line->>'variantId')::uuid,'TRY',(line->>'quantity')::integer,cost_value,known_value,p_now);
 END LOOP;
END $f$;
CREATE FUNCTION saas.orders_edit_costs(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('available',count(*)>0 AND bool_and(cost.item_id IS NOT NULL AND cost.known AND cost.quantity=i.quantity AND cost.variant_id IS NOT DISTINCT FROM i.variant_id AND cost.currency=o.currency),'knownCost',coalesce(sum(cost.unit_cost_cents::numeric*i.quantity)FILTER(WHERE cost.known AND cost.quantity=i.quantity AND cost.variant_id IS NOT DISTINCT FROM i.variant_id AND cost.currency=o.currency),0))FROM saas.orders o JOIN saas.order_items i ON i.store_id=o.store_id AND i.order_id=o.id LEFT JOIN LATERAL(SELECT c.* FROM saas.order_edit_cost_snapshots c WHERE c.store_id=i.store_id AND c.order_id=i.order_id AND c.item_id=i.id AND c.revision_version<=o.version ORDER BY c.revision_version DESC LIMIT 1)cost ON true WHERE o.store_id=p_store AND o.id=p_order
$f$;

CREATE FUNCTION saas.orders_edit_block_reason(p_store uuid,p_order uuid)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders%ROWTYPE;s saas.in_store_sales%ROWTYPE;BEGIN
 SELECT * INTO o FROM saas.orders WHERE store_id=p_store AND id=p_order;IF NOT FOUND THEN RETURN 'order_not_found';END IF;
 IF o.currency<>'TRY'THEN RETURN 'currency_unsupported';END IF;
 IF EXISTS(SELECT 1 FROM saas.order_archive_state WHERE store_id=p_store AND order_id=p_order AND archived)THEN RETURN 'order_archived';END IF;
 SELECT * INTO s FROM saas.in_store_sales WHERE store_id=p_store AND order_id=p_order;
 IF o.status IN('cancelled','refunded')OR(o.status IN('shipped','delivered')AND NOT(o.source='in_store'AND s.status='completed'AND s.fulfillment_method='pickup'))THEN RETURN 'order_fulfilled';END IF;
 IF o.tracking IS NOT NULL THEN RETURN 'shipment_exists';END IF;
 IF EXISTS(SELECT 1 FROM saas.shipping_shipments WHERE store_id=p_store AND order_id=p_order AND status<>'cancelled')THEN RETURN 'shipment_exists';END IF;
 IF EXISTS(SELECT 1 FROM saas.shipping_shipment_returns r JOIN saas.shipping_shipments sh ON sh.store_id=r.store_id AND sh.id=r.shipment_id WHERE sh.store_id=p_store AND sh.order_id=p_order)THEN RETURN 'return_exists';END IF;
 IF o.payment_status='refunded'OR EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=p_order AND(return_cents>0 OR refunded_cents>0))THEN RETURN 'return_exists';END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h JOIN saas.payment_attempts a ON a.store_id=h.store_id AND a.id=h.payment_attempt_id WHERE h.store_id=p_store AND h.order_id=p_order AND(a.status IN('partially_refunded','refunded')OR h.status IN('active','provider_ready','processing')))
 OR EXISTS(SELECT 1 FROM saas.quick_order_hosted_payment_bridges b JOIN saas.payment_attempts a ON a.store_id=b.store_id AND a.id=b.attempt_id WHERE b.store_id=p_store AND b.order_id=p_order AND a.status IN('partially_refunded','refunded'))THEN RETURN 'payment_in_progress_or_refunded';END IF;
 IF o.payment_status='processing'THEN RETURN 'payment_in_progress_or_refunded';END IF;
 RETURN NULL;
END $f$;

CREATE FUNCTION saas.orders_edit_stock_basis(p_store uuid,p_order uuid)RETURNS TABLE(variant_id uuid,location_id uuid,quantity bigint)LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT s.variant_id,s.location_id,s.quantity FROM saas.order_edit_stock_state s WHERE s.store_id=p_store AND s.order_id=p_order
 UNION ALL
 SELECT m.variant_id,m.location_id,(-sum(m.quantity_delta))::bigint FROM saas.inventory_movements m
 WHERE m.store_id=p_store AND m.quantity_delta<0 AND NOT EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order)
 AND((m.source_kind='checkout_sale'AND(m.source_id=p_order OR EXISTS(SELECT 1 FROM saas.checkout_payment_attempts a WHERE a.store_id=p_store AND a.id=m.source_id AND a.settled_order_id=p_order)))
 OR(m.source_kind='in_store_sale'AND EXISTS(SELECT 1 FROM saas.in_store_sales s WHERE s.store_id=p_store AND s.order_id=p_order AND s.id=m.source_id)))
 GROUP BY m.variant_id,m.location_id
$f$;
CREATE FUNCTION saas.orders_edit_stock_managed(p_store uuid,p_order uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT o.source IN('storefront','quick_link','in_store')OR(o.source='manual'AND(EXISTS(SELECT 1 FROM saas.order_drafts d WHERE d.store_id=p_store AND d.converted_order_id=p_order AND d.adjust_inventory)OR EXISTS(SELECT 1 FROM saas.manual_order_inventory_commitments c WHERE c.store_id=p_store AND c.order_id=p_order)))FROM saas.orders o WHERE o.store_id=p_store AND o.id=p_order
$f$;
CREATE FUNCTION saas.orders_edit_stock_plan(p_store uuid,p_order uuid,p_lines jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE v record;b record;current_qty bigint;wanted bigint;requested bigint;unmanaged bigint;remaining bigint;take bigint;fixed_location uuid;changes jsonb:='[]';managed boolean;
BEGIN
 managed:=saas.orders_edit_stock_managed(p_store,p_order);
 SELECT location_id INTO fixed_location FROM saas.in_store_sales WHERE store_id=p_store AND order_id=p_order;
 FOR v IN SELECT variant.* FROM saas.product_variants variant WHERE variant.store_id=p_store AND(variant.id IN(SELECT nullif(value->>'variantId','')::uuid FROM jsonb_array_elements(p_lines))OR variant.id IN(SELECT basis.variant_id FROM saas.orders_edit_stock_basis(p_store,p_order)basis))ORDER BY variant.id LOOP
  SELECT coalesce(sum((value->>'quantity')::bigint),0)INTO requested FROM jsonb_array_elements(p_lines)WHERE(value->>'variantId')::uuid=v.id;
  SELECT coalesce(sum(quantity),0)INTO current_qty FROM saas.orders_edit_stock_basis(p_store,p_order)basis WHERE basis.variant_id=v.id;
  SELECT quantity INTO unmanaged FROM saas.order_edit_unmanaged_stock WHERE store_id=p_store AND order_id=p_order AND variant_id=v.id;
  IF NOT FOUND THEN SELECT greatest(coalesce(sum(i.quantity),0)-current_qty,0)INTO unmanaged FROM saas.order_items i WHERE i.store_id=p_store AND i.order_id=p_order AND i.variant_id=v.id;END IF;
  wanted:=CASE WHEN managed AND v.stock_tracking THEN greatest(requested-unmanaged,0)ELSE least(requested,current_qty)END;
  IF wanted<current_qty THEN
   remaining:=current_qty-wanted;
   FOR b IN SELECT basis.* FROM saas.orders_edit_stock_basis(p_store,p_order)basis WHERE basis.variant_id=v.id ORDER BY basis.location_id LOOP
    take:=least(remaining,b.quantity);IF take>0 THEN changes:=changes||jsonb_build_array(jsonb_build_object('variantId',v.id,'locationId',b.location_id,'quantityDelta',take));remaining:=remaining-take;END IF;EXIT WHEN remaining=0;
   END LOOP;
  ELSIF wanted>current_qty THEN
   remaining:=wanted-current_qty;
   IF v.stock_quantity-saas.in_store_held_quantity(p_store,v.id)<remaining THEN RETURN jsonb_build_object('error','inventory_conflict');END IF;
   FOR b IN SELECT bal.location_id,bal.quantity-saas.in_store_held_quantity(p_store,v.id,bal.location_id)available FROM saas.inventory_balances bal JOIN saas.inventory_locations loc ON loc.store_id=bal.store_id AND loc.id=bal.location_id AND loc.status='active'WHERE bal.store_id=p_store AND bal.variant_id=v.id AND(fixed_location IS NULL OR bal.location_id=fixed_location)ORDER BY loc.is_default DESC,bal.location_id LOOP
    take:=least(remaining,greatest(b.available,0));IF take>0 THEN changes:=changes||jsonb_build_array(jsonb_build_object('variantId',v.id,'locationId',b.location_id,'quantityDelta',-take));remaining:=remaining-take;END IF;EXIT WHEN remaining=0;
   END LOOP;
   IF remaining>0 THEN RETURN jsonb_build_object('error','inventory_conflict');END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(changes)c JOIN saas.inventory_locations loc ON loc.store_id=p_store AND loc.id=(c->>'locationId')::uuid WHERE loc.status<>'active')OR EXISTS(SELECT 1 FROM jsonb_array_elements(changes)c JOIN saas.inventory_balances bal_check ON bal_check.store_id=p_store AND bal_check.location_id=(c->>'locationId')::uuid AND bal_check.variant_id=(c->>'variantId')::uuid WHERE bal_check.quantity::numeric+(c->>'quantityDelta')::numeric NOT BETWEEN 0 AND 2147483647)OR EXISTS(SELECT 1 FROM saas.product_variants variant_check JOIN(SELECT(value->>'variantId')::uuid id,sum((value->>'quantityDelta')::numeric)delta FROM jsonb_array_elements(changes)GROUP BY 1)c ON c.id=variant_check.id WHERE variant_check.store_id=p_store AND variant_check.stock_quantity::numeric+c.delta NOT BETWEEN 0 AND 2147483647)THEN RETURN jsonb_build_object('error','inventory_conflict');END IF;
 RETURN jsonb_build_object('changes',changes);
END $f$;

CREATE FUNCTION saas.orders_edit_preview(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid,p_intent jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;o saas.orders%ROWTYPE;line jsonb;old_line saas.order_items%ROWTYPE;variant saas.product_variants%ROWTYPE;product saas.products%ROWTYPE;gross numeric:=0;discount numeric:=0;total numeric;perms jsonb;finance jsonb;stock jsonb;preview jsonb;commission bigint;BEGIN
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_order_id IS NULL OR NOT saas.orders_edit_intent_valid(p_intent)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO o FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id;IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb;RETURN;END IF;
 IF o.version<>(p_intent->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF o.version>=9007199254740991 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 err:=saas.orders_edit_block_reason(p_store_id,p_order_id);IF err IS NOT NULL THEN RETURN QUERY SELECT 'invalid_transition',jsonb_build_object('blockReason',err);RETURN;END IF;
 IF o.source<>'in_store'AND(p_intent->'customerName'='null'::jsonb OR p_intent->'customerEmail'='null'::jsonb OR p_intent->'shippingAddress'='null'::jsonb)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 perms:=saas.orders_edit_permissions(p_store_id,p_membership_id);
 FOR line IN SELECT value FROM jsonb_array_elements(p_intent->'lines')LOOP
  SELECT * INTO old_line FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id AND id=(line->>'lineId')::uuid;
  IF old_line.id IS NULL AND EXISTS(SELECT 1 FROM saas.order_edit_original_items WHERE id=(line->>'lineId')::uuid)THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;RETURN;END IF;
  IF old_line.id IS NOT NULL AND(old_line.variant_id IS DISTINCT FROM(line->>'variantId')::uuid OR old_line.product_id IS DISTINCT FROM(line->>'productId')::uuid)THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.order_items WHERE id=(line->>'lineId')::uuid AND(store_id<>p_store_id OR order_id<>p_order_id))OR EXISTS(SELECT 1 FROM saas.order_edit_original_items WHERE id=(line->>'lineId')::uuid AND(store_id<>p_store_id OR order_id<>p_order_id))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF line->'variantId'='null'::jsonb OR line->'productId'='null'::jsonb THEN
   IF old_line.id IS NULL OR old_line.variant_id IS DISTINCT FROM(line->>'variantId')::uuid OR old_line.product_id IS DISTINCT FROM(line->>'productId')::uuid THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;RETURN;END IF;
  ELSE
   SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid AND product_id=(line->>'productId')::uuid;
   SELECT * INTO product FROM saas.products WHERE store_id=p_store_id AND id=(line->>'productId')::uuid;
   IF variant.id IS NULL OR product.id IS NULL OR product.currency<>'TRY'OR((variant.status<>'active'OR product.status<>'active')AND(old_line.id IS NULL OR old_line.variant_id<>variant.id OR(line->>'quantity')::bigint>old_line.quantity))THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;RETURN;END IF;
  END IF;
 IF NOT(perms->>'canEditPrices')::boolean AND NOT(old_line.id IS NOT NULL AND old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.unit_price_cents=(line->>'unitPriceCents')::bigint)AND(old_line.id IS NOT NULL OR variant.id IS NULL OR variant.price_cents<>(line->>'unitPriceCents')::bigint)THEN RETURN QUERY SELECT 'price_permission_denied',NULL::jsonb;RETURN;END IF;
  gross:=gross+(line->>'quantity')::numeric*(line->>'unitPriceCents')::numeric;discount:=discount+(line->>'discountCents')::numeric;
 END LOOP;
 discount:=discount+(p_intent->>'discountCents')::numeric;total:=gross+(p_intent->>'shippingCents')::numeric-discount;
 IF gross>8000000000 OR discount>8000000000 OR(p_intent->>'shippingCents')::numeric>8000000000 OR total NOT BETWEEN 0 AND 8000000000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF discount>gross*(perms->>'discountLimitBps')::numeric/10000 AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)THEN RETURN QUERY SELECT 'discount_limit_exceeded',NULL::jsonb;RETURN;END IF;
 stock:=saas.orders_edit_stock_plan(p_store_id,p_order_id,p_intent->'lines');IF stock?'error'THEN RETURN QUERY SELECT stock->>'error',NULL::jsonb;RETURN;END IF;
 finance:=saas.orders_edit_finance(p_store_id,p_order_id);
 IF total<(finance->>'settlementDiscountCents')::numeric THEN RETURN QUERY SELECT 'invalid_transition',jsonb_build_object('blockReason','settlement_discount_exceeds_total');RETURN;END IF;
 commission:=saas.orders_edit_commission_delta(p_store_id,p_order_id,(gross-discount)::bigint);
 preview:=jsonb_build_object('orderId',p_order_id,'expectedVersion',o.version,'beforeTotalCents',o.total_cents,'afterSubtotalCents',gross,'afterShippingCents',(p_intent->>'shippingCents')::bigint,'afterDiscountCents',discount,'afterTotalCents',total,'collectedCents',finance->'collectedCents','settlementDiscountCents',finance->'settlementDiscountCents','dueCents',greatest(total-(finance->>'settlementDiscountCents')::numeric-(finance->>'collectedCents')::numeric,0),'refundDueCents',greatest((finance->>'collectedCents')::numeric-greatest(total-(finance->>'settlementDiscountCents')::numeric,0),0),'stockChanges',stock->'changes','commissionDeltaCents',commission);
 preview:=preview||jsonb_build_object('fingerprint',encode(sha256(convert_to(jsonb_build_array(preview,p_intent,perms,finance,saas.orders_edit_contacts(p_store_id,p_order_id),(SELECT jsonb_agg(jsonb_build_array(v.id,v.version,v.stock_tracking,v.price_cents)ORDER BY v.id)FROM saas.product_variants v WHERE v.store_id=p_store_id AND v.id IN(SELECT(value->>'variantId')::uuid FROM jsonb_array_elements(p_intent->'lines'))))::text,'UTF8')),'hex'));
 RETURN QUERY SELECT 'previewed',preview;
END $f$;

CREATE FUNCTION saas.orders_edit_lines(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',id,'productId',product_id,'variantId',variant_id,'productName',product_name,'variantName',variant_name,'sku',sku,'quantity',quantity,'unitPriceCents',unit_price_cents,'discountCents',discount_cents,'lineTotalCents',line_total_cents)ORDER BY position,id),'[]')FROM saas.order_items WHERE store_id=p_store AND order_id=p_order
$f$;
CREATE FUNCTION saas.orders_edit_permissions(p_store uuid,p_member uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('canEditPrices',saas.in_store_is_manager(p_store,p_member)OR coalesce((SELECT enabled AND can_edit_price FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false),'discountLimitBps',CASE WHEN saas.in_store_is_manager(p_store,p_member)THEN 10000 ELSE coalesce((SELECT discount_limit_bps FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled),0)END)
$f$;

-- Finance helpers and reviewed reader updates are appended below before grants.

CREATE FUNCTION saas.orders_edit_workspace(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;o saas.orders%ROWTYPE;perms jsonb;BEGIN
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO o FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id;IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb;RETURN;END IF;
 err:=saas.orders_edit_block_reason(p_store_id,p_order_id);perms:=saas.orders_edit_permissions(p_store_id,p_membership_id);
 RETURN QUERY SELECT 'found',jsonb_build_object('orderId',o.id,'orderNumber',o.order_number,'version',o.version,'currency',o.currency,'source',o.source,'canEdit',err IS NULL,'blockReason',err,'shippingAddress',o.shipping_address,'billingAddress',o.billing_address,'subtotalCents',o.subtotal_cents,'shippingCents',o.shipping_cents,'discountCents',o.discount_cents-CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_revisions WHERE store_id=p_store_id AND order_id=p_order_id)THEN coalesce((SELECT sum(discount_cents)FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id),0)ELSE 0 END,'totalCents',o.total_cents,'lines',saas.orders_edit_lines(p_store_id,p_order_id),'finance',saas.orders_edit_finance(p_store_id,p_order_id))||perms||saas.orders_edit_contacts(p_store_id,p_order_id);
END $f$;

CREATE FUNCTION saas.orders_edit_seed_stock(p_store uuid,p_order uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order)THEN RETURN;END IF;
 INSERT INTO saas.order_edit_stock_state SELECT p_store,p_order,b.variant_id,b.location_id,b.quantity FROM saas.orders_edit_stock_basis(p_store,p_order)b;
 INSERT INTO saas.order_edit_unmanaged_stock SELECT p_store,p_order,i.variant_id,greatest(sum(i.quantity)-coalesce((SELECT sum(s.quantity)FROM saas.order_edit_stock_state s WHERE s.store_id=p_store AND s.order_id=p_order AND s.variant_id=i.variant_id),0),0)FROM saas.order_items i WHERE i.store_id=p_store AND i.order_id=p_order AND i.variant_id IS NOT NULL GROUP BY i.variant_id;
END $f$;

CREATE FUNCTION saas.orders_edit_apply(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid,p_operation_id uuid,p_fingerprint text,p_intent jsonb,p_preview_fingerprint text)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;prior saas.order_edit_revisions%ROWTYPE;o saas.orders%ROWTYPE;before_value jsonb;after_value jsonb;current_preview record;line jsonb;old_line saas.order_items%ROWTYPE;v saas.product_variants%ROWTYPE;product_title text;change jsonb;pos integer:=0;result jsonb;marker text;BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'orders_edit_apply');
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_order_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'OR p_preview_fingerprint IS NULL OR p_preview_fingerprint!~'^[a-f0-9]{64}$'OR NOT saas.orders_edit_intent_valid(p_intent)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store_id::text,0));
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id FOR SHARE;
 PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id FOR SHARE;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.order_edit_revisions WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id=p_store_id AND prior.order_id=p_order_id AND prior.actor_membership_id=p_membership_id AND prior.payload_fingerprint=p_fingerprint AND prior.after_payload->'editIntent'=p_intent AND prior.preview->>'fingerprint'=p_preview_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM saas.order_operations WHERE operation_id=p_operation_id)OR EXISTS(SELECT 1 FROM saas.accounting_operations WHERE operation_id=p_operation_id)THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 SELECT * INTO o FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND order_id=p_order_id FOR UPDATE;
 PERFORM 1 FROM saas.accounting_receivables WHERE store_id=p_store_id AND order_id=p_order_id FOR UPDATE;
 PERFORM 1 FROM saas.product_variants WHERE store_id=p_store_id AND(id IN(SELECT(value->>'variantId')::uuid FROM jsonb_array_elements(p_intent->'lines'))OR id IN(SELECT variant_id FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id))ORDER BY id FOR UPDATE;
 PERFORM 1 FROM saas.inventory_balances WHERE store_id=p_store_id AND variant_id IN(SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND(id IN(SELECT(value->>'variantId')::uuid FROM jsonb_array_elements(p_intent->'lines'))OR id IN(SELECT variant_id FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id)))ORDER BY variant_id,location_id FOR UPDATE;
 SELECT * INTO current_preview FROM saas.orders_edit_preview(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_order_id,p_intent);
 IF current_preview.outcome<>'previewed'THEN RETURN QUERY SELECT current_preview.outcome,current_preview.result_payload;RETURN;END IF;
 IF current_preview.result_payload->>'fingerprint'<>p_preview_fingerprint THEN RETURN QUERY SELECT 'preview_conflict',NULL::jsonb;RETURN;END IF;
 before_value:=to_jsonb(o)||jsonb_build_object('lines',saas.orders_edit_lines(p_store_id,p_order_id));
 PERFORM saas.orders_edit_seed_stock(p_store_id,p_order_id);
 PERFORM saas.orders_edit_capture_finance(p_store_id,p_order_id,p_now);
 PERFORM saas.orders_edit_capture_costs(p_store_id,p_order_id,p_intent,p_now);
 IF saas.orders_edit_contacts(p_store_id,p_order_id)<>jsonb_build_object('customerName',p_intent->'customerName','customerEmail',p_intent->'customerEmail','customerPhone',p_intent->'customerPhone')THEN
  INSERT INTO saas.order_edit_contact_overrides VALUES(p_store_id,p_order_id,p_intent->>'customerName',p_intent->>'customerEmail',p_intent->>'customerPhone')ON CONFLICT(store_id,order_id)DO UPDATE SET customer_name=excluded.customer_name,customer_email=excluded.customer_email,customer_phone=excluded.customer_phone;
 END IF;
 -- These local contexts are accepted only by the two narrow legacy guards.
 marker:=p_store_id::text||':'||p_order_id::text||':'||p_operation_id::text;
 PERFORM set_config('saas.orders.edit260',marker,true);
 PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
 FOR change IN SELECT value FROM jsonb_array_elements(current_preview.result_payload->'stockChanges')LOOP
  UPDATE saas.inventory_balances SET quantity=quantity+(change->>'quantityDelta')::bigint,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=(change->>'locationId')::uuid AND variant_id=(change->>'variantId')::uuid;
  INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)VALUES(saas.inventory_deterministic_uuid('order-edit-stock',p_operation_id::text||':'||(change->>'variantId')||':'||(change->>'locationId')),p_store_id,(change->>'locationId')::uuid,(change->>'variantId')::uuid,'order_edit',CASE WHEN(change->>'quantityDelta')::bigint>0 THEN 'in'ELSE 'out'END,(change->>'quantityDelta')::bigint,'order_edit',p_operation_id,p_now,p_now);
  UPDATE saas.order_edit_stock_state SET quantity=quantity-(change->>'quantityDelta')::bigint WHERE store_id=p_store_id AND order_id=p_order_id AND variant_id=(change->>'variantId')::uuid AND location_id=(change->>'locationId')::uuid;
  IF NOT FOUND THEN INSERT INTO saas.order_edit_stock_state VALUES(p_store_id,p_order_id,(change->>'variantId')::uuid,(change->>'locationId')::uuid,-(change->>'quantityDelta')::bigint);END IF;
 END LOOP;
 UPDATE saas.product_variants changed_variant SET stock_quantity=saas.inventory_active_balance_total(p_store_id,changed_variant.id),version=changed_variant.version+1,updated_at=p_now WHERE changed_variant.store_id=p_store_id AND changed_variant.id IN(SELECT(value->>'variantId')::uuid FROM jsonb_array_elements(current_preview.result_payload->'stockChanges'));
 PERFORM set_config('saas.inventory.source_marker','',true);
 IF o.source='manual'THEN
  DELETE FROM saas.manual_order_inventory_commitments WHERE store_id=p_store_id AND order_id=p_order_id;
  INSERT INTO saas.manual_order_inventory_commitments(store_id,order_id,variant_id,quantity,created_at)SELECT p_store_id,p_order_id,variant_id,sum(quantity)::integer,p_now FROM saas.order_edit_stock_state WHERE store_id=p_store_id AND order_id=p_order_id GROUP BY variant_id HAVING sum(quantity)>0;
 END IF;
 SET CONSTRAINTS saas.order_items_store_id_order_id_position_key DEFERRED;
 DELETE FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id AND id NOT IN(SELECT(value->>'lineId')::uuid FROM jsonb_array_elements(p_intent->'lines'));
 FOR line IN SELECT value FROM jsonb_array_elements(p_intent->'lines')LOOP
  SELECT * INTO old_line FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id AND id=(line->>'lineId')::uuid;
  IF NOT FOUND THEN SELECT * INTO old_line FROM saas.order_edit_original_items WHERE store_id=p_store_id AND order_id=p_order_id AND id=(line->>'lineId')::uuid;END IF;
  SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid;
  SELECT title INTO product_title FROM saas.products WHERE store_id=p_store_id AND id=(line->>'productId')::uuid;
  INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES((line->>'lineId')::uuid,p_store_id,p_order_id,(line->>'productId')::uuid,(line->>'variantId')::uuid,pos,CASE WHEN old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.id IS NOT NULL THEN old_line.product_name ELSE coalesce(product_title,old_line.product_name)END,CASE WHEN old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.id IS NOT NULL THEN old_line.variant_name ELSE v.title END,CASE WHEN old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.id IS NOT NULL THEN old_line.sku ELSE v.sku END,(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,(line->>'discountCents')::bigint,(line->>'unitPriceCents')::bigint*(line->>'quantity')::integer-(line->>'discountCents')::bigint,coalesce(old_line.created_at,p_now))ON CONFLICT(id)DO UPDATE SET product_id=excluded.product_id,variant_id=excluded.variant_id,position=excluded.position,product_name=excluded.product_name,variant_name=excluded.variant_name,sku=excluded.sku,unit_price_cents=excluded.unit_price_cents,quantity=excluded.quantity,discount_cents=excluded.discount_cents,line_total_cents=excluded.line_total_cents WHERE ROW(order_items.product_id,order_items.variant_id,order_items.position,order_items.product_name,order_items.variant_name,order_items.sku,order_items.unit_price_cents,order_items.quantity,order_items.discount_cents,order_items.line_total_cents)IS DISTINCT FROM ROW(excluded.product_id,excluded.variant_id,excluded.position,excluded.product_name,excluded.variant_name,excluded.sku,excluded.unit_price_cents,excluded.quantity,excluded.discount_cents,excluded.line_total_cents);pos:=pos+1;
 END LOOP;
 SET CONSTRAINTS saas.order_items_store_id_order_id_position_key IMMEDIATE;
 UPDATE saas.orders SET customer_name=p_intent->>'customerName',customer_email=p_intent->>'customerEmail',customer_phone=p_intent->>'customerPhone',shipping_address=nullif(p_intent->'shippingAddress','null'::jsonb),billing_address=nullif(p_intent->'billingAddress','null'::jsonb),subtotal_cents=(current_preview.result_payload->>'afterSubtotalCents')::bigint,shipping_cents=(current_preview.result_payload->>'afterShippingCents')::bigint,discount_cents=(current_preview.result_payload->>'afterDiscountCents')::bigint,total_cents=(current_preview.result_payload->>'afterTotalCents')::bigint,payment_status=CASE WHEN(current_preview.result_payload->>'dueCents')::bigint=0 THEN 'completed'ELSE 'pending'END,paid_at=CASE WHEN(current_preview.result_payload->>'dueCents')::bigint=0 THEN paid_at ELSE NULL END,version=version+1,updated_at=greatest(updated_at,p_now)WHERE store_id=p_store_id AND id=p_order_id;
 PERFORM saas.orders_edit_apply_finance(p_store_id,p_order_id,p_operation_id,p_membership_id,o.total_cents,(current_preview.result_payload->>'afterTotalCents')::bigint,p_now);
 -- Invalidated review invitations must not ask about removed products or use an
 -- obsolete contact address. Existing sent history remains intact.
 UPDATE saas.review_collection_requests SET status='suppressed',lease_id=NULL,lease_expires_at=NULL,error_code='order_edited',updated_at=greatest(updated_at,p_now)WHERE store_id=p_store_id AND order_id=p_order_id AND status IN('queued','leased');
 SELECT to_jsonb(value)||jsonb_build_object('lines',saas.orders_edit_lines(p_store_id,p_order_id),'editIntent',p_intent)INTO after_value FROM saas.orders value WHERE store_id=p_store_id AND id=p_order_id;
 result:=jsonb_build_object('orderId',p_order_id,'version',after_value->'version','operationId',p_operation_id,'replayed',false,'preview',current_preview.result_payload);
 INSERT INTO saas.order_edit_revisions VALUES(p_operation_id,p_store_id,p_order_id,p_membership_id,p_fingerprint,before_value,after_value,current_preview.result_payload,result,p_now);
 INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at)VALUES(saas.inventory_deterministic_uuid('order-edit-event',p_operation_id::text),p_store_id,p_order_id,p_membership_id,'order_edited',p_intent->>'reason',jsonb_build_object('operationId',p_operation_id,'beforeTotalCents',o.total_cents,'afterTotalCents',after_value->'total_cents'),p_now);
 PERFORM set_config('saas.orders.edit260','',true);
 RETURN QUERY SELECT 'committed',result;
END $f$;
CREATE FUNCTION saas.orders_edit_recover(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_expected_fingerprint text)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;r saas.order_edit_revisions%ROWTYPE;BEGIN
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.order_edit_revisions WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF r.store_id<>p_store_id OR r.actor_membership_id<>p_membership_id OR r.payload_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',r.result_payload||jsonb_build_object('replayed',true);
END $f$;
CREATE FUNCTION saas.orders_edit_options(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_limit bigint)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;items jsonb;BEGIN
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_search IS NULL OR length(p_search)>200 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('productId',q.product_id,'variantId',q.id,'productName',q.product_name,'variantName',q.title,'sku',q.sku,'unitPriceCents',q.price_cents)ORDER BY q.product_name,q.id),'[]')INTO items FROM(SELECT v.*,p.title product_name FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store_id AND v.status='active'AND p.status='active'AND p.currency='TRY'AND(p_search=''OR strpos(lower(p.title||' '||v.title||' '||coalesce(v.sku,'')),lower(p_search))>0)ORDER BY p.title,v.id LIMIT p_limit+1)q;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]')FROM jsonb_array_elements(items)WITH ORDINALITY a(value,ord)WHERE ord<=p_limit),'hasMore',jsonb_array_length(items)>p_limit);
END $f$;

-- Private finance helpers for native260. Include after core tables and the
-- reviewed order_edit260_patch helper, before ACL finalization / COMMIT.
CREATE FUNCTION saas.orders_edit_payment_evidence(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders%ROWTYPE;s saas.in_store_sales%ROWTYPE;amount bigint;received timestamptz;source_value text;BEGIN
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 SELECT w.amount_cents,w.received_at,'provider_or_recorded_transition' INTO amount,received,source_value FROM saas.accounting_web_payment_evidence(p_store)w WHERE w.order_id=p_order;
 IF amount IS NULL AND o.source='in_store'THEN
  SELECT * INTO s FROM saas.in_store_sales WHERE store_id=p_store AND order_id=p_order AND status='completed';
  IF s.id IS NOT NULL THEN
   SELECT sum(a.amount_cents)::bigint,max(a.received_at)INTO amount,received FROM saas.in_store_payment_attestations a WHERE a.store_id=p_store AND a.sale_id=s.id;
   IF amount IS NULL THEN amount:=coalesce(s.initial_collection_cents,CASE WHEN o.payment_status='completed'THEN s.total_cents ELSE 0 END);received:=coalesce(s.payment_received_at,s.completed_at);END IF;
   source_value:='completed_pos_snapshot';
  END IF;
 END IF;
 IF amount IS NULL THEN
  amount:=CASE WHEN o.payment_status='completed'THEN o.total_cents ELSE 0 END;
  received:=coalesce(o.paid_at,o.updated_at,o.created_at);source_value:=CASE WHEN amount>0 THEN 'recorded_manual_payment_status'ELSE 'unpaid_order_snapshot'END;
 END IF;
 RETURN jsonb_build_object('collectedCents',amount,'receivedAt',saas.orders_json_timestamp(coalesce(received,o.created_at)),'evidenceSource',source_value);
END $f$;

CREATE FUNCTION saas.orders_edit_finance(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.accounting_receivables%ROWTYPE;o saas.orders%ROWTYPE;proof jsonb;collected bigint;discounted bigint:=0;BEGIN
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=p_order;
 IF r.id IS NOT NULL THEN collected:=r.collected_cents-r.refunded_cents;discounted:=r.discount_cents;
 ELSE proof:=saas.orders_edit_payment_evidence(p_store,p_order);collected:=(proof->>'collectedCents')::bigint;END IF;
 RETURN jsonb_build_object('collectedCents',collected,'settlementDiscountCents',discounted,'dueCents',greatest(o.total_cents-discounted-collected,0),'refundDueCents',greatest(collected-greatest(o.total_cents-discounted,0),0));
END $f$;

CREATE FUNCTION saas.orders_edit_current_merchandise(p_store uuid,p_order uuid,p_original bigint)RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order)THEN coalesce(
  (SELECT subtotal_cents-discount_cents FROM saas.orders WHERE store_id=p_store AND id=p_order),
  (SELECT(after_payload->>'subtotal_cents')::bigint-(after_payload->>'discount_cents')::bigint FROM saas.order_edit_revisions WHERE store_id=p_store AND order_id=p_order ORDER BY created_at DESC,operation_id DESC LIMIT 1),p_original)ELSE p_original END
$f$;

CREATE FUNCTION saas.orders_edit_commission_delta(p_store uuid,p_order uuid,p_new_merchandise bigint)RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce((SELECT round(greatest(p_new_merchandise-coalesce(r.return_cents,0)-coalesce(r.discount_cents,0),0)::numeric*s.rate_bps/10000)::bigint
  -round(greatest(saas.orders_edit_current_merchandise(p_store,p_order,s.merchandise_cents)-coalesce(r.return_cents,0)-coalesce(r.discount_cents,0),0)::numeric*s.rate_bps/10000)::bigint
 FROM saas.accounting_cashier_commission_sales s LEFT JOIN saas.accounting_receivables r ON r.store_id=s.store_id AND r.id=s.receivable_id WHERE s.store_id=p_store AND s.order_reference_id=p_order),0)
$f$;

CREATE FUNCTION saas.orders_edit_capture_finance(p_store uuid,p_order uuid,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders%ROWTYPE;finance jsonb;proof jsonb;r saas.accounting_receivables%ROWTYPE;BEGIN
 IF EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order)THEN RETURN;END IF;
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 finance:=saas.orders_edit_finance(p_store,p_order);proof:=saas.orders_edit_payment_evidence(p_store,p_order);
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=p_order;
 INSERT INTO saas.order_edit_baselines(store_id,order_id,original_payload,original_finance,created_at)VALUES(p_store,p_order,to_jsonb(o)||jsonb_build_object('lines',saas.orders_edit_lines(p_store,p_order)),proof||finance||jsonb_build_object('receivable',CASE WHEN r.id IS NULL THEN NULL ELSE to_jsonb(r)END),p_now);
END $f$;

CREATE FUNCTION saas.orders_edit_apply_finance(p_store uuid,p_order uuid,p_operation uuid,p_actor uuid,p_before_total bigint,p_after_total bigint,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE b saas.order_edit_baselines%ROWTYPE;o saas.orders%ROWTYPE;r saas.accounting_receivables%ROWTYPE;s saas.in_store_sales%ROWTYPE;receivable uuid;sale_event uuid;receipt_event uuid;delta_event uuid;initial_total bigint;initial_collected bigint;received timestamptz;sold timestamptz;channel_value text;delta bigint;BEGIN
 SELECT * INTO STRICT b FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order;
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=p_order FOR UPDATE;
 IF r.id IS NULL THEN
  initial_total:=(b.original_payload->>'total_cents')::bigint;initial_collected:=(b.original_finance->>'collectedCents')::bigint;
  received:=(b.original_finance->>'receivedAt')::timestamptz;sold:=CASE WHEN initial_collected>0 THEN received ELSE(b.original_payload->>'created_at')::timestamptz END;
  SELECT * INTO s FROM saas.in_store_sales WHERE store_id=p_store AND order_id=p_order;
  IF s.id IS NOT NULL THEN sold:=coalesce(s.completed_at,sold);END IF;
  channel_value:=CASE WHEN o.source='in_store'THEN 'POS'ELSE 'WEB'END;
  receivable:=saas.inventory_deterministic_uuid('accounting','saas.accounting.receivable:'||p_store::text||':'||p_order::text);
  sale_event:=saas.inventory_deterministic_uuid('order-edit-import-sale',p_store::text||':'||p_order::text);
  receipt_event:=saas.inventory_deterministic_uuid('order-edit-import-collection',p_store::text||':'||p_order::text);
  INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,order_id,channel,currency,sale_cents,collected_cents,occurred_at)
  VALUES(receivable,p_store,o.customer_id,jsonb_strip_nulls(jsonb_build_object('name',b.original_payload->>'customer_name','email',b.original_payload->>'customer_email','phone',b.original_payload->>'customer_phone')),p_order,channel_value,o.currency,initial_total,initial_collected,sold);
  INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,customer_id,order_id,channel,actor_membership_id,occurred_at,created_at,metadata)
  VALUES(sale_event,p_store,p_operation,'sale',o.currency,initial_total,o.customer_id,p_order,channel_value,p_actor,sold,p_now,jsonb_build_object('orderEditImport',true,'orderEditChannel',channel_value,'evidenceSource',b.original_finance->>'evidenceSource','orderEditBaseline',true));
  IF initial_collected>0 THEN
   -- Imported evidence has no invented account or payment method. No allocation
   -- is created, so the ordinary receipt projection does not claim a cash receipt.
   INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,customer_id,order_id,channel,actor_membership_id,occurred_at,created_at,metadata)
   VALUES(receipt_event,p_store,p_operation,'collection',o.currency,initial_collected,o.customer_id,p_order,channel_value,p_actor,received,p_now,jsonb_build_object('orderEditImport',true,'orderEditChannel',channel_value,'evidenceSource',b.original_finance->>'evidenceSource','orderEditBaseline',true));
  END IF;
  SELECT * INTO STRICT r FROM saas.accounting_receivables WHERE store_id=p_store AND id=receivable;
 END IF;
 IF r.return_cents<>0 OR r.refunded_cents<>0 THEN RAISE EXCEPTION 'ORDER_EDIT_FINANCIAL_RETURN_CONFLICT';END IF;
 IF r.version>=9007199254740991 THEN RAISE EXCEPTION 'ORDER_EDIT_FINANCIAL_VERSION_OVERFLOW';END IF;
 IF p_after_total<r.discount_cents THEN RAISE EXCEPTION 'ORDER_EDIT_SETTLEMENT_DISCOUNT_CONFLICT';END IF;
 UPDATE saas.accounting_receivables SET sale_cents=p_after_total,version=version+1 WHERE store_id=p_store AND id=r.id;
 delta:=p_after_total-p_before_total;
 IF delta<>0 THEN
  delta_event:=saas.inventory_deterministic_uuid('order-edit-financial-delta',p_operation::text);
  INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,customer_id,order_id,channel,actor_membership_id,occurred_at,created_at,metadata)
  VALUES(delta_event,p_store,p_operation,'sale',o.currency,abs(delta),r.customer_id,p_order,r.channel,p_actor,p_now,p_now,jsonb_build_object('orderEditRevision',true,'orderEditSign',CASE WHEN delta<0 THEN -1 ELSE 1 END,'beforeTotalCents',p_before_total,'afterTotalCents',p_after_total));
 END IF;
 PERFORM saas.accounting_bump_customer(p_store,r.customer_id,r.currency);
END $f$;

-- Exact source replacements are admitted and backed up by the core helper.
SELECT saas.order_edit260_patch('saas.accounting_web_payment_evidence(uuid)',
 $old$SELECT e.order_id,o.currency,o.total_cents,e.created_at,3,e.id$old$,
 $new$SELECT e.order_id,o.currency,coalesce((SELECT(b.original_payload->>'total_cents')::bigint FROM saas.order_edit_baselines b WHERE b.store_id=o.store_id AND b.order_id=o.id),o.total_cents),e.created_at,3,e.id$new$);

SELECT saas.order_edit260_patch('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',
 $old$WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric END amount$old$,
 $new$WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric*CASE WHEN e.kind='sale'AND e.metadata->>'orderEditSign'='-1'THEN -1 ELSE 1 END END amount$new$);
SELECT saas.order_edit260_patch('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',
 $old$saas.accounting_pending_receipt_v4(p_store,e.id)$old$,
 $new$(saas.accounting_pending_receipt_v4(p_store,e.id)OR e.metadata->>'orderEditImport'='true')$new$);
SELECT saas.order_edit260_patch('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',
 $old$coalesce((SELECT amount FROM web WHERE currency=code.currency),0) web_payments$old$,
 $new$coalesce((SELECT amount FROM web WHERE currency=code.currency),0)+coalesce((SELECT sum(amount)FROM events WHERE currency=code.currency AND kind='collection'AND metadata->>'orderEditImport'='true'AND metadata->>'orderEditChannel'='WEB'),0) web_payments$new$);
SELECT saas.order_edit260_patch('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
 $old$CASE WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric END amount$old$,
 $new$CASE WHEN e.kind='reversal' THEN -e.amount_cents::numeric ELSE e.amount_cents::numeric*CASE WHEN e.kind='sale'AND e.metadata->>'orderEditSign'='-1'THEN -1 ELSE 1 END END amount$new$);
SELECT saas.order_edit260_patch('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
 $old$CASE WHEN e.kind='reversal' THEN -1 ELSE 1 END sign$old$,
 $new$CASE WHEN e.kind='reversal' THEN -1 WHEN e.kind='sale'AND e.metadata->>'orderEditRevision'='true'THEN 0 ELSE 1 END sign$new$);
SELECT saas.order_edit260_patch('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)',
 $old$IF original.kind IN('sale','reversal') OR EXISTS$old$,
 $new$IF original.kind IN('sale','reversal') OR original.metadata->>'orderEditImport'='true' OR EXISTS$new$);

-- Override only the derived merchandise base. Snapshot owner, rate, shipping,
-- completion time and all payout evidence stay immutable.
SELECT saas.order_edit260_patch('saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
 $old$SELECT s.*,coalesce(r.return_cents$old$,
 $new$SELECT s.store_id,s.sale_id,s.membership_id,s.original_operation_id,s.order_reference_id,s.receivable_id,s.display_name,s.phone_masked,s.rate_bps,s.basis,s.currency,saas.orders_edit_current_merchandise(s.store_id,s.order_reference_id,s.merchandise_cents)merchandise_cents,s.shipping_cents,s.completed_at,coalesce(r.return_cents$new$);
SELECT saas.order_edit260_patch('saas.accounting_commission251_balance_projection(uuid,uuid)',
 $old$SELECT s.*,coalesce(r.return_cents$old$,
 $new$SELECT s.store_id,s.sale_id,s.membership_id,s.original_operation_id,s.order_reference_id,s.receivable_id,s.display_name,s.phone_masked,s.rate_bps,s.basis,s.currency,saas.orders_edit_current_merchandise(s.store_id,s.order_reference_id,s.merchandise_cents)merchandise_cents,s.shipping_cents,s.completed_at,coalesce(r.return_cents$new$);

DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('orders_edit_payment_evidence','orders_edit_finance','orders_edit_current_merchandise','orders_edit_commission_delta','orders_edit_capture_finance','orders_edit_apply_finance')LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,r.rolname);END LOOP;
 END LOOP;
END $acl$;

-- DOWN: restore every function from order_edit260_restore after confirming its
-- current hash matches after_hash; then drop the seven private helpers above.
-- Do not discard baselines/revisions after any committed edits. Core down must
-- refuse rollback when revisions exist, preserving all original money evidence.


SELECT saas.order_edit260_patch('saas.in_store_order_guard()',
 $old$BEGIN
$old$,
 $new$BEGIN
 IF OLD.source='in_store'AND current_setting('saas.orders.edit260',true)LIKE OLD.store_id::text||':'||OLD.id::text||':%'
 AND EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=OLD.store_id AND order_id=OLD.id)
 AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at
 AND to_jsonb(NEW)-ARRAY['customer_name','customer_email','customer_phone','shipping_address','billing_address','subtotal_cents','shipping_cents','discount_cents','total_cents','payment_status','paid_at','version','updated_at']=to_jsonb(OLD)-ARRAY['customer_name','customer_email','customer_phone','shipping_address','billing_address','subtotal_cents','shipping_cents','discount_cents','total_cents','payment_status','paid_at','version','updated_at']
 THEN RETURN NEW;END IF;
$new$);
SELECT saas.order_edit260_patch('saas.pricing_manual_order_item_guard()',
 $old$BEGIN
$old$,
 $new$BEGIN
 IF current_setting('saas.orders.edit260',true)LIKE NEW.store_id::text||':'||NEW.order_id::text||':%'
 AND EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=NEW.store_id AND order_id=NEW.order_id)THEN RETURN NEW;END IF;
$new$);
SELECT saas.order_edit260_patch('saas.in_store_order_item_net(uuid,bigint)',
 $old$SELECT coalesce((SELECT net_cents FROM saas.in_store_discount_allocations WHERE order_item_id=p_item),p_gross)$old$,
 $new$SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.order_items i JOIN saas.order_edit_baselines b ON b.store_id=i.store_id AND b.order_id=i.order_id WHERE i.id=p_item)THEN p_gross ELSE coalesce((SELECT net_cents FROM saas.in_store_discount_allocations WHERE order_item_id=p_item),p_gross)END$new$);
SELECT saas.order_edit260_patch('saas.orders_detail_projection_v2(uuid,uuid)',
 $old$'billingAddress',coalesce(s.billing_address,o.billing_address)$old$,
 $new$'billingAddress',CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store AND order_id=p_order)THEN o.billing_address ELSE coalesce(s.billing_address,o.billing_address)END$new$);
SELECT saas.order_edit260_patch('saas.orders_detail_projection_v2(uuid,uuid)',
 $old$|| CASE WHEN o.source='in_store' THEN jsonb_build_object('inStorePaymentMethod'$old$,
 $new$||saas.orders_edit_contact_metadata(p_store,p_order)|| CASE WHEN o.source='in_store' THEN jsonb_build_object('inStorePaymentMethod'$new$);
-- A revision carries forward a proven unit cost for the same original variant;
-- a newly chosen variant captures its verified current cost. Historical unknown
-- costs and existing invalidations are retained rather than replaced with zero.
SELECT saas.order_edit260_patch('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
 $old$s.cost_sign*(coalesce(c.known_cost,0)+CASE WHEN trusted.catalog_trusted THEN coalesce(live.catalog_cost,0) ELSE 0 END) known_cost$old$,
 $new$s.cost_sign*(CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)THEN(saas.orders_edit_costs(p_store,s.order_id)->>'knownCost')::numeric ELSE coalesce(c.known_cost,0)+CASE WHEN trusted.catalog_trusted THEN coalesce(live.catalog_cost,0) ELSE 0 END END) known_cost$new$);
SELECT saas.order_edit260_patch('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',
 $old$(c.item_count>0 AND c.item_count=c.max_observed$old$,
 $new$(coalesce((saas.orders_edit_costs(p_store,s.order_id)->>'available')::boolean,false))OR(c.item_count>0 AND c.item_count=c.max_observed$new$);

-- Include after native260's existing cost patches, before final ACL/COMMIT.
-- Original cost snapshots / invalidations remain immutable. Complete revision
-- snapshots let reports use the original COGS plus only dated COGS differences.
CREATE OR REPLACE FUNCTION saas.orders_edit_capture_costs(p_store uuid,p_order uuid,p_intent jsonb,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE line jsonb;old_line saas.order_items%ROWTYPE;frozen saas.accounting_profitability_line_costs%ROWTYPE;previous saas.order_edit_cost_snapshots%ROWTYPE;cost_value bigint;known_value boolean;catalog_trusted boolean;v bigint;BEGIN
 v:=(p_intent->>'expectedVersion')::bigint;
 -- Match the existing catalog fallback admission, without promoting a historic
 -- invalidation or missing / changed snapshot into verified evidence.
 SELECT coalesce((SELECT cost_catalog_fallback_enabled FROM saas.accounting_release_state WHERE singleton),false)
  AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations WHERE store_id=p_store AND order_id=p_order)
  AND(SELECT count(*)FROM saas.accounting_profitability_line_costs WHERE store_id=p_store AND order_id=p_order)=(SELECT count(*)FROM saas.order_items WHERE store_id=p_store AND order_id=p_order)
  AND NOT EXISTS(SELECT 1 FROM saas.order_items i LEFT JOIN saas.accounting_profitability_line_costs f ON f.store_id=i.store_id AND f.item_id=i.id WHERE i.store_id=p_store AND i.order_id=p_order AND(f.item_id IS NULL OR f.order_id<>i.order_id OR f.quantity<>i.quantity OR f.currency<>'TRY'))
  AND coalesce((SELECT max(observed_line_count)FROM saas.accounting_profitability_line_costs WHERE store_id=p_store AND order_id=p_order),0)<=(SELECT count(*)FROM saas.order_items WHERE store_id=p_store AND order_id=p_order)
 INTO catalog_trusted;
 IF NOT EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order AND revision_version=v)THEN
  FOR old_line IN SELECT * FROM saas.order_items WHERE store_id=p_store AND order_id=p_order ORDER BY position,id LOOP
   SELECT * INTO previous FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order AND item_id=old_line.id AND revision_version<v ORDER BY revision_version DESC LIMIT 1;
   IF previous.item_id IS NOT NULL THEN
    cost_value:=previous.unit_cost_cents;known_value:=previous.known AND previous.variant_id IS NOT DISTINCT FROM old_line.variant_id AND previous.quantity=old_line.quantity AND previous.currency='TRY';
   ELSE
    SELECT * INTO frozen FROM saas.accounting_profitability_line_costs WHERE store_id=p_store AND order_id=p_order AND item_id=old_line.id;
    cost_value:=frozen.unit_cost_cents;
    known_value:=cost_value IS NOT NULL AND frozen.quantity=old_line.quantity AND frozen.currency='TRY'AND NOT EXISTS(SELECT 1 FROM saas.accounting_profitability_cost_invalidations bad WHERE bad.store_id=p_store AND bad.order_id=p_order AND bad.item_id=old_line.id);
   END IF;
   IF previous.item_id IS NULL AND NOT known_value AND cost_value IS NULL AND catalog_trusted THEN
    SELECT coalesce(exact.cost_cents,shared.cost_cents)INTO cost_value FROM saas.products product
    LEFT JOIN saas.product_variants exact ON exact.store_id=product.store_id AND exact.product_id=product.id AND exact.id=old_line.variant_id
    LEFT JOIN LATERAL(SELECT min(canonical.cost_cents)cost_cents FROM saas.product_variants canonical WHERE canonical.store_id=product.store_id AND canonical.product_id=product.id HAVING count(canonical.cost_cents)>0 AND min(canonical.cost_cents)=max(canonical.cost_cents))shared ON exact.cost_cents IS NULL
    WHERE product.store_id=p_store AND product.id=old_line.product_id AND product.currency='TRY'AND(old_line.variant_id IS NULL OR exact.id IS NOT NULL);
    known_value:=cost_value IS NOT NULL;
   END IF;
   INSERT INTO saas.order_edit_cost_snapshots VALUES(p_store,p_order,old_line.id,v,old_line.variant_id,'TRY',old_line.quantity,cost_value,coalesce(known_value,false),p_now);
  END LOOP;
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_intent->'lines')LOOP
  cost_value:=NULL;known_value:=false;
  SELECT * INTO old_line FROM saas.order_items WHERE store_id=p_store AND order_id=p_order AND id=(line->>'lineId')::uuid;
  IF old_line.id IS NOT NULL AND old_line.variant_id IS NOT DISTINCT FROM(line->>'variantId')::uuid AND old_line.product_id IS NOT DISTINCT FROM(line->>'productId')::uuid THEN
   SELECT * INTO previous FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order AND item_id=old_line.id AND revision_version<=v ORDER BY revision_version DESC LIMIT 1;
   cost_value:=previous.unit_cost_cents;known_value:=previous.known AND previous.variant_id IS NOT DISTINCT FROM old_line.variant_id AND previous.quantity=old_line.quantity AND previous.currency='TRY';
  ELSE
   -- This is the same direct catalog source used by the native insert capture.
   SELECT variant.cost_cents INTO cost_value FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store AND variant.id=(line->>'variantId')::uuid AND product.id=(line->>'productId')::uuid AND product.currency='TRY';known_value:=cost_value IS NOT NULL;
  END IF;
  INSERT INTO saas.order_edit_cost_snapshots VALUES(p_store,p_order,(line->>'lineId')::uuid,v+1,(line->>'variantId')::uuid,'TRY',(line->>'quantity')::integer,cost_value,coalesce(known_value,false),p_now);
 END LOOP;
END $f$;

CREATE FUNCTION saas.orders_edit_cost_version(p_store uuid,p_order uuid,p_version bigint,p_currency text)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('available',count(*)>0 AND coalesce(bool_and(known AND unit_cost_cents IS NOT NULL AND unit_cost_cents>=0 AND currency=p_currency),false),'knownCost',coalesce(sum(unit_cost_cents::numeric*quantity)FILTER(WHERE known AND unit_cost_cents IS NOT NULL AND currency=p_currency),0))FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order AND revision_version=p_version
$f$;

CREATE FUNCTION saas.orders_edit_cost_period(p_store uuid,p_order uuid,p_currency text,p_start timestamptz,p_end timestamptz,p_original_sign numeric)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE base_version bigint;before_value jsonb;after_value jsonb;r record;amount numeric:=0;available boolean:=true;has_evidence boolean:=false;BEGIN
 SELECT min(revision_version)INTO base_version FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order;
 IF base_version IS NULL THEN RETURN jsonb_build_object('available',false,'knownCost',0);END IF;
 IF p_original_sign<>0 THEN
  before_value:=saas.orders_edit_cost_version(p_store,p_order,base_version,p_currency);
  available:=coalesce((before_value->>'available')::boolean,false);amount:=p_original_sign*(before_value->>'knownCost')::numeric;has_evidence:=true;
 END IF;
 FOR r IN SELECT before_payload,after_payload FROM saas.order_edit_revisions WHERE store_id=p_store AND order_id=p_order AND created_at>=p_start AND created_at<p_end ORDER BY created_at,operation_id LOOP
  before_value:=saas.orders_edit_cost_version(p_store,p_order,(r.before_payload->>'version')::bigint,p_currency);
  after_value:=saas.orders_edit_cost_version(p_store,p_order,(r.after_payload->>'version')::bigint,p_currency);
  available:=available AND coalesce((before_value->>'available')::boolean,false)AND coalesce((after_value->>'available')::boolean,false);
  amount:=amount+(after_value->>'knownCost')::numeric-(before_value->>'knownCost')::numeric;has_evidence:=true;
 END LOOP;
 -- A discount-only period still needs a verified cost scope, even though that
 -- period recognizes no COGS. Preserve native known-cost eligibility semantics.
 IF NOT has_evidence THEN
  SELECT max(revision_version)INTO base_version FROM saas.order_edit_cost_snapshots WHERE store_id=p_store AND order_id=p_order;
  available:=coalesce((saas.orders_edit_cost_version(p_store,p_order,base_version,p_currency)->>'available')::boolean,false);
 END IF;
 RETURN jsonb_build_object('available',available,'knownCost',amount);
END $f$;

SELECT saas.order_edit260_patch_many('saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)',jsonb_build_array(
jsonb_build_array($old$s.cost_sign*(CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)THEN(saas.orders_edit_costs(p_store,s.order_id)->>'knownCost')::numeric ELSE coalesce(c.known_cost,0)+CASE WHEN trusted.catalog_trusted THEN coalesce(live.catalog_cost,0) ELSE 0 END END) known_cost$old$,$new$CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)THEN(saas.orders_edit_cost_period(p_store,s.order_id,s.currency,start_at,end_at,s.cost_sign::numeric)->>'knownCost')::numeric ELSE s.cost_sign*(coalesce(c.known_cost,0)+CASE WHEN trusted.catalog_trusted THEN coalesce(live.catalog_cost,0) ELSE 0 END)END known_cost$new$),
jsonb_build_array($old$(coalesce((saas.orders_edit_costs(p_store,s.order_id)->>'available')::boolean,false))OR(c.item_count>0 AND c.item_count=c.max_observed$old$,$new$CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)THEN coalesce((saas.orders_edit_cost_period(p_store,s.order_id,s.currency,start_at,end_at,s.cost_sign::numeric)->>'available')::boolean,false)ELSE(c.item_count>0 AND c.item_count=c.max_observed$new$),
jsonb_build_array($old$OR (trusted.catalog_trusted AND live.item_count>0 AND live.resolved_item_count=live.item_count) cost_available,$old$,$new$OR (trusted.catalog_trusted AND live.item_count>0 AND live.resolved_item_count=live.item_count)END cost_available,$new$),
jsonb_build_array($old$s.cost_sign<>0 AND trusted.catalog_trusted AND live.catalog_item_count>0 catalog_order,$old$,$new$NOT EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)AND s.cost_sign<>0 AND trusted.catalog_trusted AND live.catalog_item_count>0 catalog_order,$new$),
jsonb_build_array($old$CASE WHEN s.cost_sign<>0 AND trusted.catalog_trusted THEN s.cost_sign*coalesce(live.catalog_cost,0) ELSE 0 END catalog_cost$old$,$new$CASE WHEN NOT EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=s.order_id)AND s.cost_sign<>0 AND trusted.catalog_trusted THEN s.cost_sign*coalesce(live.catalog_cost,0) ELSE 0 END catalog_cost$new$),
jsonb_build_array($old$c.cost_sign=0 OR c.cost_available cost_complete$old$,$new$CASE WHEN EXISTS(SELECT 1 FROM saas.order_edit_cost_snapshots revised WHERE revised.store_id=p_store AND revised.order_id=c.order_id)THEN c.cost_available ELSE c.cost_sign=0 OR c.cost_available END cost_complete$new$),
jsonb_build_array($old$WHERE d.amount<>0 AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.order_id=d.order_id AND s.currency=d.currency)
 ),cost_resolution AS MATERIALIZED($old$,$new$WHERE d.amount<>0 AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.order_id=d.order_id AND s.currency=d.currency)
  UNION ALL
  SELECT DISTINCT r.order_id,r.after_payload->>'currency',0::numeric,0::numeric FROM saas.order_edit_revisions r WHERE r.store_id=p_store AND r.created_at>=start_at AND r.created_at<end_at AND(NOT(p_filters?'currency')OR r.after_payload->>'currency'=p_filters->>'currency')AND NOT EXISTS(SELECT 1 FROM sales s WHERE s.order_id=r.order_id AND s.currency=r.after_payload->>'currency')AND NOT EXISTS(SELECT 1 FROM scope_discount_totals d WHERE d.order_id=r.order_id AND d.currency=r.after_payload->>'currency'AND d.amount<>0)
 ),cost_resolution AS MATERIALIZED($new$)));







-- Zero-total edits can change quantity/cost with no financial sale delta event.
-- Add those dated orders to the existing cost_subjects union exactly once.


-- Down: existing core drops all orders_edit_% helpers after source-hash-checked
-- restoration. Keep order_edit_cost_snapshots immutable and refuse rollback once
-- committed revisions exist. No native242 cost snapshots/invalidations are edited.


-- Include before native260 final ACL/COMMIT. Only a real committed cancellation
-- event for a previously edited order enters this boundary. The parent adds the
-- exact predecessor signature/hash below to order_edit260_restore admission.
CREATE OR REPLACE FUNCTION saas.orders_edit_finance(p_store uuid,p_order uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.accounting_receivables%ROWTYPE;o saas.orders%ROWTYPE;proof jsonb;collected bigint;discounted bigint:=0;obligation bigint;BEGIN
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=p_order;
 IF r.id IS NOT NULL THEN collected:=r.collected_cents-r.refunded_cents;discounted:=r.discount_cents;obligation:=greatest(r.sale_cents-r.return_cents-r.discount_cents,0);
 ELSE proof:=saas.orders_edit_payment_evidence(p_store,p_order);collected:=(proof->>'collectedCents')::bigint;obligation:=greatest(o.total_cents-discounted,0);END IF;
 RETURN jsonb_build_object('collectedCents',collected,'settlementDiscountCents',discounted,'dueCents',greatest(obligation-collected,0),'refundDueCents',greatest(collected-obligation,0));
END $f$;

SELECT saas.order_edit260_patch('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
 $old$  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;$old$,
 $new$  IF p_next_status='cancelled'AND EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store_id AND order_id=p_order_id)THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
    PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store_id::text,0));
  END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;$new$);
SELECT saas.order_edit260_patch('saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
 $old$IF current_order.source='manual' AND p_next_status='cancelled' THEN$old$,
 $new$IF current_order.source='manual' AND p_next_status='cancelled'AND NOT EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=p_store_id AND order_id=p_order_id)THEN$new$);

CREATE FUNCTION saas.orders_edit_cancel_event()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders%ROWTYPE;r saas.accounting_receivables%ROWTYPE;b record;operation_id_value uuid;event_id_value uuid;amount bigint;old_marker text;BEGIN
 IF NEW.event_type<>'status_transition'OR NEW.to_value<>'cancelled'OR NOT EXISTS(SELECT 1 FROM saas.order_edit_baselines WHERE store_id=NEW.store_id AND order_id=NEW.order_id)THEN RETURN NEW;END IF;
 operation_id_value:=saas.inventory_deterministic_uuid('order-edit-cancel-operation',NEW.id::text);
 event_id_value:=saas.inventory_deterministic_uuid('order-edit-cancel-finance',NEW.id::text);
 IF EXISTS(SELECT 1 FROM saas.accounting_events WHERE store_id=NEW.store_id AND id=event_id_value)THEN RETURN NEW;END IF;
 -- The narrow outer status patch owns these before order / manual-variant rows.
 -- Reentrant locks preserve the collection/edit writer order at the event hook.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||NEW.store_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||NEW.store_id::text,0));
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=NEW.store_id AND id=NEW.order_id FOR UPDATE;
 IF o.status<>'cancelled'OR NEW.actor_membership_id IS NULL OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=NEW.store_id AND id=NEW.actor_membership_id)THEN RAISE EXCEPTION 'ORDER_EDIT_CANCEL_CONTEXT_INVALID';END IF;
 SELECT * INTO r FROM saas.accounting_receivables WHERE store_id=NEW.store_id AND order_id=NEW.order_id FOR UPDATE;
 IF r.id IS NULL OR r.return_cents<>0 OR r.refunded_cents<>0 THEN RAISE EXCEPTION 'ORDER_EDIT_CANCEL_FINANCIAL_CONFLICT';END IF;
 IF r.version>=9007199254740991 THEN RAISE EXCEPTION 'ORDER_EDIT_CANCEL_FINANCIAL_VERSION_OVERFLOW';END IF;
 amount:=greatest(r.sale_cents-r.discount_cents,0);
 -- This is an obligation cancellation. Historical collections and account
 -- movements remain unchanged; actual refund continues to require its own act.
 INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,customer_id,order_id,channel,actor_membership_id,occurred_at,created_at,metadata)
 VALUES(event_id_value,NEW.store_id,operation_id_value,'return_credit',r.currency,amount,r.customer_id,NEW.order_id,r.channel,NEW.actor_membership_id,NEW.created_at,NEW.created_at,jsonb_build_object('orderEditCancellation',true,'statusEventId',NEW.id,'saleCents',r.sale_cents,'settlementDiscountCents',r.discount_cents));
 IF amount>0 THEN INSERT INTO saas.accounting_allocations VALUES(NEW.store_id,event_id_value,r.id,'return',amount);END IF;
 UPDATE saas.accounting_receivables SET return_cents=return_cents+amount,version=version+1 WHERE store_id=NEW.store_id AND id=r.id;
 PERFORM saas.accounting_bump_customer(NEW.store_id,r.customer_id,r.currency);
 -- Edited manual orders also return to their actual original warehouses. The
 -- narrow outer patch skips the legacy location-free commitment restoration.
 IF true THEN
  PERFORM 1 FROM saas.product_variants WHERE store_id=NEW.store_id AND id IN(SELECT variant_id FROM saas.order_edit_stock_state WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND quantity>0)ORDER BY id FOR UPDATE;
  PERFORM 1 FROM saas.inventory_balances WHERE store_id=NEW.store_id AND(variant_id,location_id)IN(SELECT variant_id,location_id FROM saas.order_edit_stock_state WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND quantity>0)ORDER BY variant_id,location_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM saas.order_edit_stock_state s LEFT JOIN saas.inventory_balances balance ON balance.store_id=s.store_id AND balance.location_id=s.location_id AND balance.variant_id=s.variant_id WHERE s.store_id=NEW.store_id AND s.order_id=NEW.order_id AND s.quantity>0 AND(balance.store_id IS NULL OR balance.quantity::numeric+s.quantity>2147483647 OR balance.version>=9007199254740991))THEN RAISE EXCEPTION 'ORDER_EDIT_CANCEL_INVENTORY_CONFLICT';END IF;
  old_marker:=current_setting('saas.inventory.source_marker',true);PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR b IN SELECT * FROM saas.order_edit_stock_state WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND quantity>0 ORDER BY variant_id,location_id FOR UPDATE LOOP
   UPDATE saas.inventory_balances SET quantity=quantity+b.quantity,version=version+1,updated_at=greatest(updated_at,NEW.created_at)WHERE store_id=NEW.store_id AND location_id=b.location_id AND variant_id=b.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('order-edit-cancel-stock',NEW.id::text||':'||b.variant_id::text||':'||b.location_id::text),NEW.store_id,b.location_id,b.variant_id,'order_edit','in',b.quantity,'order_edit',operation_id_value,NEW.created_at,NEW.created_at);
  END LOOP;
  UPDATE saas.product_variants variant SET stock_quantity=saas.inventory_active_balance_total(NEW.store_id,variant.id),version=version+1,updated_at=greatest(updated_at,NEW.created_at)WHERE variant.store_id=NEW.store_id AND variant.id IN(SELECT variant_id FROM saas.order_edit_stock_state WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND quantity>0);
  PERFORM set_config('saas.inventory.source_marker',coalesce(old_marker,''),true);
 END IF;
 UPDATE saas.manual_order_inventory_commitments SET restoration_operation_id=operation_id_value,restored_at=NEW.created_at WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND restoration_operation_id IS NULL;
 -- Every source now has an idempotent zero-consumption state.
 UPDATE saas.order_edit_stock_state SET quantity=0 WHERE store_id=NEW.store_id AND order_id=NEW.order_id;
 UPDATE saas.order_edit_unmanaged_stock SET quantity=0 WHERE store_id=NEW.store_id AND order_id=NEW.order_id;
 RETURN NEW;
END $f$;
CREATE TRIGGER orders_edit_cancel_event AFTER INSERT ON saas.order_events FOR EACH ROW WHEN(NEW.event_type='status_transition'AND NEW.to_value='cancelled')EXECUTE FUNCTION saas.orders_edit_cancel_event();

SELECT saas.order_edit260_patch('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)',
 $old$OR original.metadata->>'orderEditImport'='true' OR EXISTS$old$,
 $new$OR original.metadata->>'orderEditImport'='true' OR original.metadata->>'orderEditCancellation'='true' OR EXISTS$new$);

-- Down: DROP TRIGGER orders_edit_cancel_event ON saas.order_events before the
-- existing down helper/function cleanup. Its new function is orders_edit_% and
-- remains private under the existing final ACL loop. Restore accounting_mutate
-- through the native260 source-hash-checked backup; do not remove committed rows.


DO $acl$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'orders_edit_%'OR proname LIKE 'order_edit260_%')LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,r.rolname);END LOOP;
  IF f.proname IN('orders_edit_workspace','orders_edit_options','orders_edit_preview','orders_edit_apply','orders_edit_recover')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',f.signature);END IF;
 END LOOP;
END $acl$;
COMMIT;
