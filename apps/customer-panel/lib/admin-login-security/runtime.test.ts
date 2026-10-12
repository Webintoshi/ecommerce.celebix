import assert from "node:assert/strict";
import test from "node:test";
import {createHmac} from "node:crypto";
import * as runtimeModule from "./runtime.ts";
import {createAdminLoginSecurityHandlers} from "./handler.ts";
import { createAdminSecurityCompletionTransfer, resolveAdminLoginSecurityConfig } from "./runtime.ts";
const now=new Date("2026-10-12T12:00:00.000Z"),operationId="aabbccdd-1234-4234-8234-aabbccddeeff",storeId="aabbccdd-1234-4234-8234-aabbccddee11";
const session=`v1.key.${Buffer.alloc(32,1).toString("base64url")}`,handoff=`v1.handoff.${Buffer.alloc(32,2).toString("base64url")}`;
const completion={sessionCredential:session,sessionIssuedAt:now.toISOString(),sessionExpiresAt:new Date(now.getTime()+28800000).toISOString(),destinationStoreId:storeId,destinationOrigin:"https://admin.guzidekuyumcu.com.tr",handoffCredential:handoff,handoffId:"aabbccdd-1234-4234-8234-aabbccddee22",handoffOperationId:operationId};
test("MFA completion validates session then issues authorized cross-host auto POST without central session cookie",async()=>{
 const calls:any[]=[];const transfer=createAdminSecurityCompletionTransfer({clock:()=>now,randomBytes:size=>new Uint8Array(size).fill(1),repository:{issuePreparedHandoff:async input=>{calls.push(input);return{kind:"handoff_issued",credential:handoff,destinationOrigin:"https://admin.guzidekuyumcu.com.tr",expiresAt:new Date(now.getTime()+120000).toISOString()};},recoverIssuedHandoff:async()=>({kind:"unavailable"})}});
 const response=await transfer(completion,new Request("https://panel.test/auth/admin-login/complete"));assert.equal(response.status,200);assert.deepEqual(calls[0],{currentCredential:session,operationId,destinationStoreId:storeId,destinationHostname:"admin.guzidekuyumcu.com.tr",now,candidateCredential:handoff,handoffId:completion.handoffId});const html=await response.text();assert.ok(html.includes('action="https://admin.guzidekuyumcu.com.tr/auth/handoff"'));assert.ok(html.includes(handoff));assert.ok(!html.includes(session));assert.equal(response.headers.get("set-cookie"),null);
 for(const bad of [{...completion,sessionExpiresAt:new Date(now.getTime()+28801000).toISOString()},{...completion,destinationOrigin:"https://evil.test/path"},{...completion,secret:"secret"}])await assert.rejects(transfer(bad,new Request("https://panel.test/auth/admin-login/complete")));assert.equal(calls.length,1);
});
test("unknown cross-host commit recovers exact operation and failure stays closed",async()=>{
 const recover:any[]=[];const transfer=createAdminSecurityCompletionTransfer({clock:()=>now,randomBytes:size=>new Uint8Array(size),repository:{issuePreparedHandoff:async()=>({kind:"commit_unknown",credential:handoff}),recoverIssuedHandoff:async input=>{recover.push(input);if(recover.length===1)return{kind:"unauthenticated"};return{kind:"operation_replayed",credential:handoff,destinationOrigin:"https://admin.guzidekuyumcu.com.tr",expiresAt:new Date(now.getTime()+120000).toISOString()};}}});
 assert.equal((await transfer(completion,new Request("https://panel.test/auth/admin-login/complete"))).status,200);assert.deepEqual(recover[0],{operationId,credential:handoff,destinationHostname:"admin.guzidekuyumcu.com.tr",now});
});
test("disabled runtime configuration has no database or owner fallback",()=>{
 assert.equal(resolveAdminLoginSecurityConfig({}),null);assert.equal(resolveAdminLoginSecurityConfig({CELEBIX_SAAS_AUTH_MODE:"approved_staging",CELEBIX_DEPLOYMENT_TIER:"production"}),null);assert.throws(()=>resolveAdminLoginSecurityConfig({CELEBIX_SAAS_AUTH_MODE:"approved_staging",CELEBIX_DEPLOYMENT_TIER:"staging",UNRELATED_SECRET:"must not affect strict config"}));
});
test("parallel and repeated MFA completion always reuse escrow's fixed handoff operation and candidate",async()=>{
 const candidate={...completion,handoffCredential:handoff,handoffId:"aabbccdd-1234-4234-8234-aabbccddee22",handoffOperationId:operationId},calls:any[]=[];let issued=false;
 const transfer=createAdminSecurityCompletionTransfer({clock:()=>now,randomBytes:size=>new Uint8Array(size),repository:{recoverIssuedHandoff:async input=>{calls.push(["recover",input]);return issued?{kind:"operation_replayed",credential:handoff,destinationOrigin:completion.destinationOrigin,expiresAt:new Date(now.getTime()+120000).toISOString()}:{kind:"unauthenticated"};},issuePreparedHandoff:async input=>{calls.push(["issue",input]);const kind=issued?"operation_replayed":"handoff_issued";issued=true;return{kind,credential:handoff,destinationOrigin:completion.destinationOrigin,expiresAt:new Date(now.getTime()+120000).toISOString()};}}});
 const responses=await Promise.all([1,2,3].map(()=>transfer(candidate,new Request("https://panel.test/auth/admin-login/complete"))));assert.ok(responses.every(response=>response.status===200));await transfer(candidate,new Request("https://panel.test/auth/admin-login/complete"));
 assert.ok(calls.every(([,input])=>input.operationId===operationId));assert.ok(calls.filter(([kind])=>kind==="issue").every(([,input])=>input.candidateCredential===handoff&&input.handoffId===candidate.handoffId));
 const expired=createAdminSecurityCompletionTransfer({clock:()=>now,randomBytes:size=>new Uint8Array(size),repository:{recoverIssuedHandoff:async()=>({kind:"expired"}),issuePreparedHandoff:async()=>{throw Error("no new grant");}}});await assert.rejects(expired(candidate,new Request("https://panel.test/auth/admin-login/complete")));
});

test("runtime ingress key is optional before activation and invalid configured keys fail closed",()=>{
 assert.equal(runtimeModule.resolveAdminLoginIngress({}, {centralOrigin:"https://panel.test",clock:()=>now}),undefined);
 for(const key of ["","x".repeat(64),"aa".repeat(31),"AA".repeat(32)])assert.throws(()=>runtimeModule.resolveAdminLoginIngress({CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX:key},{centralOrigin:"https://panel.test",clock:()=>now}));
});
test("configured runtime requires authenticated send while signed unknown omits IP and signed known carries it",async()=>{
 const centralOrigin="https://panel.test",key=Buffer.alloc(32,7),ingress=runtimeModule.resolveAdminLoginIngress({CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX:key.toString("hex")},{centralOrigin,clock:()=>now});assert.equal(typeof ingress,"function");
 const pending=`apc1.${Buffer.alloc(32,3).toString("base64url")}`,binding=`pb1.${Buffer.alloc(32,4).toString("base64url")}`,state={schemaVersion:1,phase:"phone",purpose:"login",displayName:"Butik",maskedPhone:null,challengeId:null,expiresAt:null,resendAt:null,enrolled:false,backupCodesRemaining:0},calls:any[]=[];
 const handlers=createAdminLoginSecurityHandlers({centralOrigin,authorityOrigin:"https://id.test",ingress,transport:{execute:async input=>{calls.push(input);return{schemaVersion:1,code:"ok",state};}},completeSession:async()=>new Response()});
 function send(ip?:string,forged=false){const time=now.toISOString(),headers:Record<string,string>={origin:centralOrigin,"content-type":"application/json","idempotency-key":operationId,cookie:`__Host-celebix_admin_pending=${pending}; __Host-celebix_panel_pre_auth=${binding}`,"cf-connecting-ip":"203.0.113.99","x-forwarded-for":"203.0.113.99"};if(ip!==undefined){headers["x-celebix-admin-ip"]=ip;headers["x-celebix-admin-ip-time"]=time;headers["x-celebix-admin-ip-signature"]=forged?"0".repeat(64):createHmac("sha256",key).update(["celebix/admin-login/ingress/v1",centralOrigin,"/api/admin-login/send",operationId,ip,time].join("\n")).digest("hex");}return new Request(centralOrigin+"/api/admin-login/send",{method:"POST",headers,body:JSON.stringify({phone:"+905321234567"})});}
 for(const denied of [send(),send("203.0.113.7",true),send("unknown",true)]){const response=await handlers.send(denied);assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:"delivery_unavailable"});assert.equal(calls.length,0);}
 assert.equal((await handlers.send(send("203.0.113.7"))).status,200);assert.equal(calls[0].trustedIp,"203.0.113.7");assert.equal((await handlers.send(send("unknown"))).status,200);assert.equal(Object.hasOwn(calls[1],"trustedIp"),false);
});
