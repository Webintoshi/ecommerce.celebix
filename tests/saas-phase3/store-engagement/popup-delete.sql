-- Socket-only disposable fixture. Every synthetic campaign/contact rolls back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE popup_delete_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.popup_delete_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
 IF current_setting('celebix.popup_delete.inject_failure',true)='1' AND NEW.request_payload->>'action'='delete_popup' THEN RAISE EXCEPTION 'POPUP222_INJECTED_OPERATION_FAILURE';END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER popup_delete_atomic_fixture BEFORE INSERT ON saas.store_engagement_admin_operations FOR EACH ROW EXECUTE FUNCTION pg_temp.popup_delete_fail_receipt();
DO $test$
DECLARE
 st uuid:='a2220000-0000-4000-8000-000000000001';otherst uuid:='a2220000-0000-4000-8000-000000000011';
 pr uuid:='a2220000-0000-4000-8000-000000000002';mb uuid:='a2220000-0000-4000-8000-000000000003';
 othermb uuid:='a2220000-0000-4000-8000-000000000013';pl uuid:='a2220000-0000-4000-8000-000000000004';
 cashier uuid:='a2220000-0000-4000-8000-000000000005';cashmb uuid:='a2220000-0000-4000-8000-000000000006';
 n timestamptz:=date_trunc('milliseconds',transaction_timestamp())-interval '1 hour';
 config jsonb:='{"schemaVersion":1,"template":"minimal","heading":"Merhaba","body":"","buttonLabel":"Devam et","delaySeconds":5,"repeatDays":7,"devices":{"desktop":true,"mobile":true},"collectMode":"either"}';
 promo uuid:='a2220000-0000-4000-8000-000000000020';media uuid:='a2220000-0000-4000-8000-000000000021';
 cart uuid:='a2220000-0000-4000-8000-000000000022';popup uuid;capture uuid;foreign_popup uuid;protected_popup uuid;slot uuid;
 op uuid:=gen_random_uuid();r record;receipt jsonb;before_contact jsonb;before_promo jsonb;before_media jsonb;i integer;
 rule jsonb:='{"schemaVersion":1,"benefit":{"kind":"percentage","percentageBps":300},"targets":{"mode":"all","include":[],"exclude":[]},"audience":{"mode":"everyone"},"trigger":{"kind":"code","codes":["DELETE222"]},"schedule":{"timezone":"Europe/Istanbul"},"limits":{"totalUsage":null,"perCustomerUsage":null,"budgetMinor":null,"orderMaximumMinor":null},"conditions":{"minimumBasketMinor":0,"minimumQuantity":0,"minimumProductQuantity":0},"combinationPolicy":{"kind":"none"},"priority":0,"marginPolicy":{"kind":"warn"},"progressMessagePolicy":{"enabled":false}}';
BEGIN
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
 (st,'Popup deletion fixture','popup-delete-222','active','tr','TRY','hemenaku',n,n),(otherst,'Other popup fixture','popup-delete-other-222','active','tr','TRY','hemenaku',n,n);
 INSERT INTO saas.principals VALUES(pr,'https://qa.celebix.invalid','popup222','popup222@qa.celebix.invalid',true,n,n),(cashier,'https://qa.celebix.invalid','popup222cash','popup222cash@qa.celebix.invalid',true,n,n);
 INSERT INTO saas.memberships VALUES(mb,pr,st,'store_owner','active',n,n),(othermb,pr,otherst,'store_owner','active',n,n),(cashmb,cashier,st,'cashier','active',n,n);
 INSERT INTO saas.plans VALUES(pl,'popup222_qa',1,'active',n-interval '1 day',NULL,n,n);
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.plan_features VALUES(pl,'catalog',1,true),(pl,'promotions',2,true);
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 INSERT INTO saas.subscriptions VALUES(gen_random_uuid(),st,pl,'popup222_qa',1,'active',n-interval '1 day',NULL,n,n),(gen_random_uuid(),otherst,pl,'popup222_qa',1,'active',n-interval '1 day',NULL,n,n);
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at) VALUES(gen_random_uuid(),st,'popup-delete-222.qa.celebix.invalid','platform_subdomain','active',true,n,n,n);
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(promo,st,'Retained popup coupon','active',1,rule,n,n);
 INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(gen_random_uuid(),st,promo,1,rule,n);
 INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(gen_random_uuid(),st,promo,NULL,'DELETE222','active',n);
 INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
 VALUES(media,st,'stores/'||st::text||'/design/'||media::text||'.jpg','https://media.saas-staging.celebix.site/stores/'||st::text||'/design/'||media::text||'.jpg','image/jpeg','Fixture',10,10,100,repeat('a',64),'active',n,n);
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('1',64),NULL,NULL,'popup','Delete me',true,config||jsonb_build_object('promotionId',promo,'image',jsonb_build_object('kind','media','mediaId',media)));
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'POPUP222_CREATE:%',r.outcome;END IF;popup:=(r.result_payload->>'id')::uuid;
 SELECT * INTO r FROM saas.store_engagement_public_settings('popup-delete-222.qa.celebix.invalid',n);
 IF jsonb_array_length(r.result_payload->'popups')<>1 THEN RAISE EXCEPTION 'POPUP222_PUBLIC_BEFORE';END IF;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,cashier,cashmb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('2',64),popup,1);
 IF r.outcome NOT IN('membership_denied','role_denied') THEN RAISE EXCEPTION 'POPUP222_CASHIER:%',r.outcome;END IF;INSERT INTO popup_delete_checks VALUES('cashier denied');
 SELECT * INTO r FROM saas.store_engagement_popup_delete(otherst,pr,othermb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('2',64),popup,1);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'POPUP222_TENANT:%',r.outcome;END IF;INSERT INTO popup_delete_checks VALUES('foreign store denied');
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('2',64),popup,2);
 IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'POPUP222_CAS:%',r.outcome;END IF;INSERT INTO popup_delete_checks VALUES('stale version denied');
 PERFORM set_config('celebix.popup_delete.inject_failure','1',true);
 BEGIN
  PERFORM * FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64),popup,1);
  RAISE EXCEPTION 'POPUP222_EXPECTED_INJECTED_FAILURE';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'POPUP222_INJECTED_OPERATION_FAILURE' THEN RAISE;END IF;END;
 PERFORM set_config('celebix.popup_delete.inject_failure','0',true);
 IF NOT EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE id=popup) OR EXISTS(SELECT 1 FROM saas.store_engagement_admin_operations WHERE store_id=st AND operation_id=op) THEN RAISE EXCEPTION 'POPUP222_NON_ATOMIC_DELETE';END IF;INSERT INTO popup_delete_checks VALUES('receipt insertion failure rolls back campaign deletion');
 UPDATE saas.storefront_design_media SET status='deleted' WHERE id=media;
 UPDATE saas.promotions SET status='archived' WHERE id=promo;
 SELECT to_jsonb(t) INTO before_promo FROM saas.promotions t WHERE id=promo;SELECT to_jsonb(t) INTO before_media FROM saas.storefront_design_media t WHERE id=media;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64),popup,1);
 IF r.outcome<>'saved' OR r.result_payload<>jsonb_build_object('campaignId',popup,'deleted',true) OR EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE id=popup) THEN RAISE EXCEPTION 'POPUP222_DELETE:%',r.outcome;END IF;receipt:=r.result_payload;INSERT INTO popup_delete_checks VALUES('active popup deleted despite unavailable references');
 IF before_promo IS DISTINCT FROM(SELECT to_jsonb(t) FROM saas.promotions t WHERE id=promo) OR before_media IS DISTINCT FROM(SELECT to_jsonb(t) FROM saas.storefront_design_media t WHERE id=media) OR NOT EXISTS(SELECT 1 FROM saas.promotion_codes WHERE promotion_id=promo AND code='DELETE222') THEN RAISE EXCEPTION 'POPUP222_LINKED_DATA_CHANGED';END IF;INSERT INTO popup_delete_checks VALUES('coupon code and media retained');
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64),popup,1);
 IF r.outcome<>'replayed' OR r.result_payload<>receipt THEN RAISE EXCEPTION 'POPUP222_REPLAY';END IF;INSERT INTO popup_delete_checks VALUES('deleted operation replay survives missing campaign');
 SELECT * INTO r FROM saas.store_engagement_admin_operation_get(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64));
 IF r.outcome<>'replayed' OR r.result_payload<>receipt THEN RAISE EXCEPTION 'POPUP222_COMMIT_RECOVERY';END IF;INSERT INTO popup_delete_checks VALUES('existing operation recovery returns exact delete evidence');
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64),popup,2);
 IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'POPUP222_OPERATION_PAYLOAD';END IF;INSERT INTO popup_delete_checks VALUES('changed operation payload denied');
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,op,repeat('3',64),NULL,NULL,'popup','Wrong action',false,config);
 IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'POPUP222_OPERATION_ACTION';END IF;INSERT INTO popup_delete_checks VALUES('save cannot reuse delete operation');
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('4',64),popup,1,'popup','Do not revive',false,config);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'POPUP222_STALE_SAVE';END IF;INSERT INTO popup_delete_checks VALUES('stale update cannot revive popup');
 SELECT * INTO r FROM saas.store_engagement_campaign_list(st,pr,mb,pl,'popup222_qa',1,n);IF r.result_payload<>'[]'::jsonb THEN RAISE EXCEPTION 'POPUP222_LIST';END IF;
 SELECT * INTO r FROM saas.store_engagement_public_settings('popup-delete-222.qa.celebix.invalid',n);IF r.result_payload->'popups'<>'[]'::jsonb THEN RAISE EXCEPTION 'POPUP222_PUBLIC_AFTER';END IF;INSERT INTO popup_delete_checks VALUES('admin and storefront readers omit deleted popup');
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('4',64),NULL,NULL,'cart_capture','Retained capture',false,config);capture:=(r.result_payload->>'id')::uuid;
 INSERT INTO saas.storefront_carts VALUES(cart,st,'active',1,n+interval '1 day',n,n);
 INSERT INTO saas.store_engagement_cart_contacts VALUES(st,cart,capture,'retained@qa.celebix.invalid',NULL,false,NULL,1,NULL,n);
 SELECT to_jsonb(t) INTO before_contact FROM saas.store_engagement_cart_contacts t WHERE source_cart_id=cart;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('5',64),capture,1);
 IF r.outcome<>'invalid_input' OR before_contact IS DISTINCT FROM(SELECT to_jsonb(t) FROM saas.store_engagement_cart_contacts t WHERE source_cart_id=cart) OR NOT EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE id=capture) THEN RAISE EXCEPTION 'POPUP222_CAPTURE_PROTECTION:%',r.outcome;END IF;INSERT INTO popup_delete_checks VALUES('cart capture and contact history cannot be deleted');
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('4',64),NULL,NULL,'popup','Protected unexpected contact',false,config);protected_popup:=(r.result_payload->>'id')::uuid;
 UPDATE saas.store_engagement_cart_contacts SET campaign_id=protected_popup WHERE source_cart_id=cart;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('6',64),protected_popup,1);
 IF r.outcome<>'campaign_unavailable' OR NOT EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE id=protected_popup) THEN RAISE EXCEPTION 'POPUP222_UNEXPECTED_REFERENCE:%',r.outcome;END IF;INSERT INTO popup_delete_checks VALUES('unexpected popup contact reference prevents deletion');
 UPDATE saas.store_engagement_cart_contacts SET campaign_id=capture WHERE source_cart_id=cart;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('6',64),protected_popup,1);IF r.outcome<>'saved' THEN RAISE EXCEPTION 'POPUP222_DISABLED_DELETE';END IF;INSERT INTO popup_delete_checks VALUES('disabled popup deleted');
 FOR i IN 1..20 LOOP
  SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('7',64),NULL,NULL,'popup','Quota '||i,false,config);IF r.outcome<>'saved' THEN RAISE EXCEPTION 'POPUP222_QUOTA_SETUP:%',r.outcome;END IF;IF i=1 THEN slot:=(r.result_payload->>'id')::uuid;END IF;
 END LOOP;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('7',64),NULL,NULL,'popup','Quota overflow',false,config);IF r.outcome<>'limit_exceeded' THEN RAISE EXCEPTION 'POPUP222_LIMIT';END IF;
 SELECT * INTO r FROM saas.store_engagement_popup_delete(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('8',64),slot,1);IF r.outcome<>'saved' THEN RAISE EXCEPTION 'POPUP222_QUOTA_DELETE';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(st,pr,mb,pl,'popup222_qa',1,n,gen_random_uuid(),repeat('9',64),NULL,NULL,'popup','Quota replacement',false,config);IF r.outcome<>'saved' OR(SELECT count(*) FROM saas.store_engagement_campaigns WHERE store_id=st AND kind='popup')<>20 THEN RAISE EXCEPTION 'POPUP222_QUOTA_NOT_FREED';END IF;INSERT INTO popup_delete_checks VALUES('deletion frees popup capacity');
END $test$;
DROP TRIGGER popup_delete_atomic_fixture ON saas.store_engagement_admin_operations;
DROP FUNCTION pg_temp.popup_delete_fail_receipt();
SELECT name FROM popup_delete_checks ORDER BY name;
ROLLBACK;
