import assert from "node:assert/strict";
import test from "node:test";

import {
  digestRedemptionCredential,
  generateRedemptionCredential,
  parseRedemptionCookie,
  serializeRedemptionCookie,
} from "./redemption-cookie.ts";

const credential = `q1.${Buffer.alloc(32, 0x41).toString("base64url")}`;

test("generates canonical q1 credentials and persists only a lowercase SHA-256 digest", () => {
  const generated = generateRedemptionCredential((size) => Buffer.alloc(size, 0x41));
  assert.equal(generated, credential);
  assert.match(digestRedemptionCredential(generated), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(digestRedemptionCredential(generated), /q1|QUFB/);
});

test("serializes one host-only secure cookie bounded to thirty minutes", () => {
  const value = serializeRedemptionCookie(credential, 900);
  assert.equal(value, `${"__Host-celebix_quick"}=${credential}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
  assert.doesNotMatch(value, /Domain=/i);
  assert.throws(() => serializeRedemptionCookie(credential, 1801), /redemption_cookie_invalid/);
});

test("parses one exact redemption cookie while ignoring well-formed unrelated cookies", () => {
  assert.deepEqual(parseRedemptionCookie(`theme=dark; encoded=dGVzdA==; __Host-celebix_quick=${credential}; locale=tr`), { kind: "valid", credential });
  assert.deepEqual(parseRedemptionCookie("theme=dark; locale=tr"), { kind: "missing" });
});

test("rejects duplicate, malformed, whitespace-altered, and noncanonical redemption cookies", () => {
  for (const value of [
    `__Host-celebix_quick=${credential}; __Host-celebix_quick=${credential}`,
    "broken",
    "theme =dark",
    `__Host-celebix_quick= ${credential}`,
    "__Host-celebix_quick=q1.invalid",
  ]) assert.deepEqual(parseRedemptionCookie(value), { kind: "invalid" });
});
