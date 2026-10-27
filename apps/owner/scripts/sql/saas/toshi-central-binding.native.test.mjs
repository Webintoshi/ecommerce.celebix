import assert from 'node:assert/strict';
import {readFileSync,readdirSync}from'node:fs';
import path from'node:path';
import{createHash,createCipheriv,randomBytes}from'node:crypto';
import{spawn}from'node:child_process';
import{applyBaseline}from'../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import{startDisposablePostgres}from'../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
const ROOT=path.resolve(import.meta.dirname,'../../../../..'),dir=path.join(ROOT,'apps/owner/scripts/sql/saas'),pg=startDisposablePostgres({database:'toshi_central284'}),{sql}=pg;
const id=n=>`28400000-0000-4000-8000-${String(n).padStart(12,'0')}`,P=id(100),OWNER=id(101),PLAN='00000000-0000-4000-8000-000000000010',hash=s=>createHash('sha256').update(String(s)).digest('hex');
const read=f=>readFileSync(path.join(dir,f),'utf8'),lit=s=>`'${String(s).replaceAll("'","''")}'`,json=s=>`${lit(JSON.stringify(s))}::jsonb`,j=q=>JSON.parse(sql(q));
const secret=randomBytes(32),cryptKey=randomBytes(32);
function envelope(){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',cryptKey,iv),ciphertext=Buffer.concat([c.update(secret),c.final()]);return{algorithm:'A256GCM',ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),keyId:'native-test-only',tag:c.getAuthTag().toString('base64url'),version:1};}
const expr=(store,action,args,options={})=>`saas.toshi_central_binding_command('${id(store)}','${options.principal??P}','${options.member??id(1000+store)}','${options.plan??PLAN}','${options.code??'professional'}',${options.version??2},clock_timestamp(),${lit(action)},${json(args)})`;
const command=(store,action,args={},options={})=>j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr(store,action,args,options)}r`);
const connectArgs=(store,n,expectedVersion=0,credentialVersion=1)=>({operationId:id(n),fingerprint:hash('binding'+store+':'+n),configId:id(store+2000),provider:'deepseek',sealedCredentials:envelope(),credentialDigest:'sha256:'+hash('central-test'),credentialVersion,maskedKey:'••••oshi',selectedModel:'deepseek-flash',availableModels:[{id:'deepseek-flash',label:'Toshi'}],expectedVersion});
const asyncSql=source=>new Promise((resolve,reject)=>{const child=spawn(path.join(pg.bin,'psql'),['-h',pg.socket,'-p',String(pg.port),'-U','postgres','-d',pg.database,'-X','-qAt','-v','ON_ERROR_STOP=1'],{env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&!k.endsWith('DATABASE_URL')))});let out='',err='';const timer=setTimeout(()=>child.kill('SIGTERM'),15000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('isolated concurrency failed:'+err));resolve(JSON.parse(out.split('\n').filter(s=>s.startsWith('{')).at(-1)));});child.stdin.end(source);});
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=283&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(read(f));
 const before=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");
 sql(read('202610270284_toshi_central_binding.up.sql'));sql(read('202610270284_toshi_central_binding_assertions.sql'));
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.commercial_package_release_state SET assignments_enabled=true WHERE singleton;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${P}','https://central284.example.test','staff284','staff284@example.test',true,clock_timestamp(),clock_timestamp()),('${OWNER}','https://central284.example.test','owner284','owner284@example.test',true,clock_timestamp(),clock_timestamp());
 ${[1,2,3,4,5,6].map(n=>`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${id(n)}','Central ${n}','central-${n}','active','tr','TRY','starter',clock_timestamp(),clock_timestamp());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${id(1000+n)}','${P}','${id(n)}','${n===2?'cashier':n===3?'analyst':n===4?'store_owner':'editor'}','active',clock_timestamp(),clock_timestamp()),('${id(3000+n)}','${OWNER}','${id(n)}','store_owner','active',clock_timestamp(),clock_timestamp());INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('${id(4000+n)}','${id(n)}','${PLAN}','professional',2,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());`).join('')}`);
 check('editor and cashier bootstrap central binding without legacy configuration permissions',()=>{
  for(const store of[1,2]){assert.equal(command(store,'identity').outcome,'not_found');const args=connectArgs(store,10000+store),created=command(store,'connect',args);assert.equal(created.outcome,'connected',JSON.stringify(created));assert.equal(created.result_payload.isDefault,false);assert.equal(created.result_payload.maskedKey,'••••oshi');assert.equal(command(store,'authority').result_payload.provider,'deepseek');assert.equal(command(store,'identity').result_payload.configId,args.configId);
   const legacy=j(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM saas.toshi_provider_connect('${id(store)}','${P}','${id(1000+store)}','${PLAN}','professional',2,clock_timestamp(),'${id(11000+store)}','${hash('legacy')}','${args.configId}','deepseek',${json(args.sealedCredentials)},'${args.credentialDigest}',2,'••••oshi','deepseek-flash',${json(args.availableModels)},1)r`);assert.equal(legacy.outcome,'membership_denied');
  }
 });
 check('analyst cannot inspect, connect, recover or read central credential authority',()=>{for(const[action,args]of[['identity',{}],['authority',{}],['connect',connectArgs(3,10003)],['recover',{operationId:id(10001),fingerprint:hash('binding1:10001')}]])assert.equal(command(3,action,args).outcome,'membership_denied');});
 check('fixed central protocol rejects model, marker, provider, plaintext and malformed ciphertext envelopes',()=>{
  const good=connectArgs(4,10004);
  for(const delta of[{provider:'openai'},{selectedModel:'deepseek-v4-pro'},{maskedKey:'••••test'},{availableModels:[{id:'deepseek-flash',label:'Other'}]},{sealedCredentials:'plaintext-must-never-store'},{sealedCredentials:{...good.sealedCredentials,iv:'A'.repeat(15)}},{sealedCredentials:{...good.sealedCredentials,tag:'A'.repeat(21)+'B'}},{isDefault:true}])assert.equal(command(4,'connect',{...good,...delta}).outcome,'invalid_input');
  assert.equal(command(4,'identity').outcome,'not_found');
 });
 check('exact operation replay is immutable and bound to actor, store and request fingerprint',()=>{
  const args=connectArgs(4,10004),created=command(4,'connect',args);assert.equal(created.outcome,'connected');assert.equal(command(4,'connect',args).outcome,'operation_replayed');assert.equal(command(4,'recover',{operationId:args.operationId,fingerprint:args.fingerprint}).outcome,'operation_replayed');assert.equal(command(4,'connect',{...args,fingerprint:hash('different')}).outcome,'operation_mismatch');assert.equal(command(5,'connect',args).outcome,'operation_mismatch');assert.equal(command(4,'recover',{operationId:args.operationId,fingerprint:args.fingerprint},{principal:OWNER,member:id(3004)}).outcome,'operation_mismatch');assert.equal(sql(`SELECT count(*)FROM saas.toshi_provider_events WHERE id='${args.operationId}'`),'1');
 });
 check('rotating an existing default DeepSeek binding preserves its legacy default flag',()=>{
  sql(`SET ROLE celebix_saas_owner;UPDATE saas.toshi_provider_configs SET masked_key='••••test',selected_model='deepseek-v4-pro',available_models='[{"id":"deepseek-v4-pro","label":"Legacy"}]',is_default=true WHERE store_id='${id(4)}'AND provider='deepseek'AND status='active'`);
  assert.equal(command(4,'authority').result_payload.selectedModel,'deepseek-v4-pro');
  const args=connectArgs(4,12004,1,2),rotated=command(4,'connect',args);assert.equal(rotated.outcome,'connected');assert.equal(rotated.result_payload.isDefault,true);assert.equal(rotated.result_payload.version,2);assert.equal(rotated.result_payload.selectedModel,'deepseek-flash');assert.equal(command(4,'identity').result_payload.credentialVersion,2);assert.equal(command(4,'connect',connectArgs(4,12005,1,2)).outcome,'version_conflict');
 });
 check('cross-store membership and stale plan authority cannot read or rotate any binding',()=>{
  assert.equal(command(1,'authority',{}, {member:id(1002)}).outcome,'membership_denied');assert.equal(command(1,'identity',{}, {version:1}).outcome,'durable_authority_invalid');assert.equal(command(1,'connect',connectArgs(1,13001,1,2),{code:'starter'}).outcome,'durable_authority_invalid');assert.equal(command(1,'identity').result_payload.version,1);
 });
 const args=connectArgs(5,14005);const results=await Promise.all([asyncSql(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr(5,'connect',args)}r`),asyncSql(`SET ROLE celebix_saas_app;SELECT to_jsonb(r)FROM ${expr(5,'connect',args)}r`)]);assert.deepEqual(results.map(v=>v.outcome).sort(),['connected','operation_replayed']);console.log(`PASS ${++checks} real simultaneous central bootstrap records one config and one event`);
 check('private encrypted authority API is app-only and all legacy functions remain byte-identical',()=>{
  for(const role of['celebix_saas_platform_operator','celebix_saas_workflow','celebix_saas_host_resolver'])assert.throws(()=>sql(`SET ROLE ${role};SELECT *FROM ${expr(1,'authority',{})}`),/permission denied/);
  assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.toshi_provider_configs`),/permission denied/);assert.throws(()=>sql(`SET ROLE celebix_saas_app;SELECT *FROM saas.toshi_central284_predecessors`),/permission denied/);
  const after=j("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace");for(const[signature,definition]of Object.entries(before))assert.equal(after[signature],definition,signature);
  assert.equal(sql(`SELECT count(*)FROM saas.toshi_provider_operations WHERE result_payload::text LIKE '%sealedCredentials%'`),'0');sql(read('202610270284_toshi_central_binding_assertions.sql'));assert.throws(()=>sql(read('202610270284_toshi_central_binding.down.sql')),/TOSHI_CENTRAL284_FORWARD_ONLY/);
 });
 console.log(JSON.stringify({passed:checks,externalCalls:0,livePayments:0,postgresMajor:16}));
}finally{secret.fill(0);cryptKey.fill(0);pg.stop();}
