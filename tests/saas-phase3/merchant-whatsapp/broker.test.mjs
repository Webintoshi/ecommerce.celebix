import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {applyBaseline} from '../admin-login-security/baseline.mjs';
import {createPostgresMerchantWhatsAppRepository} from '../../../packages/saas-data/src/merchant-whatsapp/repository.ts';
import {PostgresSaaSDataRepository} from '../../../packages/saas-data/src/postgres/repository.ts';
import {createStarterTenantService} from '../../../packages/saas-tenant-core/src/create-starter-tenant.ts';
import {createMerchantWhatsAppCodec} from '../../../apps/owner/lib/merchant-whatsapp/codec.ts';
import {createOwnerMerchantWhatsAppService} from '../../../apps/owner/lib/merchant-whatsapp/service.ts';
import {createMerchantInternalGateway,createMerchantInternalTransport} from '../../../apps/owner/lib/merchant-whatsapp/internal.ts';
import {createMerchantPhoneHandlers} from '../../../apps/customer-panel/lib/merchant-phone/handler.ts';
import {createMerchantSessionCompletion} from '../../../apps/owner/lib/merchant-whatsapp/completion.ts';
import {createPostgresCrossHostSessionHandoffRepository} from '../../../apps/customer-panel/lib/cross-host-session-handoff/postgres-repository.ts';
import {createPanelSessionPersistenceApproval} from '../../../apps/customer-panel/lib/panel-session-persistence/activation.ts';
import {createMerchantPhoneRegistrationHandler} from '../../../apps/owner/lib/merchant-whatsapp/registration.ts';
const root=path.resolve(import.meta.dirname,'../../..'),dir=path.join(root,'apps/owner/scripts/sql/saas'),bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const temp=mkdtempSync('/tmp/merchant-broker229-'),data=path.join(temp,'data'),sock=path.join(temp,'socket');mkdirSync(sock);
const port=24000+Math.floor(Math.random()*10000),db='merchant_broker_isolated';
function run(name,args,input=''){const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});if(r.status!==0)throw Error(`${name}: ${r.stderr}`);return r.stdout.trim();}
const sql=s=>run('psql',['-h',sock,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],s);
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const timeouts={poolCheckoutMs:1000,statementMs:5000,lockMs:2000,idleTransactionMs:8000};
let pool,checks=0;async function check(name,fn){await fn();console.log(`PASS ${++checks} ${name}`);}
try{
 run('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);run('pg_ctl',['-D',data,'-o',`-k ${sock} -p ${port} -h ''`,'-l',path.join(temp,'pg.log'),'start']);run('createdb',['-h',sock,'-p',String(port),'-U','postgres',db]);
 applyBaseline(sql,dir);for(const f of ['202610120228_admin_login_security.up.sql','202610130229_merchant_whatsapp_authority.up.sql','202610130230_customer_whatsapp_only.up.sql','202610130231_merchant_phone_operator_enrollment.up.sql'])sql(readFileSync(path.join(dir,f),'utf8'));
 pool=new Pool({host:sock,port,user:'postgres',database:db,max:6});let loseAction=null,destroyed=0;
 const faultPool={async connect(){const client=await pool.connect();let action=null;return {async query(q,values){if(q.includes('merchant_whatsapp_command'))action=values[0];const r=await client.query(q,values);if(q==='COMMIT'&&action===loseAction){loseAction=null;throw Error('fixture lost committed acknowledgement');}return r;},release(destroy){if(destroy)destroyed++;client.release(destroy);}};}};
 const sessionKey=Buffer.alloc(32,4),sessionKeys=new Map([['session1',sessionKey]]),ownerOrigin='https://owner.example.test',hostname='broker-fixture.admin.celebix.site',centralHostname='panel.celebix.site';
 const codec=createMerchantWhatsAppCodec({environment:'staging',masterKeyId:'master-v1',masterKeys:new Map([['master-v1',Buffer.alloc(32,1)]]),phoneLookupKeyId:'phone-v1',phoneLookupKey:Buffer.alloc(32,2),recipientRateKey:Buffer.alloc(32,3),sessionKeyId:'session1',sessionKeys});
 const repository=createPostgresMerchantWhatsAppRepository({pool:faultPool,role:'celebix_saas_identity',timeouts}),deliveries=[];
 const service=createOwnerMerchantWhatsAppService({codec,repository,centralLoginHostnames:new Set([centralHostname]),recipientRateKey:Buffer.alloc(32,3),sessionKeys,clock:()=>new Date(),delivery:async input=>{deliveries.push(input);return {recipient:input.phone.slice(1),reportId:input.idempotencyKey};}});
 const internalKey=Buffer.alloc(32,5),gateway=createMerchantInternalGateway({ownerOrigin,keys:new Map([['internal1',internalKey]]),handle:service.command});
 const transport=createMerchantInternalTransport({ownerOrigin,keyId:'internal1',secret:internalKey,fetch:async r=>gateway(r)});
 const store=randomUUID(),principal=randomUUID(),credential='v1.session1.'+randomBytes(32).toString('base64url'),tokenDigest=createHmac('sha256',sessionKey).update('celebix-panel-session-v1\n'+credential).digest('hex');
 sql(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${store}','Broker fixture','broker-fixture','active','tr','TRY','starter',now(),now());
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${principal}','https://identity.example.test','broker-owner','broker@example.test',true,now(),now());
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${randomUUID()}','${principal}','${store}','store_owner','active',now(),now());
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${randomUUID()}','${store}',(SELECT id FROM saas.plans WHERE plan_code='pilot' AND version=1),'pilot',1,'active',now(),now(),now());
 INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,created_at,updated_at,management) VALUES('${randomUUID()}','${store}','${hostname}','platform_subdomain','active',true,now(),now(),now(),'platform');
 SELECT * FROM saas.issue_panel_session('${randomUUID()}','${randomUUID()}','${randomUUID()}','session1','${tokenDigest}','${principal}','${store}',now(),now()+interval '20 minutes');
 UPDATE saas.merchant_whatsapp_policy SET central_hostnames=ARRAY['owner.example.test','${centralHostname}'],signup_enabled=true;`);
 function browser(host=hostname,purpose='login',completeSession){
  const jar=new Map();let csrf;
  const h=createMerchantPhoneHandlers({transport,requireActor:async()=>credential,authenticateIngress:()=>({authenticated:true,trustedIp:'203.0.113.9'}),purpose,...(completeSession?{completeSession}:{})});
  const prefix=purpose==='signup'?'/api/merchant-signup':'/api/merchant-login';
  const req=(pathname,body)=>new Request('http://internal:3400'+pathname,{method:body?'POST':'GET',headers:{host,origin:'https://'+host,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'content-type':'application/json','idempotency-key':body.operationId,'x-celebix-merchant-phone-csrf':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  async function call(action,payload,bind=false){const pathname=action==='complete'?'/auth/merchant-phone/complete':prefix+(bind?'/bind':'')+'/'+action;const r=await h[bind?'bind'+action[0].toUpperCase()+action.slice(1):action](req(pathname,payload));for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');if(v)jar.set(k,v);else jar.delete(k);}const body=action==='complete'?null:await r.json();if(body?.csrfToken)csrf=body.csrfToken;return {r,body};}
  return {call,jar,req,handlers:h};
 }
 let bound;
 await check('actual signed broker, native self binding and panel completion issue a valid cookie',async()=>{
  const b=browser();assert.equal((await b.call('state',undefined,true)).r.status,200);
  const startOperation=randomUUID();const start=await b.call('start',{phone:'+905551110001',operationId:startOperation},true);assert.equal(start.r.status,200,JSON.stringify(start.body));assert.equal(start.body.state.phase,'code');assert.equal(deliveries.length,1);assert.equal((await b.call('start',{phone:'+905551110001',operationId:startOperation},true)).r.status,200);assert.equal(deliveries.length,1);
  const verify=await b.call('verify',{code:deliveries.at(-1).code,operationId:randomUUID()},true);assert.equal(verify.r.status,200,JSON.stringify(verify.body));assert.deepEqual(verify.body,{code:'phone_bound'});assert.equal(verify.r.headers.get('set-cookie'),null);
  const complete=await b.call('complete');assert.equal(complete.r.status,303);bound=b.jar.get('__Host-celebix_panel');assert.ok(bound);const digest=createHmac('sha256',sessionKey).update('celebix-panel-session-v1\n'+bound).digest('hex');assert.equal(sql(`SELECT outcome FROM saas.resolve_panel_session('session1','${digest}',now())`),'resolved');assert.equal(sql(`SELECT principal_id FROM saas.merchant_phone_identities WHERE principal_id='${principal}'`),principal);
 });
 await check('owner staff creation reserves phone, actual login wrong code persists attempts and never sets session cookie',async()=>{
  const created=await service.command({schemaVersion:1,action:'staff_create',purpose:'login',hostname,sessionCredential:bound,operationId:randomUUID(),payload:{phone:'+905551110002',displayName:'Test staff',role:'admin',expectedVersion:0}});assert.equal(created.code,'ok',JSON.stringify(created));
  const b=browser();await b.call('state');const start=await b.call('start',{phone:'+905551110002',operationId:randomUUID()});assert.equal(start.r.status,200,JSON.stringify(start.body));const right=deliveries.at(-1).code,wrong=right==='000000'?'111111':'000000';const verify=await b.call('verify',{code:wrong,operationId:randomUUID()});assert.equal(verify.body.code,'invalid_code');assert.equal(verify.r.headers.get('set-cookie'),null);assert.equal(sql('SELECT max(attempts) FROM saas.merchant_phone_challenges'),'1');
  const count=sql('SELECT count(*) FROM saas.panel_sessions');loseAction='verify';const operationId=randomUUID();const parallel=await Promise.all([b.call('verify',{code:right,operationId}),b.call('verify',{code:right,operationId})]);for(const ok of parallel)assert.equal(ok.body.code,'complete',JSON.stringify(ok.body));assert.equal(destroyed,1);assert.equal(Number(sql('SELECT count(*) FROM saas.panel_sessions')),Number(count)+1);const replay=await b.call('verify',{code:right,operationId});assert.equal(replay.body.code,'complete');assert.equal(Number(sql('SELECT count(*) FROM saas.panel_sessions')),Number(count)+1);const completed=await b.call('complete');assert.equal(completed.r.status,303);assert.ok(b.jar.get('__Host-celebix_panel'));
 });
 await check('lost reservation acknowledgement recovers durable pending without provider re-dispatch',async()=>{
  const b=browser();await b.call('state');const count=deliveries.length,operationId=randomUUID();loseAction='prepare';const first=await b.call('start',{phone:'+905551110003',operationId});assert.equal(first.body.code,'operation_uncertain',JSON.stringify(first.body));assert.equal(deliveries.length,count);assert.equal(destroyed,2);const retry=await b.call('start',{phone:'+905551110003',operationId});assert.equal(retry.body.code,'operation_uncertain');assert.equal(deliveries.length,count);
 });
 await check('real signup proof, tenant core and native claim agree on canonical new tenant and exact committed replay',async()=>{
  const b=browser('owner.example.test','signup');await b.call('state');assert.equal((await b.call('start',{phone:'+905551110004',operationId:randomUUID()})).r.status,200);assert.equal((await b.call('verify',{code:deliveries.at(-1).code,operationId:randomUUID()})).body.code,'phone_verified');
  const core=createStarterTenantService({repository:new PostgresSaaSDataRepository({pool,generateId:()=>randomUUID(),audit:()=>{},timeouts,bootstrapRole:'celebix_saas_bootstrap',panelOrigin:'https://panel.celebix.site'}),platformDomainSuffix:'celebix.site'}),completions=[];
  const handler=createMerchantPhoneRegistrationHandler({ownerOrigin,clock:()=>new Date(),starterTenant:core,getSignupProof:async()=>service.getSignupProof({pendingCookie:b.jar.get('__Host-celebix_merchant_signup_pending'),browserCredential:b.jar.get('__Host-celebix_merchant_signup_browser'),hostname:'owner.example.test'}),claimSignup:service.claimSignup,complete:async({completion})=>{completions.push(completion);return new Response(null,{status:303,headers:{location:completion.destinationOrigin}});}});
  const operationId=randomUUID(),fields={operationId,storeName:'Fresh phone shop',storeSlug:'fresh-phone-shop',privacyConsent:'on'};
  const submit=()=>handler(new Request('http://internal:3100/api/self-serve/register',{method:'POST',headers:{host:'owner.example.test',origin:ownerOrigin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}));
  const result=await submit();assert.equal(result.status,303,await result.clone().text());assert.equal(completions[0].destinationOrigin,'https://fresh-phone-shop.admin.celebix.site');const sessions=sql('SELECT count(*) FROM saas.panel_sessions');assert.equal((await submit()).status,303);assert.deepEqual(completions[0],completions[1]);assert.equal(sql('SELECT count(*) FROM saas.panel_sessions'),sessions);assert.equal(sql("SELECT count(*) FROM saas.stores WHERE slug='fresh-phone-shop'"),'1');
 });
 await check('central pre-enrolled original principal transfers one prepared handoff with fixed original expiry',async()=>{
  const target=randomUUID(),operator=randomUUID(),operatorPrincipal=randomUUID(),phone='+905551110005';
  sql(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${target}','https://identity.example.test','central-original','central-original@example.test',true,now(),now()),('${operatorPrincipal}','https://operator.example.test','central-operator','sdkahmetcelebi@icloud.com',true,now(),now());INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active) VALUES('${operator}','https://operator.example.test','central-operator','${operatorPrincipal}','sdkahmetcelebi@icloud.com',true);INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${randomUUID()}','${target}','${store}','editor','active',now(),now());`);
  const identity=codec.phoneIdentity(phone),enrollment={operatorId:operator,operationId:randomUUID(),principalId:target,reason:'Confirmed original principal personal phone',phoneKeyId:identity.phoneKeyId,phoneDigest:identity.phoneDigest,phoneCiphertext:identity.phoneCiphertext,phoneMasked:identity.phoneMasked};
  assert.equal(sql(`SET ROLE celebix_saas_platform_operator;SELECT outcome FROM saas.merchant_phone_operator_enroll(${literal(JSON.stringify(enrollment))}::jsonb)`),'prepared');
  const memberships=sql('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM saas.memberships m'),handoffBefore=Number(sql('SELECT count(*) FROM saas.cross_host_panel_handoffs'));
  const handoffRepository=createPostgresCrossHostSessionHandoffRepository(createPanelSessionPersistenceApproval('disposable_test'),{pool,handoffKeys:new Map([['handoff1',Buffer.alloc(32,7)]]),activeHandoffKeyId:'handoff1',sessionKeys,activeSessionKeyId:'session1',clock:()=>new Date(),randomBytes,timeouts,audit:()=>undefined});
  const transfer=createMerchantSessionCompletion({repository:handoffRepository,secret:internalKey,handoffKeyId:'handoff1',allowedPurpose:'login',clock:()=>new Date(),randomBytes});let savedCompletion;
  const b=browser(centralHostname,'login',async(completion,request)=>{savedCompletion=completion;return transfer({completion,request,operationId:completion.sessionId});});
  assert.equal((await b.call('state')).r.status,200);assert.equal((await b.call('start',{phone,operationId:randomUUID()})).r.status,200);assert.equal((await b.call('verify',{code:deliveries.at(-1).code,operationId:randomUUID()})).body.code,'complete');
  const request=b.req('/auth/merchant-phone/complete'),responses=await Promise.all([b.handlers.complete(request.clone()),b.handlers.complete(request.clone())]);
  for(const response of responses){assert.equal(response.status,200,await response.clone().text());assert.ok(!response.headers.getSetCookie().some(c=>c.startsWith('__Host-celebix_panel=')));}
  const tokenFrom=html=>html.match(/name="handoff" value="([^"]+)"/)[1],token=tokenFrom(await responses[0].text());assert.equal(tokenFrom(await responses[1].text()),token);
  const again=await b.handlers.complete(request.clone());assert.equal(again.status,200);assert.equal(tokenFrom(await again.text()),token);assert.equal(Number(sql('SELECT count(*) FROM saas.cross_host_panel_handoffs')),handoffBefore+1);
  assert.equal(savedCompletion.destinationOrigin,'https://'+hostname);assert.equal(savedCompletion.destinationStoreId,store);assert.equal(Date.parse(savedCompletion.sessionExpiresAt)-Date.parse(savedCompletion.sessionIssuedAt),8*3600000);
  const redeemed=await handoffRepository.redeemHandoff({credential:token,destinationHostname:hostname,now:new Date()});assert.equal(redeemed.kind,'redeemed',JSON.stringify(redeemed));assert.equal(redeemed.session.principalId,target);assert.equal(redeemed.session.activeStoreId,store);assert.equal(redeemed.session.expiresAt,savedCompletion.sessionExpiresAt);
  assert.equal((await handoffRepository.redeemHandoff({credential:token,destinationHostname:hostname,now:new Date()})).kind,'handoff_replayed');const afterRedeem=await b.handlers.complete(request.clone());assert.ok(afterRedeem.status>=400);assert.ok(!afterRedeem.headers.getSetCookie().some(c=>c.startsWith('__Host-celebix_panel=')));assert.equal(Number(sql('SELECT count(*) FROM saas.cross_host_panel_handoffs')),handoffBefore+1);assert.equal(sql('SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM saas.memberships m'),memberships);
  assert.equal(sql(`SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${target}'`),'2');
 });
 console.log(`PASS ${checks} real merchant broker integration checks`);
}finally{if(pool)await pool.end();try{run('pg_ctl',['-D',data,'-m','immediate','stop']);}catch{}rmSync(temp,{recursive:true,force:true});}
