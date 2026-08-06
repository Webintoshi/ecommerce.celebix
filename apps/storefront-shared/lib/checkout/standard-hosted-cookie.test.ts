import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorefrontCredential,
  parseStorefrontCommerceCredentialKeyring,
} from "../cart/credential.ts";
import {
  createStandardHostedCheckoutCredential,
  readStandardHostedCheckoutCookie,
  serializeStandardHostedCheckoutCookie,
  serializeStandardHostedCheckoutDeletionCookie,
  standardHostedCheckoutDigestCandidates,
} from "./standard-hosted-cookie.ts";

const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 9).toString("base64url");
const source = (activeKeyId: string) => ({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging",
  CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: activeKeyId,
  CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([
    { keyId: "current_01", key: KEY_A }, { keyId: "previous_01", key: KEY_B },
  ]),
});

test("hosted checkout credential has an independent purpose and cannot be reused as commerce authority", () => {
  const keyring = parseStorefrontCommerceCredentialKeyring(source("current_01"));
  const random = (size: number) => new Uint8Array(size).fill(3);
  const hosted = createStandardHostedCheckoutCredential(keyring, random);
  assert.match(hosted.value, /^h1[.]current_01[.][A-Za-z0-9_-]{43}$/u);
  for (const purpose of ["cart", "intent", "customer", "receipt"] as const) {
    assert.notEqual(hosted.digest, createStorefrontCredential(purpose, keyring, random).digest);
  }
});

test("hosted checkout accepts retained-key credentials after active-key rotation", () => {
  const previous = createStandardHostedCheckoutCredential(
    parseStorefrontCommerceCredentialKeyring(source("previous_01")),
    (size) => new Uint8Array(size).fill(4),
  );
  const rotated = parseStorefrontCommerceCredentialKeyring(source("current_01"));
  assert.deepEqual(standardHostedCheckoutDigestCandidates(previous.value, rotated), [
    { keyId: "previous_01", digest: previous.digest },
  ]);
});

test("hosted checkout cookie is host-only, short-lived, path-bounded and deletable", () => {
  const keyring = parseStorefrontCommerceCredentialKeyring(source("current_01"));
  const created = createStandardHostedCheckoutCredential(keyring, (size) => new Uint8Array(size).fill(5));
  const serialized = serializeStandardHostedCheckoutCookie(created.value);
  assert.equal(serialized, `__Host-celebix_hosted_checkout=${created.value}; Path=/checkout/payment; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
  assert.doesNotMatch(serialized, /Domain=/iu);
  assert.equal(serializeStandardHostedCheckoutDeletionCookie(), "__Host-celebix_hosted_checkout=; Path=/checkout/payment; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
});

test("hosted checkout cookie reader rejects duplicates and every other credential purpose", () => {
  const keyring = parseStorefrontCommerceCredentialKeyring(source("current_01"));
  const hosted = createStandardHostedCheckoutCredential(keyring, (size) => new Uint8Array(size).fill(6)).value;
  const cart = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(6)).value;
  assert.deepEqual(readStandardHostedCheckoutCookie(`theme=light; __Host-celebix_hosted_checkout=${hosted}`), { kind: "present", value: hosted });
  assert.deepEqual(readStandardHostedCheckoutCookie(`__Host-celebix_hosted_checkout=${cart}`), { kind: "invalid" });
  assert.deepEqual(readStandardHostedCheckoutCookie(`__Host-celebix_hosted_checkout=${hosted}; __Host-celebix_hosted_checkout=${hosted}`), { kind: "invalid" });
  assert.deepEqual(readStandardHostedCheckoutCookie("theme=light"), { kind: "missing" });
});
