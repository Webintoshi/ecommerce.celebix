-- Self-contained quota acceptance. All quota data rolls back.
BEGIN;
\ir 202610100226_lucky_wheel_fixtures.sql
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN IF current_database()<>'celebix_wheel226_20261010' THEN RAISE EXCEPTION 'LUCKY_WHEEL_ISOLATED_DATABASE_REQUIRED';END IF;END $guard$;
DO $quota$
DECLARE st uuid:='22600000-0000-4000-8000-000000000002';principal uuid:='22600000-0000-4000-8000-000000000011';membership uuid:='22600000-0000-4000-8000-000000000022';plan uuid:='22600000-0000-4000-8000-000000000010';n timestamptz:=date_trunc('milliseconds',clock_timestamp());source uuid:=gen_random_uuid();candidate uuid:=gen_random_uuid();blocked uuid:=gen_random_uuid();campaign uuid;rule jsonb;config jsonb;r record;i integer;ordinary uuid;
BEGIN
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('22600000-0000-4000-8000-000000000060',st,'wheel-quota-product','Quota product','active','TRY',1,n,n);
 SET LOCAL saas.inventory.source_marker='inventory_managed';
 INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('22600000-0000-4000-8000-000000000061','22600000-0000-4000-8000-000000000060',st,'Quota variant','WHEEL-QUOTA',10000,5000,false,0,'active','{}',1,n,n);
 rule:='{"schemaVersion":1,"benefit":{"kind":"percentage","percentageBps":500},"targets":{"mode":"all","include":[],"exclude":[]},"audience":{"mode":"everyone"},"trigger":{"kind":"code","codes":["QUOTA-SOURCE"]},"schedule":{"timezone":"Europe/Istanbul"},"limits":{"totalUsage":null,"perCustomerUsage":null,"budgetMinor":null,"orderMaximumMinor":null},"conditions":{"minimumBasketMinor":0,"minimumQuantity":0,"minimumProductQuantity":0,"salesChannels":["storefront"]},"combinationPolicy":{"kind":"none"},"priority":1,"marginPolicy":{"kind":"warn"},"progressMessagePolicy":{"enabled":false}}';
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(source,st,'Quota fixture source','active',1,rule,n,n);INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(gen_random_uuid(),st,source,1,rule,n);
 config:=jsonb_build_object('schemaVersion',1,'heading','Quota fixture','body','','appearance',jsonb_build_object('sliceA','#ffffff','sliceB','#eeeeee','background','#ffffff','accent','#ff8800'),'collectMode','either','repeatDays',7,'couponHours',24,'marketingOptInLabel','Fixture opt-in','devices',jsonb_build_object('desktop',true,'mobile',true),'allowedPaths','[]'::jsonb,'scrollPercent',NULL,'startsAt',NULL,'endsAt',NULL,'prizes',(SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'promotionId',source,'weightBps',CASE WHEN slots.position<=4 THEN 1667 ELSE 1666 END,'issuanceLimit',NULL)) FROM generate_series(1,6) slots(position)));
 FOR i IN 1..17 LOOP
 SELECT * INTO r FROM saas.lucky_wheel_campaign_save_v1(st,principal,membership,plan,'wheel_fixture',1,n,gen_random_uuid(),md5(i::text)||md5(i::text),campaign,CASE WHEN campaign IS NULL THEN NULL ELSE i-1 END,'Quota fixture',false,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'WHEEL_QUOTA_SETUP:%',r.outcome;END IF;campaign:=(r.result_payload->>'id')::uuid;
 END LOOP;
 IF(SELECT count(*) FROM saas.lucky_wheel_rewards WHERE store_id=st)<>102 THEN RAISE EXCEPTION 'WHEEL_QUOTA_REVISIONS';END IF;
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(candidate,st,'Normal activation with 102 internal revisions','draft',1,jsonb_set(rule,'{trigger,codes}',jsonb_build_array('NORMAL-CANDIDATE')),n,n);INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) SELECT gen_random_uuid(),st,candidate,1,rule_document,n FROM saas.promotions WHERE id=candidate;
 SELECT * INTO r FROM saas.promotion_lifecycle_v1(st,principal,membership,plan,'wheel_fixture',1,n,gen_random_uuid(),saas.promotion_operation_fingerprint_v2('lifecycle',st,jsonb_build_object('id',candidate,'expectedVersion',1,'nextStatus','active')),candidate,1,'active');
 IF r.outcome<>'updated' THEN RAISE EXCEPTION 'WHEEL_INTERNAL_QUOTA_CONSUMED:%:%',r.outcome,r.result_payload;END IF;
 FOR i IN 1..98 LOOP ordinary:=gen_random_uuid();INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(ordinary,st,'Ordinary cap fixture','active',1,jsonb_set(rule,'{trigger,codes}',jsonb_build_array('NORMAL-'||i)),n,n);INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) SELECT gen_random_uuid(),st,ordinary,1,rule_document,n FROM saas.promotions WHERE id=ordinary;END LOOP;
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(blocked,st,'Real ordinary cap remains','draft',1,jsonb_set(rule,'{trigger,codes}',jsonb_build_array('NORMAL-BLOCKED')),n,n);INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) SELECT gen_random_uuid(),st,blocked,1,rule_document,n FROM saas.promotions WHERE id=blocked;
 SELECT * INTO r FROM saas.promotion_lifecycle_v1(st,principal,membership,plan,'wheel_fixture',1,n,gen_random_uuid(),saas.promotion_operation_fingerprint_v2('lifecycle',st,jsonb_build_object('id',blocked,'expectedVersion',1,'nextStatus','active')),blocked,1,'active');
 IF r.outcome<>'promotion_limit_reached' THEN RAISE EXCEPTION 'WHEEL_ORDINARY_CAP_LOST:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.promotion_overview_v1(st,principal,membership,plan,'wheel_fixture',1,n,7);IF r.outcome<>'listed' OR r.result_payload->>'activePromotions'<>'100' THEN RAISE EXCEPTION 'WHEEL_OVERVIEW_INTERNAL_COUNT:%',r.result_payload;END IF;
 RAISE NOTICE 'native226 quota acceptance: 102 historical internal promotions excluded, normal activation allowed, 100 ordinary promotions still enforce cap, overview counts 100 passed';
END $quota$;
ROLLBACK;
