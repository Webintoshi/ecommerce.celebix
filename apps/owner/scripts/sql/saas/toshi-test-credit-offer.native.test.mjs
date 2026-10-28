import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const ROOT=path.resolve(import.meta.dirname,'../../../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610280288_toshi_test_credit_offer',pg=startDisposablePostgres({database:'toshi_test_credit288'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28800000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const P=id(100),P2=id(101),FREE='00000000-0000-4000-8000-000000000007',PRO='00000000-0000-4000-8000-000000000010';
const plan=store=>store===6?{id:PRO,code:'professional',version:2}:{id:FREE,code:'free_starter',version:3};
const seal=JSON.stringify({v:1,iv:'A'.repeat(16),tag:'A'.repeat(22),ciphertext:'AA'});
const app=source=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${source}r`);
const checkout=(store,n,offerId='toshi-test-1',extra={})=>app(`saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${plan(store).id}','${plan(store).code}',${plan(store).version},clock_timestamp(),'${id(n)}',${json({kind:'toshi_credit',offerId,term:'once',...extra})},'${hash('handoff'+n)}')`);
const wallet=store=>app(`saas.toshi_credit_command('${id(store)}','${P}','${id(store+1000)}','${plan(store).id}','${plan(store).code}',${plan(store).version},clock_timestamp(),'wallet','{}'::jsonb)`).result_payload;
const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('isolated fixture failed:'+err));resolve(JSON.parse(out.split('\n').filter(s=>s.startsWith('{')).at(-1)));});child.stdin.end(source);});
function payment(order,n,total){
 const attemptId=id(n+10000);
 assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff'+n),sessionDigest:hash('session'+n)}).outcome,'redeemed');
 assert.equal(machine('begin',{orderId:order,sessionDigest:hash('session'+n),attemptId,requestDigest:hash('request'+n),sealedBuyer:seal}).outcome,'initialization_claimed');
 assert.equal(machine('initialized',{orderId:order,attemptId,requestDigest:hash('request'+n),status:'ready',tokenDigest:hash('token'+n),sealedProvider:seal,expiresAt:sql("SELECT saas.merchant_admin_timestamp(clock_timestamp()+interval '30 minutes')")}).outcome,'initialized');
 return {orderId:order,attemptId,tokenDigest:hash('token'+n),status:'approved',paymentId:String(n+100000),conversationId:attemptId,basketId:order,priceCents:total,paidPriceCents:total,currency:'TRY',fraudStatus:1,proofDigest:hash('proof'+n),itemTransactions:[{itemId:order,transactionId:String(n+200000),priceCents:total,paidPriceCents:total}]};
}
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=287&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'bodyHash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',p.proacl::text))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://fixture288.example.test','buyer288','buyer288@example.test',true,clock_timestamp(),clock_timestamp()),('${P2}','https://fixture288.example.test','second-owner288','second-owner288@example.test',true,clock_timestamp(),clock_timestamp());
 ${Array.from({length:7},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Fixture ${n}','credit-test-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(n+1000)}','${P}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${plan(n).id}','${plan(n).code}',${plan(n).version},'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`;}).join('')}`);
 const historical=checkout(6,399,'toshi-500');assert.equal(historical.outcome,'created');
 const historicalHash=sql(`SELECT encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex')FROM saas.platform_checkout_orders o WHERE id='${historical.result_payload.orderId}'`);
 sql(read(migration+'.up.sql'));sql(read(migration+'_assertions.sql'));
 check('migration leaves existing unpaid order snapshots intact and their verified fulfillment usable',()=>{
  assert.equal(sql(`SELECT encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex')FROM saas.platform_checkout_orders o WHERE id='${historical.result_payload.orderId}'`),historicalHash);
  assert.equal(machine('finish',payment(historical.result_payload.orderId,399,29880)).outcome,'fulfilled');assert.equal(wallet(6).balance,500);
 });
 const created=checkout(1,400),order=created.result_payload?.orderId;
 check('test offer quotes exactly 83 net plus 17 VAT equals 100 kuruş, with no unpaid credit',()=>{
  assert.equal(created.outcome,'created',JSON.stringify(created));assert.equal(created.result_payload.netCents,83);assert.equal(created.result_payload.vatCents,17);assert.equal(created.result_payload.totalCents,100);assert.equal(wallet(1).balance,0);
  assert.equal(checkout(1,400).outcome,'operation_replayed');assert.equal(checkout(2,400).outcome,'operation_mismatch');
  assert.equal(checkout(2,401,'toshi-test-1',{totalCents:1}).outcome,'invalid_input');
  assert.equal(checkout(2,402,'toshi-test-1',{credits:500}).outcome,'invalid_input');
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;SELECT saas.platform_checkout_fulfill281('${order}','${id(10400)}',clock_timestamp())`),/APPROVAL_REQUIRED/);
 });
 const proof=payment(order,400,100);
 check('wrong paid amount or cross-order proof cannot grant even one credit',()=>{
  assert.equal(machine('finish',{...proof,paidPriceCents:1}).outcome,'payment_mismatch');
  assert.equal(machine('finish',{...proof,basketId:id(2)}).outcome,'payment_mismatch');assert.equal(wallet(1).balance,0);
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.platform_checkout_machine('finish',${json(proof)})`),/permission denied/);
 });
 const responses=await Promise.all([asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`),asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`)]);
 check('simultaneous verified callbacks grant exactly one credit and preserve immutable purchase ledger',()=>{
  assert.deepEqual(responses.map(r=>r.outcome).sort(),['fulfilled','operation_replayed']);assert.deepEqual(wallet(1),{balance:1,reserved:0,available:1});
  assert.equal(sql(`SELECT count(*)FROM saas.toshi_credit_ledger WHERE checkout_order_id='${order}'AND event='purchase'`),'1');assert.equal(machine('finish',proof).outcome,'operation_replayed');assert.equal(wallet(1).balance,1);
 });
 for(const[index,[offer,credits,net]]of [['toshi-500',500,24900],['toshi-2500',2500,99900],['toshi-10000',10000,299900],['toshi-50000',50000,1249900]].entries()){
  check(`${offer} retains its exact quote and credit fulfillment`,()=>{const n=410+index,r=checkout(2+index,n,offer);assert.equal(r.outcome,'created');assert.equal(r.result_payload.netCents,net);assert.equal(r.result_payload.totalCents,net*1.2);assert.equal(machine('finish',payment(r.result_payload.orderId,n,net*1.2)).outcome,'fulfilled');assert.equal(wallet(2+index).balance,credits);});
 }
 check('admin may buy the same one-credit offer; editor and inactive stores remain denied',()=>{
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(9006)}','${P2}','${id(6)}','store_owner','active',clock_timestamp(),clock_timestamp());UPDATE saas.memberships SET role='admin'WHERE id='${id(1006)}'`);
  const admin=checkout(6,429);assert.equal(admin.outcome,'created');assert.equal(machine('finish',payment(admin.result_payload.orderId,429,100)).outcome,'fulfilled');assert.equal(wallet(6).balance,501);
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.memberships SET role='editor'WHERE id='${id(1006)}';UPDATE saas.stores SET status='suspended'WHERE id='${id(7)}'`);
  assert.equal(checkout(6,430).outcome,'membership_denied');assert.equal(checkout(7,431).outcome,'store_inactive');
 });
 check('repeated migration preserves routine identities, ACLs and every unrelated routine',()=>{
  const once=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
  for(const[name,prior]of Object.entries(before)){
   assert.equal(once[name].oid,prior.oid,name);assert.equal(once[name].acl,prior.acl,name);
   if(!name.startsWith('saas.platform_checkout_create(')&&!name.startsWith('saas.platform_checkout_fulfill281('))assert.equal(once[name].definition,prior.definition,name);
  }
  sql(read(migration+'.up.sql'));sql(read(migration+'_assertions.sql'));
  assert.deepEqual(j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text))FROM pg_proc p WHERE pronamespace='saas'::regnamespace"),once);
  assert.throws(()=>sql(read(migration+'.down.sql')),/TOSHI_TEST_CREDIT288_FORWARD_ONLY/);
 });
 check('unexpected routine or ACL drift is never overwritten',()=>{
  const identity='saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)';
  const definition=sql(`SELECT pg_get_functiondef('${identity}'::regprocedure)`);
  sql(`SET ROLE celebix_saas_owner;ALTER FUNCTION ${identity} COST 101`);
  assert.throws(()=>sql(read(migration+'.up.sql')),/PREDECESSOR_INVALID/);assert.equal(sql(`SELECT procost FROM pg_proc WHERE oid='${identity}'::regprocedure`),'101');
  sql(`SET ROLE celebix_saas_owner;${definition}`);
  sql(`SET ROLE celebix_saas_owner;GRANT EXECUTE ON FUNCTION ${identity} TO PUBLIC`);
  assert.throws(()=>sql(read(migration+'.up.sql')),/ROUTINE_IDENTITY_INVALID/);
  sql(`SET ROLE celebix_saas_owner;REVOKE EXECUTE ON FUNCTION ${identity} FROM PUBLIC`);sql(read(migration+'_assertions.sql'));
 });
 console.log(JSON.stringify({passed:checks,externalCalls:0,livePayments:0,postgresMajor:16}));
}finally{pg.stop();}
