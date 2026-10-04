-- Disposable native214 clone only. All synthetic data rolls back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- pg_get_functiondef qualifies composite types according to search_path.
-- Use the same canonical context as up/down; do not ignore any definition differences.
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='120s';
DO $isolated$ BEGIN
 IF current_database()!~'^celebix_engagement_215_[0-9]{8}$' THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_215_ISOLATED_DATABASE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.store_engagement_215_function_baseline b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.identity)
 WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>b.definition_hash OR p.proowner<>b.owner_oid OR p.proacl::text IS DISTINCT FROM b.acl)
 THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_215_NATIVE_FUNCTION_CHANGED';END IF;
END $isolated$;
CREATE TEMP TABLE financial_baseline(table_name text PRIMARY KEY,row_hash text NOT NULL);
DO $financial$ DECLARE r record;h text;BEGIN
 FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind='r'
 AND(c.relname IN('customers','product_variants','inventory_movements','inventory_stock_balances','promotion_usage_reservations','promotion_redemptions')
 OR c.relname~'^(orders|order_items|payment_|checkout_|in_store_|accounting_|platform_billing|platform_receipt|provider_)') LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(j.value,E''\n'' ORDER BY j.value),'''')) FROM (SELECT to_jsonb(t)::text value FROM saas.%I t) j',r.relname) INTO h;
  INSERT INTO financial_baseline VALUES(r.relname,h);
 END LOOP;
 IF(SELECT count(*) FROM financial_baseline)<10 THEN RAISE EXCEPTION 'FINANCIAL_BASELINE_INCOMPLETE';END IF;
END $financial$;
DO $authority$ DECLARE t text;r record;gr record;BEGIN
 FOREACH t IN ARRAY ARRAY['store_engagement_215_function_baseline','store_engagement_campaigns','store_engagement_admin_operations','store_engagement_cart_contacts','store_engagement_capture_operations','store_engagement_request_limits'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'ENGAGEMENT_RLS_NOT_FORCED:%',t;END IF;
  IF has_table_privilege('celebix_saas_app','saas.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver','saas.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'ENGAGEMENT_DIRECT_TABLE_ACCESS:%',t;END IF;
 END LOOP;
 FOR r IN SELECT oid,proname,proowner,proacl FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'store_engagement_%' LOOP
  FOR gr IN SELECT * FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) LOOP
   IF gr.grantee=r.proowner THEN CONTINUE;END IF;
   IF gr.grantee=(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_app') AND r.proname IN('store_engagement_campaign_list','store_engagement_campaign_save','store_engagement_admin_operation_get') AND gr.privilege_type='EXECUTE' THEN CONTINUE;END IF;
   IF gr.grantee=(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_host_resolver') AND r.proname IN('store_engagement_public_settings','store_engagement_public_operation_get','store_engagement_contact_capture') AND gr.privilege_type='EXECUTE' THEN CONTINUE;END IF;
   RAISE EXCEPTION 'ENGAGEMENT_WIDENED_FUNCTION_ACCESS:%',r.proname;
  END LOOP;
 END LOOP;
END $authority$;

DO $fixture$
DECLARE n timestamptz:=date_trunc('milliseconds',clock_timestamp());a record;b record;r record;r2 record;
 config jsonb:='{"schemaVersion":1,"template":"discount","heading":"Sepetinizi hatırlayalım","body":"İsteğe bağlı indirim","buttonLabel":"Kaydet","delaySeconds":0,"repeatDays":7,"devices":{"desktop":true,"mobile":true},"collectMode":"either"}';
 rule jsonb:='{"schemaVersion":1,"benefit":{"kind":"percentage","percentageBps":300},"targets":{"mode":"all","include":[],"exclude":[]},"audience":{"mode":"everyone"},"trigger":{"kind":"code","codes":["ENGAGEMENT215"]},"schedule":{"timezone":"Europe/Istanbul"},"limits":{"totalUsage":null,"perCustomerUsage":null,"budgetMinor":null,"orderMaximumMinor":null},"conditions":{"minimumBasketMinor":0,"minimumQuantity":0,"minimumProductQuantity":0},"combinationPolicy":{"kind":"none"},"priority":0,"marginPolicy":{"kind":"warn"},"progressMessagePolicy":{"enabled":false}}';
 promo uuid:=gen_random_uuid();media uuid:=gen_random_uuid();othermedia uuid:=gen_random_uuid();campaign uuid;popup uuid;cart uuid:=gen_random_uuid();emptycart uuid:=gen_random_uuid();othercart uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();saveop uuid:=gen_random_uuid();product uuid;variant uuid;otherproduct uuid;othervariant uuid;price bigint;otherprice bigint;digest text:=repeat('a',64);payload jsonb;initial_result jsonb;quota integer;i integer;
BEGIN
 SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version,d.hostname INTO a
 FROM saas.memberships m JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.store_domains d ON d.store_id=m.store_id
 WHERE d.status='active' AND d.verified_at<=n AND saas.merchant_action_authority_error(m.store_id,m.principal_id,m.id,s.plan_id,s.plan_code,s.plan_version,n,'catalog','configuration.manage') IS NULL
 AND saas.storefront_public_store(d.hostname,n)=m.store_id AND EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=s.plan_id AND f.feature_key='promotions' AND f.enabled)
 AND saas.storefront_shipping_projection(m.store_id) IS NOT NULL AND jsonb_array_length(saas.storefront_payment_methods_projection(m.store_id))>0
 AND EXISTS(SELECT 1 FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=m.store_id AND v.status='active' AND p.status='active' AND(NOT v.stock_tracking OR v.stock_quantity-saas.in_store_held_quantity(v.store_id,v.id,NULL,NULL)>0)) ORDER BY d.is_primary DESC,m.store_id,m.id LIMIT 1;
 SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version,d.hostname INTO b
 FROM saas.memberships m JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.store_domains d ON d.store_id=m.store_id
 WHERE m.store_id<>a.store_id AND d.status='active' AND d.verified_at<=n AND saas.merchant_action_authority_error(m.store_id,m.principal_id,m.id,s.plan_id,s.plan_code,s.plan_version,n,'catalog','configuration.manage') IS NULL
 AND EXISTS(SELECT 1 FROM saas.product_variants v WHERE v.store_id=m.store_id AND v.status='active') ORDER BY d.is_primary DESC,m.store_id,m.id LIMIT 1;
 IF a.store_id IS NULL OR b.store_id IS NULL THEN RAISE EXCEPTION 'ENGAGEMENT_TWO_ACTIVE_STORE_FIXTURES_REQUIRED';END IF;
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(promo,a.store_id,'Isolated engagement 3%','active',1,rule,n,n);
 INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(gen_random_uuid(),a.store_id,promo,1,rule,n);
 INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(gen_random_uuid(),a.store_id,promo,NULL,'ENGAGEMENT215','active',n);
 INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
 VALUES(media,a.store_id,'stores/'||a.store_id::text||'/design/'||media::text||'.jpg','https://media.saas-staging.celebix.site/stores/'||a.store_id::text||'/design/'||media::text||'.jpg','image/jpeg','Fixture',10,10,100,repeat('a',64),'active',n,n),
 (othermedia,b.store_id,'stores/'||b.store_id::text||'/design/'||othermedia::text||'.jpg','https://media.saas-staging.celebix.site/stores/'||b.store_id::text||'/design/'||othermedia::text||'.jpg','image/jpeg','Fixture',10,10,100,repeat('b',64),'active',n,n);
 config:=config||jsonb_build_object('promotionId',promo,'image',jsonb_build_object('kind','media','mediaId',media));
 IF saas.store_engagement_config_valid(config) IS DISTINCT FROM true OR saas.store_engagement_config_valid(config||'{"template":null}') IS DISTINCT FROM false OR saas.store_engagement_config_valid(config||'{"collectMode":null}') IS DISTINCT FROM false OR saas.store_engagement_config_valid(config||'{"image":null}') IS DISTINCT FROM false THEN RAISE EXCEPTION 'ENGAGEMENT_CONFIG_VALIDATION';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,saveop,repeat('1',64),NULL,NULL,'cart_capture','Capture fixture',true,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'ENGAGEMENT_SAVE:%',r.outcome;END IF;campaign:=(r.result_payload->>'id')::uuid;initial_result:=r.result_payload;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,saveop,repeat('1',64),NULL,NULL,'cart_capture','Capture fixture',true,config);
 IF r.outcome<>'replayed' OR r.result_payload<>initial_result THEN RAISE EXCEPTION 'ENGAGEMENT_SAVE_REPLAY';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,saveop,repeat('1',64),NULL,NULL,'cart_capture','Tampered',true,config);
 IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'ENGAGEMENT_SAVE_KEY_PAYLOAD';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('2',64),campaign,2,'cart_capture','Conflict',true,config);
 IF r.outcome<>'version_conflict' THEN RAISE EXCEPTION 'ENGAGEMENT_SAVE_CAS';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('2',64),NULL,NULL,'popup','Foreign image',true,jsonb_set(config,'{image,mediaId}',to_jsonb(othermedia)));
 IF r.outcome<>'invalid_reference' THEN RAISE EXCEPTION 'ENGAGEMENT_FOREIGN_IMAGE';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(b.store_id,b.principal_id,b.membership_id,b.plan_id,b.plan_code,b.plan_version,n,gen_random_uuid(),repeat('2',64),NULL,NULL,'popup','Foreign promotion',true,config-'image');
 IF r.outcome<>'invalid_reference' THEN RAISE EXCEPTION 'ENGAGEMENT_FOREIGN_PROMOTION';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('3',64),NULL,NULL,'popup','Popup fixture',true,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'ENGAGEMENT_POPUP_SAVE';END IF;popup:=(r.result_payload->>'id')::uuid;
 UPDATE saas.storefront_design_media SET status='deleted' WHERE id=media;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('8',64),campaign,1,'cart_capture','Capture fixture',false,config);
 IF r.outcome<>'saved' OR r.result_payload->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'ENGAGEMENT_DISABLE_MISSING_OWN_MEDIA';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('8',64),campaign,2,'cart_capture','Capture fixture',false,jsonb_set(config,'{image,mediaId}',to_jsonb(othermedia)));
 IF r.outcome<>'invalid_reference' THEN RAISE EXCEPTION 'ENGAGEMENT_DISABLE_FOREIGN_CHANGED_MEDIA';END IF;
 UPDATE saas.storefront_design_media SET status='active' WHERE id=media;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('9',64),campaign,2,'cart_capture','Capture fixture',true,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'ENGAGEMENT_REENABLE_OWN_MEDIA';END IF;
 SELECT * INTO r FROM saas.store_engagement_public_settings(a.hostname,n);
 IF r.outcome<>'ok' OR r.result_payload->'cartCapture'->>'couponCode' IS NOT NULL OR r.result_payload->'popups'->0->>'couponCode'<>'ENGAGEMENT215' OR r.result_payload->'cartCapture'->>'imageUrl' IS NULL THEN RAISE EXCEPTION 'ENGAGEMENT_PUBLIC_PROJECTION';END IF;
 SELECT * INTO r FROM saas.store_engagement_public_settings(b.hostname,n);
 IF r.result_payload->'cartCapture'<>'null'::jsonb OR jsonb_array_length(r.result_payload->'popups')<>0 THEN RAISE EXCEPTION 'ENGAGEMENT_PUBLIC_TENANT';END IF;
 SELECT v.product_id,v.id,pricing.price_cents INTO product,variant,price FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id CROSS JOIN LATERAL saas.resolve_effective_variant_price(v.store_id,v.id,'storefront',n,NULL) pricing WHERE v.store_id=a.store_id AND v.status='active' AND p.status='active' AND pricing.outcome='found' AND pricing.price_cents>100 AND saas.pricing_variant_discount_allowed(v.store_id,v.id) AND(NOT v.stock_tracking OR v.stock_quantity-saas.in_store_held_quantity(v.store_id,v.id,NULL,NULL)>0) ORDER BY v.id LIMIT 1;
 SELECT v.product_id,v.id,pricing.price_cents INTO otherproduct,othervariant,otherprice FROM saas.product_variants v CROSS JOIN LATERAL saas.resolve_effective_variant_price(v.store_id,v.id,'storefront',n,NULL) pricing WHERE v.store_id=b.store_id AND v.status='active' AND pricing.outcome='found' ORDER BY v.id LIMIT 1;
 INSERT INTO saas.storefront_carts VALUES(cart,a.store_id,'active',1,n+interval '1 day',n,n),(emptycart,a.store_id,'active',1,n+interval '1 day',n,n),(othercart,b.store_id,'active',1,n+interval '1 day',n,n);
 INSERT INTO saas.storefront_cart_credentials VALUES(cart,a.store_id,'fixture215',digest,n+interval '1 day'),(emptycart,a.store_id,'fixture215',repeat('b',64),n+interval '1 day'),(othercart,b.store_id,'fixture215',repeat('c',64),n+interval '1 day');
 INSERT INTO saas.storefront_cart_items VALUES(cart,a.store_id,product,variant,1,price,0,n,n),(othercart,b.store_id,otherproduct,othervariant,1,otherprice,0,n,n);
 PERFORM saas.sync_durable_abandoned_cart(a.store_id,cart,n);
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,repeat('b',64),n,gen_random_uuid(),campaign,'person@example.test',NULL,false,repeat('4',64));
 IF r.outcome<>'cart_unavailable' THEN RAISE EXCEPTION 'ENGAGEMENT_EMPTY_CART';END IF;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(b.hostname,digest,n,gen_random_uuid(),campaign,'person@example.test',NULL,false,repeat('4',64));
 IF r.outcome<>'cart_unavailable' THEN RAISE EXCEPTION 'ENGAGEMENT_FOREIGN_CREDENTIAL';END IF;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,gen_random_uuid(),campaign,'person@example.test',NULL,true,repeat('4',64));
 IF r.outcome<>'invalid_input' THEN RAISE EXCEPTION 'ENGAGEMENT_MARKETING_LABEL';END IF;
 UPDATE saas.store_engagement_campaigns c SET config=jsonb_set(c.config,'{collectMode}','"phone"') WHERE c.id=campaign;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,gen_random_uuid(),campaign,'person@example.test',NULL,false,repeat('4',64));
 IF r.outcome<>'invalid_input' THEN RAISE EXCEPTION 'ENGAGEMENT_COLLECT_MODE';END IF;
 UPDATE saas.store_engagement_campaigns c SET config=jsonb_set(c.config,'{collectMode}','"either"') WHERE c.id=campaign;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,operation,campaign,'person@example.test','+905347990028',false,repeat('4',64));
 IF r.outcome<>'captured' OR r.result_payload->>'couponCode'<>'ENGAGEMENT215' OR r.result_payload->'contactCaptured'<>'true'::jsonb THEN RAISE EXCEPTION 'ENGAGEMENT_CAPTURE:%',r.outcome;END IF;payload:=r.result_payload;
 -- Real current guest checkout quote, not a second discount/grant implementation.
 SELECT * INTO r FROM saas.public_checkout_quote_v3(a.hostname,n,'cart',jsonb_build_array(jsonb_build_object('keyId','fixture215','digest',digest)),'[]'::jsonb,ARRAY['ENGAGEMENT215'],'{"firstTouch":{"source":"unknown","medium":"unknown"},"lastTouch":{"source":"unknown","medium":"unknown"},"landingPathGroup":"/unknown","deviceGroup":"unknown"}');
 IF r.outcome<>'quoted' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.result_payload->'quote'->'appliedPromotions') applied WHERE applied->>'name'='Isolated engagement 3%' AND applied->>'normalizedCode'='ENGAGEMENT215' AND(applied->>'discountCents')::bigint=price*300/10000)
 THEN RAISE EXCEPTION 'ENGAGEMENT_CANONICAL_GUEST_THREE_PERCENT_QUOTE:%:%',r.outcome,r.result_payload->'quote'->'rejectedPromotions';END IF;
 SELECT requests INTO quota FROM saas.store_engagement_request_limits WHERE store_id=a.store_id AND source_cart_id=cart;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,operation,campaign,'person@example.test','+905347990028',false,repeat('4',64));
 IF r.outcome<>'replayed' OR r.result_payload<>payload OR(SELECT requests FROM saas.store_engagement_request_limits WHERE store_id=a.store_id AND source_cart_id=cart)<>quota THEN RAISE EXCEPTION 'ENGAGEMENT_CAPTURE_REPLAY';END IF;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,operation,campaign,'attacker@example.test',NULL,false,repeat('4',64));
 IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'ENGAGEMENT_CAPTURE_KEY_PAYLOAD';END IF;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,gen_random_uuid(),campaign,'attacker@example.test',NULL,false,repeat('5',64));
 IF r.outcome<>'contact_conflict' THEN RAISE EXCEPTION 'ENGAGEMENT_CONTACT_IMMUTABLE';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.abandoned_carts WHERE store_id=a.store_id AND source_cart_id=cart AND customer_id IS NULL AND customer_email='person@example.test' AND customer_phone='+905347990028') THEN RAISE EXCEPTION 'ENGAGEMENT_DURABLE_CONTACT';END IF;
 UPDATE saas.abandoned_carts SET customer_email=NULL,customer_phone=NULL WHERE store_id=a.store_id AND source_cart_id=cart;
 PERFORM saas.sync_durable_abandoned_cart(a.store_id,cart,n+interval '1 second');
 IF NOT EXISTS(SELECT 1 FROM saas.abandoned_carts WHERE store_id=a.store_id AND source_cart_id=cart AND customer_id IS NULL AND customer_email='person@example.test' AND customer_phone='+905347990028') THEN RAISE EXCEPTION 'ENGAGEMENT_CONTACT_SURVIVES_SYNC';END IF;
 SELECT * INTO r FROM saas.store_engagement_public_operation_get(a.hostname,digest,n,operation,repeat('4',64));
 IF r.outcome<>'replayed' OR r.result_payload<>payload THEN RAISE EXCEPTION 'ENGAGEMENT_RECOVERY';END IF;
 SELECT * INTO r FROM saas.store_engagement_public_operation_get(b.hostname,digest,n,operation,repeat('4',64));
 IF r.outcome<>'operation_not_found' THEN RAISE EXCEPTION 'ENGAGEMENT_RECOVERY_TENANT';END IF;
 UPDATE saas.promotions SET status='paused' WHERE store_id=a.store_id AND id=promo;
 SELECT * INTO r FROM saas.store_engagement_public_settings(a.hostname,n);
 IF jsonb_array_length(r.result_payload->'popups')<>0 OR r.result_payload->'cartCapture'<>'null'::jsonb THEN RAISE EXCEPTION 'ENGAGEMENT_PAUSED_HIDDEN';END IF;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,gen_random_uuid(),campaign,'person@example.test','+905347990028',false,repeat('6',64));
 IF r.outcome<>'promotion_unavailable' THEN RAISE EXCEPTION 'ENGAGEMENT_PROMOTION_RACE';END IF;
 UPDATE saas.promotions SET status='active',rule_document=jsonb_set(rule_document,'{schedule}',jsonb_build_object('timezone','Europe/Istanbul','endsAt',saas.storefront_design_timestamp(n-interval '1 second'))) WHERE store_id=a.store_id AND id=promo;
 SELECT * INTO r FROM saas.store_engagement_public_settings(a.hostname,n);
 IF jsonb_array_length(r.result_payload->'popups')<>0 OR r.result_payload->'cartCapture'<>'null'::jsonb THEN RAISE EXCEPTION 'ENGAGEMENT_EXPIRED_HIDDEN';END IF;
 UPDATE saas.promotions SET rule_document=rule WHERE store_id=a.store_id AND id=promo;
 UPDATE saas.store_engagement_request_limits SET requests=20 WHERE store_id=a.store_id AND source_cart_id=cart;
 SELECT * INTO r FROM saas.store_engagement_contact_capture(a.hostname,digest,n,gen_random_uuid(),campaign,'person@example.test','+905347990028',false,repeat('7',64));
 IF r.outcome<>'rate_limited' THEN RAISE EXCEPTION 'ENGAGEMENT_DURABLE_RATE_LIMIT';END IF;
 IF(SELECT count(*) FROM saas.store_engagement_cart_contacts WHERE store_id=a.store_id AND source_cart_id=cart)<>1 OR EXISTS(SELECT 1 FROM saas.store_engagement_cart_contacts WHERE store_id=b.store_id) THEN RAISE EXCEPTION 'ENGAGEMENT_CONTACT_TENANT';END IF;
 RAISE NOTICE 'ENGAGEMENT215 fixture PASS: config/ownership/CAS/replay/public projection/current nonempty cart/collect mode/consent/immutable contact/durable sync/expiry/rate isolation';
END $fixture$;
DO $financial_after$ DECLARE r record;h text;BEGIN
 FOR r IN SELECT * FROM financial_baseline LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(j.value,E''\n'' ORDER BY j.value),'''')) FROM (SELECT to_jsonb(t)::text value FROM saas.%I t) j',r.table_name) INTO h;
  IF h<>r.row_hash THEN RAISE EXCEPTION 'ENGAGEMENT_FINANCIAL_EFFECT:%',r.table_name;END IF;
 END LOOP;
 RAISE NOTICE 'ENGAGEMENT215 financial/native PASS: all selected customer/catalog stock/payment/order/POS/accounting/provider/redemption rows unchanged';
END $financial_after$;
ROLLBACK;
