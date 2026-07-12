import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  IdentityCryptoError,
  createAes256GcmPayloadCipher,
  createOpaqueStateDigester,
} from "./identity-crypto.ts";

test("opaque state digests are domain separated, fixed lowercase hex, and require a 32-byte key", () => {
  const key = randomBytes(32);
  const registration = createOpaqueStateDigester({ key, context: "registration-attempt-state" });
  const oidc = createOpaqueStateDigester({ key, context: "oidc-transaction-state" });
  const raw = "opaque-state-that-must-never-be-stored";

  assert.match(registration.digest(raw), /^[a-f0-9]{64}$/);
  assert.notEqual(registration.digest(raw), oidc.digest(raw));
  assert.throws(() => createOpaqueStateDigester({ key: randomBytes(31), context: "too-short" }), IdentityCryptoError);
  assert.throws(() => registration.digest(""), IdentityCryptoError);
});

test("AES-256-GCM binds purpose, digest, schema, and record ID and fails closed on tampering", () => {
  const key = randomBytes(32);
  const cipher = createAes256GcmPayloadCipher({
    currentKeyId: "current",
    resolveKey: (keyId) => keyId === "current" ? key : undefined,
  });
  const binding = {
    purpose: "saas.registration_workflows",
    stateDigest: "a".repeat(64),
    schemaVersion: 1,
    recordId: "attempt_123",
  } as const;
  const encrypted = cipher.encrypt({ binding, payload: { safe: "value" } });

  assert.equal(encrypted.keyId, "current");
  assert.equal(encrypted.iv.length, 12);
  assert.ok(encrypted.ciphertext.length > 16);
  assert.deepEqual(cipher.decrypt({ binding, encrypted }), { safe: "value" });

  for (const changed of [
    { ...binding, purpose: "saas.oidc_transactions" },
    { ...binding, stateDigest: "b".repeat(64) },
    { ...binding, schemaVersion: 2 },
    { ...binding, recordId: "attempt_456" },
  ]) {
    assert.throws(() => cipher.decrypt({ binding: changed, encrypted }), IdentityCryptoError);
  }

  const tampered = Buffer.from(encrypted.ciphertext);
  tampered[0] ^= 1;
  assert.throws(() => cipher.decrypt({ binding, encrypted: { ...encrypted, ciphertext: tampered } }), IdentityCryptoError);
  assert.throws(() => cipher.decrypt({ binding, encrypted: { ...encrypted, keyId: "unknown" } }), IdentityCryptoError);
});

test("cipher writes with the current key and reads approved previous keys without rewriting", () => {
  const oldKey = randomBytes(32);
  const currentKey = randomBytes(32);
  const binding = {
    purpose: "saas.oidc_transactions",
    stateDigest: "c".repeat(64),
    schemaVersion: 1,
  } as const;
  const oldCipher = createAes256GcmPayloadCipher({ currentKeyId: "old", resolveKey: () => oldKey });
  const encryptedWithOld = oldCipher.encrypt({ binding, payload: { generation: "old" } });
  const rotated = createAes256GcmPayloadCipher({
    currentKeyId: "current",
    resolveKey: (keyId) => ({ old: oldKey, current: currentKey })[keyId],
  });

  assert.deepEqual(rotated.decrypt({ binding, encrypted: encryptedWithOld }), { generation: "old" });
  assert.equal(rotated.encrypt({ binding, payload: { generation: "new" } }).keyId, "current");
});
