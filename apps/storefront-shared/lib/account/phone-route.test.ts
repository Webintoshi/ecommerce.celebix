import assert from "node:assert/strict";
import test from "node:test";
import {createAccountAuthStartRoute} from "./route.ts";
import type {StorefrontIdentityRuntime} from "./runtime.ts";
const HOST="alpler-spor.saas-staging.celebix.net",ORIGIN=`https://${HOST}`;
function request(body:unknown,origin=ORIGIN){return new Request(`${ORIGIN}/api/account/auth/start`,{method:"POST",headers:{origin,"content-type":"application/json","idempotency-key":"10000000-0000-4000-8000-000000000099"},body:JSON.stringify({...body as object,operationId:"10000000-0000-4000-8000-000000000099"})});}
function route(startPhone:NonNullable<StorefrontIdentityRuntime["startPhone"]>,enabled=true){return createAccountAuthStartRoute({selectAuthority:()=>({kind:"trusted",hostname:HOST}),resolveRuntime:async()=>({whatsappEnabled:enabled,startPhone} as unknown as StorefrontIdentityRuntime),resolveBrand:async()=>({storeName:"Alpler Spor",logoUrl:null,primaryColor:null}),requestAuthority:()=>"ip",authenticateIngress:()=>({authenticated:true,trustedIp:null})});}
test("phone route normalizes register fields and returns WhatsApp delivery only after confirmed dispatch",async()=>{
 let value:unknown;const post=route(async input=>{value=input;return{result:{outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true},setCookie:"test-cookie"};});
 const response=await post(request({phone:"0452 606 05 52",firstName:"Cemo",lastName:"Test",returnTo:"/account"}));assert.equal(response.status,200);assert.equal((value as {phone:string}).phone,"+904526060552");assert.equal((await response.json()).deliveryRequired,true);assert.equal(response.headers.getSetCookie().length,1);
});
test("resend limit has real429 countdown and cannot erase the previous challenge",async()=>{
 const response=await route(async()=>({result:{outcome:"accepted",retryAfterSeconds:42,deliveryRequired:false},setCookie:""}))(request({phone:"+904526060552"}));assert.equal(response.status,429);assert.equal((await response.json()).retryAfterSeconds,42);assert.equal(response.headers.getSetCookie().length,0);
});
test("invalid combinations, foreign origins and unavailable WhatsApp never call provider",async()=>{
 let calls=0;const post=route(async()=>{calls++;throw new Error();});for(const body of [{phone:"+904526060552",email:"test@example.test"},{phone:"+904526060552",firstName:"Cemo"},{phone:"+904526060552",firstName:"Cemo",lastName:"Test",storeId:"x"}])assert.equal((await post(request(body))).status,400);
 assert.equal((await post(request({phone:"+904526060552"},"https://other.example"))).status,400);assert.equal((await route(async()=>{calls++;throw new Error();},false)(request({phone:"+904526060552"}))).status,503);assert.equal(calls,0);
});

test("phone binding start requires CSRF and forwards only server cookies",async()=>{
 let value:unknown; const post=route(async input=>{value=input;return{result:{outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true},setCookie:"test-cookie"};});
 assert.equal((await post(request({phone:"+904526060552",bindPhone:true}))).status,403);
 assert.equal((await post(request({phone:"+904526060552",bindPhone:false}))).status,400);
 const selected=request({phone:"+904526060552",bindPhone:true});
 selected.headers.set("cookie","__Host-celebix_account_csrf=csrf-test; __Host-celebix_account=account-test");
 selected.headers.set("x-celebix-account-csrf","csrf-test");
 assert.equal((await post(selected)).status,200);
 assert.equal((value as {bindPhone?:boolean}).bindPhone,true);
 assert.equal((value as {cookieHeader:string}).cookieHeader,selected.headers.get("cookie"));
});


test("phone-only routes reject email and magic-ticket grants before runtime calls",async()=>{
 const {createAccountAuthVerifyRoute,createAccountAuthVerifyBrowserRoute}=await import("./route.ts");
 let email=0,verification=0;
 const deps={selectAuthority:()=>({kind:"trusted" as const,hostname:HOST}),resolveRuntime:async()=>({whatsappEnabled:true,start:async()=>{email++;return {result:{outcome:"accepted",retryAfterSeconds:60},setCookie:""};},verify:async()=>{verification++;return {result:{outcome:"authenticated",profileRequired:false},setCookies:[]};}} as unknown as StorefrontIdentityRuntime),resolveBrand:async()=>({storeName:"Store",logoUrl:null,primaryColor:null}),requestAuthority:()=>"unknown_client",authenticateIngress:()=>({authenticated:true,trustedIp:null})};
 const start=await createAccountAuthStartRoute(deps)(request({email:"historic@example.test"}));assert.equal(start.status,400);assert.equal(email,0);
 const ticket=`ch1.seal_01.${"A".repeat(16)}.${"B".repeat(24)}.${"C".repeat(22)}.tk1.${"D".repeat(43)}`;
 const jsonRequest=new Request(`${ORIGIN}/api/account/auth/verify`,{method:"POST",headers:{origin:ORIGIN,"content-type":"application/json"},body:JSON.stringify({ticket})});
 assert.equal((await createAccountAuthVerifyRoute(deps)(jsonRequest)).status,400);
 const formRequest=new Request(`${ORIGIN}/api/account/auth/verify-browser`,{method:"POST",headers:{origin:ORIGIN,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({ticket})});
 assert.equal((await createAccountAuthVerifyBrowserRoute(deps)(formRequest)).status,400);assert.equal(verification,0);
});

test("known and unknown phones return the same public start shape without account identity",async()=>{
 const post=route(async()=>({result:{outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true},setCookie:"__Host-celebix_account_challenge=opaque; Secure; HttpOnly"}));
 const known=await post(request({phone:"+905551112233"})),unknown=await post(request({phone:"+905551112234"}));
 assert.deepEqual(await known.json(),await unknown.json());
 assert.equal(known.headers.get("cache-control"),"no-store, max-age=0");
});

test("customer phone starts require an authenticated ingress and matching operation before runtime",async()=>{
 let calls=0;const operationId="10000000-0000-4000-8000-000000000099";const deps={selectAuthority:()=>({kind:"trusted" as const,hostname:HOST}),resolveRuntime:async()=>({whatsappEnabled:true,startPhone:async()=>{calls++;return {result:{outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true},setCookie:""};}} as unknown as StorefrontIdentityRuntime),resolveBrand:async()=>({storeName:"Store",logoUrl:null,primaryColor:null}),requestAuthority:()=>"ignored",authenticateIngress:()=>({authenticated:false,trustedIp:null})};
 const forged=request({phone:"+905551112233"});forged.headers.set("idempotency-key",operationId);assert.equal((await createAccountAuthStartRoute(deps)(forged)).status,503);assert.equal(calls,0);
 const unsigned=new Request(`${ORIGIN}/api/account/auth/start`,{method:"POST",headers:{origin:ORIGIN,"content-type":"application/json"},body:JSON.stringify({phone:"+905551112233"})});assert.equal((await createAccountAuthStartRoute({...deps,authenticateIngress:()=>({authenticated:true,trustedIp:null})})(unsigned)).status,400);assert.equal(calls,0);
});
