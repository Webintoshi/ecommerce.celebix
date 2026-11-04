import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir=import.meta.dirname,pg=startDisposablePostgres({database:'loyalty502_native'}),{sql}=pg;
const lit=x=>`'${String(x).replaceAll("'","''")}'`,json=x=>`${lit(JSON.stringify(x))}::jsonb`,id=n=>`50200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owned=q=>sql('SET ROLE celebix_saas_owner;'+q),j=q=>JSON.parse(sql(q));
const config={schemaVersion:1,template:'product_gift',target:5,eligibleProductIds:[],reward:{kind:'gift',variantId:id(90),quantity:1},minimumBasketMinor:0,rewardMinimumBasketMinor:0,channels:['storefront','in_store','manual'],startsAt:null,endsAt:null,timezone:'Europe/Istanbul',repeat:true,maxOncePerDay:false,allowMultiplePrograms:false,allowCombination:false,progressExpiryDays:null,rewardExpiryDays:null};
const file='202611040502_loyalty_programs';let checks=0;
const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try {
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=501&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 if(!process.argv.includes('--baseline-red')&&existsSync(path.join(dir,file+'.up.sql')))sql(readFileSync(path.join(dir,file+'.up.sql'),'utf8'));
 check('four templates validate exact bounded inputs without accepting unrelated fields',()=>{
  assert.equal(sql(`SELECT saas.loyalty_config_valid_v1(${json(config)})`),'t');
  for(const change of[{target:0},{target:1.1},{target:9007199254740992},{channels:[]},{eligibleProductIds:['foreign']},{timezone:'invalid/time'},{extra:true},{reward:{kind:'gift',variantId:id(90),quantity:0}},{template:'spend_discount'},{startsAt:'2026-11-05T00:00:00.000Z',endsAt:'2026-11-04T00:00:00.000Z'}])assert.equal(sql(`SELECT saas.loyalty_config_valid_v1(${json({...config,...change})})`),'f',JSON.stringify(change));
 });
 const store=id(1),customer=id(2),account=id(3),program=id(4),other=id(5),at=new Date(Date.now()+86400000).toISOString();
 owned(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${store}','Loyalty fixture','loyalty-502','active','tr','TRY','starter','2026-01-01','2026-01-01');INSERT INTO saas.customers(id,store_id,status,first_name,last_name,created_at,updated_at)VALUES('${customer}','${store}','active','Test','Member','2026-01-01','2026-01-01');INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,phone_normalized,phone_verified_at,status,verified_at,last_login_at,created_at,updated_at)VALUES('${account}','${store}','${customer}',NULL,NULL,'+905000000502','2026-01-01','active','2026-01-01','2026-01-01','2026-01-01','2026-01-01');INSERT INTO saas.loyalty_programs(id,store_id,name,enabled,version,config,created_at,updated_at)VALUES('${program}','${store}','Beş ürüne hediye',true,1,${json(config)},'${at}','${at}');INSERT INTO saas.loyalty_program_versions(store_id,program_id,version,config,created_at)VALUES('${store}','${program}',1,${json(config)},'${at}');`);
 check('progress carries excess units and retries do not earn twice',()=>{
  const op=id(10);owned(`SELECT saas.loyalty_apply_effect_v1('${store}','${program}',1,'${account}','${customer}','${op}',7,'${at}','fixture','{}')`);
  let m=j(`SELECT to_jsonb(m)FROM saas.loyalty_members m WHERE store_id='${store}'AND program_id='${program}'AND account_id='${account}'`);assert.equal(m.earned,1);assert.equal(m.progress,2);
  owned(`SELECT saas.loyalty_apply_effect_v1('${store}','${program}',1,'${account}','${customer}','${op}',7,'${at}','fixture','{}')`);
  assert.equal(sql(`SELECT progress FROM saas.loyalty_members WHERE store_id='${store}'AND account_id='${account}'`),'2');
  owned(`SELECT saas.loyalty_apply_effect_v1('${store}','${program}',1,'${account}','${customer}','${id(11)}',3,'${at}','fixture','{}')`);
  m=j(`SELECT to_jsonb(m)FROM saas.loyalty_members m WHERE store_id='${store}'AND account_id='${account}'`);assert.equal(m.earned,2);assert.equal(m.progress,0);
 });
 check('compensation preserves used reward history and offsets later earnings',()=>{
  const reward=sql(`SELECT id FROM saas.loyalty_rewards WHERE store_id='${store}'ORDER BY sequence LIMIT 1`);owned(`UPDATE saas.loyalty_rewards SET status='used'WHERE id='${reward}';SELECT saas.loyalty_apply_effect_v1('${store}','${program}',1,'${account}','${customer}','${id(12)}',-10,'${at}','return','{}')`);
  assert.equal(sql(`SELECT status FROM saas.loyalty_rewards WHERE id='${reward}'`),'used');assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${store}'AND status='revoked'`),'1');
  owned(`SELECT saas.loyalty_apply_effect_v1('${store}','${program}',1,'${account}','${customer}','${id(13)}',5,'${at}','fixture','{}')`);
  assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${store}'AND status='available'`),'0');
  assert.equal(sql(`SELECT count(*)FROM saas.accounting_events WHERE store_id='${store}'`),'0');
 });
 check('source processing refuses phone-only ownership and discount-only settlement',()=>{
  assert.equal(sql(`SELECT saas.loyalty_paid_order_amount_v1('${store}','${other}')`),'0');
  for(const role of['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'])assert.throws(()=>sql(`SET ROLE ${role};SELECT * FROM saas.loyalty_members`),/permission denied/);
 });
 const principal=id(20),membership=id(21),plan='00000000-0000-4000-8000-000000000010';
 owned(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${principal}','fixture','loyalty502','loyalty502@example.test',true,'2026-01-01','2026-01-01');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${membership}','${principal}','${store}','store_owner','active','2026-01-01','2026-01-01');INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(22)}','${store}','${plan}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01');`);
 const admin=(action,operation,payload)=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.loyalty_admin_command_v1('${store}','${principal}','${membership}','${plan}','professional',2,'${at}',${lit(action)},${lit(operation)}::uuid,${json(payload)})r`);
 check('save creates the real active promotion once and recovers stable replay',()=>{
  const op=id(23),payload={name:'Harcama hediyesi',enabled:true,config:{...config,template:'spend_discount',target:200000,reward:{kind:'discount',amountMinor:15000}}};
  const saved=admin('save',op,payload);assert.equal(saved.outcome,'committed',JSON.stringify(saved));assert.equal(saved.result_payload.program.status,'active');
  assert.deepEqual(admin('save',op,payload),{...saved,outcome:'operation_replayed'});
  assert.equal(admin('save',op,{...payload,name:'Other'}).outcome,'operation_mismatch');
  assert.deepEqual(admin('recover',op,{action:'save',payload}),{...saved,outcome:'operation_replayed'});
  const paused=admin('pause',id(24),{programId:saved.result_payload.program.id,expectedVersion:1});assert.equal(paused.outcome,'committed');assert.equal(paused.result_payload.program.status,'paused');
  assert.equal(admin('pause',id(25),{programId:saved.result_payload.program.id,expectedVersion:1}).outcome,'version_conflict');
 });
 check('actual collected money qualifies a canonical order once; forgiving a debt does not',()=>{
  const order=id(30),unpaid=id(31);
  for(const oid of[order,unpaid])owned(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,customer_id,paid_at)VALUES('${oid}','${store}','${oid}','storefront','Test Member','member@example.test','TRY',700,0,0,700,'confirmed','completed','{}','${at}','${at}','${customer}','${at}');INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)VALUES('${randomUUID()}','${store}','${oid}',0,'Paid units',100,7,0,700,'${at}');INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,order_id,channel,currency,sale_cents,collected_cents,discount_cents,occurred_at)VALUES('${randomUUID()}','${store}','${customer}','{}','${oid}','WEB','TRY',700,${oid===order?700:0},${oid===order?0:700},'${at}');`);
  assert.equal(sql(`SELECT saas.loyalty_paid_order_amount_v1('${store}','${unpaid}')`),'0');
  assert.equal(sql(`SELECT saas.loyalty_paid_order_amount_v1('${store}','${order}')`),'700');
  owned(`SELECT saas.loyalty_reconcile_order_v1('${store}','${order}','${at}');SELECT saas.loyalty_reconcile_order_v1('${store}','${unpaid}','${at}');SELECT saas.loyalty_reconcile_order_v1('${store}','${order}','${at}');`);
  assert.equal(sql(`SELECT amount FROM saas.loyalty_order_effects WHERE store_id='${store}'AND program_id='${program}'AND order_id='${order}'`),'7');
  assert.equal(sql(`SELECT count(*)FROM saas.loyalty_order_effects WHERE store_id='${store}'AND order_id='${unpaid}'`),'0');
 });
 check('large valid earnings are issued in bounded chunks without losing excess progress',()=>{
  const p=id(40),cfg={...config,target:1},when=new Date(Date.parse(at)+1000).toISOString();
  owned(`INSERT INTO saas.loyalty_programs(id,store_id,name,enabled,version,config,created_at,updated_at)VALUES('${p}','${store}','Batch fixture',true,1,${json(cfg)},'${when}','${when}');INSERT INTO saas.loyalty_program_versions(store_id,program_id,version,config,created_at)VALUES('${store}','${p}',1,${json(cfg)},'${when}');SELECT saas.loyalty_apply_effect_v1('${store}','${p}',1,'${account}','${customer}','${id(41)}',1005,'${when}','fixture','{}');`);
  assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${store}'AND program_id='${p}'`),'1000');
  assert.equal(sql(`SELECT pending_issuance FROM saas.loyalty_members WHERE store_id='${store}'AND program_id='${p}'`),'t');
  sql(`SET ROLE celebix_saas_workflow;SELECT saas.loyalty_process_pending_v1('${when}',20)`);
  assert.equal(sql(`SELECT count(*)FROM saas.loyalty_rewards WHERE store_id='${store}'AND program_id='${p}'`),'1005');
  assert.equal(sql(`SELECT progress FROM saas.loyalty_members WHERE store_id='${store}'AND program_id='${p}'`),'0');
 });
 if(existsSync(path.join(dir,file+'_assertions.sql')))sql(readFileSync(path.join(dir,file+'_assertions.sql'),'utf8'));
 console.log(JSON.stringify({checks,postgresqlMajor:16,externalConnections:0,productionMutations:0}));
}finally{pg.stop();}
