import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createInvitationBrowserHandlers} from './handlers.ts';
import {createInvitationTransport,INVITATION_BINDING_COOKIE} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
import {createInvitationService} from '../../../owner/lib/platform-invitations/service.ts';
import {createInvitationInternalHandler} from '../../../owner/lib/platform-invitations/http.ts';
import {createAes256GcmPayloadCipher} from '../../../owner/lib/saas-persistence/identity-crypto.ts';
import type {OidcProviderCallbackInput} from '../../../owner/lib/self-serve-oidc.ts';
const fixed=()=>new Date('2026-10-04T00:00:00Z');
const token='a'.repeat(72),host='shop.admin.example.test';
const config={ownerOrigin:'https://owner.example.test',panelOrigin:'https://panel.example.test',panelCallbackUrl:'https://panel.example.test/auth/callback',authorizationOrigin:'https://identity.example.test',clientId:'common-admin',key:Buffer.alloc(32,8),keyId:'fixture'};
function post(url:string,payload:string,origin:string,publicHost=new URL(url).host){return new Request(url,{method:'POST',headers:{host:publicHost,origin,'content-type':'application/x-www-form-urlencoded'},body:payload});}
function fixture(){
 const transport=createInvitationTransport({key:config.key,keyId:config.keyId,clock:fixed});let saved:unknown[]=[];let completed=false;let verifyCount=0;const actions:string[]=[];
 const service=createInvitationService({issuer:'https://identity.example.test',audience:config.clientId,callbackUrl:config.panelCallbackUrl,clock:fixed,seal:transport.seal,cipher:createAes256GcmPayloadCipher({currentKeyId:'fixture',resolveKey:()=>Buffer.alloc(32,9)}),provider:{buildAuthorizationUrl(input){const u=new URL(`${config.authorizationOrigin}/oidc/auth`);for(const [name,value] of Object.entries({state:input.state,redirect_uri:input.redirectUri,code_challenge:input.codeChallenge,code_challenge_method:input.codeChallengeMethod,client_id:config.clientId,response_type:'code'}))u.searchParams.set(name,value);return u;},async verifyCallback(input:OidcProviderCallbackInput){verifyCount++;return {issuer:input.expectedIssuer,subject:'new-subject',email:'invited@example.test',emailVerified:true,nonce:input.expectedNonce,audience:[config.clientId]};}},repository:{async execute(name,values){actions.push(name);if(name==='start'){assert.equal(values[2],host);saved=values;return {id:values[0]};}if(name==='claim'){if(completed)return {outcome:'replayed',result:{redirectUrl:`https://${host}/invitations/accepted`}};return {id:saved[0],encryptedPayload:JSON.parse(String(saved[5]))};}assert.deepEqual(values.slice(1),['https://identity.example.test','new-subject','invited@example.test',true]);completed=true;return {outcome:'committed',result:{redirectUrl:`https://${host}/invitations/accepted`}};}}});
 const internal=createInvitationInternalHandler(async()=>({service,transport,ownerOrigin:config.ownerOrigin}));
 // A real HTTPS fetch supplies the public Host; Next exposes the internal URL
 // to the receiving handler after TLS terminates at the trusted proxy.
 const handlers=createInvitationBrowserHandlers({configuration:()=>config,clock:fixed,async fetch(request){const url=new URL(request.url),headers=new Headers(request.headers);headers.set('host',url.host);return internal(new Request(`http://n${url.pathname}${url.search}`,{method:request.method,headers,body:await request.text()}));}});
 return {handlers,transport,verifyCount:()=>verifyCount,actions};
}
async function begin(f:ReturnType<typeof fixture>){const started=await f.handlers.start(post(`https://${host}/api/platform-invitations/start`,`token=${token}`,`https://${host}`));assert.equal(started.status,200);assert.equal(started.headers.get('set-cookie'),null);const html=await started.text();assert.equal(html.includes('nonce='),true);const ticket=html.match(/name="ticket" value="([^"]+)"/)![1];const bootstrapped=await f.handlers.bootstrap(post(`${config.panelOrigin}/api/platform-invitations/bootstrap`,`ticket=${encodeURIComponent(ticket)}`,`https://${host}`));assert.equal(bootstrapped.status,303);const authorization=new URL(bootstrapped.headers.get('location')!);assert.equal(authorization.origin,config.authorizationOrigin);const setCookie=bootstrapped.headers.get('set-cookie')!;assert.match(setCookie,/Secure; HttpOnly; SameSite=Lax/);return {ticket,state:authorization.searchParams.get('state')!,cookie:setCookie.split(';')[0]};}
test('tenant invitation uses central callback and separate browser cookie, creates only native membership and recovers completed response',async()=>{const f=fixture(),b=await begin(f);const callback=new Request(`${config.panelCallbackUrl}?state=${b.state}&code=verified`,{headers:{host:'panel.example.test',cookie:`celebix_panel_session=normal-session; ${b.cookie}`}});const completed=await f.handlers.callback(callback);assert.equal(completed.status,303);assert.equal(completed.headers.get('location'),`https://${host}/invitations/accepted`);assert.equal(completed.headers.get('set-cookie'),`${INVITATION_BINDING_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);assert.equal(f.verifyCount(),1);assert.equal((await f.handlers.callback(callback)).status,303);assert.equal(f.verifyCount(),1);assert.deepEqual([...new Set(f.actions)],['start','claim','complete']);});
test('wrong tenant start origin, tampered bootstrap, cross origin, duplicate or absent browser binding fail closed',async()=>{const f=fixture();assert.equal((await f.handlers.start(post(`https://${host}/api/platform-invitations/start`,`token=${token}`,'https://evil.example.test'))).status,403);assert.equal(f.actions.length,0);const b=await begin(f);assert.equal((await f.handlers.bootstrap(post(`${config.panelOrigin}/api/platform-invitations/bootstrap`,`ticket=${b.ticket}`,'https://other.admin.example.test'))).status,403);assert.equal((await f.handlers.bootstrap(post(`${config.panelOrigin}/api/platform-invitations/bootstrap`,'ticket=iv1.tampered',`https://${host}`))).status,403);const callback=`${config.panelCallbackUrl}?state=${b.state}&code=verified`;assert.equal((await f.handlers.callback(new Request(callback,{headers:{host:'panel.example.test'}}))).status,403);assert.equal((await f.handlers.callback(new Request(callback,{headers:{host:'panel.example.test',cookie:`${b.cookie}; ${b.cookie}`}}))).status,403);assert.equal((await f.handlers.callback(new Request(callback,{headers:{host:'other.admin.example.test',cookie:b.cookie}}))).status,403);assert.equal(f.verifyCount(),0);});

test('HTTPS invitation completes through proxy-facing HTTP URLs with public Host authority',async()=>{
 const f=fixture();
 const started=await f.handlers.start(post('http://n/api/platform-invitations/start',`token=${token}`,`https://${host}`,host));
 assert.equal(started.status,200);
 const html=await started.text(),ticket=html.match(/name="ticket" value="([^"]+)"/)![1];
 assert.ok(html.includes(`action="${config.panelOrigin}/api/platform-invitations/bootstrap"`));
 assert.equal(started.headers.get('set-cookie'),null);
 const bootstrapped=await f.handlers.bootstrap(post('http://n/api/platform-invitations/bootstrap',`ticket=${encodeURIComponent(ticket)}`,`https://${host}`,'panel.example.test'));
 assert.equal(bootstrapped.status,303);
 const authorization=new URL(bootstrapped.headers.get('location')!),setCookie=bootstrapped.headers.get('set-cookie')!;
 assert.equal(authorization.origin,config.authorizationOrigin);
 assert.match(setCookie,/Secure; HttpOnly; SameSite=Lax/);
 const callback=new Request(`http://n/auth/callback?state=${authorization.searchParams.get('state')!}&code=verified`,{headers:{host:'panel.example.test',cookie:setCookie.split(';')[0]}});
 const completed=await f.handlers.callback(callback);
 assert.equal(completed.status,303);
 assert.equal(completed.headers.get('location'),`https://${host}/invitations/accepted`);
 assert.equal(completed.headers.get('set-cookie'),`${INVITATION_BINDING_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
 assert.equal(f.verifyCount(),1);
 assert.deepEqual(f.actions,['start','claim','complete']);
});

test('proxy-facing invitations reject invalid public authority and non-HTTPS browser origins',async()=>{
 const f=fixture();
 for(const [url,origin,authority] of [
  ['http://n/api/platform-invitations/start',`http://${host}`,host],
  ['http://n/api/platform-invitations/start',`https://${host}`,''],
  ['http://n/api/platform-invitations/start',`https://${host}`,'other.admin.example.test'],
  ['ftp://n/api/platform-invitations/start',`https://${host}`,host],
 ])assert.equal((await f.handlers.start(post(url,`token=${token}`,origin,authority))).status,403);
 assert.equal(f.actions.length,0);
 const b=await begin(f);
 assert.equal((await f.handlers.bootstrap(post('http://n/api/platform-invitations/bootstrap',`ticket=${b.ticket}`,`https://${host}`,'other.example.test'))).status,403);
 assert.equal((await f.handlers.bootstrap(post('http://n/api/platform-invitations/bootstrap',`ticket=${b.ticket}`,`http://${host}`,'panel.example.test'))).status,403);
 assert.equal((await f.handlers.bootstrap(post('http://n/api/platform-invitations/bootstrap','ticket=iv1.tampered',`https://${host}`,'panel.example.test'))).status,403);
 for(const headers of [{host:'other.example.test',cookie:b.cookie},{host:'panel.example.test'},{host:'panel.example.test',cookie:`${b.cookie}; ${b.cookie}`}])assert.equal((await f.handlers.callback(new Request(`http://n/auth/callback?state=${b.state}&code=verified`,{headers}))).status,403);
 assert.equal(f.verifyCount(),0);
});

test('invitation layout supplies origin-only referrer policy without the bearer path',()=>{
 const source=readFileSync(new URL('../../app/invitations/layout.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loaded={exports:{} as {metadata?:{referrer?:string}}};
 Function('module','exports',compiled)(loaded,loaded.exports);
 assert.equal(loaded.exports.metadata?.referrer,'strict-origin');
});

test('only successful start HTML preserves form Origin while bootstrap callback and errors suppress referrers',async()=>{
 const f=fixture();
 const started=await f.handlers.start(post('http://n/api/platform-invitations/start',`token=${token}`,`https://${host}`,host));
 assert.equal(started.status,200);
 assert.equal(started.headers.get('referrer-policy'),'strict-origin');
 const ticket=(await started.text()).match(/name="ticket" value="([^"]+)"/)![1];
 const bootstrap=await f.handlers.bootstrap(post('http://n/api/platform-invitations/bootstrap',`ticket=${encodeURIComponent(ticket)}`,`https://${host}`,'panel.example.test'));
 assert.equal(bootstrap.status,303);
 assert.equal(bootstrap.headers.get('referrer-policy'),'no-referrer');
 const authorization=new URL(bootstrap.headers.get('location')!);
 const callback=await f.handlers.callback(new Request(`http://n/auth/callback?state=${authorization.searchParams.get('state')!}&code=verified`,{headers:{host:'panel.example.test',cookie:bootstrap.headers.get('set-cookie')!.split(';')[0]}}));
 assert.equal(callback.status,303);
 assert.equal(callback.headers.get('referrer-policy'),'no-referrer');
 const denied=await f.handlers.start(post('http://n/api/platform-invitations/start',`token=${token}`,'null',host));
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('referrer-policy'),'no-referrer');
});

test('both invitation POST phases reject null or absent Origin instead of bypassing origin checks',async()=>{
 for(const absent of [false,true]){
  const f=fixture(),start=post('http://n/api/platform-invitations/start',`token=${token}`,'null',host);
  if(absent)start.headers.delete('origin');
  assert.equal((await f.handlers.start(start)).status,403);
  assert.equal(f.actions.length,0);
  const b=await begin(f),bootstrap=post('http://n/api/platform-invitations/bootstrap',`ticket=${encodeURIComponent(b.ticket)}`,'null','panel.example.test');
  if(absent)bootstrap.headers.delete('origin');
  assert.equal((await f.handlers.bootstrap(bootstrap)).status,403);
  assert.deepEqual(f.actions,['start']);
  assert.equal(f.verifyCount(),0);
 }
});
