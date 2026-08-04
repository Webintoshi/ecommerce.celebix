import { createCipheriv, createDecipheriv, createHmac, randomInt } from "node:crypto";

import { normalizeStorefrontAccountEmail } from "./email.ts";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^[0-9]{6}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CREDENTIAL = /^a1[.]([a-z][a-z0-9_-]{2,31})[.]([A-Za-z0-9_-]{43})$/;
const CHALLENGE = /^ch1[.]([a-z][a-z0-9_-]{2,31})[.]([A-Za-z0-9_-]{16})[.]([A-Za-z0-9_-]{1,1024})[.]([A-Za-z0-9_-]{22})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type StorefrontIdentityKeyring = Readonly<{
  activeKeyId: string;
  keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}>;
export type AccountCookieRead = Readonly<{ kind: "missing" }> | Readonly<{ kind: "invalid" }> | Readonly<{ kind: "present"; value: string }>;
export type AccountChallenge = Readonly<{ challengeId: string; email: string; expiresAt: string }>;

function unavailable(): never { throw new Error("storefront_identity_credentials_unavailable"); }
function credentialInvalid(): never { throw new TypeError("storefront_identity_credential_invalid"); }

function canonicalBase64(value: string, bytes: number): boolean {
  const decoded = Buffer.from(value, "base64url");
  try { return decoded.byteLength === bytes && decoded.toString("base64url") === value; }
  finally { decoded.fill(0); }
}

function exactKeyCandidate(value: unknown): Readonly<{ keyId: string; key: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") || Object.keys(descriptors).length !== 2) unavailable();
  for (const key of ["keyId", "key"] as const) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) unavailable();
  }
  const candidate = value as { keyId: unknown; key: unknown };
  if (typeof candidate.keyId !== "string" || !KEY_ID.test(candidate.keyId) || typeof candidate.key !== "string" || !TOKEN.test(candidate.key) || !canonicalBase64(candidate.key, 32)) unavailable();
  return Object.freeze({ keyId: candidate.keyId, key: candidate.key });
}

export function parseStorefrontIdentityKeyring(activeKeyId: unknown, serializedKeys: unknown): StorefrontIdentityKeyring {
  if (typeof activeKeyId !== "string" || !KEY_ID.test(activeKeyId) || typeof serializedKeys !== "string" || serializedKeys.length > 16_384) unavailable();
  let parsed: unknown;
  try { parsed = JSON.parse(serializedKeys); } catch { return unavailable(); }
  if (!Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Array.prototype || parsed.length < 1 || parsed.length > 16 || Object.keys(parsed).length !== parsed.length) unavailable();
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  const seen = new Set<string>();
  for (const value of parsed) {
    const candidate = exactKeyCandidate(value);
    if (seen.has(candidate.keyId)) unavailable();
    seen.add(candidate.keyId);
    const bytes = Buffer.from(candidate.key, "base64url");
    keys.push(Object.freeze({ keyId: candidate.keyId, key: new Uint8Array(bytes) }));
    bytes.fill(0);
  }
  if (!seen.has(activeKeyId)) {
    for (const entry of keys) entry.key.fill(0);
    unavailable();
  }
  return Object.freeze({ activeKeyId, keys: Object.freeze(keys) });
}

function selectedKey(keyring: StorefrontIdentityKeyring, keyId = keyring.activeKeyId): Readonly<{ keyId: string; key: Uint8Array }> {
  const selected = keyring.keys.find((entry) => entry.keyId === keyId);
  if (!selected) unavailable();
  return selected;
}

function keyedDigest(purpose: string, fields: readonly string[], selected: Readonly<{ keyId: string; key: Uint8Array }>): string {
  if (fields.some((field) => CONTROL.test(field))) credentialInvalid();
  const chunks = [Buffer.from("celebix\0storefront-identity\0v1\0", "utf8"), Buffer.from(purpose, "utf8")];
  for (const field of fields) chunks.push(Buffer.from([0]), Buffer.from(field, "utf8"));
  const frame = Buffer.concat(chunks);
  try { return createHmac("sha256", selected.key).update(frame).digest("hex"); }
  finally { for (const chunk of chunks) chunk.fill(0); frame.fill(0); }
}

function issueDigest(purpose: string, fields: readonly string[], keyring: StorefrontIdentityKeyring, keyId = keyring.activeKeyId): Readonly<{ keyId: string; digest: string }> {
  const selected = selectedKey(keyring, keyId);
  return Object.freeze({ keyId: selected.keyId, digest: keyedDigest(purpose, fields, selected) });
}

export function createAccountSessionCredential(keyring: StorefrontIdentityKeyring, random: (size: number) => Uint8Array): Readonly<{ value: string; keyId: string; digest: string }> {
  const selected = selectedKey(keyring);
  const randomValue = random(32);
  if (!(randomValue instanceof Uint8Array) || randomValue.byteLength !== 32) unavailable();
  const bytes = Buffer.from(randomValue);
  try {
    const token = bytes.toString("base64url");
    if (!TOKEN.test(token) || !canonicalBase64(token, 32)) unavailable();
    return Object.freeze({ value: `a1.${selected.keyId}.${token}`, keyId: selected.keyId, digest: keyedDigest("session", [selected.keyId, token], selected) });
  } finally { bytes.fill(0); }
}

export function accountCredentialDigestCandidates(value: string, keyring: StorefrontIdentityKeyring): readonly Readonly<{ keyId: string; digest: string }>[] {
  const match = CREDENTIAL.exec(value);
  if (!match || !canonicalBase64(match[2]!, 32)) return Object.freeze([]);
  const selected = keyring.keys.find((entry) => entry.keyId === match[1]);
  return selected ? Object.freeze([Object.freeze({ keyId: selected.keyId, digest: keyedDigest("session", [selected.keyId, match[2]!], selected) })]) : Object.freeze([]);
}

export function accountCodeDigest(authority: Readonly<{ challengeId: string; storeId: string; email: string; code: string }>, keyring: StorefrontIdentityKeyring, keyId = keyring.activeKeyId): Readonly<{ keyId: string; digest: string }> {
  if (!UUID.test(authority.challengeId) || !UUID.test(authority.storeId) || !CODE.test(authority.code)) credentialInvalid();
  const email = normalizeStorefrontAccountEmail(authority.email);
  return issueDigest("code", [authority.challengeId, authority.storeId, email, authority.code], keyring, keyId);
}

export function accountEmailDigest(storeId: string, emailValue: string, keyring: StorefrontIdentityKeyring, keyId = keyring.activeKeyId): Readonly<{ keyId: string; digest: string }> {
  if (!UUID.test(storeId)) credentialInvalid();
  return issueDigest("email", [storeId, normalizeStorefrontAccountEmail(emailValue)], keyring, keyId);
}

export function accountCsrfDigest(sessionId: string, csrfValue: string, keyring: StorefrontIdentityKeyring, keyId = keyring.activeKeyId): Readonly<{ keyId: string; digest: string }> {
  if (!UUID.test(sessionId) || typeof csrfValue !== "string" || csrfValue.length < 8 || csrfValue.length > 256 || CONTROL.test(csrfValue)) credentialInvalid();
  return issueDigest("csrf", [sessionId, csrfValue], keyring, keyId);
}

export function createStorefrontLoginCode(random: (maximumExclusive: number) => number = (maximum) => randomInt(maximum)): string {
  const value = random(1_000_000);
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1_000_000) unavailable();
  return String(value).padStart(6, "0");
}

function parseChallengePayload(value: unknown): AccountChallenge | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== 3 || !Object.hasOwn(value, "challengeId") || !Object.hasOwn(value, "email") || !Object.hasOwn(value, "expiresAt")) return null;
  const parsed = value as { challengeId: unknown; email: unknown; expiresAt: unknown };
  if (typeof parsed.challengeId !== "string" || !UUID.test(parsed.challengeId) || typeof parsed.email !== "string" || typeof parsed.expiresAt !== "string" || !ISO.test(parsed.expiresAt)) return null;
  let email: string;
  try { email = normalizeStorefrontAccountEmail(parsed.email); } catch { return null; }
  if (email !== parsed.email || new Date(parsed.expiresAt).toISOString() !== parsed.expiresAt) return null;
  return Object.freeze({ challengeId: parsed.challengeId, email, expiresAt: parsed.expiresAt });
}

export function sealAccountChallenge(challenge: AccountChallenge, keyring: StorefrontIdentityKeyring, random: (size: number) => Uint8Array): string {
  const parsed = parseChallengePayload(challenge);
  if (!parsed) credentialInvalid();
  const selected = selectedKey(keyring);
  const randomValue = random(12);
  if (!(randomValue instanceof Uint8Array) || randomValue.byteLength !== 12) unavailable();
  const nonce = Buffer.from(randomValue);
  const plaintext = Buffer.from(JSON.stringify(parsed), "utf8");
  const aad = Buffer.from(`celebix\0storefront-account-challenge\0v1\0${selected.keyId}`, "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", selected.key, nonce);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    try { return `ch1.${selected.keyId}.${nonce.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`; }
    finally { encrypted.fill(0); tag.fill(0); }
  } finally { nonce.fill(0); plaintext.fill(0); aad.fill(0); }
}

export function openAccountChallenge(value: string, keyring: StorefrontIdentityKeyring): AccountChallenge | null {
  if (typeof value !== "string" || value.length > 1_500) return null;
  const match = CHALLENGE.exec(value);
  if (!match || !canonicalBase64(match[2]!, 12) || !canonicalBase64(match[4]!, 16)) return null;
  const selected = keyring.keys.find((entry) => entry.keyId === match[1]);
  if (!selected) return null;
  const nonce = Buffer.from(match[2]!, "base64url");
  const encrypted = Buffer.from(match[3]!, "base64url");
  const tag = Buffer.from(match[4]!, "base64url");
  const aad = Buffer.from(`celebix\0storefront-account-challenge\0v1\0${selected.keyId}`, "utf8");
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", selected.key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return parseChallengePayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
  } catch { return null; }
  finally { nonce.fill(0); encrypted.fill(0); tag.fill(0); aad.fill(0); plaintext?.fill(0); }
}

export function readAccountCookie(cookieHeader: string | null): AccountCookieRead {
  if (cookieHeader === null || cookieHeader === "") return Object.freeze({ kind: "missing" });
  if (cookieHeader.length > 4_096 || CONTROL.test(cookieHeader)) return Object.freeze({ kind: "invalid" });
  const matches: string[] = [];
  for (const segment of cookieHeader.split(";")) {
    const selected = segment.trim();
    const separator = selected.indexOf("=");
    if (separator > 0 && selected.slice(0, separator) === "__Host-celebix_account") matches.push(selected.slice(separator + 1));
  }
  if (matches.length === 0) return Object.freeze({ kind: "missing" });
  if (matches.length !== 1 || !CREDENTIAL.test(matches[0]!)) return Object.freeze({ kind: "invalid" });
  const match = CREDENTIAL.exec(matches[0]!);
  if (!match || !canonicalBase64(match[2]!, 32)) return Object.freeze({ kind: "invalid" });
  return Object.freeze({ kind: "present", value: matches[0]! });
}

export function serializeAccountCookie(value: string): string {
  const match = CREDENTIAL.exec(value);
  if (!match || !canonicalBase64(match[2]!, 32)) credentialInvalid();
  return `__Host-celebix_account=${value}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
}

export function serializeAccountCookieDeletion(): string {
  return "__Host-celebix_account=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

export function serializeAccountChallengeCookie(value: string): string {
  if (!CHALLENGE.test(value)) credentialInvalid();
  return `__Host-celebix_account_challenge=${value}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
}

export function serializeAccountChallengeCookieDeletion(): string {
  return "__Host-celebix_account_challenge=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

export function isAccountDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}
