-- New orders only: durable, transactional store-local WEB/POS numbers.
-- Provider references, draft sale identifiers and historical orders are untouched.
-- Allocation is explicit in every existing creator. An already-running old body
-- finishes with its original number and receipt, without a timed cutover gate.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.order_number_migration_restore (
 signature text PRIMARY KEY,definition text NOT NULL,owner_name name NOT NULL,
 original_acl aclitem[] NOT NULL,before_hash text NOT NULL,after_hash text,
 CHECK(before_hash~'^[a-f0-9]{64}$'),CHECK(after_hash IS NULL OR after_hash~'^[a-f0-9]{64}$')
);
CREATE TABLE saas.order_number_counters (
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 series text NOT NULL CHECK(series IN('WEB','POS')),
 last_value bigint NOT NULL CHECK(last_value>=0),PRIMARY KEY(store_id,series)
);
CREATE TABLE saas.order_number_allocations (
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 order_id uuid PRIMARY KEY,series text NOT NULL CHECK(series IN('WEB','POS')),
 ordinal bigint NOT NULL CHECK(ordinal>0),order_number text NOT NULL,allocated_at timestamptz NOT NULL,
 UNIQUE(store_id,series,ordinal),UNIQUE(store_id,order_number),
 CHECK(isfinite(allocated_at)),
 CHECK(order_number=series||'-'||lpad(ordinal::text,greatest(CASE series WHEN 'WEB' THEN 6 ELSE 7 END,length(ordinal::text)),'0'))
);
CREATE INDEX in_store_sales_completed_order_number_v161
 ON saas.in_store_sales(store_id,order_number)
 WHERE status='completed' AND order_number IS NOT NULL;

DO $tables$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['order_number_migration_restore','order_number_counters','order_number_allocations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY owner_only ON saas.%I TO celebix_saas_owner USING(true) WITH CHECK(true)',table_name);
  EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',table_name);
 END LOOP;
END $tables$;

-- Only canonical decimal suffixes up to bigint width participate. In particular,
-- a legacy POS UUID consisting solely of digits still has 32 digits and is excluded.
CREATE FUNCTION saas.order_number_existing_max(p_store uuid,p_series text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT coalesce(max(candidate.ordinal),0)
 FROM (
  SELECT substring(order_number FROM 5)::numeric AS ordinal
  FROM saas.orders WHERE store_id=p_store
   AND order_number~('^'||p_series||'-[0-9]{'||CASE p_series WHEN 'WEB' THEN '6' ELSE '7' END||',19}$')
  UNION ALL
  SELECT substring(order_number FROM 5)::numeric
  FROM saas.in_store_sales WHERE store_id=p_store AND status='completed'
   AND order_number~('^'||p_series||'-[0-9]{'||CASE p_series WHEN 'WEB' THEN '6' ELSE '7' END||',19}$')
  UNION ALL
  SELECT ordinal::numeric FROM saas.order_number_allocations WHERE store_id=p_store AND series=p_series
 ) candidate
$fn$;

-- All writes share this exact tenant/series lock, including retained assignment
-- lookup. Counters and allocations roll back together with a failed order INSERT.
CREATE FUNCTION saas.order_number_allocate(p_store uuid,p_order uuid,p_series text,p_now timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE assigned saas.order_number_allocations%ROWTYPE;last_ordinal bigint;candidate bigint;
 existing_max numeric;number text;minimum_width integer;
BEGIN
 IF p_store IS NULL OR p_order IS NULL OR p_series IS NULL OR p_series NOT IN('WEB','POS')
  OR p_now IS NULL OR NOT isfinite(p_now) THEN RAISE invalid_parameter_value USING MESSAGE='ORDER_NUMBER_INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.order.number:'||p_store::text||':'||p_series,0));
 SELECT * INTO assigned FROM saas.order_number_allocations WHERE order_id=p_order;
 IF FOUND THEN
  IF assigned.store_id<>p_store OR assigned.series<>p_series THEN RAISE unique_violation USING MESSAGE='ORDER_NUMBER_ALLOCATION_MISMATCH';END IF;
  RETURN assigned.order_number;
 END IF;
 SELECT last_value INTO last_ordinal FROM saas.order_number_counters WHERE store_id=p_store AND series=p_series FOR UPDATE;
 IF NOT FOUND THEN
  existing_max:=saas.order_number_existing_max(p_store,p_series);
  IF existing_max>9223372036854775807 THEN RAISE numeric_value_out_of_range USING MESSAGE='ORDER_NUMBER_SERIES_EXHAUSTED';END IF;
  last_ordinal:=existing_max::bigint;
  INSERT INTO saas.order_number_counters VALUES(p_store,p_series,last_ordinal);
 END IF;
 minimum_width:=CASE p_series WHEN 'WEB' THEN 6 ELSE 7 END;
 LOOP
  IF last_ordinal=9223372036854775807 THEN RAISE numeric_value_out_of_range USING MESSAGE='ORDER_NUMBER_SERIES_EXHAUSTED';END IF;
  candidate:=last_ordinal+1;
  number:=p_series||'-'||lpad(candidate::text,greatest(minimum_width,length(candidate::text)),'0');
  IF NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store AND order_number=number)
   AND NOT EXISTS(SELECT 1 FROM saas.order_number_allocations WHERE store_id=p_store AND order_number=number)
   AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store AND status='completed' AND order_number=number)
  THEN EXIT;END IF;
  -- A later import may have retained a canonical external number. Advance past
  -- its complete current range instead of failing or replacing the reference.
  existing_max:=greatest(last_ordinal,candidate,saas.order_number_existing_max(p_store,p_series));
  IF existing_max>9223372036854775807 THEN RAISE numeric_value_out_of_range USING MESSAGE='ORDER_NUMBER_SERIES_EXHAUSTED';END IF;
  last_ordinal:=existing_max::bigint;
 END LOOP;
 UPDATE saas.order_number_counters SET last_value=candidate WHERE store_id=p_store AND series=p_series;
 INSERT INTO saas.order_number_allocations VALUES(p_store,p_order,p_series,candidate,number,p_now);
 RETURN number;
END $fn$;

CREATE FUNCTION saas.order_number_assign_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_series text;assigned saas.order_number_allocations%ROWTYPE;
BEGIN
 selected_series:=CASE NEW.source WHEN 'storefront' THEN 'WEB' WHEN 'quick_link' THEN 'WEB'
  WHEN 'manual' THEN 'POS' WHEN 'in_store' THEN 'POS' ELSE NULL END;
 SELECT * INTO assigned FROM saas.order_number_allocations WHERE order_id=NEW.id;
 IF FOUND AND (assigned.store_id IS DISTINCT FROM NEW.store_id OR assigned.series IS DISTINCT FROM selected_series
  OR assigned.order_number IS DISTINCT FROM NEW.order_number)
 THEN RAISE check_violation USING MESSAGE='ORDER_NUMBER_ALLOCATION_MISMATCH';END IF;
 -- An allocation legitimately exists before the first INSERT. The established
 -- permanent deletion audit distinguishes that case from an order tombstone.
 IF EXISTS(SELECT 1 FROM saas.record_deletion_operations deleted WHERE deleted.store_id=NEW.store_id
   AND deleted.resource_kind='order' AND deleted.resource_id=NEW.id AND deleted.outcome='deleted')
 THEN RAISE unique_violation USING MESSAGE='ORDER_NUMBER_DELETED_ORDER';END IF;
 -- Unallocated legacy bodies already in flight retain their original number.
 RETURN NEW;
END $fn$;

CREATE FUNCTION saas.order_number_immutable_after_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
BEGIN
 IF (NEW.order_number IS DISTINCT FROM OLD.order_number OR NEW.id IS DISTINCT FROM OLD.id OR NEW.store_id IS DISTINCT FROM OLD.store_id)
  AND EXISTS(SELECT 1 FROM saas.order_number_allocations WHERE order_id=OLD.id)
 THEN RAISE check_violation USING MESSAGE='ORDER_NUMBER_IMMUTABLE';END IF;
 RETURN NEW;
END $fn$;
CREATE FUNCTION saas.order_number_allocation_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$
BEGIN RAISE check_violation USING MESSAGE='ORDER_NUMBER_ALLOCATION_IMMUTABLE';END $fn$;

CREATE TRIGGER order_number_assign_before_insert BEFORE INSERT ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.order_number_assign_before_insert();
CREATE TRIGGER order_number_immutable_after_allocation BEFORE UPDATE ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.order_number_immutable_after_allocation();
CREATE TRIGGER order_number_allocation_immutable BEFORE UPDATE OR DELETE ON saas.order_number_allocations FOR EACH ROW EXECUTE FUNCTION saas.order_number_allocation_immutable();

-- Seed counters without assigning or altering a single existing order. Retained
-- POS sale tombstones also participate, so deletion cannot lower the initial seed.
INSERT INTO saas.order_number_counters(store_id,series,last_value)
SELECT store.id,series.code,saas.order_number_existing_max(store.id,series.code)::bigint
FROM saas.stores store CROSS JOIN (VALUES('WEB'::text),('POS'::text)) series(code);

REVOKE ALL ON FUNCTION saas.order_number_existing_max(uuid,text),
 saas.order_number_allocate(uuid,uuid,text,timestamptz),saas.order_number_assign_before_insert(),
 saas.order_number_immutable_after_allocation(),saas.order_number_allocation_immutable()
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,
 celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- Exact predecessor hashes and INSERT anchors are appended below. Allocation
-- and RETURNING keep every receipt/operation projection bound to the stored number.
DO $creator_patches$
DECLARE entry record;routine oid;definition text;patched text;owner_name name;original_acl aclitem[];actual_hash text;
BEGIN
 FOR entry IN SELECT * FROM (VALUES
('saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)','22d7f99ab7b8da1b91a2ae4af6559c3b47cd6d41a5bee62158c9363a2d5e9382','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,selected.sale_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at);$insert_anchor$,$updated_insert$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at);$updated_insert$,'actual_order_number := saas.order_number_allocate(p_store_id,target_order,''POS'',p_now);','actual_order_number',true,true),
('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','2220103da3714167c16dd06566019551e6f35db5e2af641121d53ef1f12b36af','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
  VALUES(order_id,p_store_id,order_number,'manual',current_draft.customer_id,current_draft.customer_name,current_draft.customer_email,current_draft.customer_phone,current_draft.currency,current_draft.subtotal_cents,current_draft.shipping_cents,current_draft.discount_cents,current_draft.total_cents,'pending','pending',current_draft.shipping_address,1,p_now,p_now);$insert_anchor$,$updated_insert$INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
  VALUES(order_id,p_store_id,order_number,'manual',current_draft.customer_id,current_draft.customer_name,current_draft.customer_email,current_draft.customer_phone,current_draft.currency,current_draft.subtotal_cents,current_draft.shipping_cents,current_draft.discount_cents,current_draft.total_cents,'pending','pending',current_draft.shipping_address,1,p_now,p_now);$updated_insert$,'order_number := saas.order_number_allocate(p_store_id,order_id,''POS'',p_now);','order_number',false,false),
('saas.public_checkout_complete_v2(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone,text[])','2d897492c36ab49cb36bcb7e8a11a29411b206de70a26a9477408a2409d85129','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,v_store_id,v_order_number,'storefront',v_customer.first_name||' '||v_customer.last_name,
    v_customer.email,v_customer.phone,v_currency,v_subtotal,v_shipping,v_discount_total,v_grand_total,'pending','pending',
    p_delivery->'shippingAddress',NULL,1,p_now,p_now,v_customer.id);$insert_anchor$,$updated_insert$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,v_store_id,v_order_number,'storefront',v_customer.first_name||' '||v_customer.last_name,
    v_customer.email,v_customer.phone,v_currency,v_subtotal,v_shipping,v_discount_total,v_grand_total,'pending','pending',
    p_delivery->'shippingAddress',NULL,1,p_now,p_now,v_customer.id);$updated_insert$,'v_order_number := saas.order_number_allocate(v_store_id,p_order_id,''WEB'',p_now);','v_order_number',false,false),
('saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)','e959ec1b74a44426eb6ab981c98aba2e07bcc1eb34e953eb7007e81773ca4505','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,selected_store,order_number,'storefront',selected_customer.first_name||' '||selected_customer.last_name,
    selected_customer.email,selected_customer.phone,'TRY',subtotal,shipping,0,subtotal+shipping,'pending','pending',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'line1',p_delivery->'shippingAddress'->>'line1',
      'line2',p_delivery->'shippingAddress'->>'line2',
      'district',p_delivery->'shippingAddress'->>'district',
      'city',p_delivery->'shippingAddress'->>'city',
      'postalCode',p_delivery->'shippingAddress'->>'postalCode',
      'country',p_delivery->'shippingAddress'->>'country'
    )),NULL,1,p_now,p_now,selected_customer.id);$insert_anchor$,$updated_insert$INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,selected_store,order_number,'storefront',selected_customer.first_name||' '||selected_customer.last_name,
    selected_customer.email,selected_customer.phone,'TRY',subtotal,shipping,0,subtotal+shipping,'pending','pending',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'line1',p_delivery->'shippingAddress'->>'line1',
      'line2',p_delivery->'shippingAddress'->>'line2',
      'district',p_delivery->'shippingAddress'->>'district',
      'city',p_delivery->'shippingAddress'->>'city',
      'postalCode',p_delivery->'shippingAddress'->>'postalCode',
      'country',p_delivery->'shippingAddress'->>'country'
    )),NULL,1,p_now,p_now,selected_customer.id);$updated_insert$,'order_number := saas.order_number_allocate(selected_store,p_order_id,''WEB'',p_now);','order_number',false,false),
('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)','d8082d0abfec2a2674942283e64c15f52a231c2be19bb6ba7d81477c8c7cab17','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
  ) VALUES(
    p_order_id,current_link.store_id,p_order_number,'quick_link',current_link.customer_name,
    current_link.customer_email,current_link.customer_phone,current_link.currency,current_link.subtotal_cents,
    current_link.shipping_cents,current_link.discount_cents,current_link.total_cents,'confirmed','completed',
    current_link.shipping_address,current_link.billing_address,current_link.id,1,p_now,p_now
  );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
  ) VALUES(
    p_order_id,current_link.store_id,p_order_number,'quick_link',current_link.customer_name,
    current_link.customer_email,current_link.customer_phone,current_link.currency,current_link.subtotal_cents,
    current_link.shipping_cents,current_link.discount_cents,current_link.total_cents,'confirmed','completed',
    current_link.shipping_address,current_link.billing_address,current_link.id,1,p_now,p_now
  );$updated_insert$,'p_order_number := saas.order_number_allocate(current_link.store_id,p_order_id,''WEB'',p_now);','p_order_number',false,false),
('saas.quick_order_hosted_payment_terminal_transition()','7cc0dc8838a7f2ff64fa1bbdba5a5329b8c57fd5464cdc35fe634e00bd3b2755','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
      shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
    ) VALUES(
      bridge.order_id,link.store_id,bridge.order_number,'quick_link',link.customer_name,
      link.customer_email,link.customer_phone,link.currency,link.subtotal_cents,link.shipping_cents,
      link.discount_cents,link.total_cents,'confirmed','completed',link.shipping_address,
      link.billing_address,link.id,1,NEW.updated_at,NEW.updated_at
    );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
      shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
    ) VALUES(
      bridge.order_id,link.store_id,actual_order_number,'quick_link',link.customer_name,
      link.customer_email,link.customer_phone,link.currency,link.subtotal_cents,link.shipping_cents,
      link.discount_cents,link.total_cents,'confirmed','completed',link.shipping_address,
      link.billing_address,link.id,1,NEW.updated_at,NEW.updated_at
    );$updated_insert$,'actual_order_number := saas.order_number_allocate(link.store_id,bridge.order_id,''WEB'',NEW.updated_at);','actual_order_number',true,false),
('saas.storefront_checkout_payment_attempt_terminal()','d84c8f3ae70813ad3c48f9d43dd6b6548036a6732bc0128aaf0868cea201a578','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,
      currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
      payment_status,shipping_address,billing_address,storefront_cart_id,
      version,created_at,updated_at
    ) VALUES(
      selected_bridge.order_id,selected_bridge.store_id,selected_bridge.order_number,
      'storefront',selected_bridge.settlement_snapshot#>>'{customer,name}',
      selected_bridge.settlement_snapshot#>>'{customer,email}',
      selected_bridge.settlement_snapshot#>>'{customer,phone}',
      selected_bridge.settlement_snapshot#>>'{money,currency}',
      (selected_bridge.settlement_snapshot#>>'{money,subtotalCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,shippingCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,discountCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,totalCents}')::bigint,
      'confirmed','completed',selected_bridge.settlement_snapshot#>'{customer,shippingAddress}',
      selected_bridge.settlement_snapshot#>'{customer,billingAddress}',
      selected_bridge.cart_id,1,NEW.updated_at,NEW.updated_at
    );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,
      currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
      payment_status,shipping_address,billing_address,storefront_cart_id,
      version,created_at,updated_at
    ) VALUES(
      selected_bridge.order_id,selected_bridge.store_id,actual_order_number,
      'storefront',selected_bridge.settlement_snapshot#>>'{customer,name}',
      selected_bridge.settlement_snapshot#>>'{customer,email}',
      selected_bridge.settlement_snapshot#>>'{customer,phone}',
      selected_bridge.settlement_snapshot#>>'{money,currency}',
      (selected_bridge.settlement_snapshot#>>'{money,subtotalCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,shippingCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,discountCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,totalCents}')::bigint,
      'confirmed','completed',selected_bridge.settlement_snapshot#>'{customer,shippingAddress}',
      selected_bridge.settlement_snapshot#>'{customer,billingAddress}',
      selected_bridge.cart_id,1,NEW.updated_at,NEW.updated_at
    );$updated_insert$,'actual_order_number := saas.order_number_allocate(selected_bridge.store_id,selected_bridge.order_id,''WEB'',NEW.updated_at);','actual_order_number',true,false),
('saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)','43c1d1c141f1d2b0db7820b9e43e55c390bcbd81ee2dc5d0dd7b5b0e3a1e85d2','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,
    currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
    payment_status,shipping_address,billing_address,storefront_cart_id,
    version,created_at,updated_at
  ) VALUES(
    created_order_id,selected_cart.store_id,created_order_number,'storefront',
    selected_cart.customer_name,selected_cart.customer_email,selected_cart.customer_phone,
    selected_cart.currency,(quote_payload->>'subtotalCents')::bigint,
    (quote_payload->>'shippingCents')::bigint,(quote_payload->>'discountCents')::bigint,
    (quote_payload->>'totalCents')::bigint,'confirmed','pending',
    selected_cart.shipping_address,selected_cart.billing_address,selected_cart.id,
    1,p_now,p_now
  );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,
    currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
    payment_status,shipping_address,billing_address,storefront_cart_id,
    version,created_at,updated_at
  ) VALUES(
    created_order_id,selected_cart.store_id,created_order_number,'storefront',
    selected_cart.customer_name,selected_cart.customer_email,selected_cart.customer_phone,
    selected_cart.currency,(quote_payload->>'subtotalCents')::bigint,
    (quote_payload->>'shippingCents')::bigint,(quote_payload->>'discountCents')::bigint,
    (quote_payload->>'totalCents')::bigint,'confirmed','pending',
    selected_cart.shipping_address,selected_cart.billing_address,selected_cart.id,
    1,p_now,p_now
  );$updated_insert$,'created_order_number := saas.order_number_allocate(selected_cart.store_id,created_order_id,''WEB'',p_now);','created_order_number',false,false),
('saas.storefront_hosted_checkout_promotion_terminal_v2()','6b5b70464d784515e07e01c1ef07abde5ccdfd572bdbd291c92034ae194b672a','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    v_session.order_id,v_session.store_id,v_order_number,'storefront',
    v_customer.first_name||' '||v_customer.last_name,v_customer.email,v_customer.phone,
    v_session.currency,v_session.subtotal_minor,v_session.shipping_minor,
    v_session.discount_minor,v_session.total_minor,'confirmed','completed',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',v_customer.first_name||' '||v_customer.last_name,
      'line1',v_session.delivery_snapshot->'shippingAddress'->>'line1',
      'line2',v_session.delivery_snapshot->'shippingAddress'->>'line2',
      'district',v_session.delivery_snapshot->'shippingAddress'->>'district',
      'city',v_session.delivery_snapshot->'shippingAddress'->>'city',
      'postalCode',v_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country',v_session.delivery_snapshot->'shippingAddress'->>'country'
    )),NULL,1,NEW.updated_at,NEW.updated_at,v_customer.id
  );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    v_session.order_id,v_session.store_id,v_order_number,'storefront',
    v_customer.first_name||' '||v_customer.last_name,v_customer.email,v_customer.phone,
    v_session.currency,v_session.subtotal_minor,v_session.shipping_minor,
    v_session.discount_minor,v_session.total_minor,'confirmed','completed',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',v_customer.first_name||' '||v_customer.last_name,
      'line1',v_session.delivery_snapshot->'shippingAddress'->>'line1',
      'line2',v_session.delivery_snapshot->'shippingAddress'->>'line2',
      'district',v_session.delivery_snapshot->'shippingAddress'->>'district',
      'city',v_session.delivery_snapshot->'shippingAddress'->>'city',
      'postalCode',v_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country',v_session.delivery_snapshot->'shippingAddress'->>'country'
    )),NULL,1,NEW.updated_at,NEW.updated_at,v_customer.id
  );$updated_insert$,'v_order_number := saas.order_number_allocate(v_session.store_id,v_session.order_id,''WEB'',NEW.updated_at);','v_order_number',false,false),
('saas.storefront_hosted_checkout_terminal_transition()','6b3c5008cc4dc74dc3ed9347dec9f850b63d7fac283794ec612f78d8e4b0dd05','celebix_saas_owner','{celebix_saas_owner=X/celebix_saas_owner}',$insert_anchor$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    selected_session.order_id,selected_session.store_id,order_number,'storefront',
    selected_customer.first_name||' '||selected_customer.last_name,selected_customer.email,
    selected_customer.phone,selected_session.currency,selected_session.subtotal_minor,
    selected_session.shipping_minor,selected_session.discount_minor,selected_session.total_minor,
    'confirmed','completed',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'line1',selected_session.delivery_snapshot->'shippingAddress'->>'line1',
      'line2',selected_session.delivery_snapshot->'shippingAddress'->>'line2',
      'district',selected_session.delivery_snapshot->'shippingAddress'->>'district',
      'city',selected_session.delivery_snapshot->'shippingAddress'->>'city',
      'postalCode',selected_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country',selected_session.delivery_snapshot->'shippingAddress'->>'country'
    )),NULL,
    1,NEW.updated_at,NEW.updated_at,selected_customer.id
  );$insert_anchor$,$updated_insert$INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    selected_session.order_id,selected_session.store_id,order_number,'storefront',
    selected_customer.first_name||' '||selected_customer.last_name,selected_customer.email,
    selected_customer.phone,selected_session.currency,selected_session.subtotal_minor,
    selected_session.shipping_minor,selected_session.discount_minor,selected_session.total_minor,
    'confirmed','completed',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'line1',selected_session.delivery_snapshot->'shippingAddress'->>'line1',
      'line2',selected_session.delivery_snapshot->'shippingAddress'->>'line2',
      'district',selected_session.delivery_snapshot->'shippingAddress'->>'district',
      'city',selected_session.delivery_snapshot->'shippingAddress'->>'city',
      'postalCode',selected_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country',selected_session.delivery_snapshot->'shippingAddress'->>'country'
    )),NULL,
    1,NEW.updated_at,NEW.updated_at,selected_customer.id
  );$updated_insert$,'order_number := saas.order_number_allocate(selected_session.store_id,selected_session.order_id,''WEB'',NEW.updated_at);','order_number',false,false)
 ) AS predecessors(signature,expected_hash,expected_owner,expected_acl,insert_anchor,updated_insert,allocation_statement,target_variable,add_variable,pos_sale) LOOP
  routine:=to_regprocedure(entry.signature);
  SELECT pg_get_functiondef(proc.oid),role.rolname,proc.proacl INTO definition,owner_name,original_acl
  FROM pg_proc proc JOIN pg_roles role ON role.oid=proc.proowner WHERE proc.oid=routine;
  IF definition IS NULL THEN RAISE EXCEPTION 'ORDER_NUMBER_PREDECESSOR_MISSING:%',entry.signature;END IF;
  actual_hash:=encode(sha256(convert_to(definition,'UTF8')),'hex');
  IF actual_hash<>entry.expected_hash OR owner_name::text<>entry.expected_owner OR original_acl::text<>entry.expected_acl
  THEN RAISE EXCEPTION 'ORDER_NUMBER_PREDECESSOR_DRIFT:%',entry.signature;END IF;
  IF (length(definition)-length(replace(definition,entry.insert_anchor,'')))/length(entry.insert_anchor)<>1
  THEN RAISE EXCEPTION 'ORDER_NUMBER_INSERT_ANCHOR_DRIFT:%',entry.signature;END IF;
  INSERT INTO saas.order_number_migration_restore(signature,definition,owner_name,original_acl,before_hash)
  VALUES(entry.signature,definition,owner_name,original_acl,actual_hash);
  patched:=replace(definition,entry.insert_anchor,E'-- ORDER_NUMBER_CREATOR_V161\n  '||entry.allocation_statement||E'\n  '||left(entry.updated_insert,length(entry.updated_insert)-1)||
   E'\n  RETURNING orders.order_number INTO '||entry.target_variable||';');
  IF entry.add_variable THEN
   IF (length(patched)-length(replace(patched,'DECLARE','')))/length('DECLARE')<>1
   THEN RAISE EXCEPTION 'ORDER_NUMBER_DECLARE_ANCHOR_DRIFT:%',entry.signature;END IF;
   patched:=replace(patched,'DECLARE','DECLARE actual_order_number text;');
  END IF;
  IF entry.pos_sale THEN
   IF (length(patched)-length(replace(patched,'order_number=selected.sale_number WHERE id=p_sale_id;','')))/length('order_number=selected.sale_number WHERE id=p_sale_id;')<>1
   THEN RAISE EXCEPTION 'ORDER_NUMBER_POS_SALE_ANCHOR_DRIFT';END IF;
   patched:=replace(patched,'order_number=selected.sale_number WHERE id=p_sale_id;','order_number=actual_order_number WHERE id=p_sale_id;');
  END IF;
  IF entry.signature='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)' THEN
   -- Existing marker-reset PERFORM statements overwrite ROW_COUNT with 1.
   -- Capture the actual inventory UPDATE count before clearing those markers;
   -- otherwise untracked or multi-variant callbacks incorrectly roll back.
   IF (length(patched)-length(replace(patched,E'  -- inventory marker end\n  GET DIAGNOSTICS updated_count=ROW_COUNT;','')))/length(E'  -- inventory marker end\n  GET DIAGNOSTICS updated_count=ROW_COUNT;')<>1
    OR (length(patched)-length(replace(patched,'      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;','')))/length('      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;')<>1
   THEN RAISE EXCEPTION 'ORDER_NUMBER_QUICK_CHECKOUT_STOCK_COUNT_ANCHOR_DRIFT';END IF;
   patched:=replace(patched,E'  -- inventory marker end\n  GET DIAGNOSTICS updated_count=ROW_COUNT;',E'  -- inventory marker end');
   patched:=replace(patched,'      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;',
    E'      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;\n  GET DIAGNOSTICS updated_count=ROW_COUNT;');
  END IF;
  EXECUTE patched;
  IF (SELECT role.rolname FROM pg_proc proc JOIN pg_roles role ON role.oid=proc.proowner WHERE proc.oid=routine) IS DISTINCT FROM owner_name::text
   OR (SELECT proc.proacl FROM pg_proc proc WHERE proc.oid=routine) IS DISTINCT FROM original_acl
  THEN RAISE EXCEPTION 'ORDER_NUMBER_CREATOR_PRIVILEGE_DRIFT:%',entry.signature;END IF;
  UPDATE saas.order_number_migration_restore SET after_hash=encode(sha256(convert_to(pg_get_functiondef(routine),'UTF8')),'hex') WHERE signature=entry.signature;
 END LOOP;
END $creator_patches$;

CREATE TRIGGER order_number_restore_immutable BEFORE UPDATE OR DELETE
 ON saas.order_number_migration_restore FOR EACH ROW EXECUTE FUNCTION saas.order_number_allocation_immutable();

COMMIT;
