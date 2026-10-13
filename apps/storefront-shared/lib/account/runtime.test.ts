import assert from "node:assert/strict";
import test from "node:test";

import type { StorefrontIdentityRepository } from "@celebix/saas-data";

import { parseStorefrontIdentityKeyring } from "./credential.ts";
import { createStorefrontIdentityRuntime } from "./runtime.ts";

const HOST = "identity-a.saas-staging.celebix.site";
const NOW = new Date("2026-08-04T09:00:00.000Z");
const KEYRING = parseStorefrontIdentityKeyring("current_01", JSON.stringify([{ keyId: "current_01", key: Buffer.alloc(32, 7).toString("base64url") }]));

function fake(overrides: Partial<StorefrontIdentityRepository> = {}): StorefrontIdentityRepository {
  return {
    start: async () => ({ outcome: "accepted", retryAfterSeconds: 60 }),
    verify: async () => ({ outcome: "authenticated", profileRequired: false }),
    completeProfile: async () => ({ outcome: "updated", version: 2, replayed: false }),
    session: async () => ({ outcome: "unauthenticated" }),
    logout: async () => undefined,
    logoutAll: async () => 0,
    updateProfile: async () => ({ outcome: "updated", version: 2, replayed: false }),
    saveAddress: async () => ({ outcome: "created", version: 1, replayed: false }),
    deleteAddress: async () => ({ outcome: "removed", version: 1, replayed: false }),
    favorite: async () => ({ outcome: "created", version: 1, replayed: false }),
    orders: async () => [],
    order: async () => { throw new Error("unused"); },
    devices: async () => [],
    revokeDevice: async () => ({ outcome: "revoked", version: 1, replayed: false }),
    ...overrides,
  };
}

type DeliveryMessage = Readonly<{ email: string; ticket: string; code: string; storeName: string; storeOrigin: string; returnTo: string; idempotencyKey: string }>;

function runtime(repository: StorefrontIdentityRepository, delivery: (message: DeliveryMessage) => Promise<void> = async () => undefined, emailDeliveryDispositionSupported?: boolean) {
  let index = 0;
  const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004", "10000000-0000-4000-8000-000000000005"];
  return createStorefrontIdentityRuntime({ repository, hmacKeyring: KEYRING, sealKeyring: KEYRING, now: () => new Date(NOW), randomBytes: (size) => new Uint8Array(size).fill(7), randomUuid: () => ids[index++]!, randomLoginCode: () => "042319", deliverLoginCode: delivery, emailDeliveryDispositionSupported });
}

test("retired customer email start never persists or delivers a login grant",async()=>{
 let calls=0;const selected=runtime(fake({start:async()=>{calls++;return {outcome:"accepted",retryAfterSeconds:60};},startEmail:async()=>{calls++;return {outcome:"accepted",retryAfterSeconds:60,deliveryRequired:true};}}),async()=>{calls++;});
 await assert.rejects(selected.start({hostname:HOST,email:"historic@example.test",requestAuthority:"unknown_client",returnTo:"/account",brand:{storeName:"Store",logoUrl:null,primaryColor:null}}),/storefront_email_login_retired/);assert.equal(calls,0);
});

test("a valid old email challenge cannot issue a new customer session",async()=>{
 const {sealAccountChallenge,serializeAccountChallengeCookie}=await import("./credential.ts");let calls=0;const selected=runtime(fake({verify:async()=>{calls++;return {outcome:"authenticated",profileRequired:false};}}));
 const sealed=sealAccountChallenge({challengeId:"10000000-0000-4000-8000-000000000001",email:"historic@example.test",expiresAt:new Date(NOW.getTime()+600000).toISOString()},KEYRING,size=>new Uint8Array(size).fill(7));
 await assert.rejects(selected.verify({hostname:HOST,challengeCookie:serializeAccountChallengeCookie(sealed),code:"042319",deviceLabel:"Browser",userAgent:"Browser"}),/storefront_identity_runtime_invalid/);assert.equal(calls,0);
});

test("invalid account cookies are expired locally without a database read", async () => {
  let calls = 0;
  const result = await runtime(fake({ session: async () => { calls += 1; return { outcome: "unauthenticated" }; } })).session(HOST, "__Host-celebix_account=invalid");
  assert.equal(result.outcome, "unauthenticated");
  assert.equal(result.setCookie, "__Host-celebix_account=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  assert.equal(calls, 0);
});

test("logout is enumeration-safe and always deletes identity cookies", async () => {
  const result = await runtime(fake()).logout(HOST, null);
  assert.equal(result.setCookies.some((value) => value.startsWith("__Host-celebix_account=;")), true);
  assert.equal(result.setCookies.some((value) => value.startsWith("__Host-celebix_account_csrf=;")), true);
});

test("same profile completion operation reuses its customer and session material after response loss",async()=>{
 const {createAccountSessionCredential}=await import('./credential.ts');const credential=createAccountSessionCredential(KEYRING,size=>new Uint8Array(size).fill(9)),inputs:Record<string,unknown>[]=[];const selected=runtime(fake({completeProfile:async input=>{inputs.push(input);return {outcome:'updated',version:1,replayed:inputs.length>1};}}));const input={hostname:HOST,cookieHeader:`__Host-celebix_account=${credential.value}`,operationId:'20000000-0000-4000-8000-000000000001',firstName:'Ada',lastName:'Customer',deviceLabel:'Browser',userAgent:'Browser'};const first=await selected.completeProfile(input),retry=await selected.completeProfile(input);assert.equal(inputs[0].customerId,inputs[1].customerId);assert.equal(inputs[0].fullSessionId,inputs[1].fullSessionId);assert.deepEqual(first.setCookies,retry.setCookies);
});
