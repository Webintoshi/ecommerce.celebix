import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const dir=import.meta.dirname,pg=startDisposablePostgres({database:'loyalty_corrections_native'}),{sql}=pg;
const lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>`${lit(JSON.stringify(x))}::jsonb`,id=n=>`50230000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q)),PLAN='00000000-0000-4000-8000-000000000010';
const NOW=new Date(Date.now()+120_000).toISOString(),LATER=new Date(Date.parse(NOW)+1_000).toISOString();
const failures=[];let passed=0;
async function check(label,run){try{await run();passed++;console.log(`PASS ${label}`);}catch(error){failures.push({label,message:error.message});console.error(`FAIL ${label}: ${error.message}`);}}
function asyncSql(source){return new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),20_000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(err));else resolve(out.trim());});child.stdin.end(source);});}
function setup(base,changes={}){
 const t={store:id(base),principal:id(base+1),membership:id(base+2),customer:id(base+3),account:id(base+4),otherCustomer:id(base+5),otherAccount:id(base+6),product:id(base+10),variant:id(base+11),host:`loyalty-${base}.saas-staging.celebix.site`,session:id(base+20),key:'loyalty-fixture',digest:'a'.repeat(64),otherDigest:'b'.repeat(64)};
 t.config={schemaVersion:1,template:'product_gift',target:5,eligibleProductIds:[],reward:{kind:'gift',variantId:t.variant,quantity:1},minimumBasketMinor:0,rewardMinimumBasketMinor:0,channels:['storefront','in_store','manual'],startsAt:null,endsAt:null,timezone:'Europe/Istanbul',repeat:true,maxOncePerDay:false,allowMultiplePrograms:false,allowCombination:false,progressExpiryDays:null,rewardExpiryDays:null,...changes};
 owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${t.store}','Loyalty ${base}','loyalty-${base}','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${t.principal}','fixture','loyalty-${base}','owner-${base}@test.invalid',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${t.membership}','${t.principal}','${t.store}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(base+7)}','${t.store}','${PLAN}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('${id(base+8)}','${t.store}','${t.host}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('${t.product}','${t.store}','coffee','Kahve','active','TRY','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
 INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,cost_cents,stock_tracking,stock_quantity,status,created_at,updated_at)VALUES('${t.variant}','${t.product}','${t.store}','Kahve',100,40,false,0,'active','2026-01-01','2026-01-01');
 ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
 ${[[t.customer,t.account,t.digest],[t.otherCustomer,t.otherAccount,t.otherDigest]].map(([customer,account,digest],i)=>`INSERT INTO saas.customers(id,store_id,status,first_name,last_name,created_at,updated_at)VALUES('${customer}','${t.store}','active','Müşteri','${i}','2026-01-01','2026-01-01');INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,phone_normalized,phone_verified_at,status,verified_at,last_login_at,created_at,updated_at)VALUES('${account}','${t.store}','${customer}',NULL,NULL,'+905${String(base+i).padStart(9,'0')}','2026-01-01','active','2026-01-01','2026-01-01','2026-01-01','2026-01-01');INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)VALUES('${id(base+20+i)}','${t.store}','${account}','full','${t.key}','${digest}','${'c'.repeat(64)}','Fixture','${'d'.repeat(64)}','${NOW}','${NOW}','${new Date(Date.parse(NOW)+86_400_000).toISOString()}','${new Date(Date.parse(NOW)+86_400_000).toISOString()}');`).join('')}`);
 const save=admin(t,'save',{name:'Sadakat',enabled:true,config:t.config});assert.equal(save.outcome,'committed',JSON.stringify(save));t.program=save.result_payload.program.id;return t;
}
function admin(t,action,payload,op=randomUUID()){return query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.loyalty_admin_command_v1('${t.store}','${t.principal}','${t.membership}','${PLAN}','professional',2,'${NOW}',${lit(action)},'${op}',${json(payload)})r`);}
function customer(t,action,payload={},digest=t.digest,now=LATER){return query(`SET ROLE celebix_saas_host_resolver;SELECT to_jsonb(r)FROM saas.loyalty_customer_command_v1('${t.host}','${now}',${json([{keyId:t.key,digest}])},${lit(action)},'${randomUUID()}',${json(payload)})r`);}
function issue(t,amount=5){const result=admin(t,'adjust',{programId:t.program,customerId:t.customer,delta:amount,reason:'Yetkili düzeltmesi'});assert.equal(result.outcome,'committed',JSON.stringify(result));return query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'AND program_id='${t.program}'ORDER BY sequence DESC LIMIT 1`);}
function context(t,code,who=t.customer,quantity=3,line=randomUUID()){return{storeId:t.store,customerId:who,paidOrderCount:1,customerSegmentIds:[],customerTagIds:[],cartLines:[{lineId:line,position:0,productId:t.product,variantId:t.variant,quantity,unitPriceMinor:100,unitCostMinor:40,currency:'TRY',categoryIds:[],brandId:null,collectionIds:[]}],shippingMethodId:null,paymentMethodId:null,shippingBeforeDiscountMinor:0,currency:'TRY',storeLocalTime:LATER,salesChannel:'storefront',submittedCodes:[code],abandonedCart:null};}
function order(t,base,{quantity=7,giftQuantity=0,collected=quantity*100,forgiven=0,discount=0}={}){
 const oid=id(base),line=id(base+1);owned(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,customer_id,paid_at)VALUES('${oid}','${t.store}','INT-${base}','storefront','Müşteri','member@test.invalid','TRY',${quantity*100},0,${discount},${quantity*100-discount},'confirmed','completed','{}','${LATER}','${LATER}','${t.customer}','${LATER}');
 INSERT INTO saas.order_items(id,store_id,order_id,position,product_id,variant_id,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${line}','${t.store}','${oid}',0,'${t.product}','${t.variant}','Kahve',100,${quantity},${discount},${quantity*100-discount},'${LATER}');
 DO $member_proof$BEGIN IF to_regclass('saas.loyalty_order_members')IS NOT NULL THEN INSERT INTO saas.loyalty_order_members(store_id,order_id,account_id,customer_id,source_kind,source_id,verified_at)VALUES('${t.store}','${oid}','${t.account}','${t.customer}','account_session','${t.session}','${NOW}');END IF;END $member_proof$;
 INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,order_id,channel,currency,sale_cents,collected_cents,discount_cents,occurred_at)VALUES('${id(base+2)}','${t.store}','${t.customer}','{}','${oid}','WEB','TRY',${quantity*100-discount},${collected},${forgiven},'${LATER}');`);return{oid,line};
}
function drain(){let processed=0,failed=0;for(let i=0;i<200;i++){const result=query(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${LATER}',20)`);processed+=result.processed;failed+=result.failed;if(result.processed+result.failed===0)return{processed,failed};}throw Error('review_queue_did_not_drain');}

function member(t){return query(`SELECT to_jsonb(m)FROM saas.loyalty_members m WHERE store_id='${t.store}'AND program_id='${t.program}'`);}
function editTarget(t,target){const result=admin(t,'save',{programId:t.program,expectedVersion:1,name:'Changed target',enabled:true,config:{...t.config,target}});assert.equal(result.outcome,'committed',JSON.stringify(result));}
function reserveSql(t,r,o,ctx,op=randomUUID()){const payload={sourceKind:'offline_checkout',sourceReference:o.oid,evaluatorContext:ctx};return `SELECT to_jsonb(r)FROM saas.promotion_reserve_group_v1('${t.store}','${op}',saas.promotion_operation_fingerprint_v2('reserve','${t.store}',${json(payload)}),'offline_checkout','${o.oid}',${json(ctx)},'${LATER}')r`;}
function commit(t,group,oid){const payload={reservationGroupId:group,orderId:oid};return query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_commit_reservation_group_v1('${t.store}','${randomUUID()}',saas.promotion_operation_fingerprint_v2('commit','${t.store}',${json(payload)}),'${group}','${oid}','${LATER}')r`);}
let source;
try{
 source=readFileSync(process.env.CELEBIX_LOYALTY502_TEST_SOURCE??path.join(dir,'202611040502_loyalty_programs.up.sql'),'utf8');
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=501&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 sql(source);
 owned("DO $released$BEGIN IF to_regclass('saas.loyalty_release_state')IS NOT NULL THEN UPDATE saas.loyalty_release_state SET ready=true,completed_at=clock_timestamp()WHERE singleton;END IF;END $released$");
 await check('returning a v1 order after a v2 reward restores current progress without minting an archived v1 reward',()=>{
  const t=setup(100),a=order(t,10000,{quantity:4});assert.equal(drain().failed,0);editTarget(t,10);order(t,10100,{quantity:6});assert.equal(drain().failed,0);assert.equal(member(t).balance,0);
  owned(`UPDATE saas.accounting_receivables SET return_cents=100 WHERE store_id='${t.store}'AND order_id='${a.oid}'`);assert.equal(drain().failed,0);
  assert.equal(member(t).balance,6);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND status='available'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND program_version=2 AND status='revoked'`),'1');assert.equal(sql(`SELECT program_version FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${a.oid}'`),'1');
 });
 await check('positive correction of an old order preserves its source version while using the current reward threshold',()=>{
  const t=setup(300),a=order(t,10200,{quantity:4});assert.equal(drain().failed,0);editTarget(t,10);
  owned(`UPDATE saas.order_items SET quantity=5,line_total_cents=500 WHERE store_id='${t.store}'AND order_id='${a.oid}';UPDATE saas.orders SET subtotal_cents=500,total_cents=500,version=version+1 WHERE store_id='${t.store}'AND id='${a.oid}';UPDATE saas.accounting_receivables SET sale_cents=500,collected_cents=500 WHERE store_id='${t.store}'AND order_id='${a.oid}'`);assert.equal(drain().failed,0);
  assert.equal(member(t).balance,5);assert.equal(member(t).rule_version,2);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'`),'0');assert.equal(sql(`SELECT program_version FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${a.oid}'`),'1');
 });
 await check('a paid v1 order queued before editing can still issue its frozen reward through an active managed promotion',()=>{
  const t=setup(500),a=order(t,10300,{quantity:5});assert.equal(sql(`SELECT program_snapshot->>'${t.program}'FROM saas.loyalty_order_queue WHERE store_id='${t.store}'AND order_id='${a.oid}'`),'1');editTarget(t,10);
  assert.equal(drain().failed,0);
  const reward=query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'`);assert.equal(reward.program_version,1);assert.equal(reward.target_cost,5);assert.equal(sql(`SELECT p.status FROM saas.promotion_codes c JOIN saas.promotions p ON p.store_id=c.store_id AND p.id=c.promotion_id WHERE c.id='${reward.code_id}'`),'active');assert.equal(drain().failed,0);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'`),'1');
 });
 await check('a positive redemption minimum excludes the gifted units but accepts a sufficient paid companion item',()=>{
  const t=setup(700,{rewardMinimumBasketMinor:100}),reward=issue(t),single=context(t,reward.code,t.customer,1);
  const evaluate=ctx=>query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluate_v1('${t.store}',${json(ctx)},'${LATER}')`);
  assert.equal(evaluate(single).appliedPromotions.length,0);const paired=context(t,reward.code,t.customer,2),allowed=evaluate(paired);assert.equal(allowed.appliedPromotions.length,1);assert.equal(allowed.grandTotalMinor,100);
 });
 await check('more than 100 awards remain reachable after the first 100 are actually redeemed',()=>{
  const t=setup(900,{target:1});order(t,10400,{quantity:101});assert.equal(drain().failed,0);const listed=customer(t,'list');assert.equal(listed.outcome,'found');assert.equal(listed.result_payload.rewards.length,100);assert.equal(listed.result_payload.rewards.every(r=>r.status==='available'),true);
  owned(`DO $redeem$DECLARE r record;oid uuid;line uuid;ctx jsonb;reserved record;committed record;gid uuid;BEGIN FOR r IN SELECT *FROM saas.loyalty_rewards WHERE store_id='${t.store}'ORDER BY earned_at,id LIMIT 100 LOOP
   oid:=saas.inventory_deterministic_uuid('review-redeem-order',r.id::text);line:=saas.inventory_deterministic_uuid('review-redeem-line',r.id::text);
   INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,customer_id,paid_at)VALUES(oid,'${t.store}','REVIEW-'||r.sequence,'storefront','Müşteri','member@test.invalid','TRY',100,0,100,0,'confirmed','completed','{}','${LATER}','${LATER}','${t.customer}','${LATER}');
   INSERT INTO saas.order_items(id,store_id,order_id,position,product_id,variant_id,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES(line,'${t.store}',oid,0,'${t.product}','${t.variant}','Kahve',100,1,100,0,'${LATER}');
   IF to_regclass('saas.loyalty_order_members')IS NOT NULL THEN INSERT INTO saas.loyalty_order_members(store_id,order_id,account_id,customer_id,source_kind,source_id,verified_at)VALUES('${t.store}',oid,'${t.account}','${t.customer}','account_session','${t.session}','${NOW}');END IF;
   ctx:=${json(context(t,'PLACEHOLDER',t.customer,1))};ctx:=jsonb_set(jsonb_set(ctx,'{submittedCodes}',jsonb_build_array(r.code)),'{cartLines,0,lineId}',to_jsonb(line));
   SELECT *INTO reserved FROM saas.promotion_reserve_group_v1('${t.store}',gen_random_uuid(),saas.promotion_operation_fingerprint_v2('reserve','${t.store}',jsonb_build_object('sourceKind','offline_checkout','sourceReference',oid::text,'evaluatorContext',ctx)),'offline_checkout',oid::text,ctx,'${LATER}');IF reserved.outcome<>'reserved'THEN RAISE EXCEPTION 'REVIEW_RESERVE:%',reserved.outcome;END IF;gid:=(reserved.result_payload->>'reservationGroupId')::uuid;
   SELECT *INTO committed FROM saas.promotion_commit_reservation_group_v1('${t.store}',gen_random_uuid(),saas.promotion_operation_fingerprint_v2('commit','${t.store}',jsonb_build_object('reservationGroupId',gid,'orderId',oid)),gid,oid,'${LATER}');IF committed.outcome<>'committed'THEN RAISE EXCEPTION 'REVIEW_COMMIT:%',committed.outcome;END IF;
  END LOOP;END $redeem$;`);
  assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND status='used'`),'100');assert.equal(sql(`SELECT count(*)FROM saas.promotion_redemptions WHERE store_id='${t.store}'`),'100');const remaining=customer(t,'list');assert.equal(remaining.outcome,'found');assert.equal(remaining.result_payload.rewards.filter(r=>r.status==='available').length,1);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND status='available'`),'1');
 });
 await check('a return waiting behind a new reservation preserves it and a later native commit offsets future earning',async()=>{
  const t=setup(1100),earned=order(t,10500,{quantity:5});assert.equal(drain().failed,0);const reward=query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'`),redeem=order(t,10600,{quantity:1,collected:0,discount:100}),ctx=context(t,reward.code,t.customer,1,redeem.line);
  const [reservation]=await Promise.all([asyncSql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${reserveSql(t,reward,redeem,ctx)};SELECT pg_sleep(1);COMMIT;`),asyncSql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT pg_sleep(0.25);UPDATE saas.accounting_receivables SET return_cents=100 WHERE store_id='${t.store}'AND order_id='${earned.oid}';SELECT saas.loyalty_reconcile_order_v1('${t.store}','${earned.oid}','${LATER}');COMMIT;`)]);
  assert.equal(JSON.parse(reservation.split('\n').find(x=>x.startsWith('{'))).outcome,'reserved');assert.equal(sql(`SELECT status FROM saas.loyalty_rewards WHERE id='${reward.id}'`),'available');assert.equal(member(t).balance,-5);const group=sql(`SELECT reservation_group_id FROM saas.promotion_usage_reservations WHERE store_id='${t.store}'`);assert.equal(commit(t,group,redeem.oid).outcome,'committed');assert.equal(sql(`SELECT status FROM saas.loyalty_rewards WHERE id='${reward.id}'`),'used');assert.equal(member(t).balance,-5);
 });

 await check('queued initial versions are included in admission before they can exceed the promotion evaluator ceiling',()=>{
  const t=setup(1300,{target:1});let version=1,limited=false;
  for(let i=0;i<110;i++){
   order(t,50000+i*10,{quantity:1});const saved=admin(t,'save',{programId:t.program,expectedVersion:version,name:`Version ${version+1}`,enabled:true,config:t.config});
   if(saved.outcome==='limit_exceeded'){limited=true;break;}assert.equal(saved.outcome,'committed',JSON.stringify(saved));version=saved.result_payload.program.version;
  }
  assert.equal(drain().failed,0);const active=Number(sql(`SELECT count(*)FROM saas.promotions WHERE store_id='${t.store}'AND status IN('active','scheduled')`));assert.ok(active<=90,`queued versions reactivated ${active} managed promotions`);assert.equal(limited,true,'admission never bounded queued managed versions');
  const reward=query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'ORDER BY sequence LIMIT 1`),evaluated=query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluate_v1('${t.store}',${json(context(t,reward.code,t.customer,1))},'${LATER}')`);assert.equal(evaluated.merchantExplanation,'evaluated');assert.equal(evaluated.appliedPromotions.length,1);
 });
 console.log(JSON.stringify({passed,failed:failures.length,postgresqlMajor:16,externalConnections:0,productionMutations:0,native502Up:createHash('sha256').update(source).digest('hex'),failures}));if(failures.length)process.exitCode=1;
}finally{pg.stop();}
