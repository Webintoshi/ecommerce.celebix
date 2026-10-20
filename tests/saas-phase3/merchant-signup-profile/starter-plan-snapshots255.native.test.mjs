import {Pool} from 'pg';
import {PostgresSaaSDataRepository} from '../../../packages/saas-data/src/postgres/repository.ts';
import {createStarterTenantService} from '../../../packages/saas-tenant-core/src/create-starter-tenant.ts';
import assert from 'node:assert/strict';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../../..'),dir=path.join(root,'apps/owner/scripts/sql/saas'),bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const temp=mkdtempSync('/tmp/starter-snapshots255-'),data=path.join(temp,'data'),sock=path.join(temp,'socket');mkdirSync(sock);
const port=24000+Math.floor(Math.random()*10000),db='merchant_wa_isolated';
const run=(name,args,input='')=>{const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});if(r.status!==0)throw Error(`${name}: ${r.stderr}`);return r.stdout.trim();};
const args=['-h',sock,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'];
const parallelSql=s=>new Promise((resolve,reject)=>{const c=spawn(path.join(bin,'psql'),args);let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));c.stdin.end(s);});
const sql=s=>run('psql',args,s),j=s=>JSON.parse(sql(s)),lit=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>lit(JSON.stringify(v))+'::jsonb',digest=s=>createHash('sha256').update(s).digest('hex');
const cmd=(action,input)=>j(`SET ROLE celebix_saas_identity;SELECT row_to_json(x) FROM saas.merchant_whatsapp_command(${lit(action)},${json(input)}) x;`);

let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try {
 run('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);run('pg_ctl',['-D',data,'-o',`-k ${sock} -p ${port} -h ''`,'-l',path.join(temp,'pg.log'),'start']);run('createdb',['-h',sock,'-p',String(port),'-U','postgres',db]);
 applyBaseline(sql,dir);
 const post=readdirSync(dir).filter(file=>/^\d{12}.*\.up\.sql$/.test(file)&&Number(file.slice(8,12))>227&&Number(file.slice(8,12))<=248).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
 for(const file of post){sql(readFileSync(path.join(dir,file),'utf8'));console.log('Fixture applied '+file);}
 sql(readFileSync(path.join(dir,'202610150238_merchant_signup_profile_assertions.sql'),'utf8'));
 sql("SET ROLE celebix_saas_owner;UPDATE saas.merchant_whatsapp_policy SET signup_enabled=true,central_hostnames=ARRAY['owner.example.test'];");
 const candidate=()=>({operationId:randomUUID(),sessionId:randomUUID(),familyId:randomUUID(),tokenKeyId:'test',tokenDigest:digest(randomUUID()),completionCiphertext:'encrypted.completion'});
 const prepare=(phone)=>{const binding={pendingId:randomUUID(),pendingDigest:digest(randomUUID()),browserDigest:digest(randomUUID()),environment:'test'};
 const input={...binding,operationId:randomUUID(),purpose:'signup',phoneKeyId:'phone-v1',phoneDigest:digest(phone),phoneCiphertext:'encrypted.fixture',phoneMasked:'***2233',destinationHostname:'owner.example.test',ipDigest:null,recipientBudgetDigest:digest(phone),challengeId:randomUUID(),codeDigest:digest('001234')};
 assert.equal(cmd('prepare',input).outcome,'prepared');assert.equal(cmd('finish_delivery',{...binding,challengeId:input.challengeId,status:'accepted'}).outcome,'accepted');assert.equal(cmd('verify',{...binding,...candidate(),challengeId:input.challengeId,codeDigest:input.codeDigest}).outcome,'phone_verified');return binding;};
 const pool=new Pool({host:sock,port,user:'postgres',database:db,max:2});
 try {
 const failures=[];let loseCommit=false;const proxy={async connect(){const c=await pool.connect();return{async query(q,v){let r;try{r=await c.query(q,v);}catch(e){failures.push({code:e.code,constraint:e.constraint});throw e;}if(q==='COMMIT'&&loseCommit){loseCommit=false;throw Error('lost fixture acknowledgement');}return r;},release:x=>c.release(x)}}};
 const repo=new PostgresSaaSDataRepository({pool:proxy,generateId:()=>randomUUID(),audit:()=>{},timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:8000},bootstrapRole:'celebix_saas_bootstrap',panelOrigin:'https://panel.saas-staging.celebix.net',adminOriginEnvironment:'staging_net'});
 const service=createStarterTenantService({repository:repo,panelBaseUrl:'https://panel.saas-staging.celebix.net',adminOriginEnvironment:'staging_net',platformDomainSuffix:'saas-staging.celebix.net'}),now=new Date().toISOString(),proof=prepare('profile-owner');
 const input={schemaVersion:1,idempotencyKey:randomUUID(),principal:{kind:'whatsapp',proof,profile:{firstName:'İpek',lastName:'Yılmaz'}},store:{name:'Profile Fixture',slug:'profile-fixture',locale:'tr',currency:'TRY',themeKey:'starter'},consents:{privacyAcceptedAt:now},requestedAt:now};


 const upName='202610200255_starter_tenant_plan_snapshots.up.sql',downName=upName.replace('.up.','.down.');
 const definition=()=>j("SELECT jsonb_build_object('definition',pg_get_constraintdef(oid),'expression',pg_get_expr(conbin,conrelid),'sha256',encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')) FROM pg_constraint WHERE conrelid='saas.tenant_operations'::regclass AND conname='tenant_operations_result_payload_shape_check'");
 const coreTables=['tenant_operations','principals','stores','domains','store_domains','storefront_designs','admin_domains','memberships','subscriptions','store_media_namespaces','store_settings','merchant_signup_profiles','merchant_phone_pending'];
 const rows=()=>coreTables.map(table=>[table,sql(`SELECT md5(coalesce(string_agg(md5(to_jsonb(r)::text),',' ORDER BY to_jsonb(r)::text),'')) FROM saas.${table} r`)]);
 const authority=()=>sql("SELECT encode(sha256(convert_to((SELECT string_agg(to_jsonb(p)::text||pg_get_functiondef(p.oid),E'\\n' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace)||(SELECT string_agg(to_jsonb(t)::text,E'\\n' ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='saas'::regnamespace)||(SELECT string_agg(to_jsonb(c)::text,E'\\n' ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace='saas'::regnamespace AND NOT(c.conrelid='saas.tenant_operations'::regclass AND c.conname='tenant_operations_result_payload_shape_check')),'UTF8')),'hex')");
 const makeInput=(label)=>({...input,idempotencyKey:randomUUID(),principal:{...input.principal,proof:prepare(label)},store:{...input.store,slug:label}});
 const old=definition();
 if(process.argv.includes('--emit-predecessor'))writeFileSync(path.join(root,'.tmp/signup-plan-snapshot-20261020/constraint-predecessor.json'),JSON.stringify(old,null,2)+'\n');
 const historicInput=makeInput('historic-free-one'),historic=await service.execute(historicInput);
 check('historical free v1 signup remains valid',()=>{assert.equal(historic.ok,true,JSON.stringify({historic,failures}));assert.equal(historic.value.plan.version,1);});
 const historicFrozen=sql(`SELECT to_jsonb(o) FROM saas.tenant_operations o WHERE id='${historic.value.operationId}'`);
 sql("SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true;UPDATE saas.commercial248_release_state SET enabled=true;");
 assert.equal(sql('SELECT saas.commercial_default_starter_version()'),'3');
 const beforeRows=rows(),beforeAuthority=authority();
 if(!process.argv.includes('--baseline')){
  sql(readFileSync(path.join(dir,upName),'utf8'));
  check('constraint-only migration preserves functions, triggers, other constraints and all onboarding rows',()=>{assert.equal(authority(),beforeAuthority);assert.deepEqual(rows(),beforeRows);assert.equal(sql(`SELECT to_jsonb(o) FROM saas.tenant_operations o WHERE id='${historic.value.operationId}'`),historicFrozen);});
  if(process.argv.includes('--emit-post'))writeFileSync(path.join(root,'.tmp/signup-plan-snapshot-20261020/constraint-post.json'),JSON.stringify(definition(),null,2)+'\n');
  else {
   assert.throws(()=>sql(readFileSync(path.join(dir,downName),'utf8')),/STARTER255_DOWN_REQUIRES_EXPLICIT_OPERATOR/);
   sql("SET celebix.allow_starter255_down='on';\n"+readFileSync(path.join(dir,downName),'utf8'));
   assert.equal(definition().sha256,old.sha256);assert.equal(authority(),beforeAuthority);assert.deepEqual(rows(),beforeRows);
   sql(readFileSync(path.join(dir,upName),'utf8'));sql(readFileSync(path.join(dir,upName.replace('.up.','_assertions.')),'utf8'));
   check('empty rollback restores exact predecessor and guarded source refuses replay',()=>assert.throws(()=>sql(readFileSync(path.join(dir,upName),'utf8')),/STARTER255_PREDECESSOR_DRIFT/));
  }
 }
 const result=await service.execute(input);
 check('actual free v3 phone signup commits its profile and tenant under current SQL constraint',()=>{
  assert.equal(result.ok,true,JSON.stringify({result,failures}));assert.equal(result.value.plan.version,3);assert.equal(result.value.plan.limits.products,25);assert.equal(result.value.plan.limits.monthlyOrders,50);
  assert.equal(result.value.panelUrl,`https://${input.store.slug}.admin.saas-staging.celebix.net`);assert.equal(result.value.storefrontUrl,`https://${input.store.slug}.saas-staging.celebix.net`);assert.equal(sql(`SELECT count(*) FROM saas.store_domains WHERE store_id='${result.value.store.id}' AND hostname='${input.store.slug}.saas-staging.celebix.net' AND status='active' AND is_primary AND verified_at IS NOT NULL`),'1');assert.equal(sql(`SELECT published_config IS NOT NULL AND published_version>=1 FROM saas.storefront_designs WHERE store_id='${result.value.store.id}'`),'t');
  assert.equal(sql(`SELECT status FROM saas.tenant_operations WHERE id='${result.value.operationId}'`),'committed');assert.equal(sql(`SELECT count(*) FROM saas.merchant_signup_profiles WHERE principal_id='${result.value.membership.principalId}'`),'1');
 });
 const replay=await service.execute(input);assert.equal(replay.ok,true);assert.equal(replay.value.replayed,true);assert.equal(replay.value.store.id,result.value.store.id);
 const complete={...proof,...candidate(),storeId:result.value.store.id};
 check('real V3 claim issues canonical panel session and exact retries create no duplicate',()=>{
  assert.equal(cmd('claim_signup',{...complete,storeId:historic.value.store.id}).outcome,'membership_denied');
  const issued=cmd('claim_signup',complete);assert.equal(issued.outcome,'issued');assert.equal(issued.authority.destinationOrigin,result.value.panelUrl);assert.equal(cmd('claim_signup',complete).outcome,'operation_replayed');
  const resolved=j(`SET ROLE celebix_saas_identity;SELECT row_to_json(r) FROM saas.resolve_panel_session('test','${complete.tokenDigest}',clock_timestamp()) r`);assert.equal(resolved.outcome,'resolved');
  assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${result.value.membership.principalId}' AND active_store_id='${result.value.store.id}'`),'1');assert.equal(sql(`SELECT count(*) FROM saas.tenant_operations WHERE idempotency_key='${input.idempotencyKey}'`),'1');
 });
 sql("SET ROLE celebix_saas_owner;UPDATE saas.commercial248_release_state SET enabled=false;");
 const v2Input=makeInput('historic-free-two'),v2=await service.execute(v2Input);assert.equal(v2.ok,true,JSON.stringify({v2,failures}));assert.equal(v2.value.plan.version,2);assert.equal(v2.value.plan.limits.products,100);assert.equal(v2.value.plan.limits.monthlyOrders,50);
 sql("SET ROLE celebix_saas_owner;UPDATE saas.commercial248_release_state SET enabled=true;");
 const oldReplay=await service.execute(historicInput);check('free v2 commits and historical v1 replays unchanged after v3 activation',()=>{assert.equal(oldReplay.ok,true);assert.equal(oldReplay.value.replayed,true);assert.equal(oldReplay.value.plan.version,1);assert.equal(sql(`SELECT to_jsonb(o) FROM saas.tenant_operations o WHERE id='${historic.value.operationId}'`),historicFrozen);});
 const operation=j(`SELECT to_jsonb(o) FROM saas.tenant_operations o WHERE id='${result.value.operationId}'`),expression=definition().expression;
 const allows=row=>sql(`SELECT (${expression}) FROM jsonb_populate_record(NULL::saas.tenant_operations,${json(row)}) r`)==='t';
 check('actual CHECK admits only exact supported tariff snapshots and preserves non-plan IS TRUE checks',()=>{
  assert.equal(allows(operation),true);
  for(const plan of [{...operation.result_payload.plan,version:4},{...operation.result_payload.plan,version:null},{...operation.result_payload.plan,version:'3'},{...operation.result_payload.plan,features:[...operation.result_payload.plan.features,'accounting']},{...operation.result_payload.plan,limits:{...operation.result_payload.plan.limits,products:100}},{...operation.result_payload.plan,planId:randomUUID()}])assert.equal(allows({...operation,result_payload:{...operation.result_payload,plan}}),false);
  const foreign=randomUUID();assert.equal(allows({...operation,result_plan_id:foreign,result_payload:{...operation.result_payload,plan:{...operation.result_payload.plan,planId:foreign}}}),false);
  for(const payload of [{...operation.result_payload,unknown:true},{...operation.result_payload,replayed:true},{...operation.result_payload,mediaStorage:null},{...operation.result_payload,mediaStorage:{schemaVersion:1,status:'pending',version:1}},{...operation.result_payload,membership:{...operation.result_payload.membership,role:'admin'}},{...operation.result_payload,storefrontUrl:'http://unsafe.test'}])assert.equal(allows({...operation,result_payload:payload}),false);
 });
 const bad=makeInput('tampered-proof');bad.principal.proof={...bad.principal.proof,browserDigest:digest('wrong')};assert.equal((await service.execute(bad)).ok,false);
 const expired=makeInput('expired-proof');sql(`UPDATE saas.merchant_phone_pending SET created_at=created_at-interval '11 minutes',expires_at=expires_at-interval '11 minutes' WHERE pending_id='${expired.principal.proof.pendingId}'`);assert.equal((await service.execute(expired)).ok,false);
 check('tampered or expired phone proof still rolls back without a tenant/profile',()=>{for(const value of [bad,expired]){assert.equal(sql(`SELECT count(*) FROM saas.stores WHERE slug='${value.store.slug}'`),'0');assert.equal(sql(`SELECT signup_store_id IS NULL FROM saas.merchant_phone_pending WHERE pending_id='${value.principal.proof.pendingId}'`),'t');}});
 if(!process.argv.includes('--emit-post'))check('rollback refuses any persisted non-v1 snapshot',()=>assert.throws(()=>sql("SET celebix.allow_starter255_down='on';\n"+readFileSync(path.join(dir,downName),'utf8')),/STARTER255_DOWN_NON_V1_SNAPSHOTS/));
 console.log(`Starter255 PostgreSQL checks: ${checks}; external connections: 0`);
 } finally {await pool.end();}
} finally {try{run('pg_ctl',['-D',data,'-m','immediate','stop']);}catch{}rmSync(temp,{recursive:true,force:true});}
