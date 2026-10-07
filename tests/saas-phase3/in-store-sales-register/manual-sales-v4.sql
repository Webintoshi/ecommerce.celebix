-- Elapsed real payment time is part of the POS contract, not the completion time.
-- This fixture uses a disposable PostgreSQL instance and rolls every sale back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TEMP TABLE v4_fixture_payloads(purpose text,payload jsonb);
DO $test$
DECLARE
 st uuid:='a2180000-0000-4000-8000-000000000001';
 pr uuid:='a2180000-0000-4000-8000-000000000002';
 mb uuid:='a2180000-0000-4000-8000-000000000003';
 pl uuid:='a2180000-0000-4000-8000-000000000004';
 pd uuid:='a2180000-0000-4000-8000-000000000007';
 v uuid:='a2180000-0000-4000-8000-000000000008';
 customer uuid:='a2180000-0000-4000-8000-000000000009';
 loc uuid; sale uuid; operation uuid; order_id_value uuid;
 started timestamptz:=date_trunc('milliseconds',transaction_timestamp())-interval '3 hours';
 received timestamptz; completed timestamptz; intent jsonb; r record;
 finance jsonb; account uuid; account_version bigint; customer_version bigint; n integer;
BEGIN
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(st,'POS payment timing regression','pos-payment-timing-208','active','tr','TRY','hemenaku',started,started);
 INSERT INTO saas.principals VALUES(pr,'https://qa.celebix.invalid','pos218','pos218@qa.celebix.invalid',true,started,started);
 INSERT INTO saas.memberships VALUES(mb,pr,st,'store_owner','active',started,started);
 INSERT INTO saas.plans VALUES(pl,'pos218_qa',1,'active',started-interval '1 day',NULL,started,started);
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.plan_features VALUES(pl,'orders',2,true),(pl,'catalog',1,true);
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.subscriptions VALUES('a2180000-0000-4000-8000-000000000013',st,pl,'pos218_qa',1,'active',started-interval '1 day',NULL,started,started);
 SELECT id INTO loc FROM saas.inventory_locations WHERE store_id=st AND is_default;
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
 VALUES(pd,st,'pos-payment-timing-product','POS timing product','active','TRY',started,started);
 PERFORM set_config('saas.inventory.source_marker','catalog_adjustment',true);
 PERFORM set_config('saas.inventory.source_id','a2180000-0000-4000-8000-000000000012',true);
 PERFORM set_config('saas.inventory.source_time',started::text,true);
 INSERT INTO saas.product_variants(id,store_id,product_id,title,barcode,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
 VALUES(v,st,pd,'Standard','2180012345678',100000,true,10,'active',started,started);
 INSERT INTO saas.customers(id,store_id,email,phone,first_name,last_name,status,created_at,updated_at)
 VALUES(customer,st,NULL,'+905552080001','POS','Customer','active',started,started);
 UPDATE saas.accounting_release_state SET credit_sales_enabled=true;

 UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=true;
 -- A legacy physical-payment marker predates V4 and remains recoverable in mixed registers.
 intent:=jsonb_build_object('locationId',loc,'items',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1)),'discount',NULL,'customerName',NULL,'note',NULL);
 SELECT * INTO r FROM saas.in_store_sales_create(st,pr,mb,pl,'pos218_qa',1,started,'a2180000-0000-4000-8000-000000000151',repeat('a',64),'a2180000-0000-4000-8000-000000000150',intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'legacy create %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare(st,pr,mb,pl,'pos218_qa',1,started+interval '10 seconds','a2180000-0000-4000-8000-000000000152',repeat('b',64),'a2180000-0000-4000-8000-000000000150',1,100000);
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment(st,pr,mb,pl,'pos218_qa',1,started+interval '20 seconds','a2180000-0000-4000-8000-000000000153',repeat('c',64),'a2180000-0000-4000-8000-000000000150',2,NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'legacy payment %',r.outcome;END IF;
 sale:='a2180000-0000-4000-8000-000000000020';operation:='a2180000-0000-4000-8000-000000000021';
 intent:=jsonb_build_object('locationId',loc,'items',jsonb_build_array(jsonb_build_object('variantId',v,'quantity',1,'unitPriceOverrideCents',NULL)), 'discount',NULL,'customerName',NULL,'note',NULL,'customerId',NULL,'dueDate',NULL,'salesChannel','manual','socialPlatform',NULL,'socialReference',NULL,'fulfillmentMethod','pickup','shippingAddress',NULL,'billingAddress',NULL,'shippingCents',0,'paymentParts',jsonb_build_array(jsonb_build_object('partId','a2180000-0000-4000-8000-000000000031','paymentMethod','cash','amountCents',60000),jsonb_build_object('partId','a2180000-0000-4000-8000-000000000032','paymentMethod','card','amountCents',40000)));
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started,operation,repeat('a',64),sale,intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'v4 create: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '1 minute','a2180000-0000-4000-8000-000000000022',repeat('b',64),sale,1,100000);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'v4 prepare: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '2 minutes','a2180000-0000-4000-8000-000000000023',repeat('c',64),sale,2,'a2180000-0000-4000-8000-000000000031','a2180000-0000-4000-8000-000000000022',NULL);
 IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'payment_pending' THEN RAISE EXCEPTION 'part receipt pending: % %',r.outcome,r.result_payload;END IF;
 IF(SELECT balance_cents FROM saas.accounting_accounts WHERE store_id=st AND account_type='cash')<>60000 OR(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>10 THEN RAISE EXCEPTION 'cash must post before stock';END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '3 minutes','a2180000-0000-4000-8000-000000000024',repeat('d',64),sale,2,'a2180000-0000-4000-8000-000000000032','a2180000-0000-4000-8000-000000000022',NULL);
 IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'payment_received' THEN RAISE EXCEPTION 'independent stale aggregate part: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '4 minutes','a2180000-0000-4000-8000-000000000025',repeat('e',64),sale,4);
 IF r.outcome<>'committed' THEN RAISE EXCEPTION 'complete: %',r.outcome;END IF;
 IF(SELECT sum(balance_cents) FROM saas.accounting_accounts WHERE store_id=st)<>100000 OR(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>9 OR(SELECT count(*) FROM saas.accounting_events WHERE store_id=st AND kind='collection')<>2 THEN RAISE EXCEPTION 'complete double cash or stock';END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '5 minutes','a2180000-0000-4000-8000-000000000025',repeat('e',64),sale,4);
 IF r.outcome<>'operation_replayed' THEN RAISE EXCEPTION 'replay failed';END IF;

 INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 -- The release flag gates new writes, but cannot strand an existing sale.
 UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=false;
 SELECT * INTO r FROM saas.in_store_sales_get_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '6 minutes',sale);IF r.outcome<>'found' OR r.result_payload->>'contractVersion'<>'4' THEN RAISE EXCEPTION 'disabled recovery';END IF;
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '6 minutes','a2180000-0000-4000-8000-000000000041',repeat('a',64),'a2180000-0000-4000-8000-000000000040',intent);IF r.outcome<>'feature_not_enabled' THEN RAISE EXCEPTION 'disabled new creation: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_get_v3(st,pr,mb,pl,'pos218_qa',1,started+interval '6 minutes',sale);IF r.outcome<>'client_upgrade_required' THEN RAISE EXCEPTION 'legacy truncate';END IF;
 UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=true;
 -- A received cash part survives an abandoned card attempt, then a manager returns it.
 sale:='a2180000-0000-4000-8000-000000000040';
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '7 minutes','a2180000-0000-4000-8000-000000000041',repeat('a',64),sale,intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'abort create %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '8 minutes','a2180000-0000-4000-8000-000000000042',repeat('b',64),sale,1,100000);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'abort prepare %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '9 minutes','a2180000-0000-4000-8000-000000000043',repeat('c',64),sale,2,'a2180000-0000-4000-8000-000000000031','a2180000-0000-4000-8000-000000000042',NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'abort cash %',r.outcome;END IF;
 SELECT event_id INTO operation FROM saas.in_store_payment_receipts_v4 WHERE store_id=st AND sale_id=sale;
 SELECT version INTO account_version FROM saas.accounting_accounts WHERE store_id=st AND account_type='cash';
 SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos218_qa',1,started+interval '10 minutes','a2180000-0000-4000-8000-000000000049',repeat('d',64),'reverse',jsonb_build_object('eventId',operation,'reason','Wrong route','expectedVersion',account_version));IF r.outcome<>'invalid_transition' THEN RAISE EXCEPTION 'generic pending reversal %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_abort_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '10 minutes','a2180000-0000-4000-8000-000000000044',repeat('d',64),sale,3);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'abort %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '11 minutes','a2180000-0000-4000-8000-000000000045',repeat('e',64),sale,4);IF r.outcome<>'invalid_transition' THEN RAISE EXCEPTION 'abort finalize race';END IF;
 SELECT * INTO r FROM saas.in_store_sales_return_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '12 minutes','a2180000-0000-4000-8000-000000000046',repeat('f',64),sale,4,'a2180000-0000-4000-8000-000000000031','Müşteriye nakit iade edildi');IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'cancelled' THEN RAISE EXCEPTION 'pending return %',r.outcome;END IF;
 IF(SELECT sum(balance_cents) FROM saas.accounting_accounts WHERE store_id=st)<>100000 OR(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>9 OR EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations WHERE sale_id=sale AND status='held') THEN RAISE EXCEPTION 'return account/stock/reservation';END IF;
 -- Failed remaining tender can become explicit customer debt without repricing.
 sale:='a2180000-0000-4000-8000-000000000050';
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '13 minutes','a2180000-0000-4000-8000-000000000051',repeat('a',64),sale,intent);
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '14 minutes','a2180000-0000-4000-8000-000000000052',repeat('b',64),sale,1,100000);
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '15 minutes','a2180000-0000-4000-8000-000000000053',repeat('c',64),sale,2,'a2180000-0000-4000-8000-000000000031','a2180000-0000-4000-8000-000000000052',NULL);
 SELECT * INTO r FROM saas.in_store_sales_revise_payments_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '16 minutes','a2180000-0000-4000-8000-000000000054',repeat('d',64),sale,3,jsonb_build_array(intent->'paymentParts'->0),customer,NULL);IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'payment_received' THEN RAISE EXCEPTION 'explicit debt revision %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '16 minutes','a2180000-0000-4000-8000-000000000057',repeat('f',64),sale,3,'a2180000-0000-4000-8000-000000000032','a2180000-0000-4000-8000-000000000052',NULL);IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'stale pre-revision confirmation %',r.outcome;END IF;

 -- An obsolete never-recorded physical payment can be acknowledged only after full physical return.
 SELECT count(*) INTO n FROM saas.accounting_events WHERE store_id=st;
 SELECT * INTO r FROM saas.in_store_sales_reconcile_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '16 minutes','a2180000-0000-4000-8000-000000000058',repeat('a',64),sale,4,'a2180000-0000-4000-8000-000000000057','a2180000-0000-4000-8000-000000000052','a2180000-0000-4000-8000-000000000032');IF r.outcome<>'committed' THEN RAISE EXCEPTION 'obsolete-payment reconciliation %',r.outcome;END IF;
 IF (SELECT count(*) FROM saas.accounting_events WHERE store_id=st)<>n OR NOT EXISTS(SELECT 1 FROM saas.in_store_obsolete_payment_reconciliations_v4 WHERE original_operation_id='a2180000-0000-4000-8000-000000000057' AND amount_cents=40000 AND payment_method='card') OR NOT EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations WHERE sale_id=sale AND status='held') THEN RAISE EXCEPTION 'reconcile fabricated ledger/released stock';END IF;
 SELECT * INTO r FROM saas.in_store_sales_reconcile_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '16 minutes','a2180000-0000-4000-8000-000000000058',repeat('a',64),sale,4,'a2180000-0000-4000-8000-000000000057','a2180000-0000-4000-8000-000000000052','a2180000-0000-4000-8000-000000000032');IF r.outcome<>'operation_replayed' THEN RAISE EXCEPTION 'reconcile lost commit replay';END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '16 minutes','a2180000-0000-4000-8000-000000000057',repeat('f',64),sale,5,'a2180000-0000-4000-8000-000000000032','a2180000-0000-4000-8000-000000000052',NULL);IF r.outcome<>'invalid_transition' THEN RAISE EXCEPTION 'reconciled operation later posted %',r.outcome;END IF;
 UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=false,credit_sales_enabled=false;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '17 minutes','a2180000-0000-4000-8000-000000000055',repeat('e',64),sale,5);IF r.outcome<>'committed' OR r.result_payload#>>'{sale,finance,dueCents}'<>'40000' THEN RAISE EXCEPTION 'prepared recovery/debt %',r.outcome;END IF;
 IF(SELECT sum(balance_cents) FROM saas.accounting_accounts WHERE store_id=st)<>160000 OR(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>8 THEN RAISE EXCEPTION 'debt double movement';END IF;
 finance:=saas.accounting_customer_projection(st,customer,'TRY');IF jsonb_array_length(finance->'events')<>2 THEN RAISE EXCEPTION 'anonymous receipt allocation history %',finance;END IF;
 UPDATE saas.accounting_release_state SET manual_sales_v4_enabled=true,credit_sales_enabled=true;
 -- Social shipping uses the native source, a fee outside discount, and pending fulfillment.
 sale:='a2180000-0000-4000-8000-000000000060';
 intent:=intent||jsonb_build_object('customerId',customer,'salesChannel','social','socialPlatform','instagram','socialReference','DM-218','fulfillmentMethod','shipping','shippingAddress',jsonb_build_object('recipientName','POS Customer','line1','Test sokak 1','city','Istanbul','country','TR'),'billingAddress',NULL,'shippingCents',5000,'paymentParts',jsonb_build_array(jsonb_build_object('partId','a2180000-0000-4000-8000-000000000031','paymentMethod','cash','amountCents',60000),jsonb_build_object('partId','a2180000-0000-4000-8000-000000000032','paymentMethod','bank_transfer','amountCents',45000)));
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '18 minutes','a2180000-0000-4000-8000-000000000061',repeat('a',64),sale,intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'shipping create %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '19 minutes','a2180000-0000-4000-8000-000000000062',repeat('b',64),sale,1,105000);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'shipping prepare %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '20 minutes','a2180000-0000-4000-8000-000000000063',repeat('c',64),sale,2,'a2180000-0000-4000-8000-000000000031','a2180000-0000-4000-8000-000000000062',NULL);
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '21 minutes','a2180000-0000-4000-8000-000000000064',repeat('d',64),sale,3,'a2180000-0000-4000-8000-000000000032','a2180000-0000-4000-8000-000000000062','Banka dekontu');IF r.outcome<>'committed' THEN RAISE EXCEPTION 'bank receipt %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '22 minutes','a2180000-0000-4000-8000-000000000065',repeat('e',64),sale,4);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'shipping complete %',r.outcome;END IF;order_id_value:=(r.result_payload#>>'{sale,orderId}')::uuid;
 IF NOT EXISTS(SELECT 1 FROM saas.orders WHERE id=order_id_value AND source='in_store' AND status='pending' AND shipping_cents=5000 AND billing_address=shipping_address AND customer_email IS NULL) THEN RAISE EXCEPTION 'shipping order authority/address';END IF;
 SELECT version INTO account_version FROM saas.orders WHERE id=order_id_value;
 SELECT * INTO r FROM saas.orders_transition_status(st,pr,mb,pl,'pos218_qa',1,started+interval '23 minutes','a2180000-0000-4000-8000-000000000066',repeat('f',64),order_id_value,account_version,'cancelled');IF r.outcome<>'invalid_transition' THEN RAISE EXCEPTION 'shipping cancel unsafe %',r.outcome;END IF;
 SELECT * INTO r FROM saas.orders_transition_status(st,pr,mb,pl,'pos218_qa',1,started+interval '23 minutes','a2180000-0000-4000-8000-000000000067',repeat('a',64),order_id_value,account_version,'confirmed');IF r.outcome<>'committed' THEN RAISE EXCEPTION 'shipping fulfill blocked %',r.outcome;END IF;
 IF(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>7 THEN RAISE EXCEPTION 'shipping stock double change';END IF;
 SELECT * INTO r FROM saas.accounting_read(st,pr,mb,pl,'pos218_qa',1,started+interval '24 minutes','overview',jsonb_build_object('channel','POS','salesChannel','social'));IF r.outcome<>'found' OR r.result_payload#>>'{currencies,0,salesCents}'<>'105000' THEN RAISE EXCEPTION 'social report % %',r.outcome,r.result_payload;END IF;

 -- Old bootstrap ABIs remain valid and scope their lists and summary to legacy sales.
 SELECT * INTO r FROM saas.in_store_sales_bootstrap(st,pr,mb,pl,'pos218_qa',1,started+interval '25 minutes');IF r.outcome<>'found' THEN RAISE EXCEPTION 'legacy1 mixed bootstrap %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('bootstrap1',r.result_payload);
 SELECT * INTO r FROM saas.in_store_sales_bootstrap_v2(st,pr,mb,pl,'pos218_qa',1,started+interval '25 minutes');IF r.outcome<>'found' THEN RAISE EXCEPTION 'legacy2 mixed bootstrap %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('bootstrap2',r.result_payload);
 SELECT * INTO r FROM saas.in_store_sales_bootstrap_v3(st,pr,mb,pl,'pos218_qa',1,started+interval '25 minutes');IF r.outcome<>'found' THEN RAISE EXCEPTION 'legacy3 mixed bootstrap %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('bootstrap3',r.result_payload);
 SELECT * INTO r FROM saas.in_store_sales_bootstrap_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '25 minutes');IF r.outcome<>'found' THEN RAISE EXCEPTION 'postshipping register reload %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('bootstrap',r.result_payload);
 SELECT * INTO r FROM saas.orders_get_v2(st,pr,mb,pl,'pos218_qa',1,started+interval '25 minutes',order_id_value);IF r.outcome<>'found' OR r.result_payload->>'salesChannel'<>'social' OR r.result_payload->>'fulfillmentMethod'<>'shipping' THEN RAISE EXCEPTION 'real social shipping reader % %',r.outcome,r.result_payload;END IF;INSERT INTO v4_fixture_payloads VALUES('order',r.result_payload);

 -- Draft autosave permits no tender/customer, but preparation demands explicit credit contact.
 sale:='a2180000-0000-4000-8000-000000000070';intent:=intent||jsonb_build_object('customerId',NULL,'salesChannel','manual','socialPlatform',NULL,'socialReference',NULL,'fulfillmentMethod','pickup','shippingAddress',NULL,'billingAddress',NULL,'shippingCents',0,'paymentParts','[]'::jsonb);
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '26 minutes','a2180000-0000-4000-8000-000000000071',repeat('a',64),sale,intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'draft empty plan %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '27 minutes','a2180000-0000-4000-8000-000000000072',repeat('b',64),sale,1,100000);IF r.outcome<>'customer_required' THEN RAISE EXCEPTION 'anonymous debt prepared %',r.outcome;END IF;
 intent:=intent||jsonb_build_object('customerId',customer);SELECT * INTO r FROM saas.in_store_sales_update_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '28 minutes','a2180000-0000-4000-8000-000000000073',repeat('c',64),sale,1,intent);
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '29 minutes','a2180000-0000-4000-8000-000000000074',repeat('d',64),sale,2,100000);IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'payment_pending' THEN RAISE EXCEPTION 'zero credit prepare %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '30 minutes','a2180000-0000-4000-8000-000000000075',repeat('e',64),sale,3);IF r.outcome<>'committed' OR r.result_payload#>>'{sale,finance,dueCents}'<>'100000' OR r.result_payload#>>'{sale,paymentReceivedAt}' IS NOT NULL THEN RAISE EXCEPTION 'zero credit fabricated receipt %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 -- Formerly full single tender reconciles both upward and downward price changes before credit checks.
 intent:=intent||jsonb_build_object('customerId',NULL,'paymentParts',jsonb_build_array(jsonb_build_object('partId','a2180000-0000-4000-8000-000000000031','paymentMethod','cash','amountCents',100000)));
 sale:='a2180000-0000-4000-8000-000000000080';SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '31 minutes','a2180000-0000-4000-8000-000000000081',repeat('a',64),sale,intent);
 UPDATE saas.product_variants SET price_cents=110000,version=version+1,updated_at=started+interval '32 minutes' WHERE id=v;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '33 minutes','a2180000-0000-4000-8000-000000000082',repeat('b',64),sale,1,100000);IF r.outcome<>'committed' OR r.result_payload->>'priceChanged'<>'true' OR r.result_payload#>>'{sale,status}'<>'draft' OR r.result_payload#>>'{sale,paymentParts,0,amountCents}'<>'110000' THEN RAISE EXCEPTION 'up-price reconciliation % %',r.outcome,r.result_payload;END IF;INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 UPDATE saas.product_variants SET price_cents=90000,version=version+1,updated_at=started+interval '34 minutes' WHERE id=v;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '35 minutes','a2180000-0000-4000-8000-000000000083',repeat('c',64),sale,2,110000);IF r.outcome<>'committed' OR r.result_payload->>'priceChanged'<>'true' OR r.result_payload#>>'{sale,paymentParts,0,amountCents}'<>'90000' THEN RAISE EXCEPTION 'down-price reconciliation % %',r.outcome,r.result_payload;END IF;INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '36 minutes','a2180000-0000-4000-8000-000000000084',repeat('d',64),sale,3,90000);IF r.outcome<>'committed' OR r.result_payload->>'priceChanged'<>'false' THEN RAISE EXCEPTION 'price reconfirmation %',r.outcome;END IF;

 -- Unchanged A remains confirmable after B revisions; revised C can reconcile from its immutable revision.
 UPDATE saas.product_variants SET price_cents=100000,version=version+1,updated_at=started+interval '37 minutes' WHERE id=v;
 sale:='a2180000-0000-4000-8000-000000000090';intent:=intent||jsonb_build_object('paymentParts',jsonb_build_array(jsonb_build_object('partId','a2180000-0000-4000-8000-000000000031','paymentMethod','cash','amountCents',60000),jsonb_build_object('partId','a2180000-0000-4000-8000-000000000032','paymentMethod','card','amountCents',40000)));
 SELECT * INTO r FROM saas.in_store_sales_create_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '38 minutes','a2180000-0000-4000-8000-000000000091',repeat('a',64),sale,intent);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'independent revision create %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '39 minutes','a2180000-0000-4000-8000-000000000092',repeat('b',64),sale,1,100000);
 intent:=jsonb_set(intent,'{paymentParts,1,partId}','"a2180000-0000-4000-8000-000000000033"');
 SELECT * INTO r FROM saas.in_store_sales_revise_payments_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '40 minutes','a2180000-0000-4000-8000-000000000093',repeat('c',64),sale,2,intent->'paymentParts',NULL,NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'first revision %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '41 minutes','a2180000-0000-4000-8000-000000000094',repeat('d',64),sale,2,'a2180000-0000-4000-8000-000000000031','a2180000-0000-4000-8000-000000000092',NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'unchanged A stale other revision %',r.outcome;END IF;
 intent:=jsonb_set(jsonb_set(intent,'{paymentParts,1,partId}','"a2180000-0000-4000-8000-000000000034"'),'{paymentParts,1,paymentMethod}','"cash"');
 SELECT * INTO r FROM saas.in_store_sales_revise_payments_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '42 minutes','a2180000-0000-4000-8000-000000000095',repeat('e',64),sale,4,intent->'paymentParts',NULL,NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'second revision %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_reconcile_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '43 minutes','a2180000-0000-4000-8000-000000000096',repeat('f',64),sale,5,'a2180000-0000-4000-8000-000000000097','a2180000-0000-4000-8000-000000000092','a2180000-0000-4000-8000-000000000033');IF r.outcome<>'committed' OR NOT EXISTS(SELECT 1 FROM saas.in_store_obsolete_payment_reconciliations_v4 WHERE original_operation_id='a2180000-0000-4000-8000-000000000097' AND amount_cents=40000 AND payment_method='card') THEN RAISE EXCEPTION 'repeated revision reconciliation %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_revise_payments_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '44 minutes','a2180000-0000-4000-8000-000000000098',repeat('a',64),sale,6,jsonb_set(intent->'paymentParts','{1,amountCents}','20000'),customer,NULL);IF r.outcome<>'invalid_transition' THEN RAISE EXCEPTION 'part identity changed %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '45 minutes','a2180000-0000-4000-8000-000000000099',repeat('b',64),sale,6,'a2180000-0000-4000-8000-000000000034','a2180000-0000-4000-8000-000000000092',NULL);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'D receipt %',r.outcome;END IF;
 SELECT * INTO r FROM saas.in_store_sales_abort_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '46 minutes','a2180000-0000-4000-8000-000000000100',repeat('c',64),sale,7);
 SELECT * INTO r FROM saas.in_store_sales_return_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '47 minutes','a2180000-0000-4000-8000-000000000101',repeat('d',64),sale,8,'a2180000-0000-4000-8000-000000000031','A fiziksel iade');IF r.outcome<>'committed' THEN RAISE EXCEPTION 'A return %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('sale',r.result_payload->'sale');
 SELECT * INTO r FROM saas.in_store_sales_return_payment_v4(st,pr,mb,pl,'pos218_qa',1,started+interval '48 minutes','a2180000-0000-4000-8000-000000000102',repeat('e',64),sale,8,'a2180000-0000-4000-8000-000000000034','D fiziksel iade');IF r.outcome<>'committed' OR r.result_payload#>>'{sale,status}'<>'cancelled' THEN RAISE EXCEPTION 'independent B stale return %',r.outcome;END IF;
 IF(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>6 THEN RAISE EXCEPTION 'pending independent returns stock restore';END IF;

 SELECT * INTO r FROM saas.in_store_sales_get_operation(st,pr,mb,pl,'pos218_qa',1,started+interval '49 minutes','a2180000-0000-4000-8000-000000000153',repeat('c',64));IF r.outcome<>'found' OR r.result_payload#>>'{sale,status}'<>'payment_received' THEN RAISE EXCEPTION 'mixed legacy physical-marker recovery %',r.outcome;END IF;INSERT INTO v4_fixture_payloads VALUES('sale1',r.result_payload->'sale');
 SELECT * INTO r FROM saas.in_store_sales_complete(st,pr,mb,pl,'pos218_qa',1,started+interval '50 minutes','a2180000-0000-4000-8000-000000000154',repeat('d',64),'a2180000-0000-4000-8000-000000000150',3);IF r.outcome<>'committed' THEN RAISE EXCEPTION 'mixed legacy finalize %',r.outcome;END IF;

 -- Immutable anonymous receipts resolve their completed allocation for financial version checks.
 SELECT event_id INTO operation FROM saas.in_store_payment_receipts_v4 WHERE sale_id='a2180000-0000-4000-8000-000000000020' AND payment_method='cash';
 SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos218_qa',1,started+interval '51 minutes','a2180000-0000-4000-8000-000000000155',repeat('e',64),'reverse',jsonb_build_object('eventId',operation,'reason','Completed cash correction','expectedVersion',1));IF r.outcome<>'committed' OR r.result_payload#>>'{finance,dueCents}'<>'60000' THEN RAISE EXCEPTION 'anonymous completed reversal finance version % %',r.outcome,r.result_payload;END IF;
 SELECT version INTO customer_version FROM saas.accounting_customer_versions WHERE store_id=st AND customer_id=customer AND currency='TRY';
 SELECT event_id INTO operation FROM saas.in_store_payment_receipts_v4 WHERE sale_id='a2180000-0000-4000-8000-000000000050';
 SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos218_qa',1,started+interval '52 minutes','a2180000-0000-4000-8000-000000000156',repeat('f',64),'reverse',jsonb_build_object('eventId',operation,'reason','Attached customer cash correction','expectedVersion',1));IF r.outcome<>'committed' OR r.result_payload#>>'{finance,dueCents}'<>'100000' OR(SELECT version FROM saas.accounting_customer_versions WHERE store_id=st AND customer_id=customer AND currency='TRY')<>customer_version+1 THEN RAISE EXCEPTION 'attached customer reverse version % %',r.outcome,r.result_payload;END IF;
 SELECT * INTO r FROM saas.accounting_mutate(st,pr,mb,pl,'pos218_qa',1,started+interval '53 minutes','a2180000-0000-4000-8000-000000000156',repeat('f',64),'reverse',jsonb_build_object('eventId',operation,'reason','Attached customer cash correction','expectedVersion',1));IF r.outcome<>'operation_replayed' OR(SELECT stock_quantity FROM saas.product_variants WHERE id=v)<>5 THEN RAISE EXCEPTION 'reversal replay stock changed %',r.outcome;END IF;
END $test$;
SELECT jsonb_build_object('purpose',purpose,'payload',payload) FROM v4_fixture_payloads;
ROLLBACK;
