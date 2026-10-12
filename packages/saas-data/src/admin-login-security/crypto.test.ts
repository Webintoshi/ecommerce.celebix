import assert from "node:assert/strict";
import test from "node:test";
import { createAdminLoginSecurityCodec, normalizeAdminLoginPhone } from "./crypto.ts";

const scope = { principalId: "10000000-0000-4000-8000-000000000001", environment: "production", securityVersion: 1 };
const pendingId = "20000000-0000-4000-8000-000000000001";
const operationId = "30000000-0000-4000-8000-000000000001";
const expiresAt = "2026-10-12T10:10:00.000Z";
let instant = new Date("2026-10-12T10:00:00.000Z");
const make = (key = 7) => createAdminLoginSecurityCodec({ activeKeyId: "admin1", keyring: new Map([["admin1", new Uint8Array(32).fill(key)]]), now: () => instant });

test("admin phone normalization preserves accepted customer number formats", () => {
  assert.equal(normalizeAdminLoginPhone("0532 123 45 67"), "+905321234567");
  assert.equal(normalizeAdminLoginPhone("0044 20 1234 5678"), "+442012345678");
  for (const value of ["+9005321234567", "+905321234567\n", "hello", "1".repeat(65)]) assert.throws(() => normalizeAdminLoginPhone(value), /^TypeError: admin_login_security_invalid$/u);
});

test("encrypted phone rejects wrong master key, purpose, principal, environment and version", () => {
  const codec = make(); const envelope = codec.sealPhone("05321234567", scope);
  assert.equal(codec.openPhone(envelope, scope), "+905321234567");
  assert.equal(make(8).openPhone(envelope, scope), null);
  assert.doesNotMatch(envelope, /905321234567/u);
  for (const change of [{ principalId: pendingId }, { environment: "staging" }, { securityVersion: 2 }]) assert.equal(codec.openPhone(envelope, { ...scope, ...change }), null);
  assert.equal(codec.openPending(envelope, scope, pendingId), null);
  assert.equal(codec.openPhone(envelope.replace(/.$/u, "!"), scope), null);
});

test("pending envelopes reject expiry and reuse for another pending operation", () => {
  instant = new Date("2026-10-12T10:00:00.000Z"); const codec = make();
  const envelope = codec.sealPending({ pendingId, expiresAt }, scope);
  assert.deepEqual(codec.openPending(envelope, scope, pendingId), { pendingId, expiresAt });
  assert.equal(codec.openPending(envelope, scope, operationId), null);
  instant = new Date(expiresAt); assert.equal(codec.openPending(envelope, scope, pendingId), null);
  instant = new Date("2026-10-12T10:00:00.000Z");
});

test("completion envelopes protect exact retry secrets and bind operation and expiration", () => {
  const codec = make(); const context = { ...scope, pendingId, operationId, expiresAt };
  const payload = { sessionCredential: "private-session", backupCodes: ["private-backup"] };
  const envelope = codec.sealCompletion(payload, context);
  assert.doesNotMatch(envelope, /private/u); assert.deepEqual(codec.openCompletion(envelope, context), payload);
  assert.equal(codec.openCompletion(envelope, { ...context, operationId: pendingId }), null);
  assert.equal(codec.openCompletion(envelope, { ...context, expiresAt: "2026-10-12T10:09:00.000Z" }), null);
  assert.equal(codec.openCompletion(envelope, { ...context, environment: "preview" }), null);
  assert.throws(() => codec.sealCompletion({ secret: "x".repeat(8192) }, context), /admin_login_security_invalid/u);
});

test("opaque pending and remembered credentials reject cross-purpose, tampered and noncanonical input", () => {
  const codec = make(); const pending = codec.generatePendingCredential(); const device = codec.generateDeviceCredential();
  assert.match(pending, /^apl1\.admin1\.[A-Za-z0-9_-]{43}$/u); assert.match(device, /^adt1\.admin1\.[A-Za-z0-9_-]{43}$/u);
  const hash = codec.pendingDigest(scope, pendingId, pending);
  assert.equal(codec.verifyPendingCredential(scope, pendingId, pending, hash), true);
  assert.equal(codec.verifyPendingCredential(scope, operationId, pending, hash), false);
  assert.equal(codec.verifyPendingCredential(scope, pendingId, `${pending.slice(0, -1)}!`, hash), false);
  assert.equal(codec.verifyPendingCredential(scope, pendingId, device, hash), false);
  assert.equal(codec.verifyPendingCredential(scope, pendingId, "x".repeat(10000), hash), false);
  assert.equal(codec.verifyPendingCredential(scope, pendingId, pending, { ...hash, digest: "0".repeat(64) }), false);
  const deviceHash = codec.deviceDigest(scope, device);
  assert.equal(codec.verifyDeviceCredential(scope, device, deviceHash), true);
  assert.equal(codec.verifyDeviceCredential({ ...scope, securityVersion: 2 }, device, deviceHash), false);
});

test("OTP digests reject code tampering, another challenge, principal and purpose", () => {
  const codec = make(); const hash = codec.otpDigest(scope, pendingId, "123456");
  assert.equal(codec.verifyOtp(scope, pendingId, "123456", hash), true);
  assert.equal(codec.verifyOtp(scope, pendingId, "123457", hash), false);
  assert.equal(codec.verifyOtp(scope, operationId, "123456", hash), false);
  assert.equal(codec.verifyOtp({ ...scope, principalId: operationId }, pendingId, "123456", hash), false);
  for (const value of ["12345", "1234567", "１２３４５６", "123456\n"]) assert.equal(codec.verifyOtp(scope, pendingId, value, hash), false);
  assert.notEqual(codec.recipientDigest(scope.environment, "+905321234567").digest, hash.digest);
});

test("OTP RNG rejects biased tail before deriving a six-digit result", () => {
  let calls = 0;
  const codec = createAdminLoginSecurityCodec({ activeKeyId: "admin1", keyring: new Map([["admin1", new Uint8Array(32).fill(7)]]), randomBytes: size => { assert.equal(size, 4); calls++; return calls === 1 ? Buffer.from([255,255,255,255]) : Buffer.from([0,0,0,42]); } });
  assert.equal(codec.generateOtp(), "000042"); assert.equal(calls, 2);
});

test("ten recovery codes have separate scoped hashes and old key rotation remains verifiable", () => {
  const codec = make(); const codes = codec.generateBackupCodes();
  assert.equal(codes.length, 10); assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/u);
    const hash = codec.backupDigest(scope, code); assert.doesNotMatch(JSON.stringify(hash), new RegExp(code));
    assert.equal(codec.verifyBackupCode(scope, code, hash), true);
    assert.equal(codec.verifyBackupCode({ ...scope, environment: "staging" }, code, hash), false);
  }
  const token = codec.generateDeviceCredential(); const hash = codec.deviceDigest(scope, token);
  const rotating = createAdminLoginSecurityCodec({ activeKeyId: "admin2", keyring: new Map([["admin1", new Uint8Array(32).fill(7)], ["admin2", new Uint8Array(32).fill(9)]]) });
  assert.equal(rotating.verifyDeviceCredential(scope, token, hash), true);
  assert.match(rotating.generateDeviceCredential(), /^adt1\.admin2\./u);
});

test("key validation protects caller buffers and fails without exposing supplied secrets", () => {
  const key = new Uint8Array(32).fill(7); const codec = createAdminLoginSecurityCodec({ activeKeyId: "admin1", keyring: new Map([["admin1", key]]) });
  key.fill(8); assert.equal(make().openPhone(codec.sealPhone("05321234567", scope), scope), "+905321234567");
  assert.throws(() => createAdminLoginSecurityCodec({ activeKeyId: "sensitive-key", keyring: new Map([["sensitive-key", new Uint8Array(31)]]) }), /^TypeError: admin_login_security_invalid$/u);
});

test("a configured codec cannot be changed by later mutation of caller options", () => {
  const options = { activeKeyId: "admin1", keyring: new Map([["admin1", new Uint8Array(32).fill(7)]]) };
  const codec = createAdminLoginSecurityCodec(options);
  options.activeKeyId = "attacker"; options.keyring.clear();
  assert.match(codec.generateDeviceCredential(), /^adt1\.admin1\./u);
  assert.equal(make().openPhone(codec.sealPhone("05321234567", scope), scope), "+905321234567");
});

test("completion plaintext is unavailable at the fixed expiry boundary", () => {
  instant = new Date("2026-10-12T10:00:00.000Z"); const codec = make();
  const context = { ...scope, pendingId, operationId, expiresAt };
  const envelope = codec.sealCompletion({ secret: "private-completion" }, context);
  instant = new Date(expiresAt); assert.equal(codec.openCompletion(envelope, context), null);
  instant = new Date("2026-10-12T10:00:00.000Z");
  assert.throws(() => codec.sealPending({ pendingId, expiresAt: "2026-10-12T10:10:00.001Z" }, scope), /admin_login_security_invalid/u);
});

test("trusted-source digests bind the environment and RNG failures are bounded", () => {
  const codec = make(); assert.match(codec.generateId(), /^[0-9a-f-]{36}$/u);
  assert.notEqual(codec.requestDigest("production", "127.0.0.1").digest, codec.requestDigest("staging", "127.0.0.1").digest);
  assert.throws(() => codec.requestDigest("production", "127.0.0.1\n"), /admin_login_security_invalid/u);
  const unavailableRng = createAdminLoginSecurityCodec({ activeKeyId: "admin1", keyring: new Map([["admin1", new Uint8Array(32).fill(7)]]), randomBytes: size => new Uint8Array(size).fill(255), randomUUID: () => "not-a-uuid" });
  assert.throws(() => unavailableRng.generateOtp(), /admin_login_security_invalid/u);
  assert.throws(() => unavailableRng.generateBackupCodes(), /admin_login_security_invalid/u);
  assert.throws(() => unavailableRng.generateId(), /admin_login_security_invalid/u);
});
