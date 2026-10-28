import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const ROOT=path.resolve(import.meta.dirname,'../../../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas');
const migration='202610280289_toshi_public_test_checkout',pg=startDisposablePostgres({database:'toshi_public_test289'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28900000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const P=id(100),P2=id(101),FREE='00000000-0000-4000-8000-000000000007',PRO='00000000-0000-4000-8000-000000000010';
const plan=store=>store===3?{id:FREE,code:'free_starter',version:3}:{id:PRO,code:'professional',version:2};
const seal=JSON.stringify({v:1,iv:'A'.repeat(16),tag:'A'.repeat(22),ciphertext:'AA'});
const app=source=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${source}r`);
const checkout=(store,n,offerId='toshi-test-1',extra={})=>app(`saas.platform_checkout_create('${id(store)}','${P}','${id(store+1000)}','${plan(store).id}','${plan(store).code}',${plan(store).version},clock_timestamp(),'${id(n)}',${json({kind:'toshi_credit',offerId,term:'once',...extra})},'${hash('handoff'+n)}')`);
const wallet=store=>app(`saas.toshi_credit_command('${id(store)}','${P}','${id(store+1000)}','${plan(store).id}','${plan(store).code}',${plan(store).version},clock_timestamp(),'wallet','{}'::jsonb)`).result_payload;
const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('isolated fixture failed:'+err));resolve(JSON.parse(out.split('\n').filter(s=>s.startsWith('{')).at(-1)));});child.stdin.end(source);});
function payment(order,n,total,publicTest=false){
 const attemptId=id(n+10000);
 if(!publicTest)assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff'+n),sessionDigest:hash('session'+n)}).outcome,'redeemed');
 assert.equal(machine('begin',{orderId:order,sessionDigest:hash('session'+n),attemptId,requestDigest:hash('request'+n),sealedBuyer:seal}).outcome,'initialization_claimed');
 assert.equal(machine('initialized',{orderId:order,attemptId,requestDigest:hash('request'+n),status:'ready',tokenDigest:hash('token'+n),sealedProvider:seal,expiresAt:sql("SELECT saas.merchant_admin_timestamp(clock_timestamp()+interval '30 minutes')")}).outcome,'initialized');
 return {orderId:order,attemptId,tokenDigest:hash('token'+n),status:'approved',paymentId:String(n+100000),conversationId:attemptId,basketId:order,priceCents:total,paidPriceCents:total,currency:'TRY',fraudStatus:1,proofDigest:hash('proof'+n),itemTransactions:[{itemId:order,transactionId:String(n+200000),priceCents:total,paidPriceCents:total}]};
}
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
const pub=(selector,n,options={})=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_public_test_create(clock_timestamp(),'${id(n)}',${lit(selector)},'${options.session??hash('session'+n)}','${options.ip??hash('ip'+n)}')r`);
const balance=store=>Number(sql(`SELECT coalesce((SELECT balance FROM saas.toshi_credit_wallets WHERE store_id='${id(store)}'),0)`));
const orderOf=r=>r.result_payload.order;
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=288&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl::text))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
 const catalogSql=String.raw`SELECT jsonb_build_object(
 'database',current_database(),'serverMajor',current_setting('server_version_num')::integer/10000,
 'role',current_user,'schemaOwner',(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='saas'),
 'functions',(SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
  'oid',p.oid::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
  'kind',p.prokind,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,
  'volatility',p.provolatile,'parallel',p.proparallel,'config',to_jsonb(p.proconfig),
  'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),
  'hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
  'definition',CASE WHEN p.oid IN(
   to_regprocedure('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)'),
   to_regprocedure('saas.platform_checkout_machine(text,jsonb)'),
   to_regprocedure('saas.platform_checkout_fulfill281(uuid,uuid,timestamptz)'),
   to_regprocedure('saas.platform_checkout_public_test_create(timestamptz,uuid,text,text,text)'),
   to_regprocedure('saas.platform_checkout_public_intent_guard289()')) THEN pg_get_functiondef(p.oid) ELSE NULL END)), '{}'::jsonb)
  FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.prokind IN('f','p')),
 'constraints',(SELECT coalesce(jsonb_object_agg(c.conrelid::regclass::text||'.'||c.conname,jsonb_build_object(
  'oid',c.oid::text,'validated',c.convalidated,'type',c.contype,'local',c.conislocal,'noInherit',c.connoinherit,
  'deferrable',c.condeferrable,'deferred',c.condeferred,'columns',to_jsonb(c.conkey),'foreignColumns',to_jsonb(c.confkey),
  'foreignRelation',CASE WHEN c.confrelid=0 THEN NULL ELSE c.confrelid::regclass::text END,
  'definition',pg_get_constraintdef(c.oid),'hash',encode(sha256(convert_to(pg_get_constraintdef(c.oid),'UTF8')),'hex'))),'{}'::jsonb)
  FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid WHERE r.relnamespace='saas'::regnamespace),
 'columns',(SELECT coalesce(jsonb_object_agg(c.oid::regclass::text||'.'||a.attname,jsonb_build_object(
  'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'acl',a.attacl::text,
  'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
  'storage',a.attstorage,'statisticsTarget',a.attstattarget,
  'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END)),'{}'::jsonb)
  FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE c.relnamespace='saas'::regnamespace AND c.relkind IN('r','p','v','m','f','S') AND a.attnum>0 AND NOT a.attisdropped),
 'relations',(SELECT coalesce(jsonb_object_agg(c.oid::regclass::text,jsonb_build_object(
  'oid',c.oid::text,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
  'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'persistence',c.relpersistence,
  'options',to_jsonb(c.reloptions),'replicaIdentity',c.relreplident,
  'accessMethod',(SELECT amname FROM pg_am WHERE oid=c.relam),
  'tablespace',(SELECT spcname FROM pg_tablespace WHERE oid=c.reltablespace),
  'partitionBound',CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound,c.oid) ELSE NULL END,
  'indexDefinition',CASE WHEN c.relkind IN('i','I') THEN pg_get_indexdef(c.oid) ELSE NULL END,
  'indexRelation',CASE WHEN i.indexrelid IS NULL THEN NULL ELSE i.indrelid::regclass::text END,
  'indexUnique',i.indisunique,'indexPrimary',i.indisprimary,'indexExclusion',i.indisexclusion,
  'indexValid',i.indisvalid,'indexReady',i.indisready,'indexLive',i.indislive)),'{}'::jsonb)
  FROM pg_class c LEFT JOIN pg_index i ON i.indexrelid=c.oid
  WHERE c.relnamespace='saas'::regnamespace AND c.relkind IN('r','p','i','I','S','v','m','f')),
 'triggers',(SELECT coalesce(jsonb_object_agg(c.oid::regclass::text||'.'||t.tgname,jsonb_build_object(
  'oid',t.oid::text,'function',t.tgfoid::regprocedure::text,'enabled',t.tgenabled,'internal',t.tgisinternal,
  'type',t.tgtype,'constraintOid',t.tgconstraint::text,'deferrable',t.tgdeferrable,'initiallyDeferred',t.tginitdeferred,
  'definition',pg_get_triggerdef(t.oid),'hash',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))),'{}'::jsonb)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='saas'::regnamespace),
 'policies',(SELECT coalesce(jsonb_object_agg(c.oid::regclass::text||'.'||p.polname,jsonb_build_object(
  'oid',p.oid::text,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',(SELECT jsonb_agg(CASE WHEN r.role_oid=0 THEN 'public' ELSE pg_get_userbyid(r.role_oid) END ORDER BY CASE WHEN r.role_oid=0 THEN 'public' ELSE pg_get_userbyid(r.role_oid) END) FROM unnest(p.polroles) AS r(role_oid)),
  'using',pg_get_expr(p.polqual,p.polrelid),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid))),'{}'::jsonb)
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='saas'::regnamespace)
)`;
 writeFileSync('/tmp/toshi-public-test289-catalog-before.json',JSON.stringify(j("BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_owner;SET LOCAL search_path=pg_catalog;"+catalogSql+";ROLLBACK;")),{mode:0o600});
 sql(read(migration+'.up.sql'));
 check('guest creator is operator-only and native tables remain private',()=>{
  assert.equal(sql("SELECT to_regprocedure('saas.platform_checkout_public_test_create(timestamptz,uuid,text,text,text)')IS NOT NULL"),'t');
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.platform_checkout_public_test_create(clock_timestamp(),'${id(300)}','public-1','${hash('session300')}','${hash('ip300')}')`),/permission denied/);
  for(const table of ['platform_checkout_public_test_limits289','platform_checkout_public289_predecessors'])assert.throws(()=>sql(`SET ROLE celebix_saas_platform_operator;SELECT *FROM saas.${table}`),/permission denied/);
 });
 const NOW=sql('SELECT saas.merchant_admin_timestamp(clock_timestamp())');
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://fixture289.example.test','buyer289','buyer289@example.test',true,'${NOW}','${NOW}');
 ${Array.from({length:6},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Public fixture ${n}','${n===5?'123':'public-'+n}','${n===4?'suspended':'active'}','tr','TRY','starter','${NOW}','${NOW}');INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${plan(n).id}','${plan(n).code}',${plan(n).version},'active','${NOW}','${NOW}','${NOW}');`;}).join('')}
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(1002)}','${P}','${id(2)}','store_owner','active','${NOW}','${NOW}');
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at)VALUES('${id(9001)}','${id(1)}','gift.example.test','custom_domain','active',true,'${NOW}','${NOW}','${NOW}'),('${id(9002)}','${id(1)}','unverified.example.test','custom_domain','pending',false,NULL,'${NOW}','${NOW}');`);
 const principalsBefore=sql('SELECT count(*)FROM saas.principals'),membershipsBefore=sql('SELECT count(*)FROM saas.memberships');
 const created=pub('public-1',400),order=orderOf(created);
 check('a guest with no membership creates exactly one credit at one TRY without any access grant',()=>{
  assert.equal(created.outcome,'created');assert.equal(order.netCents,83);assert.equal(order.vatCents,17);assert.equal(order.totalCents,100);assert.equal(order.offerId,'toshi-test-1');assert.equal(balance(1),0);
  assert.equal(sql(`SELECT count(*)FROM saas.memberships WHERE store_id='${id(1)}'`),'0');assert.equal(sql('SELECT count(*)FROM saas.principals'),principalsBefore);assert.equal(sql('SELECT count(*)FROM saas.memberships'),membershipsBefore);
  assert.equal(sql(`SELECT public_test_purchase AND principal_id IS NULL AND membership_id IS NULL FROM saas.platform_checkout_orders WHERE id='${order.orderId}'`),'t');
  assert.equal(sql(`SELECT principal_id IS NULL AND redeemed_at=created_at AND session_expires_at=created_at+interval '24 hours'FROM saas.platform_checkout_intents WHERE operation_id='${id(400)}'`),'t');
  assert.equal(machine('read',{orderId:order.orderId,sessionDigest:hash('session400')}).outcome,'found');assert.equal(machine('read',{orderId:order.orderId,sessionDigest:hash('foreign-session')}).outcome,'not_found');
 });
 check('same operation and browser session replay without new order or rate consumption; changed recipient/session cannot replay',()=>{
  const count=sql('SELECT count(*)FROM saas.platform_checkout_public_test_limits289');
  const replay=pub('public-1',400,{ip:hash('network-changed')});assert.equal(replay.outcome,'operation_replayed');assert.equal(orderOf(replay).orderId,order.orderId);assert.equal(sql('SELECT count(*)FROM saas.platform_checkout_public_test_limits289'),count);
  assert.equal(pub('public-2',400).outcome,'operation_mismatch');assert.equal(pub('public-1',400,{session:hash('foreign-session')}).outcome,'operation_mismatch');
 });
 check('verified domain and digit-leading public slugs resolve while inactive, free and unverified recipients fail closed',()=>{
  const domain=pub('gift.example.test',401);assert.equal(domain.outcome,'created');assert.equal(orderOf(domain).storeId,id(1));
  const digits=pub('123',402);assert.equal(digits.outcome,'created');assert.equal(orderOf(digits).storeId,id(5));
  for(const[selector,n]of [['unknown',403],['public-3',404],['public-4',405],['unverified.example.test',406]])assert.equal(pub(selector,n).outcome,'store_unavailable');
  for(const[selector,n]of [['https://gift.example.test/',407],['PUBLIC-1',408],['gift.example.test:80',409]])assert.equal(pub(selector,n).outcome,'invalid_input');
 });
 const proof=payment(order.orderId,400,100,true);
 check('no unverified, wrong amount, pending or crossed-order proof grants a public credit',()=>{
  assert.equal(machine('finish',{...proof,paidPriceCents:1}).outcome,'payment_mismatch');assert.equal(machine('finish',{...proof,basketId:id(2)}).outcome,'payment_mismatch');assert.equal(balance(1),0);
  assert.equal(machine('finish',{...proof,status:'pending',fraudStatus:0,proofDigest:hash('pending400')}).outcome,'pending');assert.equal(balance(1),0);
 });
 const responses=await Promise.all([asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`),asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('finish',${json(proof)})r`)]);
 check('two simultaneous verified callbacks atomically credit exactly once and mint no merchant identity',()=>{
  assert.deepEqual(responses.map(r=>r.outcome).sort(),['fulfilled','operation_replayed']);assert.equal(balance(1),1);assert.equal(machine('finish',proof).outcome,'operation_replayed');
  assert.equal(sql(`SELECT count(*)FROM saas.toshi_credit_ledger WHERE checkout_order_id='${order.orderId}'AND balance_delta=1 AND event='purchase'`),'1');assert.equal(sql('SELECT count(*)FROM saas.principals'),principalsBefore);assert.equal(sql('SELECT count(*)FROM saas.memberships'),membershipsBefore);
 });
 const guest2=pub('public-2',410),authenticated=checkout(2,411),authOrder=authenticated.result_payload;
 check('public pending purchases never replace or block authenticated orders and old authority remains enforced',()=>{
  assert.equal(guest2.outcome,'created');assert.equal(authenticated.outcome,'created');assert.notEqual(authOrder.orderId,orderOf(guest2).orderId);assert.equal(sql(`SELECT NOT public_test_purchase AND principal_id='${P}'FROM saas.platform_checkout_orders WHERE id='${authOrder.orderId}'`),'t');
  assert.equal(machine('finish',payment(authOrder.orderId,411,100)).outcome,'fulfilled');assert.equal(balance(2),1);
  assert.equal(checkout(1,412).outcome,'membership_denied');assert.equal(checkout(2,410).outcome,'operation_mismatch');
  const old=checkout(2,413,'toshi-500');assert.equal(old.outcome,'created');assert.equal(old.result_payload.totalCents,29880);assert.equal(machine('finish',payment(old.result_payload.orderId,413,29880)).outcome,'fulfilled');assert.equal(balance(2),501);
 });
 check('schema disallows null merchant actors, alternate guest SKUs and guest intents on authenticated orders',()=>{
  const clone=changes=>`INSERT INTO saas.platform_checkout_orders SELECT(jsonb_populate_record(NULL::saas.platform_checkout_orders,to_jsonb(o)||${json(changes)})).*FROM saas.platform_checkout_orders o WHERE id='${orderOf(guest2).orderId}'`;
  assert.throws(()=>sql('SET ROLE celebix_saas_owner;'+clone({id:id(500),public_test_purchase:false})),/platform_checkout_public_actor289/);
  assert.throws(()=>sql('SET ROLE celebix_saas_owner;'+clone({id:id(501),offer_id:'toshi-500'})),/platform_checkout_public_actor289/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;UPDATE saas.platform_checkout_orders SET public_test_purchase=false WHERE id='${orderOf(guest2).orderId}'`),/IMMUTABLE/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_intents SELECT(jsonb_populate_record(NULL::saas.platform_checkout_intents,to_jsonb(t)||${json({operation_id:id(502),order_id:authOrder.orderId,store_id:id(2),handoff_digest:hash('forged-handoff'),session_digest:hash('forged-session')})})).*FROM saas.platform_checkout_intents t WHERE operation_id='${id(410)}'`),/MERCHANT_ACTOR_REQUIRED/);
 });
 check('recipient deactivation prevents payment start and a verified late payment remains in review without credit',()=>{
  const r=pub('public-6',420),o=orderOf(r);assert.equal(r.outcome,'created');
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.stores SET status='suspended'WHERE id='${id(6)}'`);
  assert.equal(machine('begin',{orderId:o.orderId,sessionDigest:hash('session420'),attemptId:id(10420),requestDigest:hash('request420'),sealedBuyer:seal}).outcome,'membership_denied');
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.stores SET status='active'WHERE id='${id(6)}'`);const late=payment(o.orderId,420,100,true);sql(`SET ROLE celebix_saas_owner;UPDATE saas.stores SET status='suspended'WHERE id='${id(6)}'`);
  assert.equal(machine('finish',late).outcome,'paid_review');assert.equal(balance(6),0);
 });
 check('rolling IP rate reservations commit even for unknown recipients and replay does not spend budget',()=>{
  const ip=hash('limited-ip');for(let n=600;n<630;n++)assert.equal(pub('unknown',n,{ip}).outcome,'store_unavailable');
  assert.equal(pub('unknown',630,{ip}).outcome,'rate_limited');assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_public_test_limits289 WHERE ip_digest='${ip}'`),'30');
  assert.equal(pub('public-1',400,{ip}).outcome,'operation_replayed');
 });
 sql(`SET ROLE celebix_saas_owner;DELETE FROM saas.platform_checkout_public_test_limits289;INSERT INTO saas.platform_checkout_public_test_limits289(ip_digest,created_at)SELECT encode(sha256(convert_to(i::text,'UTF8')),'hex'),clock_timestamp()FROM generate_series(1,299)i`);
 const rateRace=await Promise.all([asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_public_test_create(clock_timestamp(),'${id(700)}','unknown','${hash('session700')}','${hash('race-ip1')}')r`),asyncSql(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_public_test_create(clock_timestamp(),'${id(701)}','unknown','${hash('session701')}','${hash('race-ip2')}')r`)]);
 check('simultaneous public requests cannot exceed the durable global rolling budget',()=>{assert.deepEqual(rateRace.map(r=>r.outcome).sort(),['rate_limited','store_unavailable']);assert.equal(sql('SELECT count(*)FROM saas.platform_checkout_public_test_limits289'),'300');});
 check('only the three reviewed legacy functions change and their identities, ACLs and old financial contracts remain intact',()=>{
  const after=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'hash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl::text))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
  const changed=['saas.platform_checkout_create(','saas.platform_checkout_fulfill281(','saas.platform_checkout_machine('];
  for(const[signature,old]of Object.entries(before)){assert.equal(after[signature].oid,old.oid,signature);assert.equal(after[signature].acl,old.acl,signature);if(!changed.some(prefix=>signature.startsWith(prefix)))assert.equal(after[signature].definition,old.definition,signature);}
  sql(read(migration+'_assertions.sql'));
  assert.throws(()=>sql(read(migration+'.up.sql')),/ALREADY_APPLIED_OR_DRIFT/);assert.throws(()=>sql(read(migration+'.down.sql')),/PUBLIC_TEST289_FORWARD_ONLY/);
 });
 writeFileSync('/tmp/toshi-public-test289-after.json',JSON.stringify(j("BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_owner;SET LOCAL search_path=pg_catalog;"+catalogSql+";ROLLBACK;")),{mode:0o600});
 console.log(JSON.stringify({passed:checks,externalCalls:0,livePayments:0,postgresMajor:16}));
}finally{pg.stop();}
