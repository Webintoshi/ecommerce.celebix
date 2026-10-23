import assert from 'node:assert/strict';
import test from 'node:test';
import {createMerchantPhoneHandlers,MerchantActorUnavailable} from './handler.ts';
import {parseStaffState} from '../merchant-staff-ui/model.ts';
const origin='https://shop.admin.example.com',operation='12345678-1234-4234-8234-123456789abc';
function fixture(){const calls:any[]=[];let authorized=true;const handlers=createMerchantPhoneHandlers({clock:()=>new Date('2026-10-13T10:00:00.000Z'),randomBytes:size=>new Uint8Array(size).fill(7),requireActor:async()=>{if(!authorized)throw Error();return 'v1.session1.'+Buffer.alloc(32,3).toString('base64url');},authenticateIngress:()=>({authenticated:true,trustedIp:'203.0.113.4'}),transport:{async command(input){calls.push(input);return {schemaVersion:1,code:'ok',state:input.action==='self_state'?{phoneMasked:null,phoneVerified:false}:{phase:'phone'}};}}});return {handlers,calls,unauthorize(){authorized=false;}};}
function request(path:string,init:RequestInit={}){return new Request(origin+path,{...init,headers:{host:'shop.admin.example.com',...init.headers}});}
async function setup(f:ReturnType<typeof fixture>){const response=await f.handlers.state(request('/api/merchant-login/state'));const body=await response.json();const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');return {cookie,csrf:body.csrfToken};}
test('state exposes only public phase plus memory CSRF and HttpOnly host cookies',async()=>{const f=fixture();const response=await f.handlers.state(request('/api/merchant-login/state'));assert.equal(response.status,200);const body=await response.json();assert.deepEqual(Object.keys(body).sort(),['code','csrfToken','state']);assert.match(body.csrfToken,/^[A-Za-z0-9_-]{43}$/);assert.equal(response.headers.get('cache-control'),'no-store');assert(response.headers.getSetCookie().every(v=>v.includes('HttpOnly; Secure; SameSite=Lax; Path=/')));});
test('CSRF, same origin and idempotency are required before broker',async()=>{const f=fixture(),s=await setup(f);const base={method:'POST',headers:{origin,'content-type':'application/json',cookie:s.cookie,'idempotency-key':operation},body:JSON.stringify({phone:'+905551234567',operationId:operation})};const missing=await f.handlers.start(request('/api/merchant-login/start',base));assert.equal(missing.status,403);assert.equal(f.calls.length,1);const good=await f.handlers.start(request('/api/merchant-login/start',{...base,headers:{...base.headers,'x-celebix-merchant-phone-csrf':s.csrf}}));assert.equal(good.status,200);assert.equal(f.calls.at(-1).ingressAuthenticated,true);assert.equal(f.calls.at(-1).hostname,'shop.admin.example.com');});
test('cross origin, duplicate cookies and browser verified fields fail before native access',async()=>{const f=fixture(),s=await setup(f);for(const [extra,body]of [[{origin:'https://evil.example.com'},{phone:'+905551234567',operationId:operation}],[{}, {phone:'+905551234567',operationId:operation,verified:true}]]as const){const response=await f.handlers.start(request('/api/merchant-login/start',{method:'POST',headers:{origin,'content-type':'application/json',cookie:s.cookie,'idempotency-key':operation,'x-celebix-merchant-phone-csrf':s.csrf,...extra},body:JSON.stringify(body)}));assert.equal(response.status,403);}assert.equal(f.calls.length,1);});
test('binding requires actual panel session and combines only safe self fields',async()=>{const f=fixture();const response=await f.handlers.bindState(request('/api/merchant-login/bind/state'));const body=await response.json();assert.deepEqual(body.state,{phase:'phone',phoneMasked:null,phoneVerified:false});f.unauthorize();const denied=await f.handlers.bindState(request('/api/merchant-login/bind/state'));assert.equal(denied.status,401);});
test('verify never releases private completion credential into JSON',async()=>{const f=fixture(),s=await setup(f);const privateToken='v1.session1.'+Buffer.alloc(32,6).toString('base64url');const handlers=createMerchantPhoneHandlers({randomBytes:size=>new Uint8Array(size).fill(7),requireActor:async()=>'',authenticateIngress:()=>({authenticated:true}),transport:{async command(){return {schemaVersion:1,code:'complete',completion:{sessionCredential:privateToken,sessionId:operation,sessionIssuedAt:'2026-10-13T10:00:00.000Z',sessionExpiresAt:'2026-10-13T18:00:00.000Z',destinationStoreId:operation,destinationOrigin:origin,purpose:'login'}};}}});const response=await handlers.verify(request('/api/merchant-login/verify',{method:'POST',headers:{origin,'content-type':'application/json',cookie:s.cookie,'idempotency-key':operation,'x-celebix-merchant-phone-csrf':s.csrf},body:JSON.stringify({code:'000001',operationId:operation})}));assert.deepEqual(await response.json(),{code:'complete'});assert.equal(response.headers.get('set-cookie'),null);});
test('authority or broker outages remain retryable503 without masquerading as authorization failures',async()=>{const options={requireActor:async()=>{throw new MerchantActorUnavailable();},authenticateIngress:()=>({authenticated:true}),transport:{async command():Promise<any>{throw Error('private transport detail');}}};const h=createMerchantPhoneHandlers(options);assert.equal((await h.bindState(request('/api/merchant-login/bind/state'))).status,503);const r=await h.state(request('/api/merchant-login/state'));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'unavailable'});});
test('internal HTTPS listener does not replace actual canonical public Host authority',async()=>{const f=fixture();for(const listener of ['https://internal:3400','https://0.0.0.0:3400']){const r=await f.handlers.state(new Request(listener+'/api/merchant-login/state',{headers:{host:'shop.admin.example.com'}}));assert.equal(r.status,200);assert.equal(f.calls.at(-1).hostname,'shop.admin.example.com');}assert.equal((await f.handlers.state(new Request('https://evil.example.com/api/merchant-login/state',{headers:{host:'shop.admin.example.com'}}))).status,403);});
test('every binding route including completion forwards current actorB alongside prior browser pendingA',async()=>{
 const actorB='v1.sessionB.'+Buffer.alloc(32,9).toString('base64url'),pendingA='mwc1.pending_a',calls:any[]=[];
 const handlers=createMerchantPhoneHandlers({clock:()=>new Date('2026-10-13T10:00:00.000Z'),randomBytes:size=>new Uint8Array(size).fill(7),requireActor:async()=>actorB,authenticateIngress:()=>({authenticated:true}),transport:{async command(input){calls.push(input);return{schemaVersion:1,code:'ok',state:input.action==='self_state'?{phoneMasked:null,phoneVerified:false}:{phase:'phone'}};}}});
 const initial=await handlers.bindState(request('/api/merchant-login/bind/state'));
 const csrf=(await initial.json()).csrfToken,cookies=initial.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')+`; __Host-celebix_merchant_pending=${pendingA}; __Host-celebix_merchant_purpose=bind_phone`;
 calls.length=0;
 const routes=[
  {action:'state',handler:handlers.bindState},
  {action:'start',handler:handlers.bindStart,body:{phone:'+905551234567',operationId:operation}},
  {action:'resend',handler:handlers.bindResend,body:{operationId:operation}},
  {action:'verify',handler:handlers.bindVerify,body:{code:'001234',operationId:operation}},
  {action:'complete',handler:handlers.complete},
 ];
 for(const {action,handler,body}of routes){
  const path=action==='complete'?'/auth/merchant-phone/complete':`/api/merchant-login/bind/${action}`;
  const headers={cookie:cookies,...(body?{origin,'content-type':'application/json','idempotency-key':operation,'x-celebix-merchant-phone-csrf':csrf}:{})};
  await handler(request(path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}));
  const command=[...calls].reverse().find(value=>value.action===action);
  assert.ok(command);assert.equal(command.purpose,'bind_phone');assert.equal(command.pendingCookie,pendingA);assert.equal(command.sessionCredential,actorB,action);
 }
});
test('binding completion denies an unauthenticated current actor before broker or cookies',async()=>{
 const f=fixture(),initial=await f.handlers.bindState(request('/api/merchant-login/bind/state'));
 const cookies=initial.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')+'; __Host-celebix_merchant_pending=mwc1.pending_a; __Host-celebix_merchant_purpose=bind_phone';
 f.unauthorize();const before=f.calls.length;
 const denied=await f.handlers.complete(request('/auth/merchant-phone/complete',{headers:{cookie:cookies}}));
 assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{code:'unauthorized'});assert.equal(f.calls.length,before);assert.equal(denied.headers.has('set-cookie'),false);
});
test('invalid completion purpose fails before current actor resolution or broker',async()=>{
 let actorCalls=0,brokerCalls=0;
 const h=createMerchantPhoneHandlers({requireActor:async()=>{actorCalls++;throw Error();},authenticateIngress:()=>({authenticated:true}),transport:{async command(){brokerCalls++;return {schemaVersion:1,code:'not_ready'};}}});
 const browser=Buffer.alloc(32,7).toString('base64url');
 for(const purpose of ['signup','unexpected']){
  const denied=await h.complete(request('/auth/merchant-phone/complete',{headers:{cookie:`__Host-celebix_merchant_browser=${browser}; __Host-celebix_merchant_purpose=${purpose}`}}));
  assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{code:'request_invalid'});assert.equal(denied.headers.has('set-cookie'),false);
 }
 assert.equal(actorCalls,0);assert.equal(brokerCalls,0);
});

test('staff delete bridges only row identity and version behind actor, CSRF and operation checks',async()=>{
 const staffId='33333333-3333-4333-8333-333333333333',calls:any[]=[];
 const handlers=createMerchantPhoneHandlers({randomBytes:size=>new Uint8Array(size).fill(7),requireActor:async()=> 'private-actor',authenticateIngress:()=>({authenticated:true}),transport:{async command(input){calls.push(input);return {schemaVersion:1,code:'ok',state:{version:4,enabled:true,staff:[]}};}}});
 const initial=await handlers.staff(request('/api/merchant-staff')),csrf=(await initial.json()).csrfToken,cookie=initial.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const headers={origin,'content-type':'application/json',cookie,'idempotency-key':operation,'x-celebix-merchant-staff-csrf':csrf};
 const input={action:'delete',operationId:operation,expectedVersion:2};
 const response=await handlers.staff(request(`/api/merchant-staff/${staffId}`,{method:'POST',headers,body:JSON.stringify(input)}),staffId);
 assert.equal(response.status,200);assert.deepEqual(calls.at(-1),{schemaVersion:1,action:'staff_delete',purpose:'login',hostname:'shop.admin.example.com',sessionCredential:'private-actor',operationId:operation,payload:{staffId,expectedVersion:2}});assert.deepEqual(await response.json(),{code:'ok',state:{version:4,enabled:true,staff:[]}});
 const count=calls.length;
 for(const change of [{role:'admin'},{displayName:'Ada'},{phone:'+905551112233'},{storeId:staffId}]){assert.equal((await handlers.staff(request(`/api/merchant-staff/${staffId}`,{method:'POST',headers,body:JSON.stringify({...input,...change})}),staffId)).status,403);}
 assert.equal(calls.length,count);
 const denied=await handlers.staff(request(`/api/merchant-staff/${staffId}`,{method:'POST',headers:{...headers,'x-celebix-merchant-staff-csrf':'invalid'},body:JSON.stringify(input)}),staffId);assert.equal(denied.status,403);assert.equal(calls.length,count);
});

const nativePendingStaff={staffId:'33333333-3333-4333-8333-333333333333',displayName:'Ada',phoneMasked:'+90 ••• 2233',role:'admin',enabled:true,version:0,phoneVerified:false,membershipId:null,principalId:null};
function staffFixture(read:()=>Record<string,unknown>){
 const calls:any[]=[];
 const handlers=createMerchantPhoneHandlers({randomBytes:size=>new Uint8Array(size).fill(7),requireActor:async()=> 'private-actor',authenticateIngress:()=>({authenticated:true}),transport:{async command(input){calls.push(input);return {schemaVersion:1,code:'ok',state:read()};}}});
 return {handlers,calls};
}
test('staff GET normalizes native pending membership null without weakening the strict public DTO',async()=>{
 const membershipId='44444444-4444-4444-8444-444444444444',principalId='55555555-5555-4555-8555-555555555555';
 const bound={...nativePendingStaff,staffId:'66666666-6666-4666-8666-666666666666',displayName:'Grace',phoneVerified:true,membershipId,principalId};
 const f=staffFixture(()=>({version:2,enabled:true,staff:[nativePendingStaff,bound]}));
 const response=await f.handlers.staff(request('/api/merchant-staff'));
 assert.equal(response.status,200);
 const body=await response.json(),{membershipId:_membership,principalId:_principal,...pendingPublic}=nativePendingStaff;
 assert.deepEqual(body.state,{version:2,enabled:true,staff:[pendingPublic,{...pendingPublic,staffId:bound.staffId,displayName:'Grace',phoneVerified:true,membershipId}]});
 assert.deepEqual(parseStaffState(body.state),body.state);
 assert.equal(Object.hasOwn(body.state.staff[0],'membershipId'),false);
 assert.equal(body.state.staff.some((row:Record<string,unknown>)=>Object.hasOwn(row,'principalId')),false);
 assert.match(body.csrfToken,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.throws(()=>parseStaffState({version:2,enabled:true,staff:[{...pendingPublic,membershipId:null}]}));
});
test('staff POST returns newly committed phone-only staff and later GET stays readable',async()=>{
 let created=false;
 const f=staffFixture(()=>({version:created?1:0,enabled:true,staff:created?[nativePendingStaff]:[]}));
 const initial=await f.handlers.staff(request('/api/merchant-staff')),csrf=(await initial.json()).csrfToken,cookie=initial.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 created=true;
 const input={phone:'+905551112233',displayName:'Ada',role:'admin',operationId:operation,expectedVersion:0};
 const response=await f.handlers.staff(request('/api/merchant-staff',{method:'POST',headers:{origin,'content-type':'application/json',cookie,'idempotency-key':operation,'x-celebix-merchant-staff-csrf':csrf},body:JSON.stringify(input)}));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(Object.keys(body).sort(),['code','state']);
 assert.equal(body.state.staff[0].staffId,nativePendingStaff.staffId);
 assert.equal(Object.hasOwn(body.state.staff[0],'membershipId'),false);
 assert.equal(Object.hasOwn(body.state.staff[0],'principalId'),false);
 assert.deepEqual(parseStaffState(body.state),body.state);
 assert.deepEqual(f.calls.at(-1),{schemaVersion:1,action:'staff_create',purpose:'login',hostname:'shop.admin.example.com',sessionCredential:'private-actor',operationId:operation,payload:{phone:input.phone,displayName:'Ada',role:'admin',expectedVersion:0}});
 const reread=await f.handlers.staff(request('/api/merchant-staff',{headers:{cookie}}));
 assert.equal(reread.status,200);
 assert.deepEqual((await reread.json()).state,body.state);
});
test('staff projection still fails closed for malformed non-null memberships and unexpected private fields',async()=>{
 for(const row of [{...nativePendingStaff,membershipId:'not-a-uuid'},{...nativePendingStaff,phoneCiphertext:'PRIVATE-PHONE'},{...nativePendingStaff,sessionCredential:'PRIVATE-SESSION'}]){
  const f=staffFixture(()=>({version:1,enabled:true,staff:[row]}));
  const response=await f.handlers.staff(request('/api/merchant-staff'));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{code:'unavailable'});
  assert.equal(response.headers.has('set-cookie'),false);
 }
});
