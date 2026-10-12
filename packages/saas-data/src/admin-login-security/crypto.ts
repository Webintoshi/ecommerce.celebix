// Server only: the admin master keyring must never be sourced from customer,
// payment, Google, or browser configuration. Node crypto prevents browser use.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
const ENV = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u;
const BACKUP = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/u;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_JSON_BYTES = 8192;
const MAX_LIFETIME_MS = 600_000;
export type AdminLoginSecurityScope = Readonly<{ principalId: string; environment: string; securityVersion: number }>;
export type AdminLoginSecurityDigest = Readonly<{ keyId: string; digest: string }>;
export type AdminPendingEnvelopePayload = Readonly<{ pendingId: string; expiresAt: string }>;
export type AdminCompletionEnvelopeContext = AdminLoginSecurityScope & Readonly<{ pendingId: string; operationId: string; expiresAt: string }>;
export type AdminLoginSecurityCodecOptions = Readonly<{
  activeKeyId: string;
  keyring: ReadonlyMap<string, Uint8Array>;
  randomBytes?: (size: number) => Uint8Array;
  randomUUID?: () => string;
  now?: () => Date;
}>;
function invalid(): never { throw new TypeError("admin_login_security_invalid"); }
function uuid(value: string): string { if (typeof value !== "string" || value.length !== 36 || !UUID.test(value)) invalid(); return value; }
function environment(value: string): string { if (typeof value !== "string" || value.length > 64 || !ENV.test(value)) invalid(); return value; }
function scopeFields(scope: AdminLoginSecurityScope): readonly (string | number)[] {
  if (!scope || !Number.isSafeInteger(scope.securityVersion) || scope.securityVersion < 1) invalid();
  return [uuid(scope.principalId), environment(scope.environment), scope.securityVersion];
}
// Same pure normalization rules as storefront-shared/lib/account/phone.ts.
// Keep this local to the data layer to avoid importing customer auth authority.
export function normalizeAdminLoginPhone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || !/^[+0-9 ()-]+$/u.test(value)) invalid();
  let number = value.trim().replace(/[ ()-]/gu, "");
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  else if (/^0[2-5][0-9]{9}$/u.test(number)) number = `+90${number.slice(1)}`;
  else if (/^[2-5][0-9]{9}$/u.test(number)) number = `+90${number}`;
  else if (/^90[2-5][0-9]{9}$/u.test(number)) number = `+${number}`;
  if (!/^\+[1-9][0-9]{7,14}$/u.test(number) || number.startsWith("+90") && !/^\+90[2-5][0-9]{9}$/u.test(number)) invalid();
  return number;
}
function canonicalBytes(value: string, size?: number): Buffer {
  if (typeof value !== "string" || value.length < 1 || value.length > 10923 || !/^[A-Za-z0-9_-]+$/u.test(value)) invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (size !== undefined && bytes.length !== size)) { bytes.fill(0); invalid(); }
  return bytes;
}
function equalDigest(actual: AdminLoginSecurityDigest, expected: AdminLoginSecurityDigest): boolean {
  if (!expected || typeof expected.keyId !== "string" || !KEY_ID.test(expected.keyId) || typeof expected.digest !== "string" || expected.digest.length !== 64 || !/^[0-9a-f]{64}$/u.test(expected.digest)) return false;
  const left = Buffer.from(actual.digest, "hex"), right = Buffer.from(expected.digest, "hex");
  try { return actual.keyId === expected.keyId && timingSafeEqual(left, right); } finally { left.fill(0); right.fill(0); }
}
export function createAdminLoginSecurityCodec(options: AdminLoginSecurityCodecOptions) {
  const keys = new Map<string, Buffer>();
  try {
    if (!options || typeof options.activeKeyId !== "string" || !KEY_ID.test(options.activeKeyId) || !(options.keyring instanceof Map) || options.keyring.size < 1 || options.keyring.size > 16) invalid();
    for (const [id, raw] of options.keyring) {
      if (typeof id !== "string" || !KEY_ID.test(id) || !(raw instanceof Uint8Array) || raw.length !== 32) invalid();
      const copy = Buffer.from(raw);
      if ([...keys.values()].some(key => timingSafeEqual(key, copy))) { copy.fill(0); invalid(); }
      keys.set(id, copy);
    }
    if (!keys.has(options.activeKeyId)) invalid();
    if (options.randomBytes !== undefined && typeof options.randomBytes !== "function" || options.randomUUID !== undefined && typeof options.randomUUID !== "function" || options.now !== undefined && typeof options.now !== "function") invalid();
  } catch { for (const key of keys.values()) key.fill(0); invalid(); }
  const activeKeyId = options.activeKeyId;
  const makeUuid = options.randomUUID ?? randomUUID;
  const rng = options.randomBytes ?? randomBytes;
  const now = options.now ?? (() => new Date());
  function random(size: number): Buffer {
    try { const value = rng(size); if (!(value instanceof Uint8Array) || value.length !== size) invalid(); return Buffer.from(value); } catch { return invalid(); }
  }
  function time(): number { const instant = now(); if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) invalid(); return instant.getTime(); }
  function expiry(value: string, issuing = false): string {
    if (typeof value !== "string" || value.length !== 24) invalid();
    const millis = Date.parse(value), current = time();
    if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value || millis <= current || issuing && millis - current > MAX_LIFETIME_MS) invalid();
    return value;
  }
  function derived(purpose: string, keyId = activeKeyId): Buffer {
    const key = keys.get(keyId); if (!key) invalid();
    return createHmac("sha256", key).update(JSON.stringify(["celebix/admin-login-security/v1", "derive", purpose, keyId])).digest();
  }
  function digest(purpose: string, fields: readonly (string | number)[], keyId = activeKeyId): AdminLoginSecurityDigest {
    const key = derived(`hmac/${purpose}`, keyId);
    try { return Object.freeze({ keyId, digest: createHmac("sha256", key).update(JSON.stringify(["celebix/admin-login-security/v1", purpose, ...fields])).digest("hex") }); } finally { key.fill(0); }
  }
  function seal(purpose: string, payload: unknown, fields: readonly (string | number)[]): string {
    let plain: Buffer | undefined, nonce: Buffer | undefined, key: Buffer | undefined;
    try {
      plain = Buffer.from(JSON.stringify(payload)); if (plain.length < 1 || plain.length > MAX_JSON_BYTES) invalid();
      nonce = random(12); key = derived(`encrypt/${purpose}`);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(JSON.stringify(["celebix/admin-login-security/v1", purpose, activeKeyId, ...fields])));
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      try { return `as1.${activeKeyId}.${nonce.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`; } finally { encrypted.fill(0); }
    } catch { return invalid(); } finally { plain?.fill(0); nonce?.fill(0); key?.fill(0); }
  }
  function open(purpose: string, envelope: string, fields: readonly (string | number)[]): unknown {
    let key: Buffer | undefined, plain: Buffer | undefined, nonce: Buffer | undefined, encrypted: Buffer | undefined, tag: Buffer | undefined;
    try {
      if (typeof envelope !== "string" || envelope.length > 11100) invalid();
      const parts = envelope.split("."); if (parts.length !== 5 || parts[0] !== "as1" || !KEY_ID.test(parts[1]!)) invalid();
      key = derived(`encrypt/${purpose}`, parts[1]); nonce = canonicalBytes(parts[2]!, 12); encrypted = canonicalBytes(parts[3]!); tag = canonicalBytes(parts[4]!, 16);
      if (encrypted.length > MAX_JSON_BYTES) invalid();
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(Buffer.from(JSON.stringify(["celebix/admin-login-security/v1", purpose, parts[1], ...fields]))); decipher.setAuthTag(tag);
      plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
    } finally { key?.fill(0); plain?.fill(0); nonce?.fill(0); encrypted?.fill(0); tag?.fill(0); }
  }
  function credential(prefix: "apl1" | "adt1"): string {
    const bytes = random(32); try { return `${prefix}.${activeKeyId}.${bytes.toString("base64url")}`; } finally { bytes.fill(0); }
  }
  function tokenKey(value: string, prefix: string): string {
    if (typeof value !== "string" || value.length > 81) invalid();
    const parts = value.split("."); if (parts.length !== 3 || parts[0] !== prefix || !KEY_ID.test(parts[1]!) || parts[2]!.length !== 43) invalid();
    const bytes = canonicalBytes(parts[2]!, 32); bytes.fill(0); if (!keys.has(parts[1]!)) invalid(); return parts[1]!;
  }
  function pendingDigest(scope: AdminLoginSecurityScope, pendingId: string, value: string) { return digest("pending-login", [...scopeFields(scope), uuid(pendingId), value], tokenKey(value, "apl1")); }
  function deviceDigest(scope: AdminLoginSecurityScope, value: string) { return digest("device-token", [...scopeFields(scope), value], tokenKey(value, "adt1")); }
  function otpDigest(scope: AdminLoginSecurityScope, challengeId: string, code: string, keyId = activeKeyId) {
    if (typeof code !== "string" || code.length !== 6 || !/^[0-9]{6}$/u.test(code)) invalid();
    return digest("otp", [...scopeFields(scope), uuid(challengeId), code], keyId);
  }
  function backupDigest(scope: AdminLoginSecurityScope, code: string, keyId = activeKeyId) {
    if (typeof code !== "string" || code.length !== 24 || !BACKUP.test(code)) invalid();
    return digest("backup-code", [...scopeFields(scope), code], keyId);
  }
  function verify(compute: () => AdminLoginSecurityDigest, expected: AdminLoginSecurityDigest): boolean { try { return equalDigest(compute(), expected); } catch { return false; } }
  return Object.freeze({
    generateId(): string { try { return uuid(makeUuid()); } catch { return invalid(); } },
    generatePendingCredential: () => credential("apl1"), generateDeviceCredential: () => credential("adt1"),
    generateOtp(): string {
      for (let attempt = 0; attempt < 128; attempt++) { const bytes = random(4); let value: number; try { value = bytes.readUInt32BE(); } finally { bytes.fill(0); } if (value < 4_294_000_000) return String(value % 1_000_000).padStart(6, "0"); }
      return invalid();
    },
    generateBackupCodes(): readonly string[] {
      const codes = new Set<string>();
      for (let attempt = 0; attempt < 128 && codes.size < 10; attempt++) { const bytes = random(20); try { const raw = [...bytes].map(byte => ALPHABET[byte & 31]!).join(""); codes.add(raw.match(/.{4}/gu)!.join("-")); } finally { bytes.fill(0); } }
      if (codes.size !== 10) invalid(); return Object.freeze([...codes]);
    },
    sealPhone(phone: string, scope: AdminLoginSecurityScope): string { return seal("phone", normalizeAdminLoginPhone(phone), scopeFields(scope)); },
    openPhone(envelope: string, scope: AdminLoginSecurityScope): string | null { try { const phone = open("phone", envelope, scopeFields(scope)); if (typeof phone !== "string" || normalizeAdminLoginPhone(phone) !== phone) return null; return phone; } catch { return null; } },
    sealPending(payload: AdminPendingEnvelopePayload, scope: AdminLoginSecurityScope): string {
      const value = { pendingId: uuid(payload.pendingId), expiresAt: expiry(payload.expiresAt, true) };
      return seal("pending-envelope", value, [...scopeFields(scope), value.pendingId]);
    },
    openPending(envelope: string, scope: AdminLoginSecurityScope, pendingId: string): AdminPendingEnvelopePayload | null {
      try { const value = open("pending-envelope", envelope, [...scopeFields(scope), uuid(pendingId)]) as AdminPendingEnvelopePayload; if (!value || Object.keys(value).length !== 2 || value.pendingId !== pendingId) return null; expiry(value.expiresAt); return Object.freeze(value); } catch { return null; }
    },
    sealCompletion(payload: Readonly<Record<string, unknown>>, context: AdminCompletionEnvelopeContext): string {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid();
      const expiresAt = expiry(context.expiresAt, true);
      return seal("completion", { expiresAt, payload }, [...scopeFields(context), uuid(context.pendingId), uuid(context.operationId), expiresAt]);
    },
    openCompletion(envelope: string, context: AdminCompletionEnvelopeContext): Readonly<Record<string, unknown>> | null {
      try { const expiresAt = expiry(context.expiresAt); const value = open("completion", envelope, [...scopeFields(context), uuid(context.pendingId), uuid(context.operationId), expiresAt]) as { expiresAt: string; payload: Record<string, unknown> }; if (!value || Object.keys(value).length !== 2 || value.expiresAt !== expiresAt || typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) return null; return Object.freeze(value.payload); } catch { return null; }
    },
    pendingDigest, deviceDigest, otpDigest, backupDigest,
    recipientDigest(environmentCode: string, phone: string, keyId = activeKeyId): AdminLoginSecurityDigest { return digest("recipient", [environment(environmentCode), normalizeAdminLoginPhone(phone)], keyId); },
    requestDigest(environmentCode: string, trustedSource: string, keyId = activeKeyId): AdminLoginSecurityDigest { if (typeof trustedSource !== "string" || trustedSource.length < 1 || trustedSource.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/u.test(trustedSource)) invalid(); return digest("trusted-source", [environment(environmentCode), trustedSource], keyId); },
    verifyPendingCredential(scope: AdminLoginSecurityScope, pendingId: string, credential: string, expected: AdminLoginSecurityDigest): boolean { return verify(() => pendingDigest(scope, pendingId, credential), expected); },
    verifyDeviceCredential(scope: AdminLoginSecurityScope, credential: string, expected: AdminLoginSecurityDigest): boolean { return verify(() => deviceDigest(scope, credential), expected); },
    verifyOtp(scope: AdminLoginSecurityScope, challengeId: string, code: string, expected: AdminLoginSecurityDigest): boolean { return verify(() => otpDigest(scope, challengeId, code, expected.keyId), expected); },
    verifyBackupCode(scope: AdminLoginSecurityScope, code: string, expected: AdminLoginSecurityDigest): boolean { return verify(() => backupDigest(scope, code, expected.keyId), expected); },
  });
}
export type AdminLoginSecurityCodec = ReturnType<typeof createAdminLoginSecurityCodec>;
