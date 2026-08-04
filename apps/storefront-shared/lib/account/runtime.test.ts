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

function runtime(repository: StorefrontIdentityRepository, delivery: (message: Readonly<{ email: string; code: string; storeName: string }>) => Promise<void> = async () => undefined) {
  let index = 0;
  const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004", "10000000-0000-4000-8000-000000000005"];
  return createStorefrontIdentityRuntime({ repository, hmacKeyring: KEYRING, sealKeyring: KEYRING, now: () => new Date(NOW), randomBytes: (size) => new Uint8Array(size).fill(7), randomUuid: () => ids[index++]!, randomLoginCode: () => "042319", deliverLoginCode: delivery });
}

test("auth start normalizes email queues only encrypted authority and sends the exact code", async () => {
  let databaseInput: Parameters<StorefrontIdentityRepository["start"]>[0] | undefined;
  let deliveryInput: unknown;
  const selected = runtime(fake({ start: async (input) => { databaseInput = input; return { outcome: "accepted", retryAfterSeconds: 60 }; } }), async (message) => { deliveryInput = message; });
  const result = await selected.start({ hostname: HOST, email: " Ada@Example.TEST ", requestAuthority: "request-bucket", brand: { storeName: "Güzide", logoUrl: null, primaryColor: "#FF5A00" } });
  assert.deepEqual(result.result, { outcome: "accepted", retryAfterSeconds: 60 });
  assert.match(result.setCookie, /^__Host-celebix_account_challenge=ch1[.]/u);
  assert.equal(JSON.stringify(databaseInput).includes("ada@example.test"), false);
  assert.match(databaseInput?.emailDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.deepEqual(deliveryInput, { email: "ada@example.test", code: "042319", storeName: "Güzide" });
});

test("verification opens the authenticated challenge and emits account plus session-bound csrf cookies", async () => {
  let verifyInput: Parameters<StorefrontIdentityRepository["verify"]>[0] | undefined;
  const selected = runtime(fake({ verify: async (input) => { verifyInput = input; return { outcome: "authenticated", profileRequired: false }; } }));
  const started = await selected.start({ hostname: HOST, email: "ada@example.test", requestAuthority: "request-bucket", brand: { storeName: "Güzide", logoUrl: null, primaryColor: "#FF5A00" } });
  const verified = await selected.verify({ hostname: HOST, challengeCookie: started.setCookie, code: "042319", deviceLabel: "Safari macOS", userAgent: "Mozilla test" });
  assert.deepEqual(verified.result, { outcome: "authenticated", profileRequired: false });
  assert.equal(verified.setCookies.some((value) => value.startsWith("__Host-celebix_account=a1.")), true);
  assert.equal(verified.setCookies.some((value) => value.startsWith("__Host-celebix_account_csrf=")), true);
  assert.equal(JSON.stringify(verifyInput).includes("042319"), false);
  assert.match(verifyInput?.codeDigest ?? "", /^[a-f0-9]{64}$/u);
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
