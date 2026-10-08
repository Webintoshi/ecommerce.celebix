import assert from 'node:assert/strict';import test from 'node:test';import type {TenantContext} from '@celebix/saas-contracts';
import {createPostgresGoogleMarketingRepository} from './repository.ts';
const ids={store:'10000000-0000-4000-8000-000000000001',actor:'20000000-0000-4000-8000-000000000001',membership:'30000000-0000-4000-8000-000000000001',plan:'00000000-0000-4000-8000-000000000101',operation:'60000000-0000-4000-8000-000000000001'};const now=new Date('2026-10-08T12:00:00Z');
const tenant={schemaVersion:1,requestId:'req',principal:{id:ids.actor,issuer:'https://identity.test',subject:'owner'},store:{id:ids.store,slug:'store',status:'active'},membership:{id:ids.membership,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:ids.plan,planCode:'starter',version:1,status:'active',features:['integrations'],limits:{products:1,staff:1,storageBytes:1},validFrom:'2026-01-01T00:00:00Z'},locale:'tr'} as TenantContext;
const configuration={clientId:'id',clientSecret:'CLIENT_SECRET',panelOrigin:'https://panel.example.com',allowedReturnOrigins:['https://store.panel.example.com'],credentialKeyring:{activeKeyId:'k1',keys:[{keyId:'k1',key:new Uint8Array(32).fill(5)}]}};
function fixture(responder:(action:string,input:any)=>any){const calls:Array<{text:string;values:any[]}>=[];return {calls,pool:{async connect(){return {async query(text:string,values:any[]=[]){calls.push({text,values});if(text.includes('google_marketing_command')){const value=responder(values[7],JSON.parse(values[8]));return {rows:[value],rowCount:1,command:'',oid:0,fields:[]};}return {rows:[],rowCount:0,command:'',oid:0,fields:[]};},release(){}};}}};}
test('invalid bound state stops before exchanging a Google code',async()=>{let exchanges=0;const f=fixture(()=>({outcome:'oauth_state_invalid',result_payload:null}));const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async()=>{exchanges++;return Response.json({});}});await assert.rejects(()=>repo.complete({tenantContext:tenant,now,sessionBinding:'session_cookie_hash',state:'x'.repeat(43),code:'private-code'}),(error:any)=>error.code==='oauth_state_invalid');assert.equal(exchanges,0);assert.equal(f.calls.find(c=>c.text.includes('google_marketing_command'))?.values[0],ids.store);assert.ok(!JSON.stringify(f.calls).includes('private-code'));});
test('OAuth state is hashed in persistence and return origin and session are bound',async()=>{const f=fixture(()=>({outcome:'started',result_payload:{scopes:[]}}));const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration});const result=await repo.begin({tenantContext:tenant,service:'gtm',operationId:ids.operation,sessionBinding:'cookie-secret-at-least-16',returnOrigin:'https://store.panel.example.com',now});const url=new URL(result.authorizationUrl);assert.equal(url.searchParams.get('redirect_uri'),'https://panel.example.com/api/marketing/google/callback');assert.ok(url.searchParams.get('scope')?.includes('tagmanager.readonly'));const requested=new Set(url.searchParams.get('scope')!.split(' '));for(const scope of gtmSetupScopes)assert.ok(requested.has(scope),`initial OAuth is missing ${scope}`);assert.ok(![...requested].some(scope=>/adwords|webmasters|siteverification/.test(scope)));assert.equal(requested.size,6);const input=JSON.parse(f.calls.find(c=>c.text.includes('google_marketing_command'))!.values[8]);assert.match(input.stateHash,/^[a-f0-9]{64}$/);assert.notEqual(input.stateHash,url.searchParams.get('state'));assert.equal(input.returnOrigin,'https://store.panel.example.com');assert.ok(!JSON.stringify(f.calls).includes('cookie-secret-at-least-16'));});
test('missing crypto blocks OAuth begin before writing state',async()=>{const f=fixture(()=>({outcome:'started',result_payload:{scopes:[]}}));const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration:{...configuration,credentialKeyring:undefined}});await assert.rejects(()=>repo.begin({tenantContext:tenant,service:'gtm',operationId:ids.operation,sessionBinding:'cookie-secret-at-least-16',returnOrigin:'https://store.panel.example.com',now}),(error:any)=>error.code==='crypto_unavailable');assert.equal(f.calls.length,0);});
test('a completed idempotent apply replays before provider transport',async()=>{let calls=0;const connection={service:'ads',version:1,status:'connected',googleEmail:'owner@example.com',selection:{accountId:'123',resourceId:'456',resourceName:'Purchase',tagId:'AW-987654',conversionLabel:'real_Label'},lastCheckedAt:now.toISOString(),errorCode:null};const f=fixture(action=>action==='claim'?{outcome:'operation_replayed',result_payload:connection}:{outcome:'private',result_payload:{domain:'store.example.com',credential:null,connection}});const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async()=>{calls++;return Response.json({});}});assert.deepEqual(await repo.apply({tenantContext:tenant,now,service:'ads',expectedVersion:0,selection:connection.selection,operationId:ids.operation}),connection);assert.equal(calls,0);});
test('successful callback stores only authenticated ciphertext after verified Google identity',async()=>{
 const f=fixture(action=>action==='consume_state'?{outcome:'consumed',result_payload:{service:'ads',returnOrigin:'https://store.panel.example.com'}}:action==='private'?{outcome:'private',result_payload:{domain:'store.example.com',credential:null,requiredScopes:[],connection:{service:'ads',version:0,status:'disconnected',googleEmail:null,selection:null,lastCheckedAt:null,errorCode:null}}}:{outcome:'saved',result_payload:null});
 const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async url=>String(url).includes('/token')?Response.json({access_token:'ACCESS_PRIVATE',refresh_token:'REFRESH_PRIVATE',expires_in:3600,scope:'https://www.googleapis.com/auth/adwords'}):Response.json({sub:'google-owner',email:'owner@example.com',email_verified:true})});
 assert.deepEqual(await repo.complete({tenantContext:tenant,now,sessionBinding:'session_cookie_hash',state:'x'.repeat(43),code:'CODE_PRIVATE'}),{returnOrigin:'https://store.panel.example.com'});
 const serialized=JSON.stringify(f.calls);assert.doesNotMatch(serialized,/ACCESS_PRIVATE|REFRESH_PRIVATE|CODE_PRIVATE|CLIENT_SECRET/);const credential=JSON.parse(f.calls.find(c=>c.values[7]==='credential')!.values[8]).credential;assert.equal(credential.algorithm,'A256GCM');assert.equal(credential.version,1);
});
test('revoked refresh token records reconnect status and reveals no provider response',async()=>{
 const {sealGoogleCredential}=await import('./credential-crypto.ts');const encrypted=sealGoogleCredential({accessToken:'ACCESS_PRIVATE',refreshToken:'REFRESH_PRIVATE',expiresAt:'2026-10-08T10:00:00Z',scopes:['https://www.googleapis.com/auth/adwords'],subject:'owner',email:'owner@example.com'},ids.store,'ads',configuration.credentialKeyring);
 const f=fixture(action=>action==='private'?{outcome:'private',result_payload:{domain:'store.example.com',credential:encrypted,requiredScopes:[],connection:{service:'ads',version:0,status:'disconnected',googleEmail:'owner@example.com',selection:null,lastCheckedAt:null,errorCode:null}}}:{outcome:'saved',result_payload:null});const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async()=>Response.json({error:'invalid_grant',message:'REFRESH_PRIVATE'},{status:400})});
 await assert.rejects(()=>repo.resources({tenantContext:tenant,now,service:'ads'}),(error:any)=>error.code==='needs_reconnect'&&!String(error).includes('PRIVATE'));assert.ok(f.calls.some(c=>c.values[7]==='error'&&JSON.parse(c.values[8]).code==='needs_reconnect'));assert.doesNotMatch(JSON.stringify(f.calls),/ACCESS_PRIVATE|REFRESH_PRIVATE/);
});

const gtmSetupScopes=[
 'https://www.googleapis.com/auth/tagmanager.readonly',
 'https://www.googleapis.com/auth/tagmanager.edit.containers',
 'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
 'https://www.googleapis.com/auth/tagmanager.publish',
];
function gtmCallbackFixture(scopes:string[]){
 const f=fixture(action=>action==='consume_state'?{outcome:'consumed',result_payload:{service:'gtm',returnOrigin:'https://store.panel.example.com'}}:action==='private'?{outcome:'private',result_payload:{domain:'store.example.com',credential:null,requiredScopes:[],connection:{service:'gtm',version:0,status:'disconnected',googleEmail:null,selection:null,lastCheckedAt:null,errorCode:null}}}:{outcome:'saved',result_payload:null});
 const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async url=>String(url).includes('/token')?Response.json({access_token:'ACCESS_PRIVATE',refresh_token:'REFRESH_PRIVATE',expires_in:3600,scope:scopes.join(' ')}):Response.json({sub:'google-owner',email:'owner@example.com',email_verified:true})});
 return {...f,repo};
}
const gtmCallback={tenantContext:tenant,now,sessionBinding:'session_cookie_hash',state:'x'.repeat(43),code:'CODE_PRIVATE'};
test('one GTM consent grants all setup permissions and saves the bound encrypted credential',async()=>{
 const f=gtmCallbackFixture(gtmSetupScopes);
 assert.deepEqual(await f.repo.complete(gtmCallback),{returnOrigin:'https://store.panel.example.com'});
 const saved=f.calls.filter(c=>c.values[7]==='credential');assert.equal(saved.length,1);
 const {openGoogleCredential}=await import('./credential-crypto.ts');
 const input=JSON.parse(saved[0]!.values[8]);
 assert.equal(input.service,'gtm');
 assert.deepEqual(openGoogleCredential(input.credential,ids.store,'gtm',configuration.credentialKeyring).scopes,gtmSetupScopes);
 assert.doesNotMatch(JSON.stringify(f.calls),/ACCESS_PRIVATE|REFRESH_PRIVATE|CODE_PRIVATE|CLIENT_SECRET/);
});
for(const missing of gtmSetupScopes.slice(1))test(`GTM callback denies missing ${missing} before saving a partial setup`,async()=>{
 const f=gtmCallbackFixture(gtmSetupScopes.filter(scope=>scope!==missing));
 await assert.rejects(()=>f.repo.complete(gtmCallback),(error:any)=>error.code==='oauth_denied');
 assert.equal(f.calls.filter(c=>c.values[7]==='credential').length,0);
});
for(const refresh of [false,true])test(`first GTM grant continues to Apply without another consent${refresh?' after a refresh with omitted scopes':''}`,async()=>{
 const selection={accountId:'1',resourceId:'2',resourceName:'Web',tagId:'GTM-ABC123'};
 const connection={service:'gtm',version:1,status:'connected',googleEmail:'owner@example.com',selection,lastCheckedAt:now.toISOString(),errorCode:null};
 let encrypted:unknown=null,tokenRequests=0;
 const f=fixture((action,input)=>{
  if(action==='consume_state')return {outcome:'consumed',result_payload:{service:'gtm',returnOrigin:'https://store.panel.example.com'}};
  if(action==='private')return {outcome:'private',result_payload:{domain:'store.example.com',credential:input.service==='gtm'?encrypted:null,requiredScopes:[],connection:{...connection,service:input.service,status:'disconnected',version:0,selection:null}}};
  if(action==='credential'||action==='refresh'){encrypted=input.credential;return {outcome:'saved',result_payload:null};}
  if(action==='claim')return {outcome:'claimed',result_payload:{leaseToken:'lease',progress:{versionId:'3'}}};
  if(action==='finalize')return {outcome:'saved',result_payload:connection};
  throw new Error(`unexpected local command ${action}`);
 });
 const repo=createPostgresGoogleMarketingRepository({pool:f.pool,configuration,fetch:async url=>{
  const path=new URL(String(url)).pathname;
  if(path.endsWith('/token')){tokenRequests++;return Response.json({access_token:'ACCESS_PRIVATE',...(tokenRequests===1?{refresh_token:'REFRESH_PRIVATE',scope:gtmSetupScopes.join(' ')}:{}),expires_in:refresh&&tokenRequests===1?20:3600});}
  if(path.endsWith('/userinfo'))return Response.json({sub:'google-owner',email:'owner@example.com',email_verified:true});
  if(path.endsWith('/accounts'))return Response.json({account:[{accountId:'1',name:'Tenant'}]});
  if(path.endsWith('/containers'))return Response.json({container:[{containerId:'2',name:'Web',publicId:'GTM-ABC123',usageContext:['web']}]});
  if(path.endsWith('/versions:live'))return Response.json({containerVersionId:'3',tag:[]});
  throw new Error(`unexpected local provider ${path}`);
 }});
 await repo.complete(gtmCallback);
 assert.deepEqual(await repo.apply({tenantContext:tenant,now,service:'gtm',expectedVersion:0,selection,operationId:ids.operation}),connection);
 assert.equal(tokenRequests,refresh?2:1);
 assert.equal(f.calls.filter(c=>c.values[7]==='scopes').length,0);
 assert.doesNotMatch(JSON.stringify(f.calls),/ACCESS_PRIVATE|REFRESH_PRIVATE|CODE_PRIVATE|CLIENT_SECRET/);
});
