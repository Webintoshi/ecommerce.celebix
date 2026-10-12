import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSecurityBridge} from "./bridge.ts";
const now=new Date("2026-10-12T12:00:00.000Z"),secret=new Uint8Array(32).fill(5),centralOrigin="https://panel.celebix.site",sourceOrigin="https://admin.guzidekuyumcu.com.tr";
const input={action:"start" as const,sourceOrigin,expiresAt:new Date(now.getTime()+600000).toISOString(),authorizationUrl:"https://identity.celebix.test/oidc/auth?state=value",browserCredential:`pb1.${Buffer.alloc(32,4).toString("base64url")}`,browserExpiresAt:new Date(now.getTime()+600000).toISOString()};
test("bridge encrypts private browser or session authority with central origin and environment binding",()=>{
 const bridge=createAdminSecurityBridge({secret,centralOrigin,environment:"staging",clock:()=>now});const transfer=bridge.seal(input);assert.deepEqual(bridge.open(transfer),input);assert.ok(!transfer.includes(input.browserCredential));assert.ok(!transfer.includes(input.authorizationUrl));
 const forget={action:"forget" as const,sourceOrigin,expiresAt:input.expiresAt,sessionCredential:`v1.key.${Buffer.alloc(32,6).toString("base64url")}`,operationId:"aabbccdd-1234-4234-8234-aabbccddeeff"};assert.deepEqual(bridge.open(bridge.seal(forget)),forget);
 for(const options of [{secret:new Uint8Array(32).fill(7),centralOrigin,environment:"staging"},{secret,centralOrigin:"https://panel.other.test",environment:"staging"},{secret,centralOrigin,environment:"production"}])assert.throws(()=>createAdminSecurityBridge({...options,clock:()=>now}).open(transfer));
 const expired=createAdminSecurityBridge({secret,centralOrigin,environment:"staging",clock:()=>new Date(now.getTime()+600001)});assert.throws(()=>expired.open(transfer));
 const parts=transfer.split(".");parts[2]=parts[2]!.slice(0,-1)+(parts[2]!.endsWith("A")?"B":"A");assert.throws(()=>bridge.open(parts.join(".")));
});
test("bridge rejects extra fields unbounded expiry invalid authority and excessive token before use",()=>{
 const bridge=createAdminSecurityBridge({secret,centralOrigin,environment:"staging",clock:()=>now});
 for(const payload of [{...input,sessionCredential:"secret"},{...input,expiresAt:now.toISOString()},{...input,expiresAt:new Date(now.getTime()+600001).toISOString()},{...input,sourceOrigin:"http://evil.test"},{...input,browserCredential:"bad"},{...input,authorizationUrl:"javascript:alert(1)"}])assert.throws(()=>bridge.seal(payload as typeof input));
 assert.throws(()=>bridge.open("a".repeat(16000)));assert.throws(()=>createAdminSecurityBridge({secret:new Uint8Array(31),centralOrigin,environment:"staging"}));
});

test("forget confirmation encrypts explicit device authority and rejects missing operation or nonce",()=>{
 const bridge=createAdminSecurityBridge({secret,centralOrigin,environment:"staging",clock:()=>now});
 const confirmation={action:"forget_confirm" as const,sourceOrigin,expiresAt:input.expiresAt,sessionCredential:`v1.key.${Buffer.alloc(32,6).toString("base64url")}`,operationId:"aabbccdd-1234-4234-8234-aabbccddeeff",deviceCredential:`adt1.key.${Buffer.alloc(32,7).toString("base64url")}`,nonce:Buffer.alloc(32,8).toString("base64url")};
 const sealed=bridge.seal(confirmation);assert.deepEqual(bridge.open(sealed),confirmation);assert.ok(!sealed.includes(confirmation.deviceCredential));
 for(const field of ["operationId","deviceCredential","nonce"]){const bad:Record<string,unknown>={...confirmation};delete bad[field];assert.throws(()=>bridge.seal(bad as typeof confirmation));}
 assert.throws(()=>bridge.seal({...confirmation,nonce:"bad"}));
});
