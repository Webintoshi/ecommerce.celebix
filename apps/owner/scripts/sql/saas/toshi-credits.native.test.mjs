import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const ROOT=path.resolve(import.meta.dirname,'../../../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610270283_toshi_credits',pg=startDisposablePostgres({database:'toshi_credits283'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28300000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const P=id(100),HUMAN=id(9000),HP=id(9001),FREE='00000000-0000-4000-8000-000000000007',STARTER='00000000-0000-4000-8000-000000000008',PRO='00000000-0000-4000-8000-000000000010';
const authority=store=>([10,11,15,16].includes(store))?{plan:PRO,code:'professional',version:2}:{plan:FREE,code:'free_starter',version:3};
const seal=JSON.stringify({v:1,iv:'A'.repeat(16),tag:'A'.repeat(22),ciphertext:'AA'});
const expr=(store,action,args,options={})=>`saas.toshi_credit_command('${id(store)}','${options.principal??P}','${options.member??id(store+1000)}','${authority(store).plan}','${authority(store).code}',${authority(store).version},clock_timestamp(),${lit(action)},${json(args)})`;
const app=source=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${source}r`);
const command=(store,action,args,options)=>app(expr(store,action,args,options));
const reserve=(store,n,cost=10,options={})=>command(store,'reserve',{operationId:id(n),fingerprint:hash('op'+n),cost,...options});
const complete=(store,n,chargedCredits,result={fields:[{field:'seoTitle',value:'Ürün'}]})=>command(store,'complete',{operationId:id(n),fingerprint:hash('op'+n),chargedCredits,result});
const fail=(store,n,unknown=false)=>command(store,'fail',{operationId:id(n),fingerprint:hash('op'+n),safeCode:'provider_unavailable',unknown});
const wallet=store=>{const r=command(store,'wallet',{});assert.equal(r.outcome,'wallet',JSON.stringify(r));return r.result_payload;};
const grant=(store,n,credits=10)=>j(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_toshi_credit_grant('${HUMAN}','${id(store)}','${id(n)}',${credits},'Isolated native acceptance grant')`);
const checkout=(store,n,kind='toshi_credit',offerId='toshi-500',term='once')=>app(`saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${authority(store).plan}','${authority(store).code}',${authority(store).version},clock_timestamp(),'${id(n)}',${json({kind,offerId,term})},'${hash('handoff'+n)}')`);
const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('isolated concurrency fixture failed:'+err));const rows=out.split('\n').filter(s=>s.startsWith('{'));resolve(JSON.parse(rows.at(-1)));});child.stdin.end(source);});
const parallel=(store,action,args)=>asyncSql(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr(store,action,args)}r`);
function payment(order,n,total){
 const attemptId=id(n+10000),proof={orderId:order,attemptId,tokenDigest:hash('token'+n),status:'approved',paymentId:String(n+100000),conversationId:attemptId,basketId:order,priceCents:total,paidPriceCents:total,currency:'TRY',fraudStatus:1,proofDigest:hash('proof'+n),itemTransactions:[{itemId:order,transactionId:String(n+200000),priceCents:total,paidPriceCents:total}]};
 assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff'+n),sessionDigest:hash('session'+n)}).outcome,'redeemed');
 assert.equal(machine('begin',{orderId:order,sessionDigest:hash('session'+n),attemptId,requestDigest:hash('request'+n),sealedBuyer:seal}).outcome,'initialization_claimed');
 assert.equal(machine('initialized',{orderId:order,attemptId,requestDigest:hash('request'+n),status:'ready',tokenDigest:hash('token'+n),sealedProvider:seal,expiresAt:sql("SELECT saas.merchant_admin_timestamp(clock_timestamp()+interval '30 minutes')")}).outcome,'initialized');
 return proof;
}
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=282&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
 sql(read(migration+'.up.sql'));sql(read(migration+'_assertions.sql'));
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://fixture283.example.test','buyer283','buyer283@example.test',true,clock_timestamp(),clock_timestamp()),('${HP}','https://human283.example.test','human283','sdkahmetcelebi@icloud.com',true,clock_timestamp(),clock_timestamp());
 INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)VALUES('${HUMAN}','https://human283.example.test','human283','${HP}','sdkahmetcelebi@icloud.com',true);
 ${Array.from({length:20},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Fixture ${n}','credit-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(n+1000)}','${P}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${authority(n).plan}','${authority(n).code}',${authority(n).version},'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`;}).join('')}`);
 check('new and free stores start at zero without any automatic credits',()=>{assert.equal(sql('SELECT count(*)FROM saas.toshi_credit_wallets'),'0');assert.deepEqual(wallet(1),{balance:0,reserved:0,available:0});assert.equal(sql('SELECT count(*)FROM saas.toshi_credit_ledger'),'0');assert.equal(reserve(1,300).outcome,'insufficient_credits');});
 check('only active audited operators grant credits and exact replay never grants twice',()=>{
  assert.deepEqual(grant(1,301),{balance:10,reserved:0,available:10});assert.deepEqual(grant(1,301),wallet(1));assert.equal(sql(`SELECT count(*)FROM saas.platform_audit WHERE action='toshi.credit.grant'AND store_id='${id(1)}'`),'1');
  assert.throws(()=>grant(1,301,11),/operation_mismatch/);assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT saas.platform_toshi_credit_grant('${HUMAN}','${id(1)}','${id(302)}',100,'forged')`),/permission denied/);
 });
 check('reserve holds credits, same operation is pending and changed request cannot dispatch',()=>{
  assert.equal(reserve(1,310).outcome,'created');assert.deepEqual(wallet(1),{balance:10,reserved:10,available:0});assert.equal(reserve(1,310).outcome,'pending');assert.equal(reserve(1,310,9).outcome,'operation_mismatch');assert.equal(reserve(1,311,1).outcome,'insufficient_credits');assert.equal(reserve(2,310).outcome,'operation_mismatch');
 });
 check('partial usable results charge only successful fields and replay returns cached result',()=>{
  const result={fields:[{field:'seoTitle',value:'Ürün'}],failedFields:['description','seoDescription']};assert.equal(complete(1,310,1,result).outcome,'completed');assert.deepEqual(wallet(1),{balance:9,reserved:0,available:9});
  const replay=reserve(1,310);assert.equal(replay.outcome,'replayed');assert.deepEqual(replay.result_payload,{kind:'replayed',status:'completed',result,chargedCredits:1});assert.equal(complete(1,310,1,result).outcome,'completed');assert.equal(complete(1,310,2,result).outcome,'operation_mismatch');assert.equal(fail(1,310).outcome,'completed');assert.equal(wallet(1).balance,9);
 });
 check('provider failure and unknown result fully release holds without client charging',()=>{
  assert.equal(reserve(1,320,7).outcome,'created');assert.equal(fail(1,320).outcome,'failed');assert.deepEqual(wallet(1),{balance:9,reserved:0,available:9});assert.equal(fail(1,320).outcome,'failed');assert.equal(reserve(1,320,7).result_payload.status,'failed');
  assert.equal(reserve(1,321,7).outcome,'created');assert.equal(fail(1,321,true).outcome,'failed');assert.equal(reserve(1,321,7).result_payload.status,'unknown');assert.equal(complete(1,321,7).outcome,'operation_failed');assert.equal(wallet(1).balance,9);
 });
 check('abandoned reservations expire terminally and completion cannot charge or redispatch',()=>{
  assert.equal(reserve(1,330,7).outcome,'created');sql(`SET ROLE celebix_saas_owner;UPDATE saas.toshi_credit_operations SET created_at=created_at-interval '16 minutes',expires_at=expires_at-interval '16 minutes'WHERE operation_id='${id(330)}'`);
  assert.equal(complete(1,330,7).outcome,'operation_failed');assert.deepEqual(wallet(1),{balance:9,reserved:0,available:9});assert.equal(reserve(1,330,7).result_payload.status,'unknown');assert.equal(sql(`SELECT count(*)FROM saas.toshi_credit_ledger WHERE source_id='${id(330)}'AND event='release'`),'1');
 });
 check('result bytes, invalid charges and exact payload boundaries fail before deduction',()=>{
  assert.equal(reserve(1,340,2).outcome,'created');assert.equal(complete(1,340,3).outcome,'invalid_input');assert.equal(complete(1,340,1,{text:'a'.repeat(262145)}).outcome,'invalid_input');assert.equal(complete(1,340,0).outcome,'invalid_input');assert.equal(wallet(1).reserved,2);assert.equal(fail(1,340).outcome,'failed');
 });
 check('cross-store membership and operation authority never expose another wallet',()=>{
  assert.equal(command(1,'wallet',{}, {member:id(1002)}).outcome,'membership_denied');assert.equal(command(2,'complete',{operationId:id(310),fingerprint:hash('op310'),chargedCredits:1,result:{ok:true}}).outcome,'operation_mismatch');assert.deepEqual(wallet(2),{balance:0,reserved:0,available:0});
  for(const table of ['toshi_credit_wallets','toshi_credit_operations','toshi_credit_ledger'])assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.${table}`),/permission denied/);
 });
 grant(3,350,10);
 const competing=await Promise.all([parallel(3,'reserve',{operationId:id(351),fingerprint:hash('op351'),cost:10}),parallel(3,'reserve',{operationId:id(352),fingerprint:hash('op352'),cost:10})]);assert.deepEqual(competing.map(r=>r.outcome).sort(),['created','insufficient_credits']);assert.deepEqual(wallet(3),{balance:10,reserved:10,available:0});console.log(`PASS ${++checks} real simultaneous sessions cannot overspend one wallet`);
 grant(4,360,10);const sameArgs={operationId:id(361),fingerprint:hash('op361'),cost:10};const same=await Promise.all([parallel(4,'reserve',sameArgs),parallel(4,'reserve',sameArgs)]);assert.deepEqual(same.map(r=>r.outcome).sort(),['created','pending']);console.log(`PASS ${++checks} real simultaneous retries authorize one provider dispatch`);
 for(const[index,[offer,credits,net]]of [['toshi-500',500,24900],['toshi-2500',2500,99900],['toshi-10000',10000,299900],['toshi-50000',50000,1249900]].entries()){
  const store=5+index,n=400+index,r=checkout(store,n,'toshi_credit',offer),order=r.result_payload?.orderId;
  assert.equal(r.outcome,'created',JSON.stringify(r));assert.equal(r.result_payload.netCents,net);assert.equal(r.result_payload.vatCents,net/5);assert.equal(r.result_payload.totalCents,net*1.2);assert.equal(wallet(store).balance,0);assert.equal(checkout(store,n,'toshi_credit',offer).outcome,'operation_replayed');
  const proof=payment(order,n,net*1.2),responses=await Promise.all([asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`),asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`)]);
  assert.deepEqual(responses.map(r=>r.outcome).sort(),['fulfilled','operation_replayed']);assert.deepEqual(wallet(store),{balance:credits,reserved:0,available:credits});assert.equal(sql(`SELECT count(*)FROM saas.toshi_credit_ledger WHERE checkout_order_id='${order}'`),'1');console.log(`PASS ${++checks} ${offer} exact VAT quote credits once under duplicate verified callbacks`);
 }
 check('credit checkout accepts admin but rejects cashier and client price injection',()=>{
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(5010)}','${HP}','${id(10)}','store_owner','active',clock_timestamp(),clock_timestamp()),('${id(5011)}','${HP}','${id(11)}','store_owner','active',clock_timestamp(),clock_timestamp());UPDATE saas.memberships SET role='admin'WHERE id='${id(1010)}';UPDATE saas.memberships SET role='cashier'WHERE id='${id(1011)}'`);
  const admin=checkout(10,420);assert.equal(admin.outcome,'created');assert.equal(machine('finish',payment(admin.result_payload.orderId,420,admin.result_payload.totalCents)).outcome,'fulfilled');assert.equal(wallet(10).balance,500);assert.equal(checkout(11,421).outcome,'membership_denied');assert.equal(checkout(12,422,'toshi_credit','toshi-unknown').outcome,'invalid_input');assert.equal(checkout(12,423,'toshi_credit','toshi-500','monthly').outcome,'invalid_input');
 });
 check('existing package and tool purchases still create and fulfill their original entitlements',()=>{
  const pkg=checkout(13,430,'package',STARTER,'monthly');assert.equal(pkg.outcome,'created');assert.equal(machine('finish',payment(pkg.result_payload.orderId,430,pkg.result_payload.totalCents)).outcome,'fulfilled');assert.equal(sql(`SELECT plan_code FROM saas.subscriptions WHERE store_id='${id(13)}'AND status='active'`),'starter');
  const tool=checkout(14,431,'tool','contact_widget');assert.equal(tool.outcome,'created');assert.equal(machine('finish',payment(tool.result_payload.orderId,431,tool.result_payload.totalCents)).outcome,'fulfilled');assert.equal(sql(`SELECT saas.store_tool_is_licensed('${id(14)}','contact_widget',clock_timestamp())`),'t');assert.equal(sql(`SELECT count(*)FROM saas.toshi_credit_ledger WHERE store_id IN('${id(13)}','${id(14)}')`),'0');
 });
 check('credit commands require catalog management: editor allowed and analyst denied',()=>{
  grant(15,440,10);grant(16,441,10);assert.equal(reserve(16,442,1).outcome,'created');
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(5015)}','${HP}','${id(15)}','store_owner','active',clock_timestamp(),clock_timestamp()),('${id(5016)}','${HP}','${id(16)}','store_owner','active',clock_timestamp(),clock_timestamp());UPDATE saas.memberships SET role='editor'WHERE id='${id(1015)}';UPDATE saas.memberships SET role='analyst'WHERE id='${id(1016)}'`);
  assert.equal(wallet(15).balance,10);assert.equal(reserve(15,443,2).outcome,'created');assert.equal(complete(15,443,1).outcome,'completed');assert.equal(reserve(15,444,2).outcome,'created');assert.equal(fail(15,444).outcome,'failed');
  assert.equal(command(16,'wallet',{}).outcome,'membership_denied');assert.equal(reserve(16,445,1).outcome,'membership_denied');assert.equal(complete(16,442,1).outcome,'membership_denied');assert.equal(fail(16,442).outcome,'membership_denied');
 });
 check('all unrelated existing routines remain byte-identical and ledger reconciles',()=>{
  const after=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
  for(const[signature,definition]of Object.entries(before))if(!signature.startsWith('saas.platform_checkout_create(')&&!signature.startsWith('saas.platform_checkout_fulfill281(')&&signature!=='saas.platform_checkout_machine(text,jsonb)')assert.equal(after[signature],definition,signature);
  sql(read(migration+'_assertions.sql'));assert.throws(()=>sql(read(migration+'.down.sql')),/TOSHI_CREDITS283_FORWARD_ONLY/);
 });
 console.log(JSON.stringify({passed:checks,externalCalls:0,livePayments:0,postgresMajor:16}));
}finally{pg.stop();}
