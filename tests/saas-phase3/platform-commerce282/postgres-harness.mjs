import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../merchant-signup-profile/disposable-postgres.mjs';

const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610270282_platform_checkout_expiry',pg=startDisposablePostgres({database:'platform_commerce282'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&!key.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('isolated concurrency fixture failed:'+err));const lines=out.split('\n').filter(line=>line.startsWith('{'));resolve(JSON.parse(lines.at(-1)));});child.stdin.end(source);});
const id=n=>`28200000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const P=id(100),FREE='00000000-0000-4000-8000-000000000007',STARTER='00000000-0000-4000-8000-000000000008',GROWTH='00000000-0000-4000-8000-000000000009';
const HUMAN=id(9000),HP=id(9001),seal=JSON.stringify({v:1,iv:'A'.repeat(16),tag:'A'.repeat(22),ciphertext:'AA'});
const app=expr=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr}r`);
const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
const intent=(offer=STARTER,term='monthly',kind='package')=>({kind,offerId:offer,term});
const create=(store,n,selected=intent())=>app(`saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${FREE}','free_starter',3,clock_timestamp(),'${id(n)}',${json(selected)},'${hash('handoff'+n)}')`);
const workspace=store=>app(`saas.store_tool_workspace_read('${id(store)}','${P}','${id(store+1000)}','${FREE}','free_starter',3,clock_timestamp())`).result_payload;
const manual=(store,n,offer='contact_widget')=>{const quote=sql(`SELECT quote_fingerprint FROM saas.store_tool_offers WHERE id='${offer}'`);return app(`saas.store_tool_purchase_request('${id(store)}','${P}','${id(store+1000)}','${FREE}','free_starter',3,clock_timestamp(),'${id(n)}','${offer}','${quote}')`);};
const age=order=>sql(`BEGIN;SET LOCAL session_replication_role=replica;UPDATE saas.platform_checkout_orders SET created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days',updated_at=updated_at-interval '2 days'WHERE id='${order}';COMMIT;`);
const purchase=order=>sql(`SELECT tool_purchase_id FROM saas.platform_checkout_orders WHERE id='${order}'`);
const attempt=(order,n,status)=>sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,token_digest,created_at,updated_at)VALUES('${id(n)}','${order}','${hash('request'+n)}','${status}',${json(seal)},'${hash('token'+n)}',clock_timestamp(),clock_timestamp())`);
const changed=new Set([
 'saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)',
 'saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
 'saas.platform_tool_purchases_read(uuid,jsonb)',
 'saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)',
 'saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb)',
]);
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=281&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=catalog();
 if(!process.argv.includes('--before-fix'))sql(read(migration+'.up.sql'));
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://fixture282.example.test','buyer282','buyer282@example.test',true,clock_timestamp(),clock_timestamp()),('${HP}','https://human282.example.test','human282','sdkahmetcelebi@icloud.com',true,clock_timestamp(),clock_timestamp());
 INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)VALUES('${HUMAN}','https://human282.example.test','human282','${HP}','sdkahmetcelebi@icloud.com',true);
 ${Array.from({length:30},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Fixture ${n}','expiry-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(n+1000)}','${P}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${FREE}','free_starter',3,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`;}).join('')}`);
 check('expired package quote no longer blocks choosing a different package',()=>{
  const first=create(1,400);assert.equal(first.outcome,'created');const order=first.result_payload.orderId;age(order);
  const next=create(1,401,intent(GROWTH));assert.equal(next.outcome,'created','expired pending quote must not return purchase_pending');
  assert.notEqual(next.result_payload.orderId,order);assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'expired');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_audit WHERE order_id='${order}'AND action='quote_expired'`),'1');
 });
 check('same expired operation returns explicit checkout_expired without rewriting its intent',()=>{
  const first=create(2,410),order=first.result_payload.orderId;age(order);
  const prior=sql(`SELECT to_jsonb(t)FROM saas.platform_checkout_intents t WHERE operation_id='${id(410)}'`);
  assert.equal(create(2,410).outcome,'checkout_expired');assert.equal(sql(`SELECT to_jsonb(t)FROM saas.platform_checkout_intents t WHERE operation_id='${id(410)}'`),prior);
  assert.equal(create(2,411,intent(STARTER,'annual')).outcome,'created');
 });
 check('expired platform-owned single tool releases overlap for a new bundle without deleting its history',()=>{
  const first=create(3,420,intent('contact_widget','once','tool')),order=first.result_payload.orderId,oldPurchase=purchase(order);age(order);
  const next=create(3,421,intent('all_tools','once','tool'));assert.equal(next.outcome,'created');assert.notEqual(purchase(next.result_payload.orderId),oldPurchase);
  assert.equal(sql(`SELECT status FROM saas.store_tool_purchases WHERE store_id='${id(3)}'AND id='${oldPurchase}'`),'pending');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(3)}'AND purchase_id='${oldPurchase}'`),'1');
 });
 check('released platform requests disappear from panel and owner pending projections and cannot be manually settled',()=>{
  const first=create(4,430,intent('contact_widget','once','tool')),order=first.result_payload.orderId,pid=purchase(order);age(order);assert.equal(create(4,431).outcome,'created');
  assert.equal(workspace(4).purchases.length,0);
  const owner=j(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchases_read('${HUMAN}',${json({storeId:id(4),status:'pending'})})`);assert.equal(owner.items.length,0);
  const receipt={storeId:id(4),amountCents:118800,method:'cash',reference:'obsolete282',reason:'Must not settle obsolete request'};
  assert.throws(()=>sql(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${HUMAN}','${pid}',1,'obsolete282',${json(receipt)})`),/record_not_found/);
  assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(4)}'`),'0');
  assert.equal(manual(4,432).outcome,'ok','a new genuine manual request must not be blocked by the released snapshot');
  assert.equal(workspace(4).purchases.length,1);
 });
 check('pre-existing manual pending requests remain unchanged and continue blocking conflicting bundles',()=>{
  const m=manual(5,440);assert.equal(m.outcome,'ok');const old=sql(`SELECT to_jsonb(p)FROM saas.store_tool_purchases p WHERE store_id='${id(5)}'AND id='${id(440)}'`);
  const reused=create(5,441,intent('contact_widget','once','tool'));assert.equal(reused.outcome,'created');age(reused.result_payload.orderId);
  assert.equal(create(5,442,intent('all_tools','once','tool')).outcome,'purchase_pending');
  assert.equal(sql(`SELECT to_jsonb(p)FROM saas.store_tool_purchases p WHERE store_id='${id(5)}'AND id='${id(440)}'`),old);
  assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(5)}'`),'0');assert.equal(workspace(5).purchases.length,1);
 });
 check('genuine manual settlement still records its receipt and grants the existing tool entitlement',()=>{
  const receipt={storeId:id(5),amountCents:118800,method:'cash',reference:'genuine-manual282',reason:'Fixture independently verified manual receipt'};
  const result=j(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${HUMAN}','${id(440)}',1,'genuine-manual282',${json(receipt)})`);
  assert.equal(result.ok,true);assert.equal(result.purchase.status,'settled');assert.equal(result.purchase.receipt.amountCents,118800);
  assert.equal(sql(`SELECT saas.store_tool_is_licensed('${id(5)}','contact_widget',clock_timestamp())`),'t');assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(5)}'`),'0');
 });
 check('pre282 platform linkage without a prospective origin never releases an unproven legacy snapshot',()=>{
  const first=create(16,445,intent('contact_widget','once','tool')),order=first.result_payload.orderId,pid=purchase(order);
  // Historical fixture: before282 this exact pending quote/purchase shape had
  // no provenance registry. Remove only the new fixture witness, never history.
  sql(`BEGIN;SET LOCAL session_replication_role=replica;DELETE FROM saas.platform_tool_purchase_origins282 WHERE store_id='${id(16)}'AND purchase_id='${pid}';COMMIT;`);age(order);
  assert.equal(create(16,446,intent('all_tools','once','tool')).outcome,'purchase_pending');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(16)}'`),'0');assert.equal(workspace(16).purchases.length,1);
 });
 for(const [i,status]of ['initializing','ready','unknown','pending','approved','paid_review'].entries())check(`${status} provider attempt prevents quote expiry, release and new conflicting purchases`,()=>{
  const store=6+i,n=500+i,first=create(store,n,intent('contact_widget','once','tool')),order=first.result_payload.orderId;attempt(order,10000+n,status);age(order);
  assert.equal(create(store,n+100,intent('all_tools','once','tool')).outcome,'purchase_pending');
  assert.notEqual(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'expired');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(store)}'`),'0');
  assert.equal(create(store,n,intent('contact_widget','once','tool')).outcome,'operation_replayed','uncertain or financially successful operation must retain its original recovery context');
 });
 check('verified failed attempt may expire, while a late approval records paid_review without granting the obsolete tool',()=>{
  const store=12,n=620,r=create(store,n,intent('contact_widget','once','tool')),order=r.result_payload.orderId,aid=10620;attempt(order,aid,'failed');age(order);
  const next=create(store,n+1,intent('all_tools','once','tool'));assert.equal(next.outcome,'created');
  const proof={orderId:order,attemptId:id(aid),tokenDigest:hash('token'+aid),status:'approved',paymentId:'282620',conversationId:id(aid),basketId:order,priceCents:118800,paidPriceCents:118800,currency:'TRY',fraudStatus:1,proofDigest:hash('late-approval620'),itemTransactions:[{itemId:order,transactionId:'382620',priceCents:118800,paidPriceCents:118800}]};
  assert.equal(machine('finish',proof).outcome,'paid_review');
  assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(store)}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(store)}'`),'0');
  assert.equal(sql(`SELECT provider_payment_id FROM saas.platform_checkout_attempts WHERE id='${id(aid)}'`),'282620');
 });
 check('fresh pending quotes are reused and active different offers remain blocked',()=>{
  const r=create(13,630);assert.equal(create(13,631).result_payload.orderId,r.result_payload.orderId);assert.equal(create(13,632,intent(GROWTH)).outcome,'purchase_pending');
 });
 check('wrong authority cannot expire another stores quote or expose private provenance',()=>{
  const r=create(14,640);age(r.result_payload.orderId);
  const denied=app(`saas.platform_checkout_create('${id(14)}','${P}','${id(15+1000)}','${FREE}','free_starter',3,clock_timestamp(),'${id(641)}',${json(intent(GROWTH))},'${hash('denied641')}')`);
  assert.notEqual(denied.outcome,'created');assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${r.result_payload.orderId}'`),'pending');
  assert.throws(()=>sql('SET ROLE celebix_saas_app;SELECT *FROM saas.platform_tool_purchase_origins282'),/permission denied/);
  assert.throws(()=>sql('SET ROLE celebix_saas_platform_operator;SELECT *FROM saas.platform_tool_purchase_releases282'),/permission denied/);
 });
 {
  const store=15,n=650,r=create(store,n,intent('contact_widget','once','tool')),order=r.result_payload.orderId;
  assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff'+n),sessionDigest:hash('session'+n)}).outcome,'redeemed');
  sql(`BEGIN;SET LOCAL session_replication_role=replica;WITH t AS(SELECT clock_timestamp()moment)UPDATE saas.platform_checkout_orders SET created_at=t.moment-interval '24 hours'+interval '1 second',expires_at=t.moment+interval '1 second',updated_at=t.moment-interval '24 hours'+interval '1 second'FROM t WHERE id='${order}';COMMIT;`);
  const args={orderId:order,sessionDigest:hash('session'+n),attemptId:id(10650),requestDigest:hash('request650'),sealedBuyer:seal};
  const claimed=asyncSql(`BEGIN;SELECT set_config('application_name','fixture282-claim',true);SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('begin',${json(args)})r;SELECT pg_sleep(3);COMMIT;`);
  let held=false;for(let i=0;i<20;i++){held=sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='fixture282-claim'AND wait_event='PgSleep')")==='t';if(held)break;await new Promise(resolve=>setTimeout(resolve,25));}assert.equal(held,true,'concurrent claim must hold the real order lock before expiry');
  while(sql(`SELECT clock_timestamp()>expires_at FROM saas.platform_checkout_orders WHERE id='${order}'`)!=='t')await new Promise(resolve=>setTimeout(resolve,50));
  const retry=asyncSql(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${FREE}','free_starter',3,clock_timestamp(),'${id(n)}',${json(intent('contact_widget','once','tool'))},'${hash('handoff'+n)}')r`);
  const replacement=asyncSql(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${FREE}','free_starter',3,clock_timestamp(),'${id(n+1)}',${json(intent('all_tools','once','tool'))},'${hash('handoff'+(n+1))}')r`);
  assert.equal((await claimed).outcome,'initialization_claimed');assert.equal((await retry).outcome,'operation_replayed');assert.equal((await replacement).outcome,'purchase_pending');
  assert.notEqual(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'expired');assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(store)}'`),'0');
  console.log(`PASS ${++checks} concurrent uncommitted begin crossing expiry preserves both prior-operation recovery and overlap protection`);
 }
 check('only the reviewed existing routines change and all their metadata stays identical',()=>{
  const after=catalog();for(const[key,value]of Object.entries(before)){
   if(changed.has(key)){assert.notEqual(after[key].definition,value.definition,key);const{definition,...rest}=after[key],{definition:old,...previous}=value;assert.deepEqual(rest,previous,key);}
   else assert.deepEqual(after[key],value,key);
  }
  assert.equal(changed.size,5);sql(read(migration+'_assertions.sql'));
 });
 mkdirSync(path.join(ROOT,'.tmp'),{recursive:true});writeFileSync(path.join(ROOT,'.tmp/platform-commerce282-native-before.json'),JSON.stringify(before,null,2));writeFileSync(path.join(ROOT,'.tmp/platform-commerce282-native-after.json'),JSON.stringify(catalog(),null,2));writeFileSync(path.join(ROOT,'.tmp/platform-commerce282-schema.json'),JSON.stringify(j(readFileSync(path.join(ROOT,'tests/saas-phase3/platform-commerce282/schema-readiness.sql'),'utf8')),null,2));
 console.log(JSON.stringify({passed:checks,externalCalls:0,forwardOnly:true}));
}finally{pg.stop();}
