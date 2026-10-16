import {Pool} from 'pg';
import {PostgresSaaSDataRepository} from '../../../packages/saas-data/src/postgres/repository.ts';
import {createStarterTenantService} from '../../../packages/saas-tenant-core/src/create-starter-tenant.ts';
import assert from 'node:assert/strict';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../../..'),dir=path.join(root,'apps/owner/scripts/sql/saas'),bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const temp=mkdtempSync('/tmp/merchant-signup-profile-'),data=path.join(temp,'data'),sock=path.join(temp,'socket');mkdirSync(sock);
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
 for(const file of ['202610120228_admin_login_security.up.sql','202610130229_merchant_whatsapp_authority.up.sql','202610130231_merchant_phone_operator_enrollment.up.sql','202610150238_merchant_signup_profile.up.sql']) if(existsSync(path.join(dir,file)))sql(readFileSync(path.join(dir,file),'utf8'));
 sql(readFileSync(path.join(dir,'202610150238_merchant_signup_profile_assertions.sql'),'utf8'));
 sql("SET ROLE celebix_saas_owner;UPDATE saas.merchant_whatsapp_policy SET signup_enabled=true,central_hostnames=ARRAY['owner.example.test'];");
 const candidate=()=>({operationId:randomUUID(),sessionId:randomUUID(),familyId:randomUUID(),tokenKeyId:'test',tokenDigest:digest(randomUUID()),completionCiphertext:'encrypted.completion'});
 const prepare=(phone)=>{const binding={pendingId:randomUUID(),pendingDigest:digest(randomUUID()),browserDigest:digest(randomUUID()),environment:'test'};
 const input={...binding,operationId:randomUUID(),purpose:'signup',phoneKeyId:'phone-v1',phoneDigest:digest(phone),phoneCiphertext:'encrypted.fixture',phoneMasked:'***2233',destinationHostname:'owner.example.test',ipDigest:null,recipientBudgetDigest:digest(phone),challengeId:randomUUID(),codeDigest:digest('001234')};
 assert.equal(cmd('prepare',input).outcome,'prepared');assert.equal(cmd('finish_delivery',{...binding,challengeId:input.challengeId,status:'accepted'}).outcome,'accepted');assert.equal(cmd('verify',{...binding,...candidate(),challengeId:input.challengeId,codeDigest:input.codeDigest}).outcome,'phone_verified');return binding;};
 const pool=new Pool({host:sock,port,user:'postgres',database:db,max:2});
 try {
 let loseCommit=false;const proxy={async connect(){const c=await pool.connect();return{async query(q,v){const r=await c.query(q,v);if(q==='COMMIT'&&loseCommit){loseCommit=false;throw Error('lost fixture acknowledgement');}return r;},release:x=>c.release(x)}}};
 const repo=new PostgresSaaSDataRepository({pool:proxy,generateId:()=>randomUUID(),audit:()=>{},timeouts:{poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:8000},bootstrapRole:'celebix_saas_bootstrap',panelOrigin:'https://panel.celebix.site'});
 const service=createStarterTenantService({repository:repo,panelBaseUrl:'https://panel.celebix.site'}),now=new Date().toISOString(),proof=prepare('profile-owner');
 const input={schemaVersion:1,idempotencyKey:randomUUID(),principal:{kind:'whatsapp',proof,profile:{firstName:'İpek',lastName:'Yılmaz'}},store:{name:'Profile Fixture',slug:'profile-fixture',locale:'tr',currency:'TRY',themeKey:'starter'},consents:{privacyAcceptedAt:now},requestedAt:now};
 const result=await service.execute(input);check('name profile persists atomically with phone owner tenant',()=>{assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(j(`SELECT jsonb_build_object('firstName',first_name,'lastName',last_name) FROM saas.merchant_signup_profiles WHERE principal_id='${result.value.membership.principalId}'`),{firstName:'İpek',lastName:'Yılmaz'});});
 const replay=await service.execute(input);check('same input replays one owner, changed name conflicts',()=>{assert.equal(replay.ok,true);assert.equal(replay.value.replayed,true);assert.equal(replay.value.store.id,result.value.store.id);});
 const changed=await service.execute({...input,principal:{...input.principal,profile:{firstName:'Other',lastName:'Name'}}});assert.equal(changed.error.code,'idempotency_mismatch');
 for(const profile of [{firstName:'',lastName:'Name'},{firstName:' İpek',lastName:'Yılmaz'},{firstName:'A\nB',lastName:'Name'},{firstName:'x'.repeat(101),lastName:'Name'},{firstName:'İpek',lastName:'Yılmaz',role:'admin'}]){const r=await service.execute({...input,idempotencyKey:randomUUID(),principal:{...input.principal,profile}});assert.equal(r.error.code,'invalid_input');}
 check('bootstrap has function execution only, no profile read/write grants',()=>{assert.equal(sql("SELECT has_table_privilege('celebix_saas_bootstrap','saas.merchant_signup_profiles','SELECT') OR has_table_privilege('celebix_saas_identity','saas.merchant_signup_profiles','INSERT')"),'f');assert.equal(sql("SELECT has_function_privilege('celebix_saas_identity','saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text)','EXECUTE')"),'f');});
 const fresh=prepare('rollback-profile-owner'),next={...input,idempotencyKey:randomUUID(),principal:{...input.principal,proof:fresh}};
 const failed=await service.execute(next);assert.equal(failed.ok,false);check('failed tenant rolls profile and proof binding back',()=>{assert.equal(sql(`SELECT count(*) FROM saas.merchant_signup_profiles WHERE principal_id=(SELECT principal_id FROM saas.merchant_phone_pending WHERE pending_id='${fresh.pendingId}')`),'0');assert.equal(sql(`SELECT signup_operation_id IS NULL FROM saas.merchant_phone_pending WHERE pending_id='${fresh.pendingId}'`),'t');});
 loseCommit=true;const uncertainInput={...next,store:{...input.store,slug:'profile-recovery'}};const lost=await service.execute(uncertainInput),recovered=await service.execute(uncertainInput);assert.equal(lost.ok,false);assert.equal(recovered.ok,true);assert.equal(recovered.value.replayed,true);check('uncertain commit exact retry keeps one profile and store',()=>assert.equal(sql("SELECT count(*) FROM saas.stores WHERE slug='profile-recovery'"),'1'));
 const legacy={...input,idempotencyKey:randomUUID(),principal:{kind:'whatsapp',proof:prepare('legacy-owner')},store:{...input.store,slug:'profile-legacy'}};assert.equal((await service.execute(legacy)).ok,true);
 sql("UPDATE saas.whatsapp_otp_send_reservations SET created_at=created_at-interval '2 minutes'");
 const second={...input,idempotencyKey:randomUUID(),principal:{kind:'whatsapp',proof:prepare('profile-owner'),profile:{firstName:'Changed',lastName:'Surname'}},store:{...input.store,slug:'profile-second'}};assert.equal((await service.execute(second)).ok,true);assert.equal(sql(`SELECT first_name FROM saas.merchant_signup_profiles WHERE principal_id='${result.value.membership.principalId}'`),'İpek');
 const badProof={...input,idempotencyKey:randomUUID(),principal:{...input.principal,proof:{...prepare('bad-profile'),browserDigest:digest('tampered')}},store:{...input.store,slug:'profile-denied'}};assert.equal((await service.execute(badProof)).ok,false);check('bad proof cannot store names or create tenant',()=>assert.equal(sql("SELECT count(*) FROM saas.stores WHERE slug='profile-denied'"),'0'));
 } finally {await pool.end();}
} finally {try{run('pg_ctl',['-D',data,'-m','immediate','stop']);}catch{}rmSync(temp,{recursive:true,force:true});}
