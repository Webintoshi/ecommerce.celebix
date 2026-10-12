import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {applyBaseline} from './baseline.mjs';
import {PostgresAdminLoginSecurityRepository} from '../../../packages/saas-data/src/admin-login-security/repository.ts';
import {createOwnerAdminLoginSecurityService} from '../../../apps/owner/lib/admin-login-security/service.ts';
import {parseLoginState,parseSecurityState} from '../../../apps/customer-panel/lib/admin-login-security-ui/model.ts';
import {createPanelSessionPersistenceApproval} from '../../../apps/customer-panel/lib/panel-session-persistence/activation.ts';
import {createAdminSecurityCompletionTransfer} from '../../../apps/customer-panel/lib/admin-login-security/runtime.ts';
import {createAdminLoginSecurityHandlers} from '../../../apps/customer-panel/lib/admin-login-security/handler.ts';
import {createPostgresCrossHostSessionHandoffRepository} from '../../../apps/customer-panel/lib/cross-host-session-handoff/postgres-repository.ts';

// Everything is local: private socket-only cluster, synthetic identities/keys,
// and an injected delivery adapter that captures codes without network access.
const root=path.resolve(import.meta.dirname,'../../..'),dir=path.join(root,'apps/owner/scripts/sql/saas');
const bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const temp=mkdtempSync('/tmp/admin-mfa-broker228-'),data=path.join(temp,'data'),sock=path.join(temp,'socket');mkdirSync(sock,{mode:0o700});
const port=24000+Math.floor(Math.random()*10000),db='broker_isolated';
const run=(name,args,input='')=>{const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});if(r.status!==0)throw Error(`${name}: ${r.stderr}`);return r.stdout.trim();};
const sql=s=>run('psql',['-h',sock,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],s);
const digest=s=>createHash('sha256').update(s).digest('hex');
const issuer='https://identity.example.test',subject='broker-admin',hostname='admin.broker.example.test',principalId=randomUUID(),storeId=randomUUID();
const sessionKeys=new Map([['sess1',new Uint8Array(32).fill(41)]]),oldKey=new Uint8Array(32).fill(21),newKey=new Uint8Array(32).fill(22);
const timeouts={poolCheckoutMs:1000,statementMs:5000,lockMs:1000,idleTransactionMs:5000};
let pool,checks=0,failures=0,lostVerifyCommit=false,destroyed=0,ambiguousDelivery=false,lostManagementFinishCommit=false,lostManagementPrepareCommit=false,managementThrows=false;
const deliveries=[],managementCalls=[];
async function check(name,body){try{await body();console.log(`PASS ${++checks} ${name}`);}catch(error){failures++;console.error(`FAIL ${name}: ${error.message}`);throw error;}}
function assertOk(result){assert.equal(result.code,'ok');if(result.state)parseLoginState(result.state);if(result.security)parseSecurityState(result.security);return result;}
async function main(){try{
 run('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);run('pg_ctl',['-D',data,'-o',`-k ${sock} -p ${port} -h ''`,'-l',path.join(temp,'pg.log'),'start']);run('createdb',['-h',sock,'-p',String(port),'-U','postgres',db]);
 const baseline=applyBaseline(sql,dir);assert.equal(baseline.functionCount,1744);
 if(process.env.ADMIN_MFA_BASELINE_EXPORT_PATH){const target=path.resolve(process.env.ADMIN_MFA_BASELINE_EXPORT_PATH);mkdirSync(path.dirname(target),{recursive:true,mode:0o700});writeFileSync(target,JSON.stringify(baseline,null,2)+'\n',{mode:0o600,flag:'wx'});}
 sql(readFileSync(path.join(dir,'202610120228_admin_login_security.up.sql'),'utf8'));
 sql(`SET ROLE celebix_saas_owner;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${storeId}','Broker fixture','broker-fixture','active','tr','TRY','starter',now(),now());
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${principalId}','${issuer}','${subject}','broker@example.test',true,now(),now());
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${randomUUID()}','${principalId}','${storeId}','store_owner','active',now(),now());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${randomUUID()}','${storeId}','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01',now(),now());
 INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,created_at,updated_at,management) VALUES('${randomUUID()}','${storeId}','${hostname}','platform_subdomain','active',true,now(),now(),now(),'platform');
 INSERT INTO saas.admin_login_store_policy(store_id,enabled) VALUES('${storeId}',true);`);
 pool=new Pool({host:sock,port,user:'postgres',database:db,max:2});
 const faultPool={async connect(){const client=await pool.connect();let verify=false,finishedManagement=false,preparedManagement=false;return{async query(text,values){const result=await client.query(text,values);if(values?.[0]==='verify_backup'&&result.rows[0]?.outcome==='old_factor_verified')verify=true;if(values?.[0]==='prepare_management'&&result.rows[0]?.outcome==='prepared')preparedManagement=true;if(text==='COMMIT'&&preparedManagement&&lostManagementPrepareCommit){lostManagementPrepareCommit=false;throw Error('injected lost management prepare COMMIT acknowledgement');}if(values?.[0]==='finish_management'&&result.rows[0]?.outcome==='completed')finishedManagement=true;if(text==='COMMIT'&&finishedManagement&&lostManagementFinishCommit){lostManagementFinishCommit=false;throw Error('injected lost management COMMIT acknowledgement');}if(text==='COMMIT'&&verify&&lostVerifyCommit){lostVerifyCommit=false;throw Error('injected lost COMMIT acknowledgement');}return result;},release(force){if(force)destroyed++;client.release(force);}};}};
 const repository=new PostgresAdminLoginSecurityRepository({pool:faultPool,role:'celebix_saas_identity',timeouts});
 function service(keyId='adm1',keys=new Map([['adm1',oldKey]])){return createOwnerAdminLoginSecurityService({issuer,clientId:'broker-client',environment:'isolated',masterKeyId:keyId,masterKeys:keys,sessionKeyId:'sess1',sessionKeys,handoffKeyId:'hand1',clock:()=>new Date(),browserDigest:digest,repository,startManagement:async input=>{managementCalls.push(input);if(managementThrows)throw Error('injected OIDC start interruption');return {schemaVersion:1,code:'ok',securityHandoff:'ash1.fixture.'+randomBytes(32).toString('base64url')};},delivery:async message=>{assert.match(message.code,/^\d{6}$/);deliveries.push(message);if(ambiguousDelivery)throw Error('injected ambiguous delivery');}});}
 async function begin(broker,purpose='login',actor={subject,principalId}){
  const now=new Date(),nonce=randomBytes(32).toString('base64url'),browserCredential='pb1.'+randomBytes(32).toString('base64url');
  const identity={issuer,subject:actor.subject,audience:'broker-client',nonce,email:'broker@example.test',emailVerified:true,passwordProof:{method:'password',issuer,subject:actor.subject,clientId:'broker-client',tokenId:randomUUID(),verificationId:randomBytes(16).toString('hex').slice(0,21),nonce,verifiedAt:now.toISOString(),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+300000).toISOString()}};
  const begun=await broker.begin({identity,destinationHostname:hostname,browserBindingCredential:browserCredential,...(purpose!=='login'?{adminLoginSecurityContext:{purpose,expectedPrincipalId:actor.principalId}}:{})});assert.equal(begun.kind,'whatsapp_required');
  return {pendingCookie:begun.pendingCookie,browserCredential};
 }
 const command=(broker,binding,action,payload={},extra={})=>broker.command({schemaVersion:1,action,...binding,operationId:randomUUID(),payload,...extra});
 // Move only fixture send timestamps instead of sleeping or overriding database time.
 const releaseSendBudget=()=>sql(`UPDATE saas.admin_login_otp SET created_at=created_at-interval '20 minutes' WHERE principal_id='${principalId}'`);
 async function send(broker,binding,phone){releaseSendBudget();const before=deliveries.length,result=assertOk(await command(broker,binding,'send',phone?{phone}:{}));assert.equal(deliveries.length,before+1);return {result,code:deliveries.at(-1).code};}
 const broker=service();let enrollment,first,backups,device;
 await check('first-factor-only state and first enrollment use real crypto/native transaction',async()=>{
  enrollment=await begin(broker);const state=assertOk(await command(broker,enrollment,'state'));assert.equal(state.state.phase,'phone');assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`),'0');
  let delivery=await send(broker,enrollment,'+905550000001');assert.equal(delivery.result.state.phase,'code');assert.ok(delivery.result.state.maskedPhone?.endsWith('0001'));assert.ok(assertOk(await command(broker,enrollment,'state')).state.maskedPhone.endsWith('0001'));sql(`UPDATE saas.admin_login_otp SET created_at=created_at-interval '61 seconds' WHERE principal_id='${principalId}'`);const resend=assertOk(await command(broker,enrollment,'send'));assert.equal(deliveries.at(-1).phone,'+905550000001');delivery={result:resend,code:deliveries.at(-1).code};
  first=assertOk(await command(broker,enrollment,'verify',{code:delivery.code,rememberDevice:true}));assert.equal(first.state.phase,'backup_codes');backups=first.state.backupCodes;device=first.deviceCredential;assert.equal(backups.length,10);assert.match(device,/^adt1\.adm1\./);assert.equal(first.completion.destinationStoreId,storeId);
  const recovered=assertOk(await command(broker,enrollment,'complete'));assert.deepEqual(recovered.completion,first.completion);assert.deepEqual(recovered.state.backupCodes,backups);
 });
 await check('pending browser/principal/security-version tampering never reaches full authority',async()=>{
  const binding=await begin(broker);assert.equal((await command(broker,{...binding,browserCredential:'pb1.'+randomBytes(32).toString('base64url')},'state')).code,'fresh_login_required');
  const parsed=JSON.parse(Buffer.from(binding.pendingCookie.slice(5),'base64url').toString());
  for(const patch of [{principalId:randomUUID()},{securityVersion:parsed.securityVersion+1},{environment:'another-environment'}]){const forged='apc1.'+Buffer.from(JSON.stringify({...parsed,...patch})).toString('base64url');assert.equal((await command(broker,{...binding,pendingCookie:forged},'state')).code,'fresh_login_required');}
 });
 await check('another enrolled merchant role cannot borrow the first principal trusted device',async()=>{
  const secondId=randomUUID(),secondSubject='broker-analyst';sql(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${secondId}','${issuer}','${secondSubject}','analyst@example.test',true,now(),now());INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${randomUUID()}','${secondId}','${storeId}','analyst','active',now(),now());`);
  const actor={subject:secondSubject,principalId:secondId},pending=await begin(broker,'login',actor),sent=await send(broker,pending,'+905550000003');assertOk(await command(broker,pending,'verify',{code:sent.code,rememberDevice:false}));
  const login=await begin(broker,'login',actor),before=sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${secondId}'`);assert.equal(assertOk(await command(broker,login,'resume',{}, {deviceCredential:device})).completion,undefined);assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${secondId}'`),before);
 });
 await check('parallel completion GETs create one prepared handoff and one destination session',async()=>{
  const handoffs=createPostgresCrossHostSessionHandoffRepository(createPanelSessionPersistenceApproval('disposable_test'),{pool,handoffKeys:new Map([['hand1',new Uint8Array(32).fill(51)]]),activeHandoffKeyId:'hand1',sessionKeys,activeSessionKeyId:'sess1',clock:()=>new Date(),randomBytes,timeouts,audit:()=>{}});
  const centralOrigin='https://panel.example.test',handlers=createAdminLoginSecurityHandlers({centralOrigin,authorityOrigin:issuer,transport:{execute:input=>broker.command(input)},completeSession:createAdminSecurityCompletionTransfer({clock:()=>new Date(),randomUuid:randomUUID,randomBytes,repository:handoffs})});
  const request=()=>new Request(centralOrigin+'/auth/admin-login/complete',{headers:{cookie:`__Host-celebix_admin_pending=${enrollment.pendingCookie}; __Host-celebix_panel_pre_auth=${enrollment.browserCredential}`}});
  const responses=await Promise.all([handlers.complete(request()),handlers.complete(request())]);for(const response of responses)assert.equal(response.status,200);
  const credentials=await Promise.all(responses.map(async response=>(await response.text()).match(/name="handoff" value="([^"]+)"/)?.[1]));assert.ok(credentials[0]);assert.equal(credentials[0],credentials[1]);
  assert.equal(sql(`SELECT count(*) FROM saas.cross_host_panel_handoffs WHERE principal_id='${principalId}'`),'1');
  const before=Number(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`));
  const redeemed=await Promise.all(credentials.map(credential=>handoffs.redeemHandoff({credential,destinationHostname:hostname,now:new Date()})));assert.deepEqual(redeemed.map(r=>r.kind).sort(),['handoff_replayed','redeemed']);
  const winner=redeemed.find(r=>r.kind==='redeemed');assert.equal(winner.session.expiresAt,first.completion.sessionExpiresAt);assert.equal(Number(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`)),before+1);
  assert.notEqual((await handlers.complete(request())).status,200);assert.equal(sql(`SELECT count(*) FROM saas.cross_host_panel_handoffs WHERE principal_id='${principalId}'`),'1');
 });
 await check('accepted send retries reuse the native challenge without another delivery',async()=>{
  const binding=await begin(broker),operationId=randomUUID();releaseSendBudget();const before=deliveries.length;
  const message={schemaVersion:1,action:'send',...binding,operationId,payload:{}};
  const firstSend=assertOk(await broker.command(message)),retried=assertOk(await broker.command(message));assert.equal(deliveries.length,before+1);assert.equal(firstSend.state.challengeId,retried.state.challengeId);
 });
 await check('trusted device repeats login without delivery or extending its fixed expiry',async()=>{
  const expiry=sql('SELECT expires_at FROM saas.admin_login_trust');const binding=await begin(broker),before=deliveries.length;
  const result=assertOk(await command(broker,binding,'resume',{}, {deviceCredential:device}));assert.equal(result.state.phase,'complete');assert.ok(result.completion);assert.equal(deliveries.length,before);assert.equal(sql('SELECT expires_at FROM saas.admin_login_trust'),expiry);
 });
 const startMessage=(operationId=randomUUID(),purpose='manage')=>({schemaVersion:1,action:'start',sessionCredential:first.completion.sessionCredential,operationId,payload:{purpose,sourceOrigin:'https://'+hostname}});
 await check('management start retries recover one encrypted result without another OIDC creation',async()=>{
  const message=startMessage(),before=managementCalls.length;
  const initial=assertOk(await broker.command(message)),retry=assertOk(await broker.command(message));assert.deepEqual(retry,initial);assert.equal(managementCalls.length,before+1);
  const created=managementCalls.at(-1);assert.equal(created.principalId,principalId);assert.equal(created.destinationOrigin,'https://'+hostname);assert.match(created.browserCredential,/^pb1\.[A-Za-z0-9_-]{43}$/);assert.ok(Date.parse(created.expiresAt)>Date.now());assert.ok(Date.parse(created.expiresAt)<=Date.now()+600000);
  const stored=sql(`SELECT completion_ciphertext FROM saas.admin_login_management_operations WHERE operation_id='${message.operationId}'`);assert.ok(stored);assert.equal(stored.includes(initial.securityHandoff),false);assert.equal(stored.includes('https://'),false);
  assert.equal((await broker.command({...message,payload:{...message.payload,purpose:'change_phone'}})).code,'operation_uncertain');assert.equal(managementCalls.length,before+1);
 });
 await check('lost management prepare COMMIT acknowledgement returns typed restart without OIDC creation',async()=>{
  const message=startMessage(),before=managementCalls.length,destroyedBefore=destroyed;lostManagementPrepareCommit=true;
  const initial=await broker.command(message);assert.equal(initial.code,'management_restart_required');assert.equal(lostManagementPrepareCommit,false);assert.equal(destroyed,destroyedBefore+1);assert.equal(managementCalls.length,before);
  assert.equal((await broker.command(message)).code,'management_restart_required');assert.equal(managementCalls.length,before);
  assertOk(await broker.command({...message,operationId:randomUUID()}));assert.equal(managementCalls.length,before+1);
 });
 await check('lost management finish COMMIT acknowledgement recovers the same sealed bridge',async()=>{
  const message=startMessage(),before=managementCalls.length,destroyedBefore=destroyed;lostManagementFinishCommit=true;
  const initial=assertOk(await broker.command(message));assert.equal(lostManagementFinishCommit,false);assert.equal(destroyed,destroyedBefore+1);
  const retry=assertOk(await broker.command(message));assert.deepEqual(retry,initial);assert.equal(managementCalls.length,before+1);
 });
 await check('interrupted management creation requires explicit new operation without automatic OIDC retry',async()=>{
  const message=startMessage(),before=managementCalls.length;managementThrows=true;let interrupted;try{interrupted=await broker.command(message);}finally{managementThrows=false;}
  assert.equal(interrupted.code,'management_restart_required');assert.equal((await broker.command(message)).code,'management_restart_required');assert.equal(managementCalls.length,before+1);
  assertOk(await broker.command({...message,operationId:randomUUID()}));assert.equal(managementCalls.length,before+2);
 });
 await check('broker forget replay does not revoke a device enrolled after the original request',async()=>{
  const message={schemaVersion:1,action:'forget',sessionCredential:first.completion.sessionCredential,operationId:randomUUID(),payload:{}};
  const forgotten=assertOk(await broker.command(message));assert.equal(forgotten.security.trustedDevices.length,0);
  const login=await begin(broker),sent=await send(broker,login),newLogin=assertOk(await command(broker,login,'verify',{code:sent.code,rememberDevice:true}));assert.ok(newLogin.deviceCredential);
  const retry=assertOk(await broker.command(message));assert.equal(retry.security.trustedDevices.length,1);
  const next=await begin(broker);assert.ok(assertOk(await command(broker,next,'resume',{}, {deviceCredential:newLogin.deviceCredential})).completion);
 });
 await check('backup recovery is single use and never mints a new device',async()=>{
  const binding=await begin(broker),result=assertOk(await command(broker,binding,'recover',{backupCode:backups[0]}));assert.ok(result.completion);assert.equal(result.deviceCredential,undefined);
  const other=await begin(broker);assert.equal((await command(broker,other,'recover',{backupCode:backups[0]})).code,'invalid_code');
 });
 await check('concurrent broker retries recover the same single-use backup session',async()=>{
  const binding=await begin(broker),before=Number(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`));
  const results=await Promise.all([command(broker,binding,'recover',{backupCode:backups[3]}),command(broker,binding,'recover',{backupCode:backups[3]})]);
  for(const result of results)assertOk(result);assert.deepEqual(results[0].completion,results[1].completion);assert.equal(Number(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`)),before+1);
 });
 await check('ambiguous provider delivery cannot authenticate or automatically resend',async()=>{
  const binding=await begin(broker),operationId=randomUUID();releaseSendBudget();const before=deliveries.length,sessions=sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`);ambiguousDelivery=true;
  const message={schemaVersion:1,action:'send',...binding,operationId,payload:{}};let firstSend;try{firstSend=await broker.command(message);}finally{ambiguousDelivery=false;}
  assert.equal(firstSend.code,'delivery_uncertain');assert.equal((await broker.command(message)).code,'delivery_uncertain');assert.equal(deliveries.length,before+1);
  assert.notEqual((await command(broker,binding,'verify',{code:deliveries.at(-1).code,rememberDevice:false})).code,'ok');assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${principalId}'`),sessions);
 });
 const rotated=service('adm2',new Map([['adm2',newKey],['adm1',oldKey]]));
 await check('master key rotation preserves known phone delivery and old backup recovery',async()=>{
  const binding=await begin(rotated),delivery=await send(rotated,binding);assert.equal(deliveries.at(-1).phone,'+905550000001');assertOk(await command(rotated,binding,'verify',{code:delivery.code,rememberDevice:false}));
  const recovery=await begin(rotated);assert.ok(assertOk(await command(rotated,recovery,'recover',{backupCode:backups[1]})).completion);
 });
 let managedCodes;
 await check('lost old-factor COMMIT acknowledgement resumes management and returns one durable batch',async()=>{
  const management=await begin(rotated,'manage'),destroyedBefore=destroyed;lostVerifyCommit=true;const result=assertOk(await command(rotated,management,'recover',{backupCode:backups[2]}));assert.equal(lostVerifyCommit,false);assert.equal(destroyed,destroyedBefore+1);assert.equal(result.state.phase,'backup_codes');assert.equal(result.completion,undefined);managedCodes=result.state.backupCodes;
  const reread=assertOk(await command(rotated,management,'state'));assert.deepEqual(reread.state.backupCodes,managedCodes);assert.equal(sql(`SELECT count(*) FROM saas.admin_login_backups WHERE principal_id='${principalId}' AND consumed_at IS NULL`),'10');
 });
 let changedCodes;
 await check('phone change verifies old factor then new phone and generates next-version backups',async()=>{
  const change=await begin(rotated,'change_phone');const old=assertOk(await command(rotated,change,'recover',{backupCode:managedCodes[0]}));assert.equal(old.state.phase,'new_phone');assert.equal(old.completion,undefined);
  let sent=await send(rotated,change,'+905550000002');assert.equal(sent.result.state.phase,'code');assert.ok(sent.result.state.maskedPhone?.endsWith('0002'));assert.ok(assertOk(await command(rotated,change,'state')).state.maskedPhone.endsWith('0002'));sql(`UPDATE saas.admin_login_otp SET created_at=created_at-interval '61 seconds' WHERE principal_id='${principalId}'`);const resent=assertOk(await command(rotated,change,'send'));assert.equal(deliveries.at(-1).phone,'+905550000002');sent={result:resent,code:deliveries.at(-1).code};
  const changed=assertOk(await command(rotated,change,'verify',{code:sent.code,rememberDevice:false}));assert.equal(changed.state.phase,'backup_codes');changedCodes=changed.state.backupCodes;assert.equal(sql(`SELECT security_version FROM saas.admin_login_factors WHERE principal_id='${principalId}'`),'2');
  assert.equal((await rotated.command({schemaVersion:1,action:'security_state',sessionCredential:first.completion.sessionCredential})).code,'fresh_login_required');
  const trusted=await begin(rotated),denied=assertOk(await command(rotated,trusted,'resume',{}, {deviceCredential:device}));assert.equal(denied.completion,undefined);
  const backup=await begin(rotated);assert.ok(assertOk(await command(rotated,backup,'recover',{backupCode:changedCodes[0]})).completion);
  const phone=await begin(rotated),newDelivery=await send(rotated,phone);assert.equal(deliveries.at(-1).phone,'+905550000002');assertOk(await command(rotated,phone,'verify',{code:newDelivery.code,rememberDevice:false}));
 });
 console.log(JSON.stringify({checks,failures,isolated:true,forwardArtifacts:240,providerCalls:0,capturedDeliveries:deliveries.length}));
}finally{if(pool)await pool.end();try{run('pg_ctl',['-D',data,'-m','immediate','stop']);}catch{}rmSync(temp,{recursive:true,force:true});}}
await main();
