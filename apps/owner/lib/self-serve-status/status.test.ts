import assert from "node:assert/strict";
import test from "node:test";
import { createOnboardingStatusCredentialCodec } from "./credential-codec.ts";
import {resolveOnboardingStatusEnabled} from "./types.ts";
import { createOnboardingStatusHandler } from "./handler.ts";
import { presentOnboardingStatus, parseOnboardingStatusDto, nextStatusPollDelay } from "./presentation.ts";
const scope = {ownerOrigin:"https://ecommerce.saas-staging.celebix.net",panelOrigin:"https://panel.saas-staging.celebix.net",platformDomainSuffix:"saas-staging.celebix.net"};
const now = new Date("2026-09-27T12:00:00.000Z");
const codec = createOnboardingStatusCredentialCodec({key:new Uint8Array(32).fill(17),randomBytes:()=>new Uint8Array(32).fill(23)});
function request(path="",credential=codec.issue().credential) {return new Request(`${scope.ownerOrigin}/api/self-serve/status${path}`,{headers:{cookie:`__Host-celebix_onboarding_status=${credential}`}});}
test("status GET reads only its proof and never renews cookie or accepts attempt hints",async()=>{
 let calls=0;const handler=createOnboardingStatusHandler({scope,codec,clock:()=>now,repository:{async readStatus(input){calls++;assert.equal(input.digest,codec.issue().digest);return {kind:"status",projection:{stage:"creating",updatedAt:now.toISOString()}};}}});
 const result=await handler(request());assert.equal(result.status,200);assert.equal(result.headers.has("set-cookie"),false);assert.equal((await result.json()).stage,"creating");
 assert.equal((await handler(request("?attemptId=other"))).status,401);assert.equal((await handler(request("", "bad"))).status,401);assert.equal(calls,1);
 const foreign=new Request("https://ecommerce.saas-staging.celebix.site/api/self-serve/status",{headers:request().headers});assert.equal((await handler(foreign)).status,401);
});
test("expired proof and failed reads have safe distinct HTTP outcomes",async()=>{
 for(const [kind,status] of [["expired",401],["unauthorized",401],["unavailable",503]] as const){const handler=createOnboardingStatusHandler({scope,codec,clock:()=>now,repository:{async readStatus(){return {kind};}}});const response=await handler(request());assert.equal(response.status,status);assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(response.headers.has("set-cookie"),false);}
});
test("ready alone produces exact destination fresh login and storefront links",()=>{
 const ready=presentOnboardingStatus({stage:"ready",updatedAt:now.toISOString(),storeSlug:"fixture-store"},scope);
 assert.equal(ready.loginUrl,`${scope.panelOrigin}/auth/login?destination=fixture-store.admin.${scope.platformDomainSuffix}`);assert.equal(ready.storefrontUrl,`https://fixture-store.${scope.platformDomainSuffix}`);assert.equal(ready.pollAfterMs,0);
 assert.equal(presentOnboardingStatus({stage:"checking_access",updatedAt:now.toISOString()},scope).loginUrl,undefined);
 assert.throws(()=>parseOnboardingStatusDto({...ready,loginUrl:"https://evil.example.test"},scope));
 assert.equal(nextStatusPollDelay(ready,false),0);assert.equal(nextStatusPollDelay(undefined,false),15000);assert.equal(nextStatusPollDelay({ ...ready,stage:"creating",pollAfterMs:5000 },true),0);
});

test("status rollout requires exact explicit true and defaults closed",()=>{for(const value of [undefined,"false","TRUE"," true ",true,"1"])assert.equal(resolveOnboardingStatusEnabled(value),false);assert.equal(resolveOnboardingStatusEnabled("true"),true);});
