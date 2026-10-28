import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const dir=path.resolve(import.meta.dirname),migration='202610270285_toshi_product_quality_lease';
const pg=startDisposablePostgres({database:'toshi_quality_lease285'}),{sql}=pg;
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=s=>`'${String(s).replaceAll("'","''")}'`,json=v=>`${lit(JSON.stringify(v))}::jsonb`,j=q=>JSON.parse(sql(q));
const id=n=>`28500000-0000-4000-8000-${String(n).padStart(12,'0')}`,P=id(100),PLAN='00000000-0000-4000-8000-000000000010',SOURCE='b'.repeat(64),FP='a'.repeat(64);
let NOW;
const signature='saas.content_authoring_claim(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint)';
const after=n=>new Date(Date.parse(NOW)+n*1000).toISOString();
const auth=(store,time=NOW,extra={})=>`'${id(store)}','${extra.principal??P}','${extra.member??id(1000+store)}','${PLAN}','professional',${extra.planVersion??2},'${time}'`;
const invoke=(name,store,extra,time=NOW,options={})=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.content_authoring_${name}(${auth(store,time,options)},${extra})r`);
const begin=(store,n,prompt='toshi-product-v10',provider='deepseek',model='deepseek-flash',time=NOW)=>invoke('begin_shared',store,`'${id(n)}','${FP}','${id(9000+store)}',NULL,'${SOURCE}','${id(2000+store)}','${provider}','${model}',1,'${prompt}'`,time);
const claim=(store,n,version=1,time=NOW,options={})=>invoke('claim',store,`'${id(n)}',${version}`,time,options);
const get=(store,n,time=NOW)=>invoke('get',store,`'${id(n)}'`,time);
const leaseSeconds=result=>(Date.parse(result.result_payload.leaseExpiresAt)-Date.parse(NOW))/1000;
const catalog=()=>j("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef,'oid',p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=284&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 // Revision248 publishes tariffs at database time. Anchor the logical test clock
 // after that publication once; all lease boundary offsets remain deterministic.
 const fixtureClock=j(`SELECT jsonb_build_object('publishedAt',valid_from,'now',date_trunc('milliseconds',greatest(clock_timestamp(),valid_from))+interval '1 second')FROM saas.plans WHERE id='${PLAN}'`);
 NOW=fixtureClock.now;assert.ok(Date.parse(NOW)>Date.parse(fixtureClock.publishedAt));
 const before=catalog(),original=before[signature];assert.ok(original,'exact claim identity exists');
 assert.equal(createHash('md5').update(original.definition).digest('hex'),'e51b56bcf1f2f62a7ff555dc1dabbae3','native baseline matches reviewed production claim');
 if(!process.argv.includes('--baseline-red')){sql(read(migration+'.up.sql'));sql(read(migration+'.up.sql'));sql(read(migration+'_assertions.sql'));}
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://lease285.example.test','staff285','staff285@example.test',true,'2026-01-01','2026-01-01');
 ${Array.from({length:14},(_,i)=>{const n=i+1;return`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Lease ${n}','lease-${n}','active','tr','TRY','starter','2026-01-01','2026-01-01');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(1000+n)}','${P}','${id(n)}','store_owner','active','2026-01-01','2026-01-01');INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(3000+n)}','${id(n)}','${PLAN}','professional',2,'active','2026-01-01','2026-01-01','2026-01-01');INSERT INTO saas.toshi_provider_configs(id,store_id,provider,sealed_credentials,credential_digest,credential_version,masked_key,selected_model,available_models,status,is_default,version,verified_at,created_at,updated_at)VALUES('${id(2000+n)}','${id(n)}','deepseek','{"algorithm":"A256GCM","ciphertext":"Y3JlZGVudGlhbA","iv":"MTIzNDU2Nzg5MDEy","keyId":"native-test-only","tag":"MTIzNDU2Nzg5MDEyMzQ1Ng","version":1}','sha256:${FP}',1,'••••oshi','deepseek-flash','[{"id":"deepseek-flash","label":"Toshi"}]','active',false,1,'2026-01-01','2026-01-01','2026-01-01');`;}).join('')}`);
 check('trusted quality profile keeps begin60 but receives claim120 without another version change',()=>{
  assert.equal(begin(14,4014,'toshi-product-v10','deepseek','deepseek-flash',new Date(Date.parse(fixtureClock.publishedAt)-1).toISOString()).outcome,'durable_authority_invalid','a request before tariff publication remains unauthorized');
  const pending=begin(1,4001);assert.equal(pending.outcome,'pending');assert.equal(leaseSeconds(pending),60);
  const claimed=claim(1,4001);assert.equal(claimed.outcome,'claimed');assert.equal(leaseSeconds(claimed),120);assert.equal(claimed.result_payload.version,2);assert.equal(claimed.result_payload.dispatchState,'dispatched');assert.ok(claimed.result_payload.claimToken);
 });
 check('pending at80 survives admission and retries cannot extend or redispatch',()=>{
  const observed=get(1,4001,after(80));assert.equal(observed.result_payload.status,'pending');assert.equal(leaseSeconds(observed),120);
  assert.equal(begin(1,4001,'toshi-product-v10','deepseek','deepseek-flash',after(80)).outcome,'existing-status');
  assert.equal(begin(1,4999,'toshi-product-v10','deepseek','deepseek-flash',after(80)).outcome,'operation_busy');
  assert.equal(claim(1,4001,1,after(80)).outcome,'version_conflict');assert.equal(claim(1,4001,2,after(80)).outcome,'dispatch_already_claimed');assert.equal(leaseSeconds(get(1,4001,after(80))),120);
 });
 check('quality output completes at80 and completed replay keeps its original claim identity',()=>{
  const token=get(1,4001,after(80)).result_payload.claimToken,draft={seoTitle:'Ürün',suggestions:[],claims:[],sourceFingerprint:SOURCE};
  const completed=invoke('complete',1,`'${id(4001)}','${token}',2,${json(draft)},'null'::jsonb`,after(80));assert.equal(completed.outcome,'completed');assert.equal(completed.result_payload.status,'completed');
  assert.equal(begin(1,4001,'toshi-product-v10','deepseek','deepseek-flash',after(90)).outcome,'replayed-result');assert.equal(claim(1,4001,3,after(90)).outcome,'version_conflict');assert.equal(get(1,4001,after(90)).result_payload.claimToken,token);
 });
 check('quality claim expires exactly at120 and never becomes dispatchable again',()=>{
  assert.equal(begin(2,4002).outcome,'pending');assert.equal(claim(2,4002).outcome,'claimed');assert.equal(get(2,4002,after(119.999)).result_payload.status,'pending');
  const expired=get(2,4002,after(120));assert.equal(expired.result_payload.status,'unknown');assert.equal(expired.result_payload.safeCode,'provider_timeout');assert.equal(claim(2,4002,3,after(121)).outcome,'version_conflict');assert.equal(begin(2,4002,'toshi-product-v10','deepseek','deepseek-flash',after(121)).outcome,'existing-status');
 });
 check('legacy prompt retains claim60 and expires before80',()=>{
  assert.equal(begin(3,4003,'toshi-product-v9').outcome,'pending');assert.equal(leaseSeconds(claim(3,4003)),60);assert.equal(get(3,4003,after(60)).result_payload.status,'unknown');
 });
 check('wrong model and provider tuples retain claim60',()=>{
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.toshi_provider_configs SET selected_model='deepseek-v4-pro',available_models='[{"id":"deepseek-v4-pro","label":"Other"}]'WHERE id='${id(2004)}';UPDATE saas.toshi_provider_configs SET provider='openai'WHERE id='${id(2005)}'`);
  assert.equal(begin(4,4004,'toshi-product-v10','deepseek','deepseek-v4-pro').outcome,'pending');assert.equal(leaseSeconds(claim(4,4004)),60);
  assert.equal(begin(5,4005,'toshi-product-v10','openai','deepseek-flash').outcome,'pending');assert.equal(leaseSeconds(claim(5,4005)),60);
 });
 check('authority, cross-store isolation and optimistic version guards run before extension',()=>{
  assert.equal(begin(6,4006).outcome,'pending');assert.equal(claim(6,4006,1,NOW,{member:id(1007)}).outcome,'membership_denied');assert.equal(claim(6,4006,1,NOW,{planVersion:1}).outcome,'durable_authority_invalid');assert.equal(claim(7,4006).outcome,'operation_not_found');assert.equal(claim(6,4006,999).outcome,'version_conflict');
  const pending=get(6,4006);assert.equal(pending.result_payload.dispatchState,'not_dispatched');assert.equal(leaseSeconds(pending),60);assert.equal(leaseSeconds(claim(6,4006)),120);
 });
 check('revoked credentials, changed credential version and unavailable models remain rejected',()=>{
  for(const n of[8,9,10])assert.equal(begin(n,4000+n).outcome,'pending');
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.toshi_provider_configs SET status='revoked',revoked_at='${NOW}'WHERE id='${id(2008)}';UPDATE saas.toshi_provider_configs SET credential_version=2 WHERE id='${id(2009)}';UPDATE saas.toshi_provider_configs SET selected_model='deepseek-v4-pro',available_models='[{"id":"deepseek-v4-pro","label":"Other"}]'WHERE id='${id(2010)}'`);
  for(const[n,want]of[[8,'connection_revoked'],[9,'credential_invalid'],[10,'model_unavailable']]){assert.equal(claim(n,4000+n).outcome,want);assert.equal(leaseSeconds(get(n,4000+n)),60);}
 });
 check('app-only ACL, exact function identity and every other native routine remain unchanged',()=>{
  const current=catalog(),changed=current[signature];for(const key of['owner','acl','config','securityDefiner','oid'])assert.deepEqual(changed[key],original[key],key);
  for(const[sig,definition]of Object.entries(before))if(sig!==signature)assert.deepEqual(current[sig],definition,sig);
  for(const role of['celebix_saas_platform_operator','celebix_saas_workflow','celebix_saas_host_resolver'])assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM saas.content_authoring_claim(${auth(7)},'${id(4999)}',1)`),/permission denied/);
  assert.throws(()=>sql('SET ROLE celebix_saas_app;SELECT *FROM saas.content_authoring_operations'),/permission denied/);
 });
 check('unknown body and broadened ACL block both migration directions',()=>{
  const wrapper=catalog()[signature].definition;
  sql(`SET ROLE celebix_saas_owner;${wrapper.replace("transition_result.outcome = 'claimed'","transition_result.outcome = 'never-claimed'")}`);
  assert.throws(()=>sql(read(migration+'.up.sql')),/TOSHI_QUALITY_LEASE285_PREDECESSOR_INVALID/);assert.throws(()=>sql(read(migration+'.down.sql')),/TOSHI_QUALITY_LEASE285_PREDECESSOR_INVALID/);sql(`SET ROLE celebix_saas_owner;${wrapper}`);
  sql(`SET ROLE celebix_saas_owner;GRANT EXECUTE ON FUNCTION ${signature} TO celebix_saas_workflow`);assert.throws(()=>sql(read(migration+'.up.sql')),/TOSHI_QUALITY_LEASE285_METADATA_INVALID/);assert.throws(()=>sql(read(migration+'.down.sql')),/TOSHI_QUALITY_LEASE285_METADATA_INVALID/);sql(`SET ROLE celebix_saas_owner;REVOKE EXECUTE ON FUNCTION ${signature} FROM celebix_saas_workflow`);
 });
 check('down twice restores exact predecessor and keeps already-issued120s claim safe',()=>{
  sql(read(migration+'.down.sql'));sql(read(migration+'.down.sql'));assert.deepEqual(catalog(),before);assert.equal(leaseSeconds(get(6,4006,after(80))),120);
  assert.equal(begin(11,4011).outcome,'pending');assert.equal(leaseSeconds(claim(11,4011)),60);
 });
 check('up after rollback restores opt-in behavior with unchanged native metadata',()=>{
  sql(read(migration+'.up.sql'));sql(read(migration+'_assertions.sql'));assert.equal(begin(12,4012).outcome,'pending');assert.equal(leaseSeconds(claim(12,4012)),120);
 });
 console.log(JSON.stringify({passed:checks,externalCalls:0,liveDatabaseConnections:0,postgresMajor:16}));
}finally{pg.stop();}
