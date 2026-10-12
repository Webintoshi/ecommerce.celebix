import assert from "node:assert/strict";
import test from "node:test";
import { createAdminLoginClient, createAdminSecurityClient } from "./client.ts";
const state={schemaVersion:1,phase:"code",purpose:"login",displayName:"Butik",maskedPhone:"•••1234",challengeId:"challenge",expiresAt:null,resendAt:null,enrolled:true,backupCodesRemaining:10};
const key="bdf7feda-446c-42ca-a159-e8326e2e46b1";
test("client sends exact bodies fixed paths credentials and idempotency headers",async()=>{
 const reads:Array<{url:string,init:RequestInit|undefined}>=[];
 const fetcher:typeof fetch=async(input,init)=>{reads.push({url:String(input),init});return Response.json({code:"ok",state});};
 const client=createAdminLoginClient({fetcher});
 await client.state();await client.send({phone:"+905321234567"},key);await client.verify({code:"001234",rememberDevice:false},key);await client.recover({backupCode:"AAAA-BBBB"},key);await client.resume(key);
 assert.deepEqual(reads.map(r=>r.url),["/api/admin-login/state","/api/admin-login/send","/api/admin-login/verify","/api/admin-login/recover","/api/admin-login/resume"]);
 for(const read of reads){assert.equal(read.init?.credentials,"same-origin");assert.equal(read.init?.cache,"no-store");}
 for(const read of reads.slice(1)){const headers=new Headers(read.init?.headers);assert.equal(headers.get("Idempotency-Key"),key);assert.equal(headers.get("Content-Type"),"application/json");}
 assert.deepEqual(reads.slice(1).map(r=>JSON.parse(String(r.init?.body))),[{phone:"+905321234567"},{code:"001234",rememberDevice:false},{backupCode:"AAAA-BBBB"},{}]);
});
test("backend message is discarded and unsafe redirects fail closed",async()=>{
 const login=createAdminLoginClient({fetcher:async()=>Response.json({code:"invalid_code",message:"SQL SECRET"},{status:400})});
 await assert.rejects(login.verify({code:"001234",rememberDevice:false},key),error=>error instanceof Error&&!error.message.includes("SECRET")&&/Kod/.test(error.message));
 const security=createAdminSecurityClient({authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",fetcher:async()=>Response.json({code:"redirect",url:"https://evil.test"})});
 await assert.rejects(security.start({purpose:"manage"},key));
});
test("security adapter reads public devices and forgets exact scope",async()=>{
 const requests:Array<[string,RequestInit|undefined]>=[];
 const security=createAdminSecurityClient({authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",fetcher:async(input,init)=>{requests.push([String(input),init]);return Response.json({code:"ok",state:{maskedPhone:null,backupCodesRemaining:0,trustedDevices:[],enabled:false}});}});
 await security.state();await security.forget({currentDevice:true},key);await security.forget({},key);await security.forget({deviceId:"device"},key);
 assert.deepEqual(requests.map(r=>r[0]),["/api/admin-security/state","/api/admin-security/forget","/api/admin-security/forget","/api/admin-security/forget"]);
 assert.deepEqual(requests.slice(1).map(r=>JSON.parse(String(r[1]?.body))),[{currentDevice:true},{},{deviceId:"device"}]);
});

test("security start returns only a bounded encrypted bridge to the fixed central POST endpoint",async()=>{
 const client=createAdminSecurityClient({authorityOrigin:"https://id.test",panelOrigin:"https://panel.test",fetcher:async()=>Response.json({code:"handoff",url:"https://panel.test/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"})});
 assert.deepEqual(await client.start({purpose:"manage"},key),{url:"https://panel.test/auth/admin-security/start",transfer:"ase1.nonce.cipher.tag"});
});
