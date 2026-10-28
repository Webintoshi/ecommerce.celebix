import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync}from'node:fs';
import path from 'node:path';
import {createHash}from'node:crypto';
import {spawn}from'node:child_process';
import {applyBaseline}from'../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres}from'../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const dir=path.resolve(import.meta.dirname),migration='202610280287_store_tool_manual_release',pg=startDisposablePostgres({database:'store_tool_manual287'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28700000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=v=>createHash('sha256').update(String(v)).digest('hex');
const P=id(100),HUMAN=id(9000),HP=id(9001),FREE='00000000-0000-4000-8000-000000000007',reason='Customer explicitly confirmed this legacy request was never paid.';
const signature='saas.platform_tool_purchase_released282(uuid,uuid)',rpc='saas.platform_tool_purchase_manual_release287(uuid,uuid,uuid,bigint,uuid,text,boolean)';
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'definer',p.prosecdef,'volatility',p.provolatile,'oid',p.oid,'strict',p.proisstrict,'parallel',p.proparallel,'language',p.prolang))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
const app=expr=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr}r`),auth=s=>`'${id(s)}','${P}','${id(s+1000)}','${FREE}','free_starter',3,clock_timestamp()`;
const manual=(s,n,offer='all_tools')=>{const quote=sql(`SELECT quote_fingerprint FROM saas.store_tool_offers WHERE id='${offer}'`);return app(`saas.store_tool_purchase_request(${auth(s)},'${id(n)}','${offer}','${quote}')`);};
const checkout=(s,n,offer='all_tools')=>app(`saas.platform_checkout_create(${auth(s)},'${id(n)}',${json({kind:'tool',offerId:offer,term:'once'})},'${hash('handoff'+n)}')`);
const releaseSql=(s,n,op,options={})=>`SET ROLE celebix_saas_owner;SELECT saas.platform_tool_purchase_manual_release287('${options.operator??HUMAN}','${id(s)}','${id(n)}',${options.version??1},'${id(op)}',${lit(options.reason??reason)},${options.unpaid===false?'false':options.unpaid===null?'NULL':'true'})`;
const release=(s,n,op,options)=>j(releaseSql(s,n,op,options));
const purchase=(s,n)=>sql(`SELECT to_jsonb(p)FROM saas.store_tool_purchases p WHERE store_id='${id(s)}'AND id='${id(n)}'`);
const linked=(s,n)=>j(`SELECT coalesce(jsonb_agg(id ORDER BY id),'[]')FROM saas.platform_checkout_orders WHERE store_id='${id(s)}'AND tool_purchase_id='${id(n)}'`);
const age=order=>sql(`BEGIN;SET LOCAL session_replication_role=replica;UPDATE saas.platform_checkout_orders SET created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days',updated_at=updated_at-interval '2 days'WHERE id='${order}';COMMIT;`);
const seal=JSON.stringify({v:1,iv:'A'.repeat(16),tag:'A'.repeat(22),ciphertext:'AA'});
const machine=(action,args)=>j(`SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine(${lit(action)},${json(args)})r`);
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error(err));const lines=out.split('\n').filter(v=>v.startsWith('{'));resolve(JSON.parse(lines.at(-1)));});child.stdin.end(source);});
const waitHeld=async(name,event='PgSleep')=>{for(let n=0;n<80;n++){if(sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${lit(name)}AND wait_event=${lit(event)})`)==='t')return;await new Promise(r=>setTimeout(r,25));}throw Error('isolated lock holder not ready');};
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=286&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=catalog();assert.equal(hash(before[signature].definition),'f84a1f5143f737d31eef9bf5874f782b4fefc57c84cd5dbd19df1328c7883244');
 if(existsSync(path.join(dir,migration+'.up.sql')))sql(read(migration+'.up.sql'));
 assert.notEqual(sql(`SELECT coalesce(to_regprocedure('${rpc}')::text,'')`),'','owner-only manual release RPC must exist');
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;UPDATE saas.commercial248_release_state SET enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://manual287.test','buyer','buyer287@example.test',true,clock_timestamp(),clock_timestamp()),('${HP}','https://manual287.test','operator','sdkahmetcelebi@icloud.com',true,clock_timestamp(),clock_timestamp());
 INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active)VALUES('${HUMAN}','https://manual287.test','operator','${HP}','sdkahmetcelebi@icloud.com',true);
 ${Array.from({length:35},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Manual ${n}','manual-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(n+1000)}','${P}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(n+2000)}','${id(n)}','${FREE}','free_starter',3,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`;}).join('')}`);
 check('an attested unpaid legacy bundle releases overlap without rewriting its purchase or another store',()=>{
  assert.equal(manual(1,4001).outcome,'ok');assert.equal(manual(2,4002).outcome,'ok');const old=purchase(1,4001),other=purchase(2,4002);
  assert.equal(checkout(1,5001,'restock').outcome,'purchase_pending');const result=release(1,4001,6001);assert.equal(result.released,true);assert.equal(result.replayed,false);
  assert.equal(purchase(1,4001),old);assert.equal(purchase(2,4002),other);assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(1)}','${id(4001)}')`),'t');assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(2)}','${id(4002)}')`),'f');
  assert.equal(checkout(1,5002,'restock').outcome,'created');assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_origins282 WHERE purchase_id='${id(4001)}'`),'0');
  assert.equal(sql(`SELECT count(*)FROM saas.store_tool_receipts WHERE store_id='${id(1)}'`),'0');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_effective_licenses('${id(1)}',clock_timestamp())`),'0');
 });
 check('exact replay is stable and all identity, version, reason and attestation mismatches fail',()=>{
  assert.equal(release(1,4001,6001).replayed,true);for(const options of[{version:2},{reason:'Different reason'},{unpaid:false},{unpaid:null}])assert.throws(()=>release(1,4001,6001,options),/operation_mismatch|invalid_input/);
  assert.throws(()=>release(2,4002,6001),/operation_mismatch/);assert.throws(()=>release(1,4001,6002),/already_released/);assert.equal(sql('SELECT count(*)FROM saas.store_tool_manual_releases287'),'1');
 });
 check('false, null or empty unpaid authorization and wrong store, version or operator never release',()=>{
  assert.equal(manual(3,4003).outcome,'ok');for(const options of[{unpaid:false},{unpaid:null},{reason:''},{reason:' '},{reason:'bad\nreason'}])assert.throws(()=>release(3,4003,6003,options),/invalid_input/);
  assert.throws(()=>release(4,4003,6003),/record_not_found/);assert.throws(()=>release(3,4003,6003,{version:2}),/version_conflict/);assert.throws(()=>release(3,4003,6003,{operator:id(9999)}),/operator_denied/);assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(3)}','${id(4003)}')`),'f');
  assert.throws(()=>sql(`BEGIN;SET ROLE celebix_saas_owner;UPDATE saas.platform_operators SET active=false WHERE id='${HUMAN}';${releaseSql(3,4003,6003)};COMMIT;`),/operator_denied/);
 });
 check('a past-deadline linked legacy quote expires with audit while original intent and purchase remain exact',()=>{
  assert.equal(manual(4,4004).outcome,'ok');const quote=checkout(4,5004),order=quote.result_payload.orderId;assert.equal(quote.outcome,'created');age(order);const old=purchase(4,4004),intent=sql(`SELECT to_jsonb(t)FROM saas.platform_checkout_intents t WHERE order_id='${order}'`);
  release(4,4004,6004);assert.equal(purchase(4,4004),old);assert.equal(sql(`SELECT to_jsonb(t)FROM saas.platform_checkout_intents t WHERE order_id='${order}'`),intent);assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'expired');assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_audit WHERE order_id='${order}'AND action='quote_expired'AND actor_kind='machine'`),'1');assert.equal(checkout(4,5004).outcome,'checkout_expired');assert.equal(checkout(4,5104,'restock').outcome,'created');
 });
 check('a live quote and prospective282 provenance remain protected',()=>{
  manual(5,4005);assert.equal(checkout(5,5005).outcome,'created');assert.throws(()=>release(5,4005,6005),/quote_live/);
  const fresh=checkout(6,5006),pid=sql(`SELECT tool_purchase_id FROM saas.platform_checkout_orders WHERE id='${fresh.result_payload.orderId}'`);age(fresh.result_payload.orderId);assert.throws(()=>j(releaseSql(6,4006,6006).replace(id(4006),pid)),/provenance/);
 });
 for(const[ordinal,status]of ['initializing','ready','unknown','pending','approved','failed','paid_review'].entries())check(`ANY ${status} provider attempt prevents manual release`,()=>{
  const s=7+ordinal,n=4000+s;manual(s,n);const quote=checkout(s,5000+s),order=quote.result_payload.orderId;age(order);
  sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,created_at,updated_at)VALUES('${id(7000+s)}','${order}','${hash('attempt'+s)}','${status}',${json(seal)},clock_timestamp(),clock_timestamp())`);
  assert.throws(()=>release(s,n,6000+s),/provider_attempt/);assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'pending');
 });
 check('receipts, settled purchases and relevant effective licenses prevent release',()=>{
  manual(14,4014);sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.store_tool_receipts(store_id,purchase_id,amount_cents,method,reference,reason,operator_id)SELECT store_id,id,total_cents,'cash','receipt287','Native proof','${HUMAN}'FROM saas.store_tool_purchases WHERE store_id='${id(14)}'AND id='${id(4014)}'`);assert.throws(()=>release(14,4014,6014),/receipt/);
  manual(15,4015);j(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${HUMAN}','${id(4015)}',1,'settled287',${json({storeId:id(15),amountCents:1678800,method:'cash',reference:'settled287',reason:'Verified native receipt'})})`);assert.throws(()=>release(15,4015,6015),/not_pending/);
  manual(16,4016);sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.store_tool_licenses(store_id,tool_key,source,granted_at)VALUES('${id(16)}','restock','grandfathered',clock_timestamp())`);assert.throws(()=>release(16,4016,6016),/licensed/);
 });
 check('closed legacy requests disappear from projections and cannot settle through the existing operator RPC',()=>{
  const w=app(`saas.store_tool_workspace_read(${auth(4)})`).result_payload;assert.ok(!w.purchases.some(p=>p.id===id(4004)));
  const receipt={storeId:id(4),amountCents:1678800,method:'cash',reference:'closed287',reason:'Must not settle'};assert.throws(()=>sql(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${HUMAN}','${id(4004)}',1,'closed287',${json(receipt)})`),/record_not_found/);
 });
 check('ALL linked quotes must be overdue and only the target legacy purchase is expired',()=>{
  manual(21,4021);const first=checkout(21,5021).result_payload.orderId;age(first);const second=checkout(21,5121).result_payload.orderId;assert.notEqual(first,second);assert.equal(linked(21,4021).length,2);
  assert.throws(()=>release(21,4021,6021),/quote_live/);const other=checkout(22,5022,'contact_widget').result_payload.orderId;age(other);age(second);
  release(21,4021,6021);assert.equal(sql(`SELECT bool_and(status='expired')FROM saas.platform_checkout_orders WHERE store_id='${id(21)}'AND tool_purchase_id='${id(4021)}'`),'t');assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${other}'`),'pending','an unrelated store quote is untouched');
 });
 check('past-deadline paid-review and fulfilled quotes cannot be manually declared unpaid',()=>{
  for(const[s,status]of[[23,'paid_review'],[24,'fulfilled']]){manual(s,4000+s);const order=checkout(s,5000+s).result_payload.orderId;age(order);sql(`BEGIN;SET LOCAL session_replication_role=replica;UPDATE saas.platform_checkout_orders SET status='${status}'WHERE id='${order}';COMMIT;`);assert.throws(()=>release(s,4000+s,6000+s),/quote_not_unpaid/);}
 });
 check('existing prospective282 automatic expiry policy remains unchanged',()=>{
  const order=checkout(25,5025,'contact_widget').result_payload.orderId;age(order);const pid=sql(`SELECT tool_purchase_id FROM saas.platform_checkout_orders WHERE id='${order}'`);sql(`SET ROLE celebix_saas_owner;INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,created_at,updated_at)VALUES('${id(7025)}','${order}','${hash('attempt25')}','failed',${json(seal)},clock_timestamp(),clock_timestamp())`);
  assert.equal(checkout(25,5125,'all_tools').outcome,'created');assert.equal(sql(`SELECT count(*)FROM saas.platform_tool_purchase_releases282 WHERE store_id='${id(25)}'AND purchase_id='${pid}'`),'1');assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(25)}','${pid}')`),'t');assert.equal(sql(`SELECT count(*)FROM saas.store_tool_manual_releases287 WHERE store_id='${id(25)}'`),'0');
 });
 check('only the private owner RPC can append and released audit rows cannot change or disappear',()=>{
  for(const role of ['celebix_saas_app','celebix_saas_platform_operator','celebix_saas_workflow','celebix_saas_host_resolver']){assert.throws(()=>sql(releaseSql(3,4003,6003).replace('SET ROLE celebix_saas_owner',`SET ROLE ${role}`)),/permission denied/);assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM saas.store_tool_manual_releases287`),/permission denied/);}
  assert.throws(()=>sql('SET ROLE celebix_saas_owner;UPDATE saas.store_tool_manual_releases287 SET reason=reason'),/PLATFORM_APPEND_ONLY/);assert.throws(()=>sql('SET ROLE celebix_saas_owner;DELETE FROM saas.store_tool_manual_releases287'),/PLATFORM_APPEND_ONLY/);assert.throws(()=>sql('SET ROLE celebix_saas_owner;TRUNCATE saas.store_tool_manual_releases287'),/PLATFORM_APPEND_ONLY/);
 });
 {
  manual(17,4017);const order=checkout(17,5017).result_payload.orderId;
  assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff5017'),sessionDigest:hash('session5017')}).outcome,'redeemed');
  sql(`BEGIN;SET LOCAL session_replication_role=replica;WITH t AS(SELECT clock_timestamp()+interval '1 second'deadline)UPDATE saas.platform_checkout_orders SET expires_at=t.deadline,created_at=t.deadline-interval '24 hours',updated_at=t.deadline-interval '24 hours'FROM t WHERE id='${order}';COMMIT;`);
  const holder=asyncSql(`BEGIN;SET LOCAL application_name='manual287-release-holder';SET ROLE celebix_saas_owner;INSERT INTO saas.platform_store_versions(store_id)VALUES('${id(17)}')ON CONFLICT DO NOTHING;SELECT 1 FROM saas.platform_store_versions WHERE store_id='${id(17)}'FOR UPDATE;SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.store:${id(17)}',0));SELECT pg_advisory_xact_lock(hashtextextended('saas.store-tools.store:${id(17)}',263));SELECT pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:${id(17)}',256));SELECT pg_advisory_xact_lock(hashtextextended('saas.platform.checkout.order281:${order}',0));SELECT pg_sleep(3);${releaseSql(17,4017,6017)};COMMIT;`);
  await waitHeld('manual287-release-holder');
  const begin=asyncSql(`BEGIN;SET LOCAL application_name='manual287-waiting-begin';SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('begin',${json({orderId:order,sessionDigest:hash('session5017'),attemptId:id(7017),requestDigest:hash('request7017'),sealedBuyer:seal})})r;COMMIT;`);
  await waitHeld('manual287-waiting-begin','advisory');assert.equal(sql(`SELECT query_start<(SELECT expires_at-interval '100 milliseconds'FROM saas.platform_checkout_orders WHERE id='${order}')FROM pg_stat_activity WHERE application_name='manual287-waiting-begin'`),'t','begin must actually enter before the quote deadline');assert.equal((await holder).released,true);assert.equal((await begin).outcome,'already_completed');assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_attempts WHERE order_id='${order}'`),'0');assert.equal(sql(`SELECT status FROM saas.platform_checkout_orders WHERE id='${order}'`),'expired');console.log(`PASS ${++checks} a pre-expiry begin waiting behind release cannot dispatch with its captured stale clock`);
 }
 {
  manual(18,4018);const order=checkout(18,5018).result_payload.orderId;assert.equal(machine('redeem',{orderId:order,handoffDigest:hash('handoff5018'),sessionDigest:hash('session5018')}).outcome,'redeemed');
  sql(`BEGIN;SET LOCAL session_replication_role=replica;WITH t AS(SELECT clock_timestamp()+interval '1 second'deadline)UPDATE saas.platform_checkout_orders SET expires_at=t.deadline,created_at=t.deadline-interval '24 hours',updated_at=t.deadline-interval '24 hours'FROM t WHERE id='${order}';COMMIT;`);
  const beginning=asyncSql(`BEGIN;SET LOCAL application_name='manual287-begin-holder';SET ROLE celebix_saas_platform_operator;SELECT to_jsonb(r)FROM saas.platform_checkout_machine('begin',${json({orderId:order,sessionDigest:hash('session5018'),attemptId:id(7018),requestDigest:hash('request7018'),sealedBuyer:seal})})r;SELECT pg_sleep(3);COMMIT;`);
  await waitHeld('manual287-begin-holder');while(sql(`SELECT clock_timestamp()>expires_at FROM saas.platform_checkout_orders WHERE id='${order}'`)!=='t')await new Promise(r=>setTimeout(r,25));
  const releasing=asyncSql(releaseSql(18,4018,6018));const rejected=assert.rejects(releasing,/provider_attempt_present/);assert.equal((await beginning).outcome,'initialization_claimed');await rejected;assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(18)}','${id(4018)}')`),'f');assert.equal(sql(`SELECT count(*)FROM saas.platform_checkout_attempts WHERE order_id='${order}'`),'1');console.log(`PASS ${++checks} a release waiting behind an uncommitted initialization rereads and rejects the new attempt`);
 }
 {
  manual(19,4019);const settling=asyncSql(`BEGIN;SET LOCAL application_name='manual287-settle-holder';SET ROLE celebix_saas_platform_operator;SELECT saas.platform_tool_purchase_settle('${HUMAN}','${id(4019)}',1,'race-settle287',${json({storeId:id(19),amountCents:1678800,method:'cash',reference:'race-settle287',reason:'Verified native receipt'})});SELECT pg_sleep(2);COMMIT;`);
  await waitHeld('manual287-settle-holder');const releasing=asyncSql(releaseSql(19,4019,6019));const rejected=assert.rejects(releasing,/not_pending/);assert.equal((await settling).ok,true);await rejected;assert.equal(sql(`SELECT saas.platform_tool_purchase_released282('${id(19)}','${id(4019)}')`),'f');console.log(`PASS ${++checks} concurrent verified manual settlement wins safely and cannot be released from a stale read`);
 }
 {
  manual(20,4020);const results=await Promise.all([asyncSql(releaseSql(20,4020,6020)),asyncSql(releaseSql(20,4020,6020))]);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);assert.equal(sql(`SELECT count(*)FROM saas.store_tool_manual_releases287 WHERE store_id='${id(20)}'`),'1');console.log(`PASS ${++checks} simultaneous exact release retries append one durable audit row`);
 }
 check('existing routine identity, ACL and all unrelated function definitions remain unchanged',()=>{
  const after=catalog();for(const[sig,value]of Object.entries(before)){if(sig!==signature)assert.deepEqual(after[sig],value,sig);else for(const key of Object.keys(value).filter(k=>k!=='definition'))assert.deepEqual(after[sig][key],value[key],key);}
  assert.equal(Object.keys(after).length,Object.keys(before).length+1);sql(read(migration+'_assertions.sql'));assert.throws(()=>sql(read(migration+'.down.sql')),/FORWARD_ONLY/);
 });
 console.log(JSON.stringify({passed:checks,externalCalls:0,liveDatabaseConnections:0,postgresMajor:16}));
}finally{pg.stop();}
