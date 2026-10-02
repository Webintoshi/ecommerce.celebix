import assert from "node:assert/strict";
import test from "node:test";
import type { StorefrontIdentityRepository } from "@celebix/saas-data";
import { accountCredentialDigestCandidates, createAccountSessionCredential, parseStorefrontIdentityKeyring } from "./credential.ts";
import { createStorefrontIdentityRuntime } from "./runtime.ts";
const HOST="alpler-spor.saas-staging.celebix.net";
const keyring=parseStorefrontIdentityKeyring("phone_01",JSON.stringify([{keyId:"phone_01",key:Buffer.alloc(32,8).toString("base64url")} ]));
function setup(overrides:Record<string,unknown>={},deliver:()=>Promise<void>=async()=>{}) {
  const calls:Record<string,unknown>[]=[];let i=0;
  const repository={start:async()=>({outcome:"accepted",retryAfterSeconds:60}),startPhone:async(input:Record<string,unknown>)=>{calls.push({kind:"start",...input});return{outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true};},markPhoneDelivery:async(input:Record<string,unknown>)=>{calls.push({kind:"delivery",...input});},verifyPhone:async(input:Record<string,unknown>)=>{calls.push({kind:"verify",...input});return{outcome:"authenticated",profileRequired:false};},...overrides} as unknown as StorefrontIdentityRepository;
  const runtime=createStorefrontIdentityRuntime({repository,hmacKeyring:keyring,sealKeyring:keyring,now:()=>new Date("2026-10-01T14:00:00.000Z"),randomBytes:size=>new Uint8Array(size).fill(4),randomUuid:()=>`10000000-0000-4000-8000-${String(++i).padStart(12,"0")}`,randomLoginCode:()=>"000001",deliverLoginCode:async()=>{},deliverWhatsAppCode:deliver});
  return{runtime,calls};
}
const input={hostname:HOST,phone:"0452 606 05 52",firstName:"Cemo",lastName:"Test",requestAuthority:"ip",returnTo:"/account",brand:{storeName:"Alpler Spor",logoUrl:null,primaryColor:null}};
test("phone OTP creates only digests, activates after provider acceptance, and verifies the sealed names",async()=>{
  const {runtime,calls}=setup(); const started=await runtime.startPhone!(input);
  assert.match(started.setCookie,/challenge=ph1[.]/u);assert.equal(JSON.stringify(calls[0]).includes("452606"),false);assert.equal(calls[1]?.accepted,true);
  const result=await runtime.verify({hostname:HOST,challengeCookie:started.setCookie,code:"000001",deviceLabel:"test",userAgent:"test"});
  assert.equal(result.result.profileRequired,false);const verify=calls[2];assert.equal(verify?.phone,"+904526060552");assert.equal(verify?.firstName,"Cemo");assert.equal(JSON.stringify(verify).includes('"code":"000001"'),false);
  assert.equal(result.setCookies.length,3);
});
test("database resend refusal does not dispatch or replace a still-valid browser challenge",async()=>{
  let sends=0;const {runtime,calls}=setup({startPhone:async()=>({outcome:"accepted",retryAfterSeconds:60,deliveryRequired:false})},async()=>{sends++;});
  const result=await runtime.startPhone!(input);assert.equal(sends,0);assert.equal(calls.length,0);assert.equal(result.setCookie,"");assert.equal(result.result.deliveryRequired,false);
});
test("failed provider delivery invalidates the pending challenge and never produces a success cookie",async()=>{
  const {runtime,calls}=setup({},async()=>{throw new Error("provider rejected");});await assert.rejects(runtime.startPhone!(input));assert.equal(calls[1]?.accepted,false);
});
test("sealed phone challenge cannot be verified on another store hostname",async()=>{
  const {runtime,calls}=setup();const started=await runtime.startPhone!(input);await assert.rejects(runtime.verify({hostname:"other.saas-staging.celebix.net",challengeCookie:started.setCookie,code:"000001",deviceLabel:"test",userAgent:"test"}));assert.equal(calls.some(c=>c.kind==="verify"),false);
});
test("email delivery respects new database disposition instead of dispatching rate-limited mail",async()=>{
  let sends=0;const {runtime}=setup({startEmail:async()=>({outcome:"accepted",retryAfterSeconds:300,deliveryRequired:false})});
  const result=await runtime.start({...input,email:"cemo@example.test"});assert.equal(result.setCookie,"");assert.equal(result.result.deliveryRequired,false);assert.equal(sends,0);
});

test("explicit phone binding derives existing account authority from the HttpOnly account cookie", async () => {
  const session=createAccountSessionCredential(keyring,size=>new Uint8Array(size).fill(9));
  const cookieHeader=`__Host-celebix_account=${session.value}`;
  const {runtime,calls}=setup({session:async()=>({outcome:"found",snapshot:{profile:{email:"test@example.test",phone:"+904526060552"}}})});
  const started=await runtime.startPhone!({...input,bindPhone:true,cookieHeader});
  await runtime.verify({hostname:HOST,challengeCookie:`${started.setCookie.split(';')[0]}; __Host-celebix_account=${session.value}`,code:"000001",deviceLabel:"test",userAgent:"test"});
  assert.deepEqual(calls.find(call=>call.kind==="verify")?.candidates,accountCredentialDigestCandidates(session.value,keyring));
});

test("generic phone login never binds an account from a stale or unrelated session cookie", async () => {
  const {runtime,calls}=setup();
  const started=await runtime.startPhone!(input);
  const session=createAccountSessionCredential(keyring,size=>new Uint8Array(size).fill(9));
  await runtime.verify({hostname:HOST,challengeCookie:`${started.setCookie.split(';')[0]}; __Host-celebix_account=${session.value}`,code:"000001",deviceLabel:"test",userAgent:"test"});
  assert.equal(Object.hasOwn(calls.find(call=>call.kind==="verify")!,"candidates"),false);
});

test("binding requires the current full account and its unchanged profile phone before delivery", async () => {
  let delivered=0;
  for(const session of [{outcome:"unauthenticated"},{outcome:"profile_required"},{outcome:"found",snapshot:{profile:{email:"test@example.test",phone:"+905551112233"}}}]) {
    const {runtime,calls}=setup({session:async()=>session},async()=>{delivered++;});
    await assert.rejects(runtime.startPhone!({...input,bindPhone:true,cookieHeader:"__Host-celebix_account=a1.phone_01."+Buffer.alloc(32,9).toString("base64url")}));
    assert.equal(calls.length,0);
  }
  assert.equal(delivered,0);
});
