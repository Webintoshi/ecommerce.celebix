import assert from "node:assert/strict";
import test from "node:test";
import {createAccountAuthStartRoute} from "./route.ts";
import type {StorefrontIdentityRuntime} from "./runtime.ts";
const HOST="alpler-spor.saas-staging.celebix.net",ORIGIN=`https://${HOST}`;
function request(body:unknown,origin=ORIGIN){return new Request(`${ORIGIN}/api/account/auth/start`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});}
function route(startPhone:NonNullable<StorefrontIdentityRuntime["startPhone"]>,enabled=true){return createAccountAuthStartRoute({selectAuthority:()=>({kind:"trusted",hostname:HOST}),resolveRuntime:async()=>({whatsappEnabled:enabled,startPhone} as StorefrontIdentityRuntime),resolveBrand:async()=>({storeName:"Alpler Spor",logoUrl:null,primaryColor:null}),requestAuthority:()=>"ip"});}
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
