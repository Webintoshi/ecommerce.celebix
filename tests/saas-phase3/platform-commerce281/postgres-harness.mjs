import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {spawn} from 'node:child_process';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../merchant-signup-profile/disposable-postgres.mjs';
const ROOT=path.resolve(import.meta.dirname,'../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610260281_platform_commerce',pg=startDisposablePostgres({database:'platform_commerce281'}),{sql}=pg;
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(out.trim())):reject(Error('isolated concurrent fixture failed:'+err));});child.stdin.end(source);});
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28100000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile))FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace");
const securitySource=readFileSync(path.join(ROOT,'apps/owner/lib/platform-commerce/security.ts'),'utf8').replace('import "server-only";','');
const securityURL='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(securitySource,{mode:'transform'})).toString('base64');
const {sealCommercePayload,unsealCommercePayload}=await import(securityURL);
const serviceSource=readFileSync(path.join(ROOT,'apps/owner/lib/platform-commerce/service.ts'),'utf8').replace("import 'server-only';",'').replace("from './security.ts'",'from '+JSON.stringify(securityURL));
const {createPlatformCommerceService}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(serviceSource,{mode:'transform'})).toString('base64'));
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try {
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=280&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=catalog();
 if(!process.argv.includes('--before-fix')){sql(read(migration+'.up.sql'));check('unused opt-in rollback restores every old routine and receipt schema',()=>{assert.throws(()=>sql(read(migration+'.down.sql')),/PLATFORM_COMMERCE281_DOWN_OPT_IN_REQUIRED/);sql("SET celebix.allow_platform_commerce281_down='on';"+read(migration+'.down.sql'));assert.deepEqual(catalog(),before);assert.equal(sql("SELECT attnotnull FROM pg_attribute WHERE attrelid='saas.store_tool_receipts'::regclass AND attname='operator_id'"),'t');assert.equal(sql("SELECT count(*)FROM pg_attribute WHERE attrelid='saas.store_tool_receipts'::regclass AND attname='checkout_order_id'AND NOT attisdropped"),'0');});sql(read(migration+'.up.sql'));}
 check('new platform checkout contract exists without changing tenant payments',()=>assert.equal(sql("SELECT to_regprocedure('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)')IS NOT NULL"),'t'));
 const PRINCIPAL=id(100),FREE='00000000-0000-4000-8000-000000000007',STARTER='00000000-0000-4000-8000-000000000008',PRO='00000000-0000-4000-8000-000000000010';
 const fixtureKey=Buffer.alloc(32,28),fixtureSeal=(value,context)=>sealCommercePayload(value,fixtureKey,context);
 const seal=fixtureSeal({buyer:{name:'Fixture'},ip:'127.0.0.1',credentialFingerprint:hash('fixture-key')},'buyer:fixture');
 const now=()=>sql("SELECT saas.merchant_admin_timestamp(clock_timestamp())"),day=()=>sql("SELECT saas.merchant_admin_timestamp(clock_timestamp()+interval '1 day')"),short=()=>sql("SELECT saas.merchant_admin_timestamp(clock_timestamp()+interval '30 minutes')");
 const app=expr=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr}r`);
 const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
 const intent=(offer=STARTER,term='monthly',kind='package')=>({kind,offerId:offer,term});
 const create=(store,n,selected=intent(),options={})=>app(`saas.platform_checkout_create('${id(store)}','${options.principal??PRINCIPAL}','${options.member??id(store+1000)}','${options.plan??FREE}','${options.code??'free_starter'}',${options.version??3},clock_timestamp(),'${id(n)}',${json(selected)},'${options.handoff??hash('handoff'+n)}')`);
 const redeem=(order,n,options={})=>machine('redeem',{orderId:order,handoffDigest:hash('handoff'+n),sessionDigest:hash('session'+n),...options});
 const begin=(order,n,options={})=>machine('begin',{orderId:order,sessionDigest:hash('session'+n),attemptId:id(n+10000),requestDigest:hash('request'+n),sealedBuyer:seal,...options});
 const initialized=(order,n,status='ready',options={})=>machine('initialized',{orderId:order,attemptId:id(n+10000),requestDigest:hash('request'+n),status,...(status==='ready'?{tokenDigest:hash('token'+n),sealedProvider:seal,expiresAt:short()}:{}),...options});
 const finish=(order,n,total,options={})=>machine('finish',{orderId:order,attemptId:id(n+10000),tokenDigest:hash('token'+n),status:'approved',paymentId:String(n+100000),conversationId:id(n+10000),basketId:order,priceCents:total,paidPriceCents:total,currency:'TRY',fraudStatus:1,proofDigest:hash('proof'+n),itemTransactions:[{itemId:order,transactionId:String(n+200000),priceCents:total,paidPriceCents:total}],...options});
 const insertStore=(n,paid=false)=>`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Store ${n}','fixture-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(n+1000)}','${PRINCIPAL}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${paid?PRO:FREE}','${paid?'professional':'free_starter'}',${paid?2:3},'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`;
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${PRINCIPAL}','https://platform281.example.test','fixture281','fixture281@example.test',true,clock_timestamp(),clock_timestamp());${Array.from({length:15},(_,i)=>insertStore(i+1,i===1)).join('')}
 INSERT INTO saas.store_tool_licenses(store_id,tool_key,source)VALUES('${id(2)}','contact_widget','grandfathered'),('${id(4)}','contact_widget','grandfathered');`);
 check('all existing native routines remain byte-identical',()=>{const after=catalog();for(const[signature,value]of Object.entries(before))assert.deepEqual(after[signature],value,signature);});
 const paidBefore=sql(`SELECT to_jsonb(s)FROM saas.subscriptions s WHERE store_id='${id(2)}'AND status='active'`);
 check('paid and grandfathered stores keep rights and are never charged',()=>{
  assert.equal(create(2,400,intent(),{plan:PRO,code:'professional',version:2}).outcome,'already_covered');
  assert.equal(create(4,401,intent('contact_widget','once','tool')).outcome,'already_owned');
  assert.equal(sql(`SELECT to_jsonb(s)FROM saas.subscriptions s WHERE store_id='${id(2)}'AND status='active'`),paidBefore);
  assert.equal(sql('SELECT count(*)FROM saas.platform_checkout_orders'),'0');
 });
 let packageOrder,toolOrder,annualOrder;
 check('catalog prices and20percentVAT freeze without browser money authority',()=>{
  const r=create(1,410);assert.equal(r.outcome,'created',JSON.stringify(r));packageOrder=r.result_payload.orderId;
  assert.equal(r.result_payload.netCents,258700);assert.equal(r.result_payload.vatCents,51740);assert.equal(r.result_payload.totalCents,310440);assert.equal(r.result_payload.status,'pending');
  assert.equal(create(1,411,{...intent(),totalCents:1}).outcome,'invalid_input');
  assert.equal(create(1,412,intent(PRO)).outcome,'purchase_pending');
  assert.equal(create(1,410).outcome,'operation_replayed');assert.equal(create(1,410,intent(STARTER,'annual')).outcome,'operation_mismatch');
  assert.equal(create(1,413).result_payload.orderId,packageOrder);assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_orders WHERE store_id='${id(1)}'`),'1');
 });
 check('cross-store and cashier authority cannot create platform purchases',()=>{
  const mismatch=app(`saas.platform_checkout_create('${id(2)}','${PRINCIPAL}','${id(1001)}','${PRO}','professional',2,clock_timestamp(),'${id(414)}',${json(intent())},'${hash('handoff414')}')`);assert.equal(mismatch.outcome,'membership_denied');
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${id(101)}','https://platform281.example.test','cashier281','cashier281@example.test',true,clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(1111)}','${id(101)}','${id(2)}','cashier','active',clock_timestamp(),clock_timestamp())`);assert.equal(create(2,415,intent(),{principal:id(101),member:id(1111),plan:PRO,code:'professional',version:2}).outcome,'membership_denied');
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.platform_checkout_orders`),/permission denied/);assert.throws(()=>sql(`SET ROLE celebix_saas_host_resolver;SELECT *FROM saas.platform_checkout_create('${id(1)}','${PRINCIPAL}','${id(1001)}','${FREE}','free_starter',3,clock_timestamp(),'${id(416)}','{}','${hash('x')}')`),/permission denied/);
 });
 check('handoff is one-use and24hour session is scoped to its exact order',()=>{
  assert.equal(redeem(packageOrder,410).outcome,'redeemed');assert.equal(redeem(packageOrder,410).outcome,'operation_replayed');
  assert.equal(redeem(packageOrder,410,{sessionDigest:hash('other')}).outcome,'handoff_used');
  assert.equal(machine('read',{orderId:packageOrder,sessionDigest:hash('session410')}).outcome,'found');
  const r=create(3,420,intent('contact_widget','once','tool'));assert.equal(r.outcome,'created');toolOrder=r.result_payload.orderId;
  assert.equal(machine('read',{orderId:toolOrder,sessionDigest:hash('session410')}).outcome,'not_found');assert.equal(redeem(toolOrder,420).outcome,'redeemed');
  assert.equal(sql(`SELECT bool_and(session_expires_at=redeemed_at+interval '24 hours')FROM saas.platform_checkout_intents WHERE redeemed_at IS NOT NULL`),'t');
 });
 check('initialization is claimed once and another attempt cannot charge in parallel',()=>{
  assert.equal(begin(packageOrder,410).outcome,'initialization_claimed');
  assert.equal(begin(packageOrder,410,{sealedBuyer:fixtureSeal({buyer:{name:'Fixture'},ip:'127.0.0.1',credentialFingerprint:hash('fixture-key')},'buyer:fixture')}).outcome,'attempt_replayed');
  assert.equal(begin(packageOrder,410,{attemptId:id(19999)}).outcome,'attempt_in_progress');
  assert.equal(begin(packageOrder,410,{requestDigest:hash('tampered')}).outcome,'operation_mismatch');
  assert.equal(initialized(packageOrder,410).outcome,'initialized');assert.equal(initialized(packageOrder,410).outcome,'operation_replayed');
 });
 check('forged price, token, context and unapproved fraud cannot fulfill',()=>{
  for(const mismatch of[{priceCents:1},{paidPriceCents:1},{currency:'USD'},{tokenDigest:hash('foreign')},{basketId:toolOrder},{conversationId:id(77)},{fraudStatus:0},{itemTransactions:[{itemId:toolOrder,transactionId:'111',priceCents:310440,paidPriceCents:310440}]}])assert.equal(finish(packageOrder,410,310440,mismatch).outcome,'payment_mismatch',JSON.stringify(mismatch));
  for(const field of['tokenDigest','proofDigest','conversationId','basketId','currency'])assert.notEqual(finish(packageOrder,410,310440,{[field]:null}).outcome,'fulfilled');
  assert.equal(sql(`SELECT plan_id FROM saas.subscriptions WHERE store_id='${id(1)}'AND status='active'`),FREE);
  assert.equal(sql('SELECT count(*)FROM saas.platform_receipts'),'0');
 });
 check('approval atomically creates an explicit monthly term, billing period and receipt',()=>{
  const r=finish(packageOrder,410,310440);assert.equal(r.outcome,'fulfilled',JSON.stringify(r));assert.equal(r.result_payload.order.status,'fulfilled');
  assert.equal(sql(`SELECT plan_id FROM saas.subscriptions WHERE store_id='${id(1)}'AND status='active'`),STARTER);
  assert.equal(sql(`SELECT bool_and(valid_until=saas.platform_checkout_term_end281(valid_from,'monthly'))FROM saas.subscriptions WHERE store_id='${id(1)}'AND status='active'`),'t');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_billing_periods WHERE store_id='${id(1)}'`),'1');
  assert.equal(sql(`SELECT count(*)||':'||sum(amount_cents)FROM saas.platform_receipts WHERE store_id='${id(1)}'`),'1:310440');
  assert.equal(finish(packageOrder,410,310440).outcome,'operation_replayed');assert.equal(finish(packageOrder,410,310440,{proofDigest:hash('new-proof410')}).outcome,'operation_replayed');
  assert.equal(sql(`SELECT count(*)FROM saas.subscriptions WHERE store_id='${id(1)}'AND plan_id='${STARTER}'`),'1');
 });
 check('machine tool receipt preserves the existing settled purchase projection without a human operator',()=>{
  assert.equal(begin(toolOrder,420).outcome,'initialization_claimed');assert.equal(initialized(toolOrder,420).outcome,'initialized');const r=finish(toolOrder,420,118800);assert.equal(r.outcome,'fulfilled',JSON.stringify(r));
  assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(3)}'AND operator_id IS NULL AND checkout_order_id='${toolOrder}'`),'1');
  assert.equal(sql(`SELECT saas.store_tool_is_licensed('${id(3)}','contact_widget',clock_timestamp())`),'t');
  const purchase=j(`SELECT saas.store_tool_purchase_projection('${id(3)}',tool_purchase_id)FROM saas.platform_checkout_orders WHERE id='${toolOrder}'`);assert.equal(purchase.status,'settled');assert.equal(purchase.receipt.method,'card');
  assert.equal(sql(`SELECT count(*)FROM saas.platform_operators`),'0');assert.equal(sql(`SELECT count(*)FROM saas.platform_audit WHERE store_id='${id(3)}'`),'0');
 });
 check('unknown initialization is never automatically retried and a later verified callback can recover its token',()=>{
  const r=create(5,430,intent('restock','once','tool'));assert.equal(r.outcome,'created');const order=r.result_payload.orderId;
  redeem(order,430);assert.equal(begin(order,430).outcome,'initialization_claimed');assert.equal(initialized(order,430,'unknown',{code:'network_unknown'}).outcome,'initialized');
  assert.equal(begin(order,430,{attemptId:id(19998)}).outcome,'attempt_in_progress');
  assert.equal(machine('lookup',{attemptId:id(10430)}).outcome,'found');
  assert.equal(finish(order,430,538800).outcome,'payment_mismatch');
  assert.equal(finish(order,430,538800,{sealedProvider:seal}).outcome,'fulfilled');
  assert.equal(machine('lookup',{tokenDigest:hash('token430')}).result_payload.attempt.sealedProvider,seal);
 });
 check('provider payment IDs cannot be reused for another purchase',()=>{
  const r=create(6,440,intent('cart_capture','once','tool'));const order=r.result_payload.orderId;redeem(order,440);begin(order,440);initialized(order,440);
  assert.equal(finish(order,440,418800,{paymentId:'100410'}).outcome,'payment_id_used');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(6)}'`),'0');
 });
 check('annual terms use12calendar months and calendar month ends remain explicit',()=>{
  const r=create(7,450,intent(PRO,'annual'));assert.equal(r.outcome,'created');annualOrder=r.result_payload.orderId;redeem(annualOrder,450);begin(annualOrder,450);initialized(annualOrder,450);
  assert.equal(finish(annualOrder,450,9344400).outcome,'fulfilled');
  assert.equal(sql(`SELECT bool_and(valid_until=saas.platform_checkout_term_end281(valid_from,'annual'))FROM saas.subscriptions WHERE store_id='${id(7)}'AND status='active'`),'t');
  assert.equal(sql("SELECT saas.platform_checkout_term_end281('2028-01-31T09:00:00Z','monthly')='2028-02-29T09:00:00Z'::timestamptz"),'t');
 });
 check('concurrent manual package assignment records paid review without overwriting rights',()=>{
  const r=create(8,460);const order=r.result_payload.orderId;redeem(order,460);begin(order,460);initialized(order,460);
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.subscriptions SET status='inactive',updated_at=clock_timestamp()WHERE store_id='${id(8)}'AND status='active';INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(8888)}','${id(8)}','${PRO}','professional',2,'active',clock_timestamp(),clock_timestamp(),clock_timestamp())`);
  assert.equal(finish(order,460,310440).outcome,'paid_review');assert.equal(sql(`SELECT plan_id FROM saas.subscriptions WHERE store_id='${id(8)}'AND status='active'`),PRO);
  assert.equal(sql(`SELECT provider_payment_id FROM saas.platform_checkout_attempts WHERE id='${id(10460)}'`),'100460');assert.equal(sql(`SELECT count(*)FROM saas.platform_receipts WHERE store_id='${id(8)}'`),'0');
 });
 check('pending fraud review has no grant until approved and uses the same attempt',()=>{
  const r=create(9,470,intent('order_bump','once','tool'));const order=r.result_payload.orderId;redeem(order,470);begin(order,470);initialized(order,470);
  assert.equal(finish(order,470,718800,{status:'pending',fraudStatus:0}).outcome,'pending');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(9)}'`),'0');
  assert.equal(finish(order,470,718800,{proofDigest:hash('approved470')}).outcome,'fulfilled');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(9)}'`),'1');
 });
 check('safe machine and buyer role boundaries remain separate',()=>{
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.platform_checkout_machine('lookup','{}')`),/permission denied/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_platform_operator;SELECT *FROM saas.platform_checkout_orders`),/permission denied/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;UPDATE saas.platform_checkout_orders SET net_cents=1 WHERE id='${packageOrder}'`),/PLATFORM_CHECKOUT281_ORDER_IMMUTABLE/);
  const publicResult=create(10,480).result_payload;assert.ok(!JSON.stringify(publicResult).includes('sealedBuyer'));assert.ok(!JSON.stringify(publicResult).includes('digest'));
  const current=catalog();for(const [signature,value]of Object.entries(before))assert.deepEqual(current[signature],value,signature);
 });
 check('actual owner AES envelopes survive native storage and preserve authenticated context',()=>{
  const restored=machine('lookup',{attemptId:id(10410)}).result_payload.attempt.sealedBuyer;
  assert.deepEqual(unsealCommercePayload(restored,fixtureKey,'buyer:fixture'),{buyer:{name:'Fixture'},ip:'127.0.0.1',credentialFingerprint:hash('fixture-key')});
  assert.throws(()=>unsealCommercePayload(restored,fixtureKey,'buyer:foreign'),/platform_commerce_payload_invalid/);
  assert.equal(sql(`SELECT saas.platform_checkout_seal_valid281(${json({v:1,iv:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA',ciphertext:'AA'})})`),'f','objects cannot replace the frozen opaque string contract');
 });
 check('a released legacy tool license becomes effective through the normal settled purchase projection',()=>{
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.store_tool_legacy_releases(store_id,tool_key,operation_id,reason,authorization_ref)VALUES('${id(4)}','contact_widget','${id(9000)}','Fixture authorized release','fixture-only')`);
  const r=create(4,490,intent('contact_widget','once','tool'));assert.equal(r.outcome,'created');const order=r.result_payload.orderId;redeem(order,490);begin(order,490);initialized(order,490);
  assert.equal(finish(order,490,118800).outcome,'fulfilled');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(4)}'`),'1');assert.equal(sql(`SELECT source FROM saas.store_tool_effective_licenses('${id(4)}',clock_timestamp())WHERE tool_key='contact_widget'`),'purchase');
 });
 check('unredeemed authorized retry refreshes only its handoff while the order expiry stays fixed',()=>{
  const r=create(10,480),order=r.result_payload.orderId;const fixed=r.result_payload.expiresAt;
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_intents(operation_id,order_id,store_id,principal_id,intent,handoff_digest,created_at,expires_at)VALUES('${id(481)}','${order}','${id(10)}','${PRINCIPAL}',${json(intent())},'${hash('handoff481')}',clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '5 minutes')`);
  assert.equal(redeem(order,481).outcome,'checkout_expired');const retry=create(10,481);assert.equal(retry.outcome,'operation_replayed');assert.equal(retry.result_payload.expiresAt,fixed);assert.equal(redeem(order,481).outcome,'redeemed');
 });
 {
  const n=510,r=create(12,n,intent('whatsapp_ordering','once','tool'));assert.equal(r.outcome,'created');const order=r.result_payload.orderId,attempt=id(n+10000),token=id(15100),fingerprint=hash('fixture-service-key');let initializeCalls=0,retrieveCalls=0;
  const service=createPlatformCommerceService({command:async(action,args)=>machine(action,args),dataKey:fixtureKey,credentialFingerprint:fingerprint,now:()=>new Date(),gateway:{initialize:async(input)=>{initializeCalls++;assert.equal(input.totalCents,298800);return{status:'ready',token,paymentPageUrl:`https://cpp.iyzipay.com/?token=${token}`,expiresAt:short()};},retrieve:async(input)=>{retrieveCalls++;assert.equal(input.orderId,order);return{status:'payment',paymentStatus:'approved',paymentId:'1251000',token,itemTransactions:[{itemId:order,paymentTransactionId:'2251000',priceCents:298800,paidPriceCents:298800}]};}}});
  const buyer={id:order,name:'Fixture',surname:'Buyer',identityNumber:'11111111111',email:'service@example.test',gsmNumber:'+905551112233',registrationAddress:'Fixture address',city:'Ordu',country:'Turkey'};
  await service.execute('redeem',{orderId:order,ticketDigest:hash('handoff'+n),sessionDigest:hash('session'+n)});
  const started=await service.execute('start',{orderId:order,sessionDigest:hash('session'+n),attemptId:attempt,buyer,ip:'203.0.113.20'});assert.equal(started.status,'ready');
  assert.equal((await service.execute('start',{orderId:order,sessionDigest:hash('session'+n),attemptId:attempt,buyer,ip:'203.0.113.20'})).status,'ready');assert.equal(initializeCalls,1);
  const callback=await service.execute('callback',{attemptId:attempt,token});assert.equal(callback.state,'approved');assert.equal(retrieveCalls,1);
  const visible=await service.execute('read',{orderId:order,sessionDigest:hash('session'+n)});assert.equal(visible.order.state,'approved');assert.equal(JSON.stringify(visible).includes(buyer.identityNumber),false);assert.equal(JSON.stringify(visible).includes(token),false);
  assert.equal(sql(`SELECT saas.store_tool_is_licensed('${id(12)}','whatsapp_ordering',clock_timestamp())`),'t');
  console.log(`PASS ${++checks} actual service and AES payloads complete the native lifecycle with one provider initialize`);
 }
 check('an expired browser session never blocks an already claimed verified bank approval',()=>{
  const r=create(13,520),original=r.result_payload.orderId,order=id(8520),attempt=id(10520);
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_orders(id,store_id,principal_id,membership_id,kind,offer_id,offer_name,term,plan_id,tool_purchase_id,tool_keys,baseline_subscription_id,baseline_subscription_digest,net_cents,vat_bps,vat_cents,total_cents,currency,status,created_at,expires_at,updated_at)
  SELECT '${order}',store_id,principal_id,membership_id,kind,offer_id,offer_name,term,plan_id,tool_purchase_id,tool_keys,baseline_subscription_id,baseline_subscription_digest,net_cents,vat_bps,vat_cents,total_cents,currency,'processing',created_at-interval '2 days',expires_at-interval '2 days',updated_at-interval '2 days'FROM saas.platform_checkout_orders WHERE id='${original}';
  INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,created_at,updated_at)VALUES('${attempt}','${order}','${hash('request520')}','unknown',${json(seal)},clock_timestamp()-interval '2 days',clock_timestamp()-interval '2 days');`);
  assert.equal(machine('read',{orderId:order,sessionDigest:hash('expired-session')}).outcome,'not_found');assert.equal(finish(order,520,310440,{sealedProvider:seal}).outcome,'fulfilled');
 });
 check('verified failure permits only explicit retry and two late approvals never duplicate an entitlement',()=>{
  const r=create(14,530,intent('cart_capture','once','tool')),order=r.result_payload.orderId;redeem(order,530);begin(order,530);initialized(order,530);
  assert.equal(finish(order,530,418800,{status:'failed',paymentId:null,fraudStatus:-1,itemTransactions:[],proofDigest:hash('failed530')}).outcome,'failed');
  const fresh=id(20530),newToken=hash('new-token530'),requestDigest=hash('new-request530');assert.equal(begin(order,530,{attemptId:fresh,requestDigest}).outcome,'initialization_claimed');
  assert.equal(initialized(order,530,'ready',{attemptId:fresh,requestDigest,tokenDigest:newToken}).outcome,'initialized');
  assert.equal(finish(order,530,418800).outcome,'fulfilled');
  assert.equal(finish(order,530,418800,{attemptId:fresh,conversationId:fresh,tokenDigest:newToken,paymentId:'999530',proofDigest:hash('new-paid530')}).outcome,'paid_review');
  assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(14)}'AND tool_key='cart_capture'`),'1');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(14)}'`),'1');
 });
 check('manual tool settlement remains compatible and a later bank approval is recorded for review',()=>{
  const r=create(11,550,intent('order_bump','once','tool')),order=r.result_payload.orderId;redeem(order,550);begin(order,550);initialized(order,550);
  const purchase=sql(`SELECT tool_purchase_id FROM saas.platform_checkout_orders WHERE id='${order}'`),human=id(9991),humanPrincipal=id(9992);
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${humanPrincipal}','https://human281.example.test','human281','sdkahmetcelebi@icloud.com',true,clock_timestamp(),clock_timestamp());INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)VALUES('${human}','https://human281.example.test','human281','${humanPrincipal}','sdkahmetcelebi@icloud.com',true)`);
  const receipt={storeId:id(11),amountCents:718800,method:'card',reference:'fixture-human-receipt281',reason:'Fixture human independently verified payment'};
  const manual=j(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${human}','${purchase}',1,'fixture-human-settle281',${json(receipt)})`);assert.equal(manual.ok,true);
  assert.equal(finish(order,550,718800).outcome,'paid_review');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(11)}'AND operator_id='${human}'AND checkout_order_id IS NULL`),'1');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(11)}'AND tool_key='order_bump'`),'1');
 });
 {
  const n=560,r=create(15,n,intent('all_tools','once','tool')),order=r.result_payload.orderId;redeem(order,n);
  const beginArgs={orderId:order,sessionDigest:hash('session'+n),attemptId:id(n+10000),requestDigest:hash('request'+n),sealedBuyer:seal};
  const concurrent=(action,args)=>asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
  const first=await Promise.all([concurrent('begin',beginArgs),concurrent('begin',beginArgs)]);assert.deepEqual(first.map(r=>r.outcome).sort(),['attempt_replayed','initialization_claimed']);initialized(order,n);
  const proof={orderId:order,attemptId:id(n+10000),tokenDigest:hash('token'+n),status:'approved',paymentId:String(n+100000),conversationId:id(n+10000),basketId:order,priceCents:1678800,paidPriceCents:1678800,currency:'TRY',fraudStatus:1,proofDigest:hash('proof'+n),itemTransactions:[{itemId:order,transactionId:String(n+200000),priceCents:1678800,paidPriceCents:1678800}]};
  const results=await Promise.all([concurrent('finish',proof),concurrent('finish',proof)]);assert.deepEqual(results.map(r=>r.outcome).sort(),['fulfilled','operation_replayed']);assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(15)}'`),'1');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_licenses WHERE store_id='${id(15)}'`),'5');
  console.log(`PASS ${++checks} real concurrent sessions claim initialization and settle the same signed-proof tuple exactly once`);
 }
 check('SQL assertions include every old routine and every machine and merchant role',()=>{sql(read(migration+'_assertions.sql'));assert.throws(()=>sql("SET celebix.allow_platform_commerce281_down='on';"+read(migration+'.down.sql')),/PLATFORM_COMMERCE281_HISTORY_EXISTS/);});
 writeFileSync(path.join(ROOT,'.tmp/platform-commerce281-native-before.json'),JSON.stringify(before,null,2));writeFileSync(path.join(ROOT,'.tmp/platform-commerce281-native-after.json'),JSON.stringify(catalog(),null,2));writeFileSync(path.join(ROOT,'.tmp/platform-commerce281-schema.json'),JSON.stringify(j(readFileSync(path.join(ROOT,'tests/saas-phase3/platform-commerce281/schema-readiness.sql'),'utf8')),null,2));
 console.log(JSON.stringify({passed:checks,externalCalls:0}));
}finally{pg.stop();}
