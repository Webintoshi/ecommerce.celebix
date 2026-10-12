import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSecurityBridge} from "../../../../packages/saas-data/src/admin-login-security/bridge.ts";
import { adminLoginRestartPath, serializeAdminDestinationCookie, createAdminSecurityBridgeHandlers, createAdminLoginSecurityHandlers } from "./handler.ts";
const origin="https://panel.test",key="aabbccdd-1234-4234-8234-aabbccddeeff";
const binding=`pb1.${Buffer.alloc(32,1).toString("base64url")}`;
const pending=`apc1.${Buffer.alloc(32,2).toString("base64url")}`;
const device=`adt1.key.${Buffer.alloc(32,3).toString("base64url")}`;
const session=`v1.key.${Buffer.alloc(32,4).toString("base64url")}`;
const cookie=`__Host-celebix_admin_pending=${pending}; __Host-celebix_panel_pre_auth=${binding}; __Host-celebix_admin_device=${device}; __Host-celebix_panel=${session}`;
const state={schemaVersion:1,phase:"code",purpose:"login",displayName:"Butik",maskedPhone:"•••1234",challengeId:"challenge",expiresAt:null,resendAt:null,enrolled:true,backupCodesRemaining:10};
function request(action:string,body:unknown={},headers:Record<string,string>={}){return new Request(`${origin}/api/admin-login/${action}`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key,Cookie:cookie,...headers},body:JSON.stringify(body)});}
function setup(response:unknown={schemaVersion:1,code:"ok",state,deviceCredential:device,deviceExpiresAt:new Date(Date.now()+2592000000).toISOString()}){const writes:any[]=[];return{writes,handlers:createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",transport:{execute:async input=>{writes.push(input);return response;}},completeSession:async()=>new Response(null,{status:303,headers:{location:"https://store.test/"}})})};}
test("same-origin public handler sends credentials privately and never exposes full credentials",async()=>{
 const{writes,handlers}=setup();const response=await handlers.verify(request("verify",{code:"001234",rememberDevice:false}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{code:"ok",state});
 assert.deepEqual(writes[0],{schemaVersion:1,action:"verify",pendingCookie:pending,browserCredential:binding,deviceCredential:device,operationId:key,payload:{code:"001234",rememberDevice:false}});
 assert.match(response.headers.get("set-cookie")!,/__Host-celebix_admin_device=/);assert.match(response.headers.get("set-cookie")!,/HttpOnly; Secure; SameSite=Lax; Path=\//);assert.equal(response.headers.get("cache-control"),"no-store");
});
test("rejects cross-origin wrong host malformed duplicate cookies bad methods extra bodies and missing operation key before transport",async()=>{
 const{writes,handlers}=setup();
 const invalid=[request("verify",{code:"001234",rememberDevice:false},{Origin:"https://evil.test"}),request("verify",{code:"001234",rememberDevice:false},{"Idempotency-Key":""}),request("verify",{code:"001234",rememberDevice:false,principalId:"attacker"}),request("verify",{code:"001234",rememberDevice:false},{Cookie:`${cookie}; __Host-celebix_admin_pending=other`}),request("verify",{code:"001234",rememberDevice:false},{"Sec-Fetch-Site":"cross-site"}),request("verify",{code:"001234",rememberDevice:false},{"Content-Type":"text/plain"}),new Request("https://tenant.test/api/admin-login/verify",{method:"POST",headers:{Origin:"https://tenant.test","Content-Type":"application/json","Idempotency-Key":key,Cookie:cookie},body:JSON.stringify({code:"001234",rememberDevice:false})}),new Request(`${origin}/api/admin-login/verify?code=secret`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key,Cookie:cookie},body:"{}"}),new Request(`${origin}/api/admin-login/verify`,{headers:{Cookie:cookie}})];
 for(const bad of invalid)assert.ok((await handlers.verify(bad)).status>=400);assert.equal(writes.length,0);
});
test("state get retains pending browser cookie and rejects leaked secret state",async()=>{
 const{handlers}=setup();const response=await handlers.state(new Request(`${origin}/api/admin-login/state`,{headers:{Cookie:cookie}}));assert.equal(response.status,200);assert.ok(!response.headers.get("set-cookie")?.includes("panel_pre_auth=;"));
 const unsafe=setup({schemaVersion:1,code:"ok",state:{...state,sessionCredential:session}});const failed=await unsafe.handlers.state(new Request(`${origin}/api/admin-login/state`,{headers:{Cookie:cookie}}));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes(session));
});
test("completion transfers server-only completion and removes pending only after success",async()=>{
 const completion={sessionCredential:session,sessionIssuedAt:"2026-10-12T12:00:00.000Z",sessionExpiresAt:"2026-10-12T20:00:00.000Z",destinationStoreId:key,destinationOrigin:"https://store.test"};
 const{handlers,writes}=setup({schemaVersion:1,code:"ok",completion});const response=await handlers.complete(new Request(`${origin}/auth/admin-login/complete`,{headers:{Cookie:cookie}}));assert.equal(response.status,303);assert.equal(writes[0].action,"complete");assert.match(response.headers.get("set-cookie")!,/__Host-celebix_admin_pending=;.*Max-Age=0/);assert.match(response.headers.get("set-cookie")!,/__Host-celebix_panel_pre_auth=;/);assert.ok(!(await response.text()).includes(session));
});
test("security actions use session authority and never pending scope",async()=>{
 const security={maskedPhone:null,backupCodesRemaining:0,enabled:false,trustedDevices:[]};const{handlers,writes}=setup({schemaVersion:1,code:"ok",security});
 const response=await handlers.forget(new Request(`${origin}/api/admin-security/forget`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key,Cookie:`__Host-celebix_panel=${session}`},body:JSON.stringify({currentDevice:true})}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{code:"ok",state:security});assert.deepEqual(writes[0],{schemaVersion:1,action:"forget",sessionCredential:session,operationId:key,payload:{currentDevice:true}});assert.match(response.headers.get("set-cookie")!,/__Host-celebix_admin_device=;/);
});
test("unknown owner error and oversized payload cannot expose raw diagnostics",async()=>{
 const{handlers}=setup({schemaVersion:1,code:"postgres_secret"});const response=await handlers.send(request("send",{}));assert.deepEqual(await response.json(),{code:"unavailable"});
 const{handlers:bounded,writes}=setup();assert.equal((await bounded.send(request("send",{phone:"+"+"1".repeat(17000)}))).status,400);assert.equal(writes.length,0);
});
test("fresh security start forwards server-derived tenant origin and emits fixed central handoff",async()=>{
 const{handlers,writes}=setup({schemaVersion:1,code:"ok",securityHandoff:"ase1.nonce.cipher.tag"});
 const response=await handlers.start(new Request(`${origin}/api/admin-security/start`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key,Cookie:`__Host-celebix_panel=${session}`},body:JSON.stringify({purpose:"change_phone"})}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{code:"handoff",url:origin+"/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"});assert.equal(writes[0].action,"start");assert.deepEqual(writes[0].payload,{purpose:"change_phone",sourceOrigin:origin});assert.equal(response.headers.get("set-cookie"),null);
});

test("tenant security current-device forget emits encrypted central bridge only after native actor validation",async()=>{
 const calls:any[]=[];const handlers=createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",bridge:createAdminSecurityBridge({secret:new Uint8Array(32).fill(9),centralOrigin:origin,environment:"staging"}),transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",security:{maskedPhone:null,backupCodesRemaining:0,trustedDevices:[],enabled:false}};}},completeSession:async()=>new Response()});
 const tenant="https://admin.guzidekuyumcu.com.tr";
 const response=await handlers.forget(new Request(`${tenant}/api/admin-security/forget`,{method:"POST",headers:{Origin:tenant,"Content-Type":"application/json","Idempotency-Key":key,Cookie:`__Host-celebix_panel=${session}`},body:JSON.stringify({currentDevice:true})}));assert.equal(response.status,200);const body=await response.json();assert.equal(body.code,"handoff");assert.equal(body.url,origin+"/auth/admin-security/forget");assert.ok(!JSON.stringify(body).includes(session));assert.equal(calls.length,1);assert.equal(calls[0].action,"security_state");const privatePayload=createAdminSecurityBridge({secret:new Uint8Array(32).fill(9),centralOrigin:origin,environment:"staging"}).open(body.transfer);assert.ok(privatePayload.action==="forget");assert.equal(privatePayload.operationId,key);
});
test("central bridge requires matching source Origin and never accepts ciphertext through URL",async()=>{
 const bridge=createAdminSecurityBridge({secret:new Uint8Array(32).fill(9),centralOrigin:origin,environment:"staging"});
 const sourceOrigin="https://admin.guzidekuyumcu.com.tr",expiresAt=new Date(Date.now()+300000).toISOString(),transfer=bridge.seal({action:"start",sourceOrigin,expiresAt,authorizationUrl:"https://id.test/oidc/auth",browserCredential:binding,browserExpiresAt:expiresAt});
 const calls:any[]=[];const routes=createAdminSecurityBridgeHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",bridge,transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok"};}}});
 const posted=(headerOrigin=sourceOrigin)=>new Request(`${origin}/auth/admin-security/start`,{method:"POST",headers:{Origin:headerOrigin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({transfer})});
 const response=await routes.start(posted());assert.equal(response.status,303);assert.equal(response.headers.get("location"),"https://id.test/oidc/auth");assert.match(response.headers.get("set-cookie")!,/panel_pre_auth=.*HttpOnly/);assert.equal(calls.length,0);
 assert.equal((await routes.start(posted("https://evil.test"))).status,400);assert.equal((await routes.start(new Request(`${origin}/auth/admin-security/start?transfer=${transfer}`))).status,400);
});
test("IP limit source comes only from explicitly trusted server injection and raw forwarding is omitted",async()=>{
 const calls:any[]=[];const options={centralOrigin:origin,authorityOrigin:"https://id.test",transport:{execute:async(input:any)=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()};
 await createAdminLoginSecurityHandlers(options).send(request("send",{},{"X-Forwarded-For":"1.2.3.4","CF-Connecting-IP":"1.2.3.4"}));assert.equal(calls[0].trustedIp,undefined);
 await createAdminLoginSecurityHandlers({...options,trustedIp:()=>"203.0.113.10"}).send(request("send",{}));assert.equal(calls[1].trustedIp,"203.0.113.10");
});
function forgetFixture(responseCode="ok"){
 const bridge=createAdminSecurityBridge({secret:new Uint8Array(32).fill(9),centralOrigin:origin,environment:"staging"}),sourceOrigin="https://admin.guzidekuyumcu.com.tr",calls:any[]=[];
 const transfer=bridge.seal({action:"forget",sourceOrigin,expiresAt:new Date(Date.now()+300000).toISOString(),sessionCredential:session,operationId:key});
 const routes=createAdminSecurityBridgeHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",bridge,transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:responseCode};}}});
 const post=(value=transfer,from=sourceOrigin,headerCookie="",nonce?:string)=>new Request(`${origin}/auth/admin-security/forget`,{method:"POST",headers:{Origin:from,"Content-Type":"application/x-www-form-urlencoded",Cookie:headerCookie},body:new URLSearchParams({transfer:value,...(nonce?{nonce}:{})})});
 return{bridge,sourceOrigin,calls,transfer,routes,post};
}
function continuationCookie(response:Response){return response.headers.get("set-cookie")!.split(";")[0]!;}
test("cross-site forget POST establishes context then read-only GET renders central nonce POST",async()=>{
 const f=forgetFixture(),arrived=await f.routes.forget(f.post());assert.equal(arrived.status,303);assert.equal(arrived.headers.get("location"),origin+"/auth/admin-security/forget");assert.equal(f.calls.length,0);
 assert.match(arrived.headers.get("set-cookie")!,/HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=/);
 const get=await f.routes.forget(new Request(origin+"/auth/admin-security/forget",{headers:{Cookie:continuationCookie(arrived)+`; __Host-celebix_admin_device=${device}`}}));assert.equal(get.status,200);assert.equal(get.headers.get("referrer-policy"),"same-origin");assert.equal(f.calls.length,0);
 const html=await get.text(),confirmCookie=continuationCookie(get),confirmTransfer=confirmCookie.split("=")[1]!,confirmation=f.bridge.open(confirmTransfer);
 assert.ok(confirmation.action==="forget_confirm");assert.equal(confirmation.operationId,key);assert.equal(confirmation.deviceCredential,device);assert.ok(html.includes(confirmTransfer));assert.ok(!html.includes(device));assert.ok(!html.includes(session));assert.match(get.headers.get("content-security-policy")!,/default-src 'none'.*script-src 'nonce-/);
 const finished=await f.routes.forget(f.post(confirmTransfer,origin,confirmCookie,confirmation.nonce));assert.equal(finished.status,303);assert.equal(finished.headers.get("location"),f.sourceOrigin+"/settings/security");assert.equal(f.calls.length,1);assert.equal(f.calls[0].operationId,key);assert.equal(f.calls[0].deviceCredential,device);assert.equal(f.calls[0].sessionCredential,session);assert.match(finished.headers.get("set-cookie")!,/admin_forget_continue=;.*Max-Age=0/);
});
test("missing central device returns tenant safe message without mutating",async()=>{
 const f=forgetFixture(),arrived=await f.routes.forget(f.post()),get=await f.routes.forget(new Request(origin+"/auth/admin-security/forget",{headers:{Cookie:continuationCookie(arrived)}}));assert.equal(get.status,303);assert.equal(get.headers.get("location"),f.sourceOrigin+"/settings/security?adminSecurity=device_unavailable");assert.equal(f.calls.length,0);assert.match(get.headers.get("set-cookie")!,/admin_forget_continue=;.*Max-Age=0/);
});
test("forget confirmation rejects missing cookie wrong nonce and cross-site POST and clears continuation",async()=>{
 const f=forgetFixture(),arrived=await f.routes.forget(f.post()),get=await f.routes.forget(new Request(origin+"/auth/admin-security/forget",{headers:{Cookie:continuationCookie(arrived)+`; __Host-celebix_admin_device=${device}`}})),confirmCookie=continuationCookie(get),transfer=confirmCookie.split("=")[1]!,confirmation=f.bridge.open(transfer);assert.ok(confirmation.action==="forget_confirm");
 for(const bad of [f.post(transfer,origin,"",confirmation.nonce),f.post(transfer,origin,confirmCookie,"wrong")]){const response=await f.routes.forget(bad);assert.equal(response.status,400);assert.match(response.headers.get("set-cookie")!,/admin_forget_continue=;.*Max-Age=0/);}
 const crossSite=await f.routes.forget(f.post(transfer,f.sourceOrigin,confirmCookie,confirmation.nonce));assert.equal(crossSite.status,400);assert.equal(crossSite.headers.get("set-cookie"),null);
 const forged=await f.routes.forget(f.post(f.transfer,"https://evil.test"));assert.equal(forged.status,400);assert.equal(forged.headers.get("set-cookie"),null);assert.equal(f.calls.length,0);
});
test("management completion returns only approved private tenant security path and leaves inputs unavailable to browser",async()=>{
 const{handlers}=setup({schemaVersion:1,code:"ok",authorizationUrl:"https://admin.guzidekuyumcu.com.tr/settings/security"});const response=await handlers.complete(new Request(`${origin}/auth/admin-login/complete`,{headers:{Cookie:cookie}}));assert.equal(response.status,303);assert.equal(response.headers.get("location"),"https://admin.guzidekuyumcu.com.tr/settings/security");
 const unsafe=setup({schemaVersion:1,code:"ok",authorizationUrl:"https://admin.guzidekuyumcu.com.tr/auth/handoff?secret=secret"});assert.equal((await unsafe.handlers.complete(new Request(`${origin}/auth/admin-login/complete`,{headers:{Cookie:cookie}}))).status,503);
});
test("device cookie lifetime uses fixed private expiry and fresh login is 401",async()=>{
 const expiresAt=new Date(Date.now()+3600000).toISOString(),base={centralOrigin:origin,authorityOrigin:"https://id.test",completeSession:async()=>new Response()};
 const handlers=createAdminLoginSecurityHandlers({...base,transport:{execute:async()=>({schemaVersion:1,code:"ok",state,deviceCredential:device,deviceExpiresAt:expiresAt})}});
 const response=await handlers.state(new Request(`${origin}/api/admin-login/state`,{headers:{Cookie:cookie}}));const maxAge=Number(/Max-Age=(\d+)/.exec(response.headers.get("set-cookie")!)?.[1]);assert.ok(maxAge>=3595&&maxAge<=3600);
 const failed=createAdminLoginSecurityHandlers({...base,transport:{execute:async()=>({schemaVersion:1,code:"fresh_login_required"})}});assert.equal((await failed.state(new Request(`${origin}/api/admin-login/state`,{headers:{Cookie:cookie}}))).status,401);
});
test("internal HTTP proxy URL reconstructs authority from configured central and exact tenant Origin without forwarded headers",async()=>{
 const{handlers,writes}=setup();const proxy=new Request("http://customer-panel:3400/api/admin-login/verify",{method:"POST",headers:{Origin:origin,Host:"customer-panel:3400","Content-Type":"application/json","Idempotency-Key":key,Cookie:cookie,"X-Forwarded-Host":"evil.test","X-Forwarded-Proto":"https"},body:JSON.stringify({code:"001234",rememberDevice:false})});assert.equal((await handlers.verify(proxy)).status,200);assert.equal(writes.length,1);
 const tenant="https://admin.guzidekuyumcu.com.tr",current=setup({schemaVersion:1,code:"ok",securityHandoff:"ase1.nonce.cipher.tag"});assert.equal((await current.handlers.start(new Request("http://customer-panel:3400/api/admin-security/start",{method:"POST",headers:{Origin:tenant,Host:"customer-panel:3400","Content-Type":"application/json","Idempotency-Key":key,Cookie:`__Host-celebix_panel=${session}`},body:JSON.stringify({purpose:"manage"})}))).status,200);assert.equal(current.writes[0].payload.sourceOrigin,tenant);
});
test("non-authorizing destination metadata survives pending expiry and validates a bounded safe restart path",()=>{
 const pendingCookie=`apc1.${Buffer.from(JSON.stringify({destinationOrigin:"https://admin.guzidekuyumcu.com.tr",credential:"private"})).toString("base64url")}`;
 assert.equal(serializeAdminDestinationCookie(pendingCookie),"__Host-celebix_admin_destination=admin.guzidekuyumcu.com.tr; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800");
 assert.equal(adminLoginRestartPath("admin.guzidekuyumcu.com.tr"),"/auth/login?destination=admin.guzidekuyumcu.com.tr");assert.equal(adminLoginRestartPath("evil.test/path?secret=x"),"/login");assert.equal(adminLoginRestartPath(undefined),"/login");
});
test("expired pending cookie absence prompts fresh restart instead of repeating missing authority",async()=>{
 const{handlers,writes}=setup();const response=await handlers.state(new Request(`${origin}/api/admin-login/state`,{headers:{Cookie:"__Host-celebix_admin_destination=admin.guzidekuyumcu.com.tr"}}));assert.equal(response.status,401);assert.deepEqual(await response.json(),{code:"fresh_login_required"});assert.equal(writes.length,0);
});

test("direct central current-device forget forwards its HttpOnly device cookie",async()=>{
 const{handlers,writes}=setup({schemaVersion:1,code:"ok",security:{maskedPhone:null,backupCodesRemaining:0,enabled:true,trustedDevices:[]}});
 const response=await handlers.forget(new Request(`${origin}/api/admin-security/forget`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":key,Cookie:`__Host-celebix_panel=${session}; __Host-celebix_admin_device=${device}`},body:JSON.stringify({currentDevice:true})}));
 assert.equal(response.status,200);assert.equal(writes[0].deviceCredential,device);assert.equal(writes[0].operationId,key);
});

test("failed actor-device validation preserves unrelated device cookie and clears only continuation",async()=>{
 for(const code of ["device_unavailable","fresh_login_required"]){const f=forgetFixture(code),arrived=await f.routes.forget(f.post()),get=await f.routes.forget(new Request(origin+"/auth/admin-security/forget",{headers:{Cookie:continuationCookie(arrived)+`; __Host-celebix_admin_device=${device}`}})),confirmCookie=continuationCookie(get),transfer=confirmCookie.split("=")[1]!,confirmation=f.bridge.open(transfer);assert.ok(confirmation.action==="forget_confirm");
 const response=await f.routes.forget(f.post(transfer,origin,confirmCookie,confirmation.nonce));assert.equal(response.status,303);assert.equal(response.headers.get("location"),f.sourceOrigin+"/settings/security?adminSecurity="+code);assert.doesNotMatch(response.headers.get("set-cookie")!,/__Host-celebix_admin_device=;/);assert.match(response.headers.get("set-cookie")!,/admin_forget_continue=;.*Max-Age=0/);}
});
test("confirmation revokes captured device A while preserving a later account B cookie",async()=>{
 const f=forgetFixture(),arrived=await f.routes.forget(f.post()),get=await f.routes.forget(new Request(origin+"/auth/admin-security/forget",{headers:{Cookie:continuationCookie(arrived)+`; __Host-celebix_admin_device=${device}`}})),confirmCookie=continuationCookie(get),transfer=confirmCookie.split("=")[1]!,confirmation=f.bridge.open(transfer);assert.ok(confirmation.action==="forget_confirm");
 const laterDevice=`adt1.key.${Buffer.alloc(32,8).toString("base64url")}`;
 const response=await f.routes.forget(f.post(transfer,origin,confirmCookie+`; __Host-celebix_admin_device=${laterDevice}`,confirmation.nonce));assert.equal(response.status,303);assert.equal(f.calls[0].deviceCredential,device);assert.doesNotMatch(response.headers.get("set-cookie")!,/__Host-celebix_admin_device=;/);assert.match(response.headers.get("set-cookie")!,/admin_forget_continue=;.*Max-Age=0/);
});
test("mandatory send ingress rejects missing forged and failed attestations before owner command",async()=>{
 for(const ingress of [()=>({authenticated:false}),()=>({authenticated:false,trustedIp:"203.0.113.10"}),()=>{throw Error("PRIVATE_ATTESTATION_DIAGNOSTIC");}]){
  const calls:any[]=[],handlers=createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",ingress,trustedIp:()=>"203.0.113.20",transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()});
  const response=await handlers.send(request("send",{},{"CF-Connecting-IP":"203.0.113.99","X-Forwarded-For":"203.0.113.99","x-celebix-admin-ip-signature":"forged"}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:"delivery_unavailable"});assert.equal(calls.length,0);
 }
});
test("authenticated send ingress forwards only its verified IP and suppresses legacy fallback",async()=>{
 const calls:any[]=[],handlers=createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",ingress:()=>({authenticated:true,trustedIp:"203.0.113.10"}),trustedIp:()=>"203.0.113.20",transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()});
 const response=await handlers.send(request("send",{},{"CF-Connecting-IP":"203.0.113.99","X-Forwarded-For":"203.0.113.99"}));assert.equal(response.status,200);assert.equal(calls[0].trustedIp,"203.0.113.10");
});
test("authenticated unknown IP is accepted without an IP field or legacy header fallback",async()=>{
 const calls:any[]=[],handlers=createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",ingress:()=>({authenticated:true}),trustedIp:()=>"203.0.113.20",transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()});
 const response=await handlers.send(request("send",{}));assert.equal(response.status,200);assert.equal(Object.hasOwn(calls[0],"trustedIp"),false);
});
test("mandatory ingress does not run for non-send login actions",async()=>{
 let attestations=0;const calls:any[]=[],handlers=createAdminLoginSecurityHandlers({centralOrigin:origin,authorityOrigin:"https://id.test",ingress:()=>{attestations++;return{authenticated:false};},transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()});
 assert.equal((await handlers.verify(request("verify",{code:"001234",rememberDevice:false}))).status,200);assert.equal((await handlers.state(new Request(origin+"/api/admin-login/state",{headers:{Cookie:cookie}}))).status,200);assert.equal(attestations,0);assert.equal(calls.length,2);
});
