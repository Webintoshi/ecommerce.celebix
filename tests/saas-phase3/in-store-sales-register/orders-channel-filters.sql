-- Real PostgreSQL regression. All synthetic records are rolled back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $seed$
DECLARE
 st uuid:='a2270000-0000-4000-8000-000000000001';
 other_st uuid:='a2270000-0000-4000-8000-000000000002';
 pr uuid:='a2270000-0000-4000-8000-000000000003';
 mb uuid:='a2270000-0000-4000-8000-000000000004';
 pl uuid:='a2270000-0000-4000-8000-000000000005';
 cu uuid:='a2270000-0000-4000-8000-000000000006';
 loc uuid:='a2270000-0000-4000-8000-000000000007';
 other_mb uuid:='a2270000-0000-4000-8000-000000000008';
 other_loc uuid:='a2270000-0000-4000-8000-000000000009';
 analyst uuid:='a2270000-0000-4000-8000-000000000010';
 analyst_mb uuid:='a2270000-0000-4000-8000-000000000011';
 provider uuid:='a2270000-0000-4000-8000-000000000013';
 quick_link uuid:='a2270000-0000-4000-8000-000000000014';
 envelope jsonb:='{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}';
 address jsonb:='{"recipientName":"Synthetic Customer","phone":"+905552270001","line1":"Synthetic 1","city":"Istanbul","country":"TR"}';
 n timestamptz:=date_trunc('milliseconds',transaction_timestamp());
 platform text; i int; oid uuid; src text; order_st uuid;
BEGIN
 IF to_regprocedure('saas.orders_list_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text)') IS NULL THEN
  RAISE EXCEPTION 'ORDERS_CHANNEL_FILTERS_ABSENT';
 END IF;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
 VALUES(st,'Synthetic channel store','orders-filter-227','active','tr','TRY','hemenaku',n,n),
 (other_st,'Other synthetic store','orders-filter-other-227','active','tr','TRY','hemenaku',n,n);
 INSERT INTO saas.principals VALUES(pr,'https://qa.celebix.invalid','orders227','orders227@qa.celebix.invalid',true,n,n),
 (analyst,'https://qa.celebix.invalid','orders227-analyst','analyst227@qa.celebix.invalid',true,n,n);
 INSERT INTO saas.memberships VALUES(mb,pr,st,'store_owner','active',n,n),
 (other_mb,pr,other_st,'store_owner','active',n,n),(analyst_mb,analyst,st,'analyst','active',n,n);
 INSERT INTO saas.plans VALUES(pl,'orders227_qa',1,'active',n-interval '1 day',NULL,n,n);
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.plan_features VALUES(pl,'orders',2,true),(pl,'customers',3,true);
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.subscriptions VALUES('a2270000-0000-4000-8000-000000000012',st,pl,'orders227_qa',1,'active',n-interval '1 day',NULL,n,n);
 INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,archived_at,created_at,updated_at)
 VALUES(cu,st,'archived','Corrected','Customer',NULL,'+905552270001',1,n,n,n);
 INSERT INTO saas.inventory_locations(id,store_id,name,status,created_at,updated_at)
 VALUES(loc,st,'Synthetic location','active',n,n),(other_loc,other_st,'Other location','active',n,n);
 INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,created_at,updated_at)
 VALUES(provider,st,'paytr','active','https://www.paytr.com','key-1',envelope,repeat('c',64),n,n);
 INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,shipping_address,billing_address,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,created_at,updated_at)
 VALUES(quick_link,st,mb,provider,'active',repeat('2',64),'key-1',envelope,'Synthetic Customer','quick227@qa.celebix.invalid',address,address,'TRY',12000,0,0,12000,n+interval '24 hours',n,n);
 FOR i IN 1..17 LOOP
  oid:=('b2270000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  src:=CASE WHEN i<=9 OR i>=15 THEN 'in_store' WHEN i=10 THEN 'manual' WHEN i=11 THEN 'storefront' WHEN i=12 THEN 'quick_link' WHEN i=13 THEN 'marketplace' ELSE 'manual_import' END;
  order_st:=CASE WHEN i=17 THEN other_st ELSE st END;
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,quick_order_link_id)
  VALUES(oid,order_st,'FILTER-227-'||i,src,CASE WHEN i=1 THEN cu END,'Historical Customer','historic227@qa.celebix.invalid','+905552279999','TRY',i*1000,0,0,i*1000,CASE WHEN i%2=0 THEN 'preparing' ELSE 'confirmed' END,'pending','{}',n+i*interval '1 minute',n+i*interval '1 minute',CASE WHEN i=12 THEN quick_link END);
  IF i<=8 OR i>=15 THEN
   platform:=CASE WHEN i<=7 THEN (ARRAY['instagram','facebook','x','pinterest','tiktok','whatsapp','other'])[i] WHEN i IN(15,17) THEN 'instagram' END;
   INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,payment_received_at,completed_at,order_id,order_number,created_at,updated_at,sales_channel,social_platform)
   VALUES(('c2270000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,order_st,'SALE-227-'||i,'completed',CASE WHEN i=17 THEN other_mb ELSE mb END,CASE WHEN i=17 THEN other_loc ELSE loc END,'Synthetic location','{}','[]',i*1000,i*1000,0,i*1000,n,n,oid,'FILTER-227-'||i,n,n,CASE WHEN platform IS NULL THEN 'manual' ELSE 'social' END,platform);
  END IF;
  IF i IN(15,16) THEN
   INSERT INTO saas.order_archive_operations(store_id,operation_id,order_id,principal_id,membership_id,action,reason,evidence_reference,changed_at,result_payload)
   VALUES(st,oid,oid,pr,mb,'archive','Synthetic fixture','qa/channel227',n,'{}');
   INSERT INTO saas.order_archive_state VALUES(st,oid,true,oid,n);
  END IF;
 END LOOP;
 -- A second reference must not duplicate a list row. A foreign store reference
 -- to the same UUID must never turn a legacy manual order into a social sale.
 INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,payment_received_at,completed_at,order_id,order_number,created_at,updated_at,sales_channel,social_platform)
 VALUES('c2270000-0000-4000-8000-000000000018',st,'SALE-227-DUP','completed',mb,loc,'Synthetic location','{}','[]',1000,1000,0,1000,n,n,'b2270000-0000-4000-8000-000000000001','FILTER-227-1',n,n,'social','instagram'),
 ('c2270000-0000-4000-8000-000000000019',other_st,'SALE-227-FOREIGN-REF','completed',other_mb,other_loc,'Other location','{}','[]',1000,1000,0,1000,n,n,'b2270000-0000-4000-8000-000000000009','FILTER-227-9',n,n,'social','instagram');
END $seed$;
SET TRANSACTION READ ONLY;
-- Execute the actual app-role readers. Direct table access and private scope
-- execution stay unavailable to the application role.
SET LOCAL ROLE celebix_saas_app;
DO $test$
DECLARE
 st uuid:='a2270000-0000-4000-8000-000000000001';
 pr uuid:='a2270000-0000-4000-8000-000000000003';
 mb uuid:='a2270000-0000-4000-8000-000000000004';
 pl uuid:='a2270000-0000-4000-8000-000000000005';
 n timestamptz:=date_trunc('milliseconds',transaction_timestamp());
 r record; legacy record; channel text; platform text; sort text; arg jsonb;
 ids jsonb; expected jsonb; cursor jsonb; i int; pages int;
BEGIN
 SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,NULL,NULL);
 SELECT * INTO legacy FROM saas.orders_list_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL);
 IF r.outcome<>'listed' OR r.result_payload<>legacy.result_payload OR jsonb_array_length(r.result_payload->'items')<>14 THEN RAISE EXCEPTION 'unfiltered ABI changed';END IF;
 SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,'manual',NULL);
 SELECT jsonb_agg(item->>'orderNumber' ORDER BY item->>'orderNumber') INTO ids FROM jsonb_array_elements(r.result_payload->'items') item;
 IF ids<>'["FILTER-227-10","FILTER-227-8","FILTER-227-9"]'::jsonb THEN RAISE EXCEPTION 'manual/legacy or foreign-scope classification failed: %',ids;END IF;
 SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,'social',NULL);
 IF jsonb_array_length(r.result_payload->'items')<>7 THEN RAISE EXCEPTION 'social cardinality or tenant boundary failed';END IF;
 FOREACH platform IN ARRAY ARRAY['instagram','facebook','x','pinterest','tiktok','whatsapp','other'] LOOP
  SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,'social',platform);
  IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,socialPlatform}'<>platform THEN RAISE EXCEPTION 'platform mismatch %: %',platform,r.result_payload;END IF;
 END LOOP;
 FOREACH channel IN ARRAY ARRAY['storefront','quick_link','marketplace','manual_import'] LOOP
  SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,channel,NULL);
  IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,source}'<>channel THEN RAISE EXCEPTION 'exact source mismatch %',channel;END IF;
 END LOOP;
 -- Newer orders of other channels must not produce an empty first social page.
 FOREACH sort IN ARRAY ARRAY['newest','oldest','highest','lowest'] LOOP
  ids:='[]';cursor:=NULL;pages:=0;
  LOOP
   SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,sort,2,(cursor->>'totalCents')::bigint,(cursor->>'createdAt')::timestamptz,(cursor->>'id')::uuid,'social',NULL);
   IF r.outcome<>'listed' OR jsonb_array_length(r.result_payload->'items')=0 THEN RAISE EXCEPTION 'empty filtered page %',sort;END IF;
   SELECT ids||coalesce(jsonb_agg(item->>'orderNumber'),'[]') INTO ids FROM jsonb_array_elements(r.result_payload->'items') item;
   pages:=pages+1;cursor:=r.result_payload->'nextCursor';EXIT WHEN cursor IS NULL;
   IF pages>4 THEN RAISE EXCEPTION 'cursor did not finish';END IF;
  END LOOP;
  expected:=CASE WHEN sort IN('newest','highest') THEN '["FILTER-227-7","FILTER-227-6","FILTER-227-5","FILTER-227-4","FILTER-227-3","FILTER-227-2","FILTER-227-1"]'::jsonb ELSE '["FILTER-227-1","FILTER-227-2","FILTER-227-3","FILTER-227-4","FILTER-227-5","FILTER-227-6","FILTER-227-7"]'::jsonb END;
  IF ids<>expected OR pages<>4 THEN RAISE EXCEPTION 'filtered cursor % mismatch %',sort,ids;END IF;
 END LOOP;
 SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,'preparing',NULL,'newest',100,NULL,NULL,NULL,'social',NULL);
 IF jsonb_array_length(r.result_payload->'items')<>3 THEN RAISE EXCEPTION 'status intersection failed';END IF;
 FOREACH platform IN ARRAY ARRAY['Corrected Customer','0555 227 00 01','historic227@qa.celebix.invalid'] LOOP
  SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,platform,'newest',100,NULL,NULL,NULL,'social','instagram');
  IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,currentCustomer,name}'<>'Corrected Customer' OR r.result_payload#>'{items,0,currentCustomer,email}'<>'null'::jsonb OR r.result_payload#>>'{items,0,currentCustomer,archived}'<>'true' THEN RAISE EXCEPTION 'current/historic contact or archive changed %',platform;END IF;
 END LOOP;
 SELECT * INTO r FROM saas.orders_list_archived_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,'social','instagram');
 IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,orderNumber}'<>'FILTER-227-15' THEN RAISE EXCEPTION 'archived social filter failed';END IF;
 SELECT * INTO r FROM saas.orders_list_archived_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',100,NULL,NULL,NULL,'manual',NULL);
 IF jsonb_array_length(r.result_payload->'items')<>1 OR r.result_payload#>>'{items,0,orderNumber}'<>'FILTER-227-16' THEN RAISE EXCEPTION 'archived manual filter failed';END IF;
 SELECT * INTO r FROM saas.orders_list_archived_filtered_v2(st,'a2270000-0000-4000-8000-000000000010','a2270000-0000-4000-8000-000000000011',pl,'orders227_qa',1,n,NULL,NULL,'newest',20,NULL,NULL,NULL,'social',NULL);
 IF r.outcome<>'membership_denied' THEN RAISE EXCEPTION 'archive manage permission bypassed';END IF;
 SELECT * INTO r FROM saas.orders_list_filtered_v2(st,'a2270000-0000-4000-8000-000000000010','a2270000-0000-4000-8000-000000000011',pl,'orders227_qa',1,n,NULL,NULL,'newest',20,NULL,NULL,NULL,'social',NULL);
 IF r.outcome<>'listed' THEN RAISE EXCEPTION 'ordinary orders.read authority changed';END IF;
 SELECT * INTO r FROM saas.orders_list_filtered_v2('a2270000-0000-4000-8000-000000000002',pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',20,NULL,NULL,NULL,'social',NULL);
 IF r.outcome<>'membership_denied' THEN RAISE EXCEPTION 'foreign store permitted';END IF;
 FOR arg IN SELECT value FROM jsonb_array_elements('[{"channel":"in_store"},{"channel":"SOCIAL"},{"channel":""},{"channel":"social "},{"channel":"social","platform":"linkedin"},{"channel":"social","platform":""},{"channel":"social","platform":"Instagram"},{"channel":"manual","platform":"instagram"},{"platform":"instagram"}]') LOOP
  SELECT * INTO r FROM saas.orders_list_filtered_v2(st,pr,mb,pl,'orders227_qa',1,n,NULL,NULL,'newest',20,NULL,NULL,NULL,arg->>'channel',arg->>'platform');
  IF r.outcome<>'invalid_input' OR r.result_payload IS NOT NULL THEN RAISE EXCEPTION 'invalid filter accepted %',arg;END IF;
 END LOOP;
END $test$;
ROLLBACK;
