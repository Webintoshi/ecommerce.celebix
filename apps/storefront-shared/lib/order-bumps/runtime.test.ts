import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createStorefrontCredential, parseStorefrontCommerceCredentialKeyring, serializeStorefrontCredentialCookie } from "../cart/credential.ts";
const keyring = parseStorefrontCommerceCredentialKeyring({ CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current", CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current", key: Buffer.alloc(32, 7).toString("base64url") }]) });
const empty = { cartVersion: null, heading: null, offers: [] };
async function implementation() { assert.ok(existsSync(new URL("./runtime.ts", import.meta.url)), "the public runtime must exist"); return import("./runtime.ts"); }

test("missing malformed and purpose-mismatched cart cookies never reach the recommendation repository", async () => {
  const { createOrderBumpRuntime } = await implementation(); let reads = 0;
  const runtime = createOrderBumpRuntime({ repository: { async offers() { reads++; return empty; } }, keyring, now: () => new Date("2026-10-09T00:00:00Z") });
  const cartCookie = serializeStorefrontCredentialCookie("cart", createStorefrontCredential("cart", keyring, size => new Uint8Array(size).fill(3)).value).split(";", 1)[0];
  for (const cookie of [null, "__Host-celebix_cart=broken", `${cartCookie}; ${cartCookie}`, serializeStorefrontCredentialCookie("intent", createStorefrontCredential("intent", keyring, size => new Uint8Array(size).fill(3)).value)]) assert.deepEqual(await runtime.offers("one.example", cookie, "side_cart"), empty);
  assert.equal(reads, 0);
});

test("public offers receive only the trusted hostname clock and a keyed cart digest", async () => {
  const { createOrderBumpRuntime } = await implementation(); const calls: unknown[] = [];
  const credential = createStorefrontCredential("cart", keyring, size => new Uint8Array(size).fill(3));
  const now = new Date("2026-10-09T00:00:00Z");
  const runtime = createOrderBumpRuntime({ repository: { async offers(input) { calls.push(input); return empty; } }, keyring, now: () => now });
  await runtime.offers("one.example", serializeStorefrontCredentialCookie("cart", credential.value), "checkout");
  assert.deepEqual(calls, [{ hostname: "one.example", now, credentialCandidates: [{ keyId: "current", digest: credential.digest }], placement: "checkout" }]);
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(credential.value.replaceAll(".", "\\.")));
});
