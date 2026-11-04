import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,pg=startDisposablePostgres({database:'loyalty_combination_native'}),{sql}=pg;
const lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>`${lit(JSON.stringify(x))}::jsonb`,id=n=>`50220000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),query=q=>JSON.parse(sql(q)),PLAN='00000000-0000-4000-8000-000000000010';
const NOW=new Date(Date.now()+120_000).toISOString(),LATER=new Date(Date.parse(NOW)+1_000).toISOString();
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

function memberProof(t){return `DO $proof$BEGIN PERFORM set_config('saas.loyalty.account_candidates',${json([{keyId:t.key,digest:t.digest}])}::text,false);END $proof$;`;}
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=504&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 owned('UPDATE saas.loyalty_release_state SET ready=true,completed_at=clock_timestamp()WHERE singleton');
 const t=setup(100,{template:'spend_discount',target:100,reward:{kind:'discount',amountMinor:10},allowCombination:true});
 const saved=admin(t,'save',{name:'Second reward program',enabled:true,config:t.config});assert.equal(saved.outcome,'committed',JSON.stringify(saved));
 const first=issue(t,100),second=issue({...t,program:saved.result_payload.program.id},100);assert.notEqual(first.code,second.code);
 const loyaltyCodes=[first.code,second.code];
 const originalContext={...context(t,first.code),submittedCodes:loyaltyCodes};
 const evaluate=ctx=>query(`SET ROLE celebix_saas_owner;${memberProof(t)}SELECT saas.promotion_evaluate_v1('${t.store}',${json(ctx)},'${LATER}')`);
 const onlyRewards=evaluate(originalContext);assert.equal(onlyRewards.merchantExplanation,'evaluated');
 assert.equal(onlyRewards.appliedPromotions.filter(p=>loyaltyCodes.includes(p.normalizedCode)).length,1,JSON.stringify(onlyRewards));
 assert.equal(onlyRewards.discountTotalMinor,10);
 console.log('PASS native evaluator applies one owner-bound loyalty reward when two combinable programs are submitted');
 const promotion=id(150),normalCode='ORDINARY',rule=query(`SET ROLE celebix_saas_owner;SELECT saas.loyalty_rule_v1(${json(t.config)},'TRY')`);rule.trigger={kind:'code',codes:[normalCode]};
 owned(`INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)VALUES('${promotion}','${t.store}','Ordinary combinable coupon','active',1,${json(rule)},'${NOW}','${NOW}');INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at)VALUES('${id(151)}','${t.store}','${promotion}',1,${json(rule)},'${NOW}');INSERT INTO saas.promotion_codes(id,store_id,promotion_id,code,status,created_at)VALUES('${id(152)}','${t.store}','${promotion}','${normalCode}','active','${NOW}');`);
 const o=order(t,10000,{quantity:3,collected:280,discount:20}),ctx={...context(t,first.code,t.customer,3,o.line),submittedCodes:[normalCode,...loyaltyCodes]};
 const combined=evaluate(ctx);assert.equal(combined.merchantExplanation,'evaluated');assert.equal(combined.appliedPromotions.length,2,JSON.stringify(combined));assert.equal(combined.appliedPromotions.filter(p=>loyaltyCodes.includes(p.normalizedCode)).length,1);assert.equal(combined.appliedPromotions.filter(p=>p.normalizedCode===normalCode).length,1);assert.equal(combined.discountTotalMinor,20);
 console.log('PASS ordinary combinable coupon still stacks with one loyalty reward');
 const payload={sourceKind:'offline_checkout',sourceReference:o.oid,evaluatorContext:ctx},fingerprint=owned(`SELECT saas.promotion_operation_fingerprint_v2('reserve','${t.store}',${json(payload)})`);
 const reserved=query(`SET ROLE celebix_saas_owner;${memberProof(t)}SELECT to_jsonb(r)FROM saas.promotion_reserve_group_v1('${t.store}','${randomUUID()}','${fingerprint}','offline_checkout','${o.oid}',${json(ctx)},'${LATER}')r`);assert.equal(reserved.outcome,'reserved',JSON.stringify(reserved));
 const group=reserved.result_payload.reservationGroupId,operation=randomUUID(),commitFingerprint=owned(`SELECT saas.promotion_operation_fingerprint_v2('commit','${t.store}',${json({reservationGroupId:group,orderId:o.oid})})`);
 const commit=()=>query(`SET ROLE celebix_saas_owner;SELECT to_jsonb(r)FROM saas.promotion_commit_reservation_group_v1('${t.store}','${operation}','${commitFingerprint}','${group}','${o.oid}','${LATER}')r`);
 assert.equal(commit().outcome,'committed');assert.equal(commit().outcome,'operation_replayed');
 assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND status='used'`),'1');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${t.store}'AND status='available'`),'1');assert.equal(sql(`SELECT count(*)FROM saas.promotion_redemptions WHERE store_id='${t.store}'AND order_id='${o.oid}'`),'2');
 console.log('PASS native reserve, commit and replay consume one loyalty reward plus the ordinary coupon');
 console.log(JSON.stringify({passed:3,postgresqlMajor:16,externalConnections:0,productionMutations:0,native502Up:createHash('sha256').update(readFileSync(path.join(dir,'202611040502_loyalty_programs.up.sql'))).digest('hex')}));
}finally{pg.stop();}
