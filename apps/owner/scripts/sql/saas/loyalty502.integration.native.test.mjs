import {actualBaselineOptions,applyAdmittedActualBaseline} from './loyalty-actual-baseline.mjs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import pgDriver from 'pg';
import {initializeLoyaltyProductionRuntime} from '../../../lib/native-loyalty/production.ts';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,pg=startDisposablePostgres({database:'loyalty502_integration'}),{sql}=pg;
const lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>`${lit(JSON.stringify(x))}::jsonb`,id=n=>`50210000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q)),PLAN='00000000-0000-4000-8000-000000000010';
const NOW=new Date(Date.now()+120_000).toISOString(),LATER=new Date(Date.parse(NOW)+1_000).toISOString();
const failures=[],sources={};let passed=0;
async function check(label,run){try{await run();passed++;console.log(`PASS ${label}`);}catch(error){failures.push({label,message:error.message,stack:error.stack});console.error(`FAIL ${label}: ${error.message}`);}}
function asyncSql(source){return new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),20_000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(err));else resolve(out.trim());});child.stdin.end(source);});}
function setup(base,changes={}){
 const t={store:id(base),principal:id(base+1),membership:id(base+2),customer:id(base+3),account:id(base+4),otherCustomer:id(base+5),otherAccount:id(base+6),product:id(base+10),variant:id(base+11),host:`loyalty-${base}.saas-staging.celebix.site`,key:'loyalty-fixture',digest:'a'.repeat(64),otherDigest:'b'.repeat(64)};
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
function issue(t,amount=5){const result=admin(t,'adjust',{programId:t.program,customerId:t.customer,delta:amount,reason:'Yetkili düzeltmesi'});assert.equal(result.outcome,'committed',JSON.stringify(result));return query(`SELECT to_jsonb(r)FROM saas.loyalty_rewards r WHERE store_id='${t.store}'ORDER BY sequence DESC LIMIT 1`);}
function context(t,code,who=t.customer,quantity=3,line=randomUUID()){return{storeId:t.store,customerId:who,paidOrderCount:1,customerSegmentIds:[],customerTagIds:[],cartLines:[{lineId:line,position:0,productId:t.product,variantId:t.variant,quantity,unitPriceMinor:100,unitCostMinor:40,currency:'TRY',categoryIds:[],brandId:null,collectionIds:[]}],shippingMethodId:null,paymentMethodId:null,shippingBeforeDiscountMinor:0,currency:'TRY',storeLocalTime:LATER,salesChannel:'storefront',submittedCodes:[code],abandonedCart:null};}
function order(t,base,{quantity=7,giftQuantity=0,collected=quantity*100,forgiven=0,discount=0,verified=true}={}){
 const oid=id(base),line=id(base+1);owned(`${verified?`INSERT INTO saas.loyalty_order_members(store_id,order_id,account_id,customer_id,source_kind,source_id,verified_at)VALUES('${t.store}','${oid}','${t.account}','${t.customer}','account_session','${id(Number(t.store.slice(-12))+20)}','${NOW}');`:''}INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,customer_id,paid_at)VALUES('${oid}','${t.store}','INT-${base}','storefront','Müşteri','member@test.invalid','TRY',${quantity*100},0,${discount},${quantity*100-discount},'confirmed','completed','{}','${LATER}','${LATER}','${t.customer}','${LATER}');
 INSERT INTO saas.order_items(id,store_id,order_id,position,product_id,variant_id,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${line}','${t.store}','${oid}',0,'${t.product}','${t.variant}','Kahve',100,${quantity},${discount},${quantity*100-discount},'${LATER}');
 INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,order_id,channel,currency,sale_cents,collected_cents,discount_cents,occurred_at)VALUES('${id(base+2)}','${t.store}','${t.customer}','{}','${oid}','WEB','TRY',${quantity*100-discount},${collected},${forgiven},'${LATER}');`);return{oid,line};
}
function drain(){return query(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${LATER}',20)`);}
function hosted(t,base){
 const cart=id(base),profile=id(base+1),method=id(base+2),attempt=id(base+3),session=id(base+4),expires=new Date(Date.parse(LATER)+900_000).toISOString(),oneDay=new Date(Date.parse(LATER)+86_400_000).toISOString();
 const sealed={algorithm:'A256GCM',ciphertext:'AA',iv:'AAAAAAAAAAAAAAAA',keyId:'loyalty-hosted',tag:'AAAAAAAAAAAAAAAAAAAAAA',version:1};
 const items=[{productId:t.product,categoryId:null,variantId:t.variant,slug:'coffee',title:'Kahve',variantTitle:'Kahve',media:null,quantity:3,unitPriceCents:100,lineTotalCents:300,discountCents:100,payableCents:200,available:true}];
 owned(`INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)VALUES('paytr_iframe','payment_processing','test',1,'sha256:${'8'.repeat(64)}','sandbox_ready',true,'${NOW}')ON CONFLICT(provider_code,environment)DO UPDATE SET enabled=true,adapter_version=EXCLUDED.adapter_version,evidence_digest=EXCLUDED.evidence_digest,readiness=EXCLUDED.readiness,approved_at=EXCLUDED.approved_at;
 INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,execution_evidence_digest,validation_environment,validation_adapter_version)VALUES('${profile}','${t.store}','paytr_iframe','payment_processing','{"environment":"test"}','fixture-***',${json(sealed)},'${'7'.repeat(64)}','loyalty-hosted',1,1,'active',1,'${NOW}','${NOW}','${NOW}','test',1,'sha256:${'8'.repeat(64)}','test',1);
 INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)VALUES('${method}','${t.store}','provider','${profile}','paytr_iframe','Hosted fixture','active',9100,'{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',1,'${NOW}','${NOW}');
 INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${cart}','${t.store}','active',1,'${oneDay}','${LATER}','${LATER}');
 INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at)VALUES('${attempt}','${t.store}','${method}','${profile}','paytr_iframe','test',1,'hold-${base}',200,'TRY','provider_outcome_unknown','provider_outcome_unknown',1,'${LATER}','${LATER}');
 INSERT INTO saas.storefront_hosted_checkout_sessions(id,store_id,cart_id,intent_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,hold_expires_at,terminal_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at)
 VALUES('${session}','${t.store}','${cart}',NULL,'${attempt}','${method}','${profile}','paytr_iframe','test',1,1,'sha256:${'8'.repeat(64)}','hold-${base}','${id(base+5)}','${t.customer}','${id(base+6)}','${id(base+7)}','${id(base+8)}','${id(base+9)}',1,'${'6'.repeat(64)}','TRY',300,0,100,200,'{}',${json(items)},'processing','provider_outcome_unknown','${expires}',NULL,1,'loyalty-hold','${'3'.repeat(64)}','${expires}','loyalty-receipt','${'4'.repeat(64)}','${oneDay}','loyalty-customer','${'5'.repeat(64)}','${oneDay}','${LATER}','${LATER}');`);
 return{session,attempt,expires};
}
const catalogue=()=>query(`SELECT jsonb_build_object('routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace),'triggers',(SELECT jsonb_object_agg(t.tgrelid::regclass::text||':'||t.tgname,pg_get_triggerdef(t.oid))FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='saas'::regnamespace AND NOT t.tgisinternal))`);
try{
 const actualOptions=actualBaselineOptions();if(actualOptions){sources.actualBaseline=applyAdmittedActualBaseline(pg,dir,actualOptions);}else{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=501&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 }
 const before=catalogue(),up=readFileSync(path.join(dir,'202611040502_loyalty_programs.up.sql'),'utf8'),down=readFileSync(path.join(dir,'202611040502_loyalty_programs.down.sql'),'utf8');
 sources.native502Up=createHash('sha256').update(up).digest('hex');sources.native502Down=createHash('sha256').update(down).digest('hex');
 sql(up);
 await check('pristine opt-in rollback restores exact native routines and triggers across two install cycles',()=>{
  const once=catalogue();sql(up);assert.deepEqual(catalogue(),once);assert.throws(()=>sql(down),/LOYALTY502_DOWN_OPT_IN_REQUIRED/);
  sql("SET celebix.allow_loyalty502_down='on';"+down);assert.deepEqual(catalogue(),before);sql(up);assert.deepEqual(catalogue(),once);
  sql("SET celebix.allow_loyalty502_down='on';"+down);assert.deepEqual(catalogue(),before);sql(up);assert.deepEqual(catalogue(),once);
 });
 await check('real workflow login refuses worker startup when 503 is absent even though 502 defines a POS stub',async()=>{
  sql('CREATE ROLE loyalty_runtime502 LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;GRANT celebix_saas_workflow TO loyalty_runtime502;');
  const pool=new pgDriver.Pool({...pg.poolOptions,user:'loyalty_runtime502'}),database={name:pg.database,url:`postgresql://unused:unused@localhost/${pg.database}`,ca:'fixture-only'};
  await assert.rejects(initializeLoyaltyProductionRuntime(database,{createPool:()=>pool,now:()=>new Date(LATER)}),/loyalty_production_preflight_failed/);
  assert.equal(sql("SELECT to_regprocedure('saas.loyalty_pos_reward_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb)')IS NOT NULL"),'t');assert.equal(sql("SELECT to_regclass('saas.loyalty_pos_redemptions')IS NULL"),'t');
 });
 if(process.argv.includes('--with503')){const source=readFileSync(path.join(dir,'202611040503_loyalty_checkout_pos.up.sql'),'utf8');sources.native503Up=createHash('sha256').update(source).digest('hex');sql(source);}
 await check('owner-bound rewards reject another customer and another tenant through native public commands',()=>{
  const t=setup(100),foreign=setup(300),reward=issue(t);assert.equal(customer(t,'prepare-reward',{rewardId:reward.id}).outcome,'committed');assert.equal(customer(t,'prepare-reward',{rewardId:reward.id},t.otherDigest).outcome,'not_found');assert.equal(customer(foreign,'prepare-reward',{rewardId:reward.id}).outcome,'not_found');
  const good=query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluator_code_facts('${t.store}',${json(context(t,reward.code))},'${LATER}')`);assert.equal(Object.keys(good).length,1);
  const copied=query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluator_code_facts('${t.store}',${json(context(t,reward.code,t.otherCustomer))},'${LATER}')`);assert.deepEqual(copied,{});
 });
 await check('ordinary non-loyalty codes remain valid for their original audience',()=>{
  const t=setup(500),promotion=id(530),rule=query(`SET ROLE celebix_saas_owner;SELECT saas.loyalty_rule_v1(${json({...t.config,template:'spend_discount',reward:{kind:'discount',amountMinor:10}})},'TRY')`);rule.trigger={kind:'code',codes:['ORDINARY']};
  owned(`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)VALUES('${promotion}','${t.store}','Normal kampanya','active',1,${json(rule)},'${NOW}','${NOW}');INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)VALUES('${randomUUID()}','${t.store}','${promotion}',1,${json(rule)},'${NOW}');INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at)VALUES('${randomUUID()}','${t.store}','${promotion}','ORDINARY','active','${NOW}');`);
  const result=query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluate_v1('${t.store}',${json(context(t,'ORDINARY',t.otherCustomer))},'${LATER}')`);assert.equal(result.appliedPromotions.length,1);assert.equal(result.discountTotalMinor,10);
 });
 await check('real paid order queue earns once while discount-only debt closure earns nothing',()=>{
  const t=setup(700),paid=order(t,10000,{collected:0}),forgiven=order(t,10100,{collected:0});
  drain();assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_effects WHERE store_id='${t.store}'`),'0');
  owned(`SELECT saas.accounting_bump_customer('${t.store}','${t.customer}','TRY');UPDATE saas.accounting_release_state SET collection_discounts_enabled=true WHERE singleton;`);
  for(const[oid,amountCents,discountCents,expectedVersion]of[[paid.oid,700,0,1],[forgiven.oid,0,700,2]]){const intent={customerId:t.customer,orderId:oid,amountCents,discountCents,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion,note:null},result=query(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.accounting_mutate('${t.store}','${t.principal}','${t.membership}','${PLAN}','professional',2,'${LATER}','${randomUUID()}','${'a'.repeat(64)}','collect',${json(intent)})r`);assert.equal(result.outcome,'committed',JSON.stringify(result));}
  assert.equal(sql(`SELECT sum(balance_cents)FROM saas.accounting_accounts WHERE store_id='${t.store}'`),'700');
  const first=drain();assert.equal(first.failed,0);assert.equal(sql(`SELECT amount FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${paid.oid}'`),'7');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${forgiven.oid}'`),'0');
  owned(`UPDATE saas.orders SET updated_at=updated_at+interval '1 millisecond',version=version+1 WHERE store_id='${t.store}'AND id='${paid.oid}'`);drain();assert.equal(sql(`SELECT count(*)FROM saas.loyalty_effects WHERE store_id='${t.store}'AND reason='paid_order'`),'1');
 });
 await check('a paid guest contact match never earns stamps without immutable verified-source proof',()=>{
  const t=setup(800),guest=order(t,10250,{quantity:2,collected:200,verified:false});drain();assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${guest.oid}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'`),'0');
 });
 await check('concurrent distinct purchases obey the single daily count under member locking',async()=>{
  const t=setup(900,{template:'purchase_gift',target:3,maxOncePerDay:true}),a=order(t,10200,{quantity:1,collected:100}),b=order(t,10300,{quantity:1,collected:100});
  await Promise.all([asyncSql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.loyalty_reconcile_order_v1('${t.store}','${a.oid}','${LATER}');SELECT pg_sleep(0.15);COMMIT;`),asyncSql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;SELECT saas.loyalty_reconcile_order_v1('${t.store}','${b.oid}','${LATER}');COMMIT;`)]);
  assert.equal(sql(`SELECT sum(amount)FROM saas.loyalty_order_effects WHERE store_id='${t.store}'`),'1');
 });
 await check('captured free units on a partially paid line never earn product stamps',()=>{
  const t=setup(1100),reward=issue(t),o=order(t,10400,{quantity:3,collected:200,discount:100});
  const ctx=context(t,reward.code,t.customer,3,o.line),evaluation=query(`SET ROLE celebix_saas_owner;SELECT saas.promotion_evaluate_v1('${t.store}',${json(ctx)},'${LATER}')`);assert.equal(evaluation.gifts.length,1);
  const reservePayload={sourceKind:'offline_checkout',sourceReference:o.oid,evaluatorContext:ctx},reserveHash=sql(`SET ROLE celebix_saas_owner;SELECT saas.promotion_operation_fingerprint_v2('reserve','${t.store}',${json(reservePayload)})`);
  const reserved=query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_reserve_group_v1('${t.store}','${randomUUID()}','${reserveHash}','offline_checkout','${o.oid}',${json(ctx)},'${LATER}')r`);assert.equal(reserved.outcome,'reserved',JSON.stringify(reserved));
  const reservationGroupId=reserved.result_payload.reservationGroupId,commitHash=sql(`SET ROLE celebix_saas_owner;SELECT saas.promotion_operation_fingerprint_v2('commit','${t.store}',${json({reservationGroupId,orderId:o.oid})})`);
  const committed=query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_commit_reservation_group_v1('${t.store}','${randomUUID()}','${commitHash}','${reservationGroupId}','${o.oid}','${LATER}')r`);assert.equal(committed.outcome,'committed',JSON.stringify(committed));
  const snapshot=query(`SELECT snapshot FROM saas.order_promotion_snapshots WHERE store_id='${t.store}'AND order_id='${o.oid}'`);assert.ok(snapshot.discountLines[0].capturedRanges.some(r=>r.kind==='gift'));drain();
  assert.equal(sql(`SELECT amount FROM saas.loyalty_order_effects WHERE store_id='${t.store}'AND order_id='${o.oid}'`),'2');
 });
 await check('unknown bank outcomes retain reward ownership after ordinary reservation expiry until definitive failure',()=>{
  const t=setup(1300),reward=issue(t),h=hosted(t,10600),ctx=context(t,reward.code),reservePayload={sourceKind:'hosted_checkout',sourceReference:h.session,evaluatorContext:ctx};
  const reserveHash=sql(`SET ROLE celebix_saas_owner;SELECT saas.promotion_operation_fingerprint_v2('reserve','${t.store}',${json(reservePayload)})`),reserved=query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_reserve_group_v1('${t.store}','${randomUUID()}','${reserveHash}','hosted_checkout','${h.session}',${json(ctx)},'${LATER}')r`);assert.equal(reserved.outcome,'reserved',JSON.stringify(reserved));
  const late=new Date(Date.parse(h.expires)+1_000).toISOString();owned(`SELECT saas.promotion_expire_due_reservations_v1('${late}',500)`);
  assert.equal(customer(t,'prepare-reward',{rewardId:reward.id},t.digest,late).outcome,'reward_unavailable');
  const lease=randomUUID(),leaseEnd=new Date(Date.parse(late)+60_000).toISOString();
  const claim=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_claim_reconciliation('${h.attempt}','${randomUUID()}','${'8'.repeat(64)}',1,'loyalty-integration','${lease}','${late}','${leaseEnd}','test',1,'sha256:${'8'.repeat(64)}')r`);assert.equal(claim.outcome,'claimed',JSON.stringify(claim));
  const finalized=query(`SET ROLE celebix_saas_workflow;SELECT to_jsonb(r)FROM saas.payment_attempt_finalize_reconciliation_guarded('${h.attempt}','${randomUUID()}','${'9'.repeat(64)}',2,'loyalty-integration','${lease}',1,'failed',NULL,'provider_declined',200,'TRY','${late}')r`);assert.equal(finalized.outcome,'failed',JSON.stringify(finalized));
  assert.equal(sql(`SELECT status FROM saas.storefront_hosted_checkout_sessions WHERE id='${h.session}'`),'failed');assert.equal(customer(t,'prepare-reward',{rewardId:reward.id},t.digest,late).outcome,'committed');
 });
 await check('large legitimate grants retain all rights across bounded minting batches and stable replay',()=>{
  const t=setup(1500,{target:1}),operation=randomUUID(),payload={programId:t.program,customerId:t.customer,delta:1500,reason:'Yetkili toplu düzeltme'};const start=performance.now();
  const saved=admin(t,'adjust',payload,operation);assert.equal(saved.outcome,'committed',JSON.stringify(saved));assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'`),'1000');assert.equal(sql(`SELECT pending_issuance FROM saas.loyalty_members WHERE store_id='${t.store}'`),'t');
  assert.equal(drain().failed,0);assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'`),'1500');assert.equal(sql(`SELECT pending_issuance FROM saas.loyalty_members WHERE store_id='${t.store}'`),'f');assert.equal(sql(`SELECT balance FROM saas.loyalty_members WHERE store_id='${t.store}'`),'0');
  assert.equal(admin(t,'adjust',payload,operation).outcome,'operation_replayed');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_effects WHERE store_id='${t.store}'`),'1');console.log(JSON.stringify({scenario:'1500_rewards_two_batches',durationMs:Math.round(performance.now()-start)}));
 });
 console.log(JSON.stringify({passed,failed:failures.length,postgresqlMajor:16,externalConnections:0,productionMutations:0,sources,failures}));if(failures.length)process.exitCode=1;
}finally{pg.stop();}
