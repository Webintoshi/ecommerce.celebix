-- Elapsed real payment time is part of the POS contract, not the completion time.
-- This fixture uses a disposable PostgreSQL instance and rolls every sale back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $test$
DECLARE
 st uuid:='a2080000-0000-4000-8000-000000000001';
 pr uuid:='a2080000-0000-4000-8000-000000000002';
 mb uuid:='a2080000-0000-4000-8000-000000000003';
 pl uuid:='a2080000-0000-4000-8000-000000000004';
 pd uuid:='a2080000-0000-4000-8000-000000000007';
 v uuid:='a2080000-0000-4000-8000-000000000008';
 customer uuid:='a2080000-0000-4000-8000-000000000009';
 op uuid:='a2080000-0000-4000-8000-000000000014'; support_value jsonb; support_member uuid; actor uuid;
 loc uuid; sale uuid; operation uuid; order_id_value uuid;
 started timestamptz:=date_trunc('milliseconds',transaction_timestamp())-interval '3 hours';
 received timestamptz; completed timestamptz; intent jsonb; r record;
 finance jsonb; account uuid; account_version bigint; customer_version bigint; n integer;
BEGIN
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(st,'POS payment timing regression','pos-payment-timing-208','active','tr','TRY','hemenaku',started,started);
 INSERT INTO saas.principals VALUES(pr,'https://qa.celebix.invalid','pos208','sdkahmetcelebi@icloud.com',true,started,started);
 INSERT INTO saas.memberships VALUES(mb,pr,st,'store_owner','active',started,started);
 INSERT INTO saas.plans VALUES(pl,'pos208_qa',1,'active',started-interval '1 day',NULL,started,started);
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.plan_features VALUES(pl,'orders',2,true),(pl,'catalog',1,true);
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.subscriptions VALUES('a2080000-0000-4000-8000-000000000013',st,pl,'pos208_qa',1,'active',started-interval '1 day',NULL,started,started);
 SELECT id INTO loc FROM saas.inventory_locations WHERE store_id=st AND is_default;
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
 VALUES(pd,st,'pos-payment-timing-product','POS timing product','active','TRY',started,started);
 PERFORM set_config('saas.inventory.source_marker','catalog_adjustment',true);
 PERFORM set_config('saas.inventory.source_id','a2080000-0000-4000-8000-000000000012',true);
 PERFORM set_config('saas.inventory.source_time',started::text,true);
 INSERT INTO saas.product_variants(id,store_id,product_id,title,barcode,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
 VALUES(v,st,pd,'Standard','2080012345678',1100000,true,10,'active',started,started);
 INSERT INTO saas.customers(id,store_id,email,phone,first_name,last_name,status,created_at,updated_at)
 VALUES(customer,st,NULL,'+905552080001','POS','Customer','active',started,started);
 UPDATE saas.accounting_release_state SET credit_sales_enabled=true;
 INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active) VALUES(op,'https://qa.celebix.invalid','pos208',pr,'sdkahmetcelebi@icloud.com',true);
 INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,created_at,updated_at,management) VALUES(gen_random_uuid(),st,'pos-support.admin.example.test','platform_subdomain','active',true,started,started,started,'platform');
 support_value:=saas.platform_support_issue(op,st,'pos-support.admin.example.test','Verify pending sale recovery',1,'pos-support.issue',repeat('c',64));
 PERFORM saas.platform_support_redeem(support_value->>'handoff','pos-support.admin.example.test',repeat('f',64));
 SELECT id INTO support_member FROM saas.memberships WHERE support_session_id=(support_value->>'id')::uuid;


 -- Full collection happens ten minutes before completion, partial collection
 -- happens before completion, and zero collection creates no receipt evidence.
 FOR n IN 0..2 LOOP
  actor:=CASE WHEN n=0 THEN support_member ELSE mb END;
  sale:=saas.inventory_deterministic_uuid('payment-timing-sale',n::text);
  received:=started+interval '20 minutes'+n*interval '30 minutes';
  completed:=received+interval '10 minutes';
  intent:=jsonb_build_object('locationId',loc,'items',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'unitPriceOverrideCents',NULL)),
   'discount',NULL,'customerName',NULL,'note',NULL,'paymentMethod',CASE WHEN n=2 THEN NULL ELSE 'card' END,
   'customerId',customer,'initialCollectionCents',CASE n WHEN 0 THEN 1100000 WHEN 1 THEN 500000 ELSE 0 END,'dueDate',NULL);
  INSERT INTO saas.store_sales_policy(store_id,paused) VALUES(st,false) ON CONFLICT(store_id) DO UPDATE SET paused=false;
  SELECT * INTO r FROM saas.in_store_sales_create_v3(st,pr,actor,pl,'pos208_qa',1,received-interval '10 minutes',
   saas.inventory_deterministic_uuid('payment-timing-create',n::text),repeat('a',64),sale,intent);
  IF r.outcome<>'committed' THEN RAISE EXCEPTION 'TIMING_CREATE_FAILED: %',r;END IF;
  SELECT * INTO r FROM saas.in_store_sales_prepare_v3(st,pr,actor,pl,'pos208_qa',1,received-interval '5 minutes',
   saas.inventory_deterministic_uuid('payment-timing-prepare',n::text),repeat('b',64),sale,1,1100000);
  IF r.outcome<>'committed' THEN RAISE EXCEPTION 'TIMING_PREPARE_FAILED: %',r;END IF;
  UPDATE saas.store_sales_policy SET paused=true WHERE store_id=st;
  SELECT * INTO r FROM saas.in_store_sales_create_v3(st,pr,actor,pl,'pos208_qa',1,received-interval '10 minutes',
   saas.inventory_deterministic_uuid('paused-new-create',n::text),repeat('e',64),saas.inventory_deterministic_uuid('paused-new-sale',n::text),intent);
  IF r.outcome<>'sales_paused' THEN RAISE EXCEPTION 'NEW_POS_ADMISSION_NOT_PAUSED: %',r; END IF;
  SELECT * INTO r FROM saas.in_store_sales_create_v3(st,pr,actor,pl,'pos208_qa',1,received-interval '10 minutes',
   saas.inventory_deterministic_uuid('payment-timing-create',n::text),repeat('a',64),sale,intent);
  IF r.outcome<>'operation_replayed' THEN RAISE EXCEPTION 'EXISTING_POS_REPLAY_BLOCKED: %',r; END IF;

  IF n<2 THEN
   SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v3(st,pr,actor,pl,'pos208_qa',1,received,
    saas.inventory_deterministic_uuid('payment-timing-confirm',n::text),repeat('c',64),sale,2,NULL,NULL);
   IF r.outcome<>'committed' THEN RAISE EXCEPTION 'TIMING_RECEIPT_FAILED: %',r;END IF;
  END IF;
  IF n=0 THEN
   PERFORM set_config('app.support_session_id','',true);
   PERFORM saas.platform_support_revoke(op,(support_value->>'id')::uuid,1,'pos-support.revoke');
   IF saas.in_store_sales_projection(st,sale) IS NULL THEN RAISE EXCEPTION 'EXPIRED_SUPPORT_SALE_DISAPPEARED'; END IF;
  END IF;
  operation:=saas.inventory_deterministic_uuid('payment-timing-complete',n::text);
  SELECT * INTO r FROM saas.in_store_sales_complete_v3(st,pr,mb,pl,'pos208_qa',1,completed,operation,repeat('d',64),sale,CASE WHEN n=2 THEN 2 ELSE 3 END);
  IF r.outcome<>'committed' THEN RAISE EXCEPTION 'TIMING_COMPLETION_FAILED: %',r;END IF;
  order_id_value:=(r.result_payload#>>'{sale,orderId}')::uuid;
  IF (SELECT created_at FROM saas.orders WHERE id=order_id_value)<>(CASE WHEN n=2 THEN completed ELSE received END)
   OR (SELECT occurred_at FROM saas.accounting_events WHERE order_id=order_id_value AND kind='sale')<>completed
   OR (SELECT occurred_at FROM saas.accounting_receivables WHERE order_id=order_id_value)<>completed
   OR (SELECT completed_at FROM saas.in_store_sales WHERE id=sale)<>completed
  THEN RAISE EXCEPTION 'TIMING_ORDER_AND_SALE_CLOCKS_DRIFTED';END IF;
  IF n<2 AND (SELECT occurred_at FROM saas.accounting_events WHERE order_id=order_id_value AND kind='collection')<>received
   OR n=2 AND EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=sale)
  THEN RAISE EXCEPTION 'TIMING_COLLECTION_EVIDENCE_DRIFTED';END IF;
  IF n=0 AND (SELECT paid_at FROM saas.orders WHERE id=order_id_value)<>received
   OR n>0 AND (SELECT paid_at FROM saas.orders WHERE id=order_id_value) IS NOT NULL
  THEN RAISE EXCEPTION 'TIMING_INITIAL_PAYMENT_STATUS_DRIFTED';END IF;
  SELECT * INTO r FROM saas.in_store_sales_complete_v3(st,pr,mb,pl,'pos208_qa',1,completed+interval '1 minute',operation,repeat('d',64),sale,CASE WHEN n=2 THEN 2 ELSE 3 END);
  IF r.outcome<>'operation_replayed' OR (SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>9-n
   OR (SELECT count(*) FROM saas.inventory_movements WHERE store_id=st AND source_kind='in_store_sale')<>n+1
  THEN RAISE EXCEPTION 'TIMING_RETRY_CHANGED_STOCK';END IF;

  IF n=1 THEN
   -- A partial product return can close the debt with the original receipt;
   -- its old paid_at must remain legal even though delivery happened later.
   SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos208_qa',1,completed+interval '2 minutes',
    saas.inventory_deterministic_uuid('payment-timing-return',n::text),repeat('e',64),'returnCredit',
    jsonb_build_object('orderId',order_id_value,'expectedVersion',1,'amountCents',600000,'reason','Timing regression partial return'));
   IF r.outcome<>'committed' OR (SELECT paid_at FROM saas.orders WHERE id=order_id_value)<>received
    OR (SELECT payment_status FROM saas.orders WHERE id=order_id_value)<>'completed'
   THEN RAISE EXCEPTION 'TIMING_PARTIAL_RETURN_SYNCHRONIZATION_FAILED: %',r;END IF;
   SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos208_qa',1,completed+interval '3 minutes',
    saas.inventory_deterministic_uuid('payment-timing-full-return',n::text),repeat('f',64),'returnCredit',
    jsonb_build_object('orderId',order_id_value,'expectedVersion',2,'amountCents',500000,'reason','Timing regression full return'));
   IF r.outcome<>'committed' THEN RAISE EXCEPTION 'TIMING_FULL_RETURN_FAILED: %',r;END IF;
   SELECT id INTO account FROM saas.accounting_accounts WHERE store_id=st AND account_type='card' AND system_default;
   SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos208_qa',1,completed+interval '4 minutes',
    saas.inventory_deterministic_uuid('payment-timing-refund',n::text),repeat('0',64),'refund',
    jsonb_build_object('orderId',order_id_value,'expectedVersion',3,'accountId',account,'amountCents',500000,'paymentMethod','card','reason','Timing regression refund'));
   IF r.outcome<>'committed' OR (SELECT paid_at FROM saas.orders WHERE id=order_id_value)<>received
    OR saas.accounting_order_finance(st,order_id_value)->>'refundDueCents'<>'0'
   THEN RAISE EXCEPTION 'TIMING_REFUND_SYNCHRONIZATION_FAILED: %',r;END IF;
  ELSIF n=2 THEN
   SELECT version INTO customer_version FROM saas.accounting_customer_versions WHERE store_id=st AND customer_id=customer AND currency='TRY';
   SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos208_qa',1,completed+interval '5 minutes',
    saas.inventory_deterministic_uuid('payment-timing-later-collection',n::text),repeat('1',64),'collect',
    jsonb_build_object('customerId',customer,'expectedVersion',customer_version,'orderId',order_id_value,'amountCents',1100000,'currency','TRY','paymentMethod','cash','accountId',NULL,'note',NULL));
   IF r.outcome<>'committed' OR (SELECT paid_at FROM saas.orders WHERE id=order_id_value)<>completed+interval '5 minutes'
   THEN RAISE EXCEPTION 'TIMING_ZERO_LATER_COLLECTION_FAILED: %',r;END IF;
  END IF;
  IF (SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>9-n THEN RAISE EXCEPTION 'TIMING_FINANCE_CHANGED_STOCK';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM saas.payment_attempts WHERE store_id=st) THEN RAISE EXCEPTION 'TIMING_POS_ENTERED_PROVIDER_FLOW';END IF;
END $test$;
ROLLBACK;
