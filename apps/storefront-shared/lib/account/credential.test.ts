import assert from "node:assert/strict";
import test from "node:test";

import {
  accountCodeDigest,
  accountCredentialDigestCandidates,
  accountCsrfDigest,
  accountEmailDigest,
  createAccountSessionCredential,
  createStorefrontLoginCode,
  openAccountChallenge,
  parseStorefrontIdentityKeyring,
  readAccountCookie,
  sealAccountChallenge,
  serializeAccountCookie,
  serializeAccountCookieDeletion,
  serializeAccountChallengeCookie,
} from "./credential.ts";

const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 9).toString("base64url");
const keyring = parseStorefrontIdentityKeyring("current_01", JSON.stringify([
  { keyId: "current_01", key: KEY_A },
  { keyId: "previous_01", key: KEY_B },
]));

test("session cookie is host-only and token storage is keyed", () => {
  const issued = createAccountSessionCredential(keyring, (size) => new Uint8Array(size).fill(7));
  assert.match(issued.value, /^a1[.]current_01[.][A-Za-z0-9_-]{43}$/u);
  assert.match(issued.digest, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(issued.digest, /BwcHBwcH/u);
  assert.deepEqual(accountCredentialDigestCandidates(issued.value, keyring), [{ keyId: "current_01", digest: issued.digest }]);
  assert.equal(serializeAccountCookie(issued.value), `__Host-celebix_account=${issued.value}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  assert.doesNotMatch(serializeAccountCookie(issued.value), /Domain=/u);
  assert.equal(serializeAccountCookieDeletion(), "__Host-celebix_account=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
});

test("account cookie reader rejects duplicates invalid frames and foreign cookies", () => {
  const value = createAccountSessionCredential(keyring, (size) => new Uint8Array(size).fill(5)).value;
  assert.deepEqual(readAccountCookie(`theme=light; __Host-celebix_account=${value}`), { kind: "present", value });
  assert.deepEqual(readAccountCookie(`__Host-celebix_account=${value}; __Host-celebix_account=${value}`), { kind: "invalid" });
  assert.deepEqual(readAccountCookie("__Host-celebix_account=a1.bad"), { kind: "invalid" });
  assert.deepEqual(readAccountCookie("theme=light"), { kind: "missing" });
});

test("low entropy codes and authority values use purpose-bound keyed digests", () => {
  const authority = { challengeId: "10000000-0000-4000-8000-000000000001", storeId: "20000000-0000-4000-8000-000000000001", email: "ada@example.com", code: "042319" } as const;
  const code = accountCodeDigest(authority, keyring);
  assert.equal(code.keyId, "current_01");
  assert.match(code.digest, /^[a-f0-9]{64}$/u);
  assert.notEqual(accountEmailDigest(authority.storeId, authority.email, keyring).digest, code.digest);
  assert.notEqual(accountCsrfDigest("30000000-0000-4000-8000-000000000001", "csrf-value", keyring).digest, code.digest);
  assert.equal(createStorefrontLoginCode((maximum) => maximum - 1), "999999");
});

test("challenge cookies are authenticated encrypted exact and short-lived", () => {
  const challenge = Object.freeze({ challengeId: "10000000-0000-4000-8000-000000000001", email: "ada@example.com", expiresAt: "2026-08-04T08:10:00.000Z" });
  const sealed = sealAccountChallenge(challenge, keyring, (size) => new Uint8Array(size).fill(11));
  assert.doesNotMatch(sealed, /ada@example[.]com/u);
  assert.deepEqual(openAccountChallenge(sealed, keyring), challenge);
  assert.equal(serializeAccountChallengeCookie(sealed), `__Host-celebix_account_challenge=${sealed}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  const tampered = `${sealed.slice(0, -1)}${sealed.endsWith("A") ? "B" : "A"}`;
  assert.equal(openAccountChallenge(tampered, keyring), null);
});

test("identity keyring rejects missing duplicate malformed and inactive authority", () => {
  for (const [active, keys] of [
    ["missing_01", JSON.stringify([{ keyId: "current_01", key: KEY_A }])],
    ["current_01", JSON.stringify([{ keyId: "current_01", key: KEY_A }, { keyId: "current_01", key: KEY_B }])],
    ["current_01", JSON.stringify([{ keyId: "current_01", key: "short" }])],
    ["CURRENT", "not-json"],
  ] as const) assert.throws(() => parseStorefrontIdentityKeyring(active, keys), /storefront_identity_credentials_unavailable/u);
});
