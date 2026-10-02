-- Behavioral assertions for a disposable PostgreSQL clone only.
-- The caller needs permission to set session_replication_role for fixture setup.
-- Every fixture and mutation is rolled back; no provider or financial state is settled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL session_replication_role=replica;
SET LOCAL ROLE celebix_saas_owner;

CREATE TEMP TABLE effective_holds_189_fixture(now_at timestamptz, retained_rows jsonb) ON COMMIT DROP;

DO $fixture$
DECLARE
  st uuid:='a1890000-0000-4000-8000-000000000001';
  pd uuid:='a1890000-0000-4000-8000-000000000002';
  vr uuid:='a1890000-0000-4000-8000-000000000003';
  loc uuid:='a1890000-0000-4000-8000-000000000004';
  n timestamptz:=date_trunc('milliseconds',statement_timestamp());
  created timestamptz;
  j integer;
  attempt uuid;
  session_id uuid;
  cart uuid;
  delivery jsonb:='{"contact":{"firstName":"Inventory","lastName":"Fixture","email":"inventory-189@example.test","phone":"+905551891891"},"shippingAddress":{"line1":"Fixture 189","city":"Ordu","country":"TR"}}'::jsonb;
BEGIN
  INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES(st,'Effective holds fixture','effective-holds-189','active','tr','TRY','hemenaku',n,n);
  INSERT INTO saas.merchant_provider_profiles(
    id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
    credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
    validation_environment,validation_adapter_version,created_at,updated_at
  ) VALUES(
    'a1890000-0000-4000-8000-000000000006',st,'paytr_iframe','payment_processing',
    '{"environment":"test"}','Fixture only',
    '{"algorithm":"A256GCM","ciphertext":"AA","iv":"AAAAAAAAAAAAAAAA","keyId":"fixture189","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
    repeat('a',64),'fixture189',1,1,'active',1,'test',1,n-interval '1 hour',n-interval '1 hour'
  );
  INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,created_at,updated_at)
    VALUES('a1890000-0000-4000-8000-000000000005',st,'provider',
      'a1890000-0000-4000-8000-000000000006','paytr_iframe','Fixture card','active',0,
      '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',
      n-interval '1 hour',n-interval '1 hour');
  INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
    VALUES(pd,st,'effective-holds-product','Effective holds product','active','TRY',n,n);
  INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
    VALUES(vr,st,pd,'Fixture',10000,true,3,'active',n,n);
  INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,created_at,updated_at)
    VALUES(loc,st,'Fixture location',true,'active',n,n);
  INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,updated_at)
    VALUES(st,loc,vr,3,n);

  -- Parent 10 is overdue but still active/created; parent 11 is live.
  -- Parents 12 and 13 provide valid FK ownership for admission assertions.
  FOR j IN 10..13 LOOP
    attempt:=('a1890000-0000-4000-8000-'||lpad(j::text,12,'0'))::uuid;
    session_id:=('a1890000-0000-4000-8000-'||lpad((j+10)::text,12,'0'))::uuid;
    cart:=('a1890000-0000-4000-8000-'||lpad((j+20)::text,12,'0'))::uuid;
    created:=CASE WHEN j=10 THEN n-interval '1 hour' ELSE n END;
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES(cart,st,'active',1,n+interval '1 day',created,created);
    INSERT INTO saas.payment_attempts(
      id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,
      order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at,
      execution_adapter_version,execution_evidence_digest,method_config_snapshot
    ) VALUES(
      attempt,st,'a1890000-0000-4000-8000-000000000005','a1890000-0000-4000-8000-000000000006',
      'paytr_iframe','test',1,'sf:'||cart::text||':1',10000,'TRY','created','fixture',1,created,created,
      1,'sha256:'||repeat('b',64),'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}'::jsonb
    );
    INSERT INTO saas.storefront_hosted_checkout_sessions(
      id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,provider_code,
      environment,credential_version,execution_adapter_version,execution_evidence_digest,
      order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,
      source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,
      total_minor,delivery_snapshot,item_snapshot,status,safe_code,hold_expires_at,version,
      payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,
      receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,
      customer_credential_digest,customer_expires_at,created_at,updated_at
    ) VALUES(
      session_id,st,cart,attempt,'a1890000-0000-4000-8000-000000000005',
      'a1890000-0000-4000-8000-000000000006','paytr_iframe','test',1,1,'sha256:'||repeat('b',64),
      'sf:'||cart::text||':1',saas.storefront_commerce_uuid('189-order:'||j),
      saas.storefront_commerce_uuid('189-customer:'||j),saas.storefront_commerce_uuid('189-address:'||j),
      saas.storefront_commerce_uuid('189-event:'||j),saas.storefront_commerce_uuid('189-receipt:'||j),
      saas.storefront_commerce_uuid('189-customer-credential:'||j),1,repeat('c',64),'TRY',10000,0,0,10000,
      delivery,jsonb_build_array(jsonb_build_object('productId',pd,'variantId',vr,'title','Fixture',
        'quantity',1,'unitPriceCents',10000,'lineTotalCents',10000)),
      'active','fixture',created+interval '15 minutes',1,'fixture189',repeat('d',64),
      created+interval '15 minutes','fixture189',repeat('e',64),created+interval '1 day',
      'fixture189',repeat('f',64),created+interval '30 days',created,created
    );
  END LOOP;
  INSERT INTO saas.checkout_inventory_reservations(
    id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,
    product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
  ) VALUES
    ('a1890000-0000-4000-8000-000000000040',st,NULL,'a1890000-0000-4000-8000-000000000010',NULL,
     'a1890000-0000-4000-8000-000000000020',pd,vr,2,true,'held',n-interval '1 hour',1,n-interval '1 hour'),
    ('a1890000-0000-4000-8000-000000000041',st,NULL,'a1890000-0000-4000-8000-000000000011',NULL,
     'a1890000-0000-4000-8000-000000000021',pd,vr,1,true,'held',n,1,n);
  INSERT INTO saas.in_store_sales(
    id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,items,
    subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at
  ) VALUES(
    'a1890000-0000-4000-8000-000000000050',st,'FIXTURE189','held',
    'a1890000-0000-4000-8000-000000000051',loc,'Fixture location','{}','[]',10000,10000,0,10000,n,n
  );
  INSERT INTO saas.in_store_inventory_reservations(
    id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at
  ) VALUES(
    'a1890000-0000-4000-8000-000000000052',st,'a1890000-0000-4000-8000-000000000050',
    loc,pd,vr,1,true,'held',n-interval '2 days',n
  );
  INSERT INTO effective_holds_189_fixture
    SELECT n,jsonb_build_object(
      'attempts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.payment_attempts r WHERE r.store_id=st),
      'sessions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.storefront_hosted_checkout_sessions r WHERE r.store_id=st),
      'online',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.checkout_inventory_reservations r WHERE r.store_id=st),
      'pos',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.in_store_inventory_reservations r WHERE r.store_id=st),
      'sales',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.in_store_sales r WHERE r.store_id=st)
    );
END
$fixture$;

RESET ROLE;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  st uuid:='a1890000-0000-4000-8000-000000000001';
  pd uuid:='a1890000-0000-4000-8000-000000000002';
  vr uuid:='a1890000-0000-4000-8000-000000000003';
  loc uuid:='a1890000-0000-4000-8000-000000000004';
  n timestamptz;
  before_rows jsonb;
  after_rows jsonb;
  blocked boolean;
  block_error text;
BEGIN
  SELECT now_at,retained_rows INTO n,before_rows FROM effective_holds_189_fixture;
  IF current_setting('saas.effective_holds_189.case',true) IN('v1','v2') THEN RETURN; END IF;
  IF saas.storefront_available_stock(st,vr,n) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_AVAILABILITY_INVALID';
  END IF;
  -- RED on the old aggregate: the stale two-unit hold incorrectly blocks this unit.
  BEGIN
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,
      product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
    ) VALUES(
      'a1890000-0000-4000-8000-000000000042',st,NULL,'a1890000-0000-4000-8000-000000000012',NULL,
      'a1890000-0000-4000-8000-000000000022',pd,vr,1,true,'held',n,1,n
    );
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_EXPIRED_ADMISSION_BLOCKED: %',SQLERRM;
  END;
  IF saas.storefront_available_stock(st,vr,n) IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_NEW_RESERVATION_NOT_COUNTED';
  END IF;
  blocked:=false;
  BEGIN
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,
      product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
    ) VALUES(
      'a1890000-0000-4000-8000-000000000043',st,NULL,'a1890000-0000-4000-8000-000000000013',NULL,
      'a1890000-0000-4000-8000-000000000023',pd,vr,1,true,'held',n,1,n
    );
  EXCEPTION WHEN check_violation THEN
    blocked:=SQLERRM='INVENTORY_ACTIVE_HOLD_VIOLATION';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_OVERSELL_ADMITTED'; END IF;

  -- Exercise the real inventory phase of capture: consume exactly its own hold,
  -- then decrement product and location stock without rewriting stale history.
  UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at=n,
    updated_at=n,version=version+1 WHERE id='a1890000-0000-4000-8000-000000000042';
  PERFORM set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM set_config('saas.inventory.source_id','a1890000-0000-4000-8000-000000000060',true);
  PERFORM set_config('saas.inventory.source_time',n::text,true);
  UPDATE saas.product_variants SET stock_quantity=2,version=version+1,updated_at=n WHERE id=vr;
  IF (SELECT stock_quantity FROM saas.product_variants WHERE id=vr) IS DISTINCT FROM 2
    OR (SELECT quantity FROM saas.inventory_balances WHERE store_id=st AND location_id=loc AND variant_id=vr) IS DISTINCT FROM 2
    OR (SELECT count(*) FROM saas.inventory_movements WHERE store_id=st AND source_kind='checkout_sale')<>1
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_CAPTURE_STOCK_DECREMENT_INVALID'; END IF;
  blocked:=false;
  BEGIN
    PERFORM set_config('saas.inventory.source_id','a1890000-0000-4000-8000-000000000061',true);
    UPDATE saas.product_variants SET stock_quantity=1,version=version+1,updated_at=n WHERE id=vr;
  EXCEPTION WHEN OTHERS THEN
    block_error:=SQLERRM;
    blocked:=SQLERRM IN('INVENTORY_ACTIVE_HOLD_VIOLATION','CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION');
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ACTIVE_OR_POS_STOCK_CONSUMED: %',block_error; END IF;
  IF (SELECT stock_quantity FROM saas.product_variants WHERE id=vr)<>2 THEN
    RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_REJECTED_DECREMENT_MUTATED_STOCK';
  END IF;
  blocked:=false;
  BEGIN
    UPDATE saas.inventory_balances SET quantity=0,version=version+1,updated_at=n
      WHERE store_id=st AND location_id=loc AND variant_id=vr;
  EXCEPTION WHEN check_violation THEN blocked:=SQLERRM='INVENTORY_LOCATION_ACTIVE_HOLD_VIOLATION'; END;
  IF NOT blocked THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_POS_LOCATION_STOCK_CONSUMED'; END IF;

  IF (SELECT status FROM saas.checkout_inventory_reservations WHERE id='a1890000-0000-4000-8000-000000000042')<>'consumed'
    OR NOT EXISTS(SELECT 1 FROM saas.all_inventory_reservations WHERE id='a1890000-0000-4000-8000-000000000042' AND status='consumed')
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_NONHELD_HISTORY_HIDDEN'; END IF;
  IF EXISTS(SELECT 1 FROM saas.all_inventory_reservations WHERE id='a1890000-0000-4000-8000-000000000040')
    OR NOT EXISTS(SELECT 1 FROM saas.all_inventory_reservations WHERE id='a1890000-0000-4000-8000-000000000041' AND status='held')
    OR NOT EXISTS(SELECT 1 FROM saas.all_inventory_reservations WHERE id='a1890000-0000-4000-8000-000000000052' AND status='held')
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_EFFECTIVE_MEMBERSHIP_INVALID'; END IF;
  SELECT jsonb_build_object(
    'attempts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.payment_attempts r WHERE r.store_id=st),
    'sessions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.storefront_hosted_checkout_sessions r WHERE r.store_id=st),
    'online',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.checkout_inventory_reservations r WHERE r.store_id=st AND r.id IN('a1890000-0000-4000-8000-000000000040','a1890000-0000-4000-8000-000000000041')),
    'pos',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.in_store_inventory_reservations r WHERE r.store_id=st),
    'sales',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM saas.in_store_sales r WHERE r.store_id=st)
  ) INTO after_rows;
  IF after_rows IS DISTINCT FROM before_rows
    OR EXISTS(SELECT 1 FROM saas.orders WHERE store_id=st)
    OR EXISTS(SELECT 1 FROM saas.payment_attempt_events WHERE store_id=st)
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_RETAINED_AUTHORITY_MUTATED'; END IF;
END
$assertions$;

-- Keep durable financial attempts untouched. Temporary attempt tables invoke the
-- actual settlement trigger functions with a captured notification. Fixture
-- setup alone bypasses triggers; settlement runs with every durable guard live.
RESET ROLE;
SET LOCAL session_replication_role=replica;
SET LOCAL ROLE celebix_saas_owner;
CREATE TEMP TABLE effective_holds_189_late(
  case_number integer,session_id uuid,attempt_id uuid,variant_id uuid,
  own_reservation_id uuid,pos_reservation_id uuid,retained_rows jsonb
) ON COMMIT DROP;
DO $late_fixture$
DECLARE
  st uuid:='a1890000-0000-4000-8000-000000000001';
  pd uuid:='a1890000-0000-4000-8000-000000000002';
  loc uuid:='a1890000-0000-4000-8000-000000000004';
  n timestamptz;
  j integer;
  vr uuid;
  sid uuid;
  aid uuid;
  cid uuid;
  own_id uuid;
  pos_id uuid;
  customer uuid;
  facts jsonb;
  delivery jsonb;
  items jsonb;
BEGIN
  SELECT now_at INTO n FROM effective_holds_189_fixture;
  IF current_setting('saas.effective_holds_189.case',true)='inventory' THEN RETURN; END IF;
  FOR j IN 1..2 LOOP
    IF current_setting('saas.effective_holds_189.case',true) IN('v1','v2')
      AND current_setting('saas.effective_holds_189.case',true)<>'v'||j::text THEN CONTINUE; END IF;
    vr:=saas.storefront_commerce_uuid('189-late-variant:'||j);
    sid:=saas.storefront_commerce_uuid('189-late-session:'||j);
    aid:=saas.storefront_commerce_uuid('189-late-attempt:'||j);
    cid:=saas.storefront_commerce_uuid('189-late-cart:'||j);
    own_id:=saas.storefront_commerce_uuid('189-late-own:'||j);
    pos_id:=saas.storefront_commerce_uuid('189-late-pos:'||j);
    customer:=saas.storefront_commerce_uuid('189-late-customer:'||j);
    delivery:=jsonb_build_object('contact',jsonb_build_object('firstName','Inventory','lastName','Fixture',
      'email','late-v'||j||'-189@example.test','phone','+90555189189'||j),
      'shippingAddress',jsonb_build_object('line1','Fixture 189','city','Ordu','country','TR'));
    items:=jsonb_build_array(jsonb_build_object('productId',pd,'variantId',vr,'title','Fixture',
      'variantTitle','Late capture '||j,'sku','LATE189-'||j,'quantity',1,'unitPriceCents',10000,
      'lineTotalCents',10000,'discountCents',0,'payableCents',10000));
    INSERT INTO saas.product_variants
      SELECT (jsonb_populate_record(NULL::saas.product_variants,to_jsonb(v)||jsonb_build_object(
        'id',vr,'title','Late capture '||j,'sku','LATE189-'||j,'stock_quantity',1))).*
      FROM saas.product_variants v WHERE v.id='a1890000-0000-4000-8000-000000000003';
    INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,updated_at)
      VALUES(st,loc,vr,1,n);
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES(cid,st,'active',1,n+interval '1 day',n-interval '1 hour',n-interval '1 hour');
    INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at)
      VALUES(customer,st,'active','Inventory','Fixture',delivery->'contact'->>'email',
        delivery->'contact'->>'phone',n-interval '1 hour',n-interval '1 hour');
    INSERT INTO saas.payment_attempts
      SELECT (jsonb_populate_record(NULL::saas.payment_attempts,to_jsonb(a)||jsonb_build_object(
        'id',aid,'order_reference','sf:'||cid||':1'))).*
      FROM saas.payment_attempts a WHERE a.id='a1890000-0000-4000-8000-000000000010';
    INSERT INTO saas.storefront_hosted_checkout_sessions
      SELECT (jsonb_populate_record(NULL::saas.storefront_hosted_checkout_sessions,to_jsonb(s)||jsonb_build_object(
        'id',sid,'cart_id',cid,'payment_attempt_id',aid,'order_reference','sf:'||cid||':1',
        'order_id',saas.storefront_commerce_uuid('189-late-order:'||j),'customer_id',customer,
        'address_id',saas.storefront_commerce_uuid('189-late-address:'||j),
        'event_id',saas.storefront_commerce_uuid('189-late-event:'||j),
        'receipt_id',saas.storefront_commerce_uuid('189-late-receipt:'||j),
        'customer_credential_id',saas.storefront_commerce_uuid('189-late-customer-credential:'||j),
        'delivery_snapshot',delivery,'item_snapshot',items,'status','provider_ready',
        'evaluator_authority_digest',CASE WHEN j=2 THEN repeat('a',64) END,
        'promotion_evaluator_context',CASE WHEN j=2 THEN '{}'::jsonb END,
        'promotion_evaluation',CASE WHEN j=2 THEN '{}'::jsonb END,
        'promotion_normalized_codes',CASE WHEN j=2 THEN '[]'::jsonb END))).*
      FROM saas.storefront_hosted_checkout_sessions s WHERE s.id='a1890000-0000-4000-8000-000000000020';
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,payment_attempt_id,storefront_hosted_session_id,product_id,variant_id,
      quantity,stock_tracked,status,held_at,version,updated_at
    ) VALUES(own_id,st,aid,sid,pd,vr,1,true,'held',n-interval '1 hour',1,n-interval '1 hour');
    INSERT INTO saas.in_store_inventory_reservations(
      id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at
    ) VALUES(pos_id,st,'a1890000-0000-4000-8000-000000000050',loc,pd,vr,1,true,'held',n-interval '2 days',n);
    IF j=2 THEN
      SELECT jsonb_build_object('authorityDigest',s.commerce_authority_digest,
        'evaluatorAuthorityDigest',s.evaluator_authority_digest,'orderId',s.order_id,
        'customerId',s.customer_id,'totalMinor',s.total_minor,'items',s.item_snapshot,
        'lineDiscountMinor',0,'shippingDiscountMinor',0,'promotionStatus','available',
        'appliedPromotions','[]'::jsonb,'gifts','[]'::jsonb) INTO facts
      FROM saas.storefront_hosted_checkout_sessions s WHERE s.id=sid;
      INSERT INTO saas.storefront_hosted_checkout_operations(
        operation_id,store_id,session_id,operation_kind,payload_fingerprint,result_payload,committed_at
      ) VALUES(aid,st,sid,'start',repeat('c',64),jsonb_build_object('authority',facts),n-interval '1 hour');
    END IF;
    INSERT INTO effective_holds_189_late SELECT j,sid,aid,vr,own_id,pos_id,jsonb_build_object(
      'attempt',(SELECT to_jsonb(a) FROM saas.payment_attempts a WHERE a.id=aid),
      'pos',(SELECT to_jsonb(p) FROM saas.in_store_inventory_reservations p WHERE p.id=pos_id),
      'customer',(SELECT to_jsonb(c) FROM saas.customers c WHERE c.id=customer)
    );
  END LOOP;
END
$late_fixture$;
RESET ROLE;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE celebix_saas_owner;
CREATE TEMP TABLE effective_holds_189_attempt_v1(LIKE saas.payment_attempts INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
CREATE TEMP TABLE effective_holds_189_attempt_v2(LIKE saas.payment_attempts INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
CREATE TRIGGER actual_terminal_v1 AFTER UPDATE ON effective_holds_189_attempt_v1
  FOR EACH ROW EXECUTE FUNCTION saas.storefront_hosted_checkout_terminal_transition();
CREATE TRIGGER actual_terminal_v2 AFTER UPDATE ON effective_holds_189_attempt_v2
  FOR EACH ROW EXECUTE FUNCTION saas.storefront_hosted_checkout_promotion_terminal_v2();
INSERT INTO effective_holds_189_attempt_v1 SELECT a.* FROM saas.payment_attempts a
  JOIN effective_holds_189_late f ON f.attempt_id=a.id AND f.case_number=1;
INSERT INTO effective_holds_189_attempt_v2 SELECT a.* FROM saas.payment_attempts a
  JOIN effective_holds_189_late f ON f.attempt_id=a.id AND f.case_number=2;
DO $late_assertions$
DECLARE
  f record;
  n timestamptz:=date_trunc('milliseconds',statement_timestamp());
  retained jsonb;
BEGIN
  FOR f IN SELECT * FROM effective_holds_189_late ORDER BY case_number LOOP
    BEGIN
      EXECUTE format('UPDATE effective_holds_189_attempt_v%s SET status=''captured'',safe_code=''captured'',updated_at=$1,version=version+1 WHERE id=$2',f.case_number)
        USING n,f.attempt_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_LATE_V%_CAPTURE_ABORTED: %',f.case_number,SQLERRM;
    END;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions
      WHERE id=f.session_id AND status='stock_conflict' AND safe_code='captured_stock_conflict' AND terminal_at=n)
      OR NOT EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations
        WHERE id=f.own_reservation_id AND status='released' AND released_at=n)
      OR (SELECT stock_quantity FROM saas.product_variants WHERE id=f.variant_id)<>1
      OR (SELECT quantity FROM saas.inventory_balances WHERE variant_id=f.variant_id)<>1
      OR EXISTS(SELECT 1 FROM saas.orders WHERE store_id='a1890000-0000-4000-8000-000000000001')
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_LATE_V%_CAPTURE_CONFLICT_INVALID',f.case_number; END IF;
    SELECT jsonb_build_object(
      'attempt',(SELECT to_jsonb(a) FROM saas.payment_attempts a WHERE a.id=f.attempt_id),
      'pos',(SELECT to_jsonb(p) FROM saas.in_store_inventory_reservations p WHERE p.id=f.pos_reservation_id),
      'customer',(SELECT to_jsonb(c) FROM saas.customers c JOIN saas.storefront_hosted_checkout_sessions s ON s.customer_id=c.id WHERE s.id=f.session_id)
    ) INTO retained;
    IF retained IS DISTINCT FROM f.retained_rows THEN
      RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_LATE_V%_CAPTURE_CHANGED_RETAINED_ROWS',f.case_number;
    END IF;
  END LOOP;
END
$late_assertions$;
ROLLBACK;
