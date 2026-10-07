-- Actual disposable PostgreSQL fixture. All synthetic customer/order records roll back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $test$
DECLARE
 st uuid:='a2190000-0000-4000-8000-000000000001';
 other_store uuid:='a2190000-0000-4000-8000-000000000002';
 pr uuid:='a2190000-0000-4000-8000-000000000003';
 mb uuid:='a2190000-0000-4000-8000-000000000004';
 pl uuid:='a2190000-0000-4000-8000-000000000005';
 customer uuid:='a2190000-0000-4000-8000-000000000006';
 other_customer uuid:='a2190000-0000-4000-8000-000000000007';
 oid uuid:='a2190000-0000-4000-8000-000000000008';
 guest uuid:='a2190000-0000-4000-8000-000000000009';
 now_at timestamptz:=date_trunc('milliseconds',transaction_timestamp());
 delivery jsonb:='{"recipientName":"Historical recipient","line1":"Historical delivery","city":"İstanbul","country":"TR"}';
 billing jsonb:='{"recipientName":"Historical billing recipient","line1":"Historical billing","city":"İstanbul","country":"TR"}';
 r record; before_order jsonb; after_order jsonb; value jsonb; search text;
BEGIN
 IF to_regprocedure('saas.orders_get_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL THEN RAISE EXCEPTION 'ORDERS_READER_V2_ABSENT'; END IF;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(st,'Orders reader regression','orders-reader-219','active','tr','TRY','hemenaku',now_at,now_at),
 (other_store,'Other synthetic store','orders-reader-other-219','active','tr','TRY','hemenaku',now_at,now_at);
 INSERT INTO saas.principals VALUES(pr,'https://qa.celebix.invalid','orders219','orders219@qa.celebix.invalid',true,now_at,now_at);
 INSERT INTO saas.memberships VALUES(mb,pr,st,'store_owner','active',now_at,now_at);
 INSERT INTO saas.plans VALUES(pl,'orders219_qa',1,'active',now_at-interval '1 day',NULL,now_at,now_at);
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.plan_features VALUES(pl,'orders',2,true),(pl,'customers',3,true);
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.subscriptions VALUES('a2190000-0000-4000-8000-000000000010',st,pl,'orders219_qa',1,'active',now_at-interval '1 day',NULL,now_at,now_at);
 INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at)
 VALUES(customer,st,'active','Original','Customer','original@qa.celebix.invalid','+905552190001',1,now_at,now_at),
 (other_customer,other_store,'active','Foreign','Profile','foreign@qa.celebix.invalid','+905552199999',1,now_at,now_at);
 INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,created_at,updated_at)
 VALUES(oid,st,'MAN-READER-219','manual_import',customer,'Historic Customer','historic@qa.celebix.invalid','+905552191111','TRY',1000,0,0,1000,'confirmed','pending',delivery,billing,now_at,now_at),
 (guest,st,'MAN-GUEST-219','manual',NULL,'Historic Guest','guest@qa.celebix.invalid',NULL,'TRY',1000,0,0,1000,'confirmed','pending',delivery,billing,now_at,now_at);
 SELECT to_jsonb(o) INTO before_order FROM saas.orders o WHERE id=oid;
 SELECT * INTO r FROM saas.customers_save(st,pr,mb,pl,'orders219_qa',1,now_at,'a2190000-0000-4000-8000-000000000011',repeat('a',64),customer,1,'Corrected','Customer','corrected@qa.celebix.invalid','+905552192222','[]','[]');
 IF r.outcome<>'committed' THEN RAISE EXCEPTION 'customer correction failed: %',r.outcome; END IF;
 FOREACH search IN ARRAY ARRAY['Corrected Customer','corrected@qa.celebix.invalid','0 (555) 219 22 22','+90 555 219 22 22','Historic Customer','historic@qa.celebix.invalid','0555 219 11 11'] LOOP
  SELECT * INTO r FROM saas.orders_list_v2(st,pr,mb,pl,'orders219_qa',1,now_at,NULL,search,'newest',20,NULL,NULL,NULL);
  IF r.outcome<>'listed' OR jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,id}'<>oid::text THEN RAISE EXCEPTION 'current/historic normalized search missing %: %',search,r.result_payload;END IF;
 END LOOP;
 SELECT * INTO r FROM saas.orders_list_v2(st,pr,mb,pl,'orders219_qa',1,now_at,NULL,'Foreign Profile','newest',20,NULL,NULL,NULL);
 IF r.result_payload->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'foreign profile leaked into search';END IF;
 SELECT * INTO r FROM saas.orders_get_v2(other_store,pr,mb,pl,'orders219_qa',1,now_at,oid);
 IF r.outcome<>'membership_denied' THEN RAISE EXCEPTION 'foreign store reader permitted: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.orders_get_with_archive(st,pr,mb,pl,'orders219_qa',1,now_at,oid);
 IF r.result_payload?'currentCustomer' OR r.result_payload->>'customerName'<>'Historic Customer' THEN RAISE EXCEPTION 'legacy reader changed';END IF;
 SELECT * INTO r FROM saas.orders_get_v2(st,pr,mb,pl,'orders219_qa',1,now_at,oid);
 IF r.result_payload#>>'{currentCustomer,name}'<>'Corrected Customer' OR r.result_payload->'shippingAddress'<>delivery OR r.result_payload->'billingAddress'<>billing THEN RAISE EXCEPTION 'profile or historic addresses changed';END IF;
 SELECT * INTO r FROM saas.customers_save(st,pr,mb,pl,'orders219_qa',1,now_at,'a2190000-0000-4000-8000-000000000012',repeat('b',64),customer,2,'Corrected','Customer',NULL,NULL,'[]','[]');
 IF r.outcome<>'committed' THEN RAISE EXCEPTION 'contact clear failed: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.orders_get_v2(st,pr,mb,pl,'orders219_qa',1,now_at,oid);
 IF r.result_payload#>'{currentCustomer,email}'<>'null'::jsonb OR r.result_payload#>'{currentCustomer,phone}'<>'null'::jsonb THEN RAISE EXCEPTION 'cleared current contact restored historic fields';END IF;
 SELECT * INTO r FROM saas.customers_archive(st,pr,mb,pl,'orders219_qa',1,now_at,'a2190000-0000-4000-8000-000000000013',repeat('c',64),customer,3);
 IF r.outcome<>'committed' THEN RAISE EXCEPTION 'customer archive failed: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.orders_list_v2(st,pr,mb,pl,'orders219_qa',1,now_at,NULL,'Corrected Customer','newest',20,NULL,NULL,NULL);
 IF r.result_payload#>>'{items,0,currentCustomer,archived}'<>'true' THEN RAISE EXCEPTION 'archived profile hid order';END IF;
 SELECT * INTO r FROM saas.orders_get_v2(st,pr,mb,pl,'orders219_qa',1,now_at,guest);
 IF r.result_payload->'customerId'<>'null'::jsonb OR r.result_payload->'currentCustomer'<>'null'::jsonb OR r.result_payload->>'customerName'<>'Historic Guest' THEN RAISE EXCEPTION 'guest snapshot lost';END IF;
 SELECT * INTO r FROM saas.orders_archive(st,pr,mb,pl,'orders219_qa',1,now_at,'a2190000-0000-4000-8000-000000000014',oid,'reader fixture','qa/orders219');
 IF r.outcome<>'archived' THEN RAISE EXCEPTION 'order archive failed: %',r.outcome;END IF;
 SELECT * INTO r FROM saas.orders_list_archived_v2(st,pr,mb,pl,'orders219_qa',1,now_at,NULL,'Corrected Customer','newest',20,NULL,NULL,NULL);
 IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,id}'<>oid::text THEN RAISE EXCEPTION 'archived order current search missing';END IF;
 SELECT to_jsonb(o) INTO after_order FROM saas.orders o WHERE id=oid;
 IF before_order<>after_order THEN RAISE EXCEPTION 'customer mutation rewrote immutable order snapshot';END IF;
END $test$;
ROLLBACK;
