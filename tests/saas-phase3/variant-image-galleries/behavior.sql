-- This entire fixture and all gallery writes are rolled back by the harness.
CREATE FUNCTION pg_temp.gallery_save(op integer,expected bigint,assignments jsonb,actor integer DEFAULT 186,fingerprint text DEFAULT repeat('a',64))
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql AS $f$
 SELECT * FROM saas.media_save_variant_gallery('10000000-0000-4000-8000-000000000186',('20000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,('30000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001','free_starter',1,1000000000,'2026-10-01',('80000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,fingerprint,'40000000-0000-4000-8000-000000000186',expected,assignments)
$f$;
SET LOCAL ROLE celebix_saas_app;
DO $test$
DECLARE r record; first_payload jsonb; payload jsonb; all_ids jsonb;
BEGIN
 SELECT * INTO r FROM saas.media_list_variant_gallery('10000000-0000-4000-8000-000000000186','20000000-0000-4000-8000-000000000187','30000000-0000-4000-8000-000000000187','00000000-0000-4000-8000-000000000001','free_starter',1,1000000000,'2026-10-01','40000000-0000-4000-8000-000000000186');
 IF r.outcome IS DISTINCT FROM 'found' OR r.result_payload#>>'{gallery,version}' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Analyst GET denied: %',r;END IF;
 payload:='[{"variantId":"50000000-0000-4000-8000-000000000186","mediaIds":["60000000-0000-4000-8000-000000000003","60000000-0000-4000-8000-000000000002"]},{"variantId":"50000000-0000-4000-8000-000000000187","mediaIds":["60000000-0000-4000-8000-000000000003"]}]';
 SELECT * INTO r FROM pg_temp.gallery_save(1,1,payload,187);
 IF r.outcome IS DISTINCT FROM 'membership_denied' THEN RAISE EXCEPTION 'Analyst write accepted: %',r;END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(1,1,payload);first_payload:=r.result_payload;
 IF r.outcome IS DISTINCT FROM 'committed' OR r.result_payload#>>'{gallery,version}' IS DISTINCT FROM '2' OR r.result_payload#>'{gallery,assignments,0,mediaIds}' IS DISTINCT FROM payload#>'{0,mediaIds}' THEN RAISE EXCEPTION 'Ordered atomic assignment failed: %',r;END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(1,1,payload);
 IF r.outcome IS DISTINCT FROM 'operation_replayed' OR r.result_payload IS DISTINCT FROM first_payload THEN RAISE EXCEPTION 'Idempotent replay failed';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(1,1,payload,186,repeat('b',64));
 IF r.outcome IS DISTINCT FROM 'operation_mismatch' THEN RAISE EXCEPTION 'Replay mismatch accepted';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(2,1,payload);
 IF r.outcome IS DISTINCT FROM 'version_conflict' THEN RAISE EXCEPTION 'Stale version accepted';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(3,2,'[{"variantId":"50000000-0000-4000-8000-000000000186","mediaIds":[]},{"variantId":"50000000-0000-4000-8000-000000000188","mediaIds":[]}]');
 IF r.outcome IS DISTINCT FROM 'variant_not_found' THEN RAISE EXCEPTION 'Cross-product batch accepted';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(4,2,'[{"variantId":"50000000-0000-4000-8000-000000000186","mediaIds":["60000000-0000-4000-8000-000000009999"]}]');
 IF r.outcome IS DISTINCT FROM 'media_not_found' THEN RAISE EXCEPTION 'Missing media accepted';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(5,2,'[{"variantId":"50000000-0000-4000-8000-000000000186","mediaIds":["60000000-0000-4000-8000-000000000003","60000000-0000-4000-8000-000000000003"]}]');
 IF r.outcome IS DISTINCT FROM 'invalid_input' THEN RAISE EXCEPTION 'Duplicate media accepted';END IF;
 SELECT jsonb_agg(('60000000-0000-4000-8000-'||lpad(g::text,12,'0')) ORDER BY g DESC) INTO all_ids FROM generate_series(1,16) g;
 SELECT * INTO r FROM pg_temp.gallery_save(6,2,jsonb_build_array(jsonb_build_object('variantId','50000000-0000-4000-8000-000000000186','mediaIds',all_ids||'"60000000-0000-4000-8000-000000000017"'::jsonb)));
 IF r.outcome IS DISTINCT FROM 'invalid_input' THEN RAISE EXCEPTION '17 image assignment accepted';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(7,2,jsonb_build_array(jsonb_build_object('variantId','50000000-0000-4000-8000-000000000186','mediaIds',all_ids)));
 IF r.outcome IS DISTINCT FROM 'committed' OR r.result_payload#>'{gallery,assignments,0,mediaIds}' IS DISTINCT FROM all_ids OR jsonb_array_length(r.result_payload#>'{gallery,assignments}') IS DISTINCT FROM 2 THEN RAISE EXCEPTION '16 reused images/untouched assignment failed';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(8,3,'[{"variantId":"50000000-0000-4000-8000-000000000186","mediaIds":[]}]');
 IF r.outcome IS DISTINCT FROM 'committed' OR r.result_payload#>'{gallery,assignments,0,mediaIds}' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Explicit general reset failed';END IF;
END $test$;
SET LOCAL ROLE celebix_saas_owner;
DO $test$
DECLARE r record; selected uuid; count_before bigint; projection jsonb;
BEGIN
 SELECT count(*) INTO count_before FROM saas.product_media WHERE product_id='40000000-0000-4000-8000-000000000186';
 IF count_before IS DISTINCT FROM 16 OR (SELECT sum(byte_size) FROM saas.product_media WHERE product_id='40000000-0000-4000-8000-000000000186') IS DISTINCT FROM 1600 THEN RAISE EXCEPTION 'Gallery consumed extra image quota';END IF;
 selected:=saas.variant_primary_media_id('10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000186');
 IF selected IS DISTINCT FROM '60000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'General reset retained legacy cover';END IF;
 selected:=saas.variant_primary_media_id('10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187');
 IF selected IS DISTINCT FROM '60000000-0000-4000-8000-000000000003'::uuid THEN RAISE EXCEPTION 'Assigned cover missing';END IF;
 projection:=saas.variant_media_commerce_projection('10000000-0000-4000-8000-000000000186','{"version":7,"items":[{"productId":"40000000-0000-4000-8000-000000000186","variantId":"50000000-0000-4000-8000-000000000187","quantity":1,"categoryId":"keep-me","media":{"old":true}}]}');
 IF projection#>>'{items,0,media,id}' IS DISTINCT FROM selected::text OR projection#>>'{items,0,categoryId}' IS DISTINCT FROM 'keep-me' OR projection->>'version' IS DISTINCT FROM '7' THEN RAISE EXCEPTION 'Commerce thumbnail wrapper discarded shared fields';END IF;
 IF saas.storefront_cart_projection('10000000-0000-4000-8000-000000000186','90000000-0000-4000-8000-000000000186','2026-10-01')#>>'{items,0,media,id}' IS DISTINCT FROM selected::text THEN RAISE EXCEPTION 'Actual cart projection bypassed gallery';END IF;
 IF saas.storefront_intent_projection('10000000-0000-4000-8000-000000000186','90000000-0000-4000-8000-000000000187','2026-10-01')#>>'{items,0,media,id}' IS DISTINCT FROM selected::text THEN RAISE EXCEPTION 'Actual intent projection bypassed gallery';END IF;
 SELECT * INTO r FROM saas.public_cart_resolve('gallery-a.example.test','2026-10-01',jsonb_build_array(jsonb_build_object('keyId','test','digest',repeat('c',64))));
 IF r.outcome IS DISTINCT FROM 'found' OR r.result_payload#>>'{items,0,media,id}' IS DISTINCT FROM selected::text THEN RAISE EXCEPTION 'Public cart RPC bypassed gallery: %',r;END IF;
 SELECT * INTO r FROM saas.public_checkout_quote('gallery-a.example.test','2026-10-01','buy_now',jsonb_build_array(jsonb_build_object('keyId','test','digest',repeat('d',64))));
 IF r.result_payload#>>'{cart,items,0,media,id}' IS DISTINCT FROM selected::text THEN RAISE EXCEPTION 'Public intent quote RPC bypassed gallery: %',r;END IF;
 SELECT * INTO r FROM saas.merchant_product_images('10000000-0000-4000-8000-000000000186','20000000-0000-4000-8000-000000000186','30000000-0000-4000-8000-000000000186','00000000-0000-4000-8000-000000000001','free_starter',1,'2026-10-01','pos','[{"key":"pos-cover","productId":"40000000-0000-4000-8000-000000000186","variantId":"50000000-0000-4000-8000-000000000187"}]');
 IF r.outcome IS DISTINCT FROM 'found' OR r.result_payload#>>'{images,0,imageUrl}' IS DISTINCT FROM 'https://media.example/stores/10000000-0000-4000-8000-000000000186/products/40000000-0000-4000-8000-000000000186/60000000-0000-4000-8000-000000000003.webp' THEN RAISE EXCEPTION 'POS cover ignored assignment: %',r;END IF;
 SELECT * INTO r FROM saas.merchant_product_images('10000000-0000-4000-8000-000000000186','20000000-0000-4000-8000-000000000186','30000000-0000-4000-8000-000000000186','00000000-0000-4000-8000-000000000001','free_starter',1,'2026-10-01','orders','[{"key":"order-cover","orderId":"91000000-0000-4000-8000-000000000186","orderItemId":"92000000-0000-4000-8000-000000000186"}]');
 IF r.outcome IS DISTINCT FROM 'found' OR r.result_payload#>>'{images,0,imageUrl}' IS DISTINCT FROM 'https://media.example/stores/10000000-0000-4000-8000-000000000186/products/40000000-0000-4000-8000-000000000186/60000000-0000-4000-8000-000000000003.webp' THEN RAISE EXCEPTION 'Order cover ignored assignment: %',r;END IF;
 -- Archive via the real lifecycle transitions; links remain but reads filter the unavailable image.
 UPDATE saas.product_media SET status='pending',version=version+1,updated_at='2026-10-01' WHERE id=selected;
 UPDATE saas.product_media SET status='archived',cleanup_state='retained',retention_expires_at='2026-10-31',archived_at='2026-10-01',updated_at='2026-10-01',version=version+1 WHERE id=selected;
 selected:=saas.variant_primary_media_id('10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187');
 IF selected IS DISTINCT FROM '60000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'Archived assignment did not fall back';END IF;
 SELECT * INTO r FROM pg_temp.gallery_save(9,4,'[{"variantId":"50000000-0000-4000-8000-000000000187","mediaIds":["60000000-0000-4000-8000-000000000003"]}]');
 IF r.outcome IS DISTINCT FROM 'media_not_found' THEN RAISE EXCEPTION 'Archived assignment accepted';END IF;
 IF has_table_privilege('celebix_saas_app','saas.variant_media_links','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver','saas.variant_media_links','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Direct table grants leak';END IF;
 IF has_function_privilege('public','saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Public gallery writer grant';END IF;
END $test$;
SET LOCAL ROLE celebix_saas_host_resolver;
DO $test$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM saas.public_variant_media_assignments('10000000-0000-4000-8000-000000000186','gallery-a.example.test','2026-10-01',ARRAY['40000000-0000-4000-8000-000000000186'::uuid,'40000000-0000-4000-8000-000000000187'::uuid]);
 IF r.outcome IS DISTINCT FROM 'found' OR jsonb_array_length(r.result_payload->'assignments') IS DISTINCT FROM 2 OR r.result_payload#>'{assignments,1,mediaIds}' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Public filtering/empty assignment failed: %',r;END IF;
 SELECT * INTO r FROM saas.public_variant_media_assignments('10000000-0000-4000-8000-000000000187','gallery-a.example.test','2026-10-01',ARRAY['40000000-0000-4000-8000-000000000186'::uuid]);
 IF r.outcome IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'Host tenant guard failed';END IF;
 SELECT * INTO r FROM saas.public_variant_media_assignments('10000000-0000-4000-8000-000000000186','unknown.example.test','2026-10-01',ARRAY['40000000-0000-4000-8000-000000000186'::uuid]);
 IF r.outcome IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'Unknown host accepted';END IF;
END $test$;

SET LOCAL ROLE celebix_saas_owner;
DO $test$
DECLARE selected uuid;
BEGIN
 -- Remove all general images while retaining the lone legacy-tagged image.
 UPDATE saas.product_media SET status='pending',version=version+1,updated_at='2026-10-01' WHERE product_id='40000000-0000-4000-8000-000000000186' AND status='active' AND variant_id IS NULL;
 UPDATE saas.product_media SET status='archived',cleanup_state='retained',retention_expires_at='2026-10-31',archived_at='2026-10-01',updated_at='2026-10-01',version=version+1 WHERE product_id='40000000-0000-4000-8000-000000000186' AND status='pending';
 selected:=saas.variant_primary_media_id('10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187');
 IF selected IS DISTINCT FROM '60000000-0000-4000-8000-000000000016'::uuid THEN RAISE EXCEPTION 'General fallback excluded another legacy variant image';END IF;
END $test$;
