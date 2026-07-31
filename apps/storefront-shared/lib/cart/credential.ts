import { createHmac, timingSafeEqual } from "node:crypto";

import type { StorefrontCredentialPurpose } from "./types.ts";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PREFIX: Readonly<Record<StorefrontCredentialPurpose, string>> = Object.freeze({ cart: "c1", intent: "i1", customer: "u1", receipt: "r1" });
const COOKIE: Readonly<Record<StorefrontCredentialPurpose, Readonly<{ name: string; maxAge: number }>>> = Object.freeze({
  cart: Object.freeze({ name: "__Host-celebix_cart", maxAge: 2_592_000 }),
  intent: Object.freeze({ name: "__Host-celebix_checkout_intent", maxAge: 900 }),
  customer: Object.freeze({ name: "__Host-celebix_customer", maxAge: 2_592_000 }),
  receipt: Object.freeze({ name: "__Host-celebix_receipt", maxAge: 900 }),
});

export type StorefrontCommerceCredentialKeyring = Readonly<{
  activeKeyId: string;
  keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}>;
export type StorefrontCredentialRead = Readonly<{ kind: "missing" }> | Readonly<{ kind: "invalid" }> | Readonly<{ kind: "present"; value: string }>;

function unavailable(): never { throw new Error("storefront_commerce_credentials_unavailable"); }

function canonicalToken(value: string): boolean {
  if (!TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  const valid = decoded.byteLength === 32 && decoded.toString("base64url") === value;
  decoded.fill(0);
  return valid;
}

function parseCredential(purpose: StorefrontCredentialPurpose, value: string): Readonly<{ keyId: string; token: string }> | null {
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX[purpose] || !KEY_ID.test(parts[1] ?? "") || !canonicalToken(parts[2] ?? "")) return null;
  return Object.freeze({ keyId: parts[1]!, token: parts[2]! });
}

function digest(purpose: StorefrontCredentialPurpose, keyId: string, token: string, key: Uint8Array): string {
  const tokenBytes = Buffer.from(token, "base64url");
  const frame = Buffer.concat([Buffer.from("celebix\0storefront-credential\0v1\0", "utf8"), Buffer.from(purpose, "utf8"), Buffer.from([0]), Buffer.from(keyId, "utf8"), Buffer.from([0]), tokenBytes]);
  try { return createHmac("sha256", key).update(frame).digest("hex"); } finally { tokenBytes.fill(0); frame.fill(0); }
}

export function parseStorefrontCommerceCredentialKeyring(source: Readonly<Record<string, string | undefined>>): StorefrontCommerceCredentialKeyring {
  if (source.CELEBIX_DEPLOYMENT_TIER !== "staging" || source.CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE !== "approved_staging" || !KEY_ID.test(source.CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID ?? "")) unavailable();
  let parsed: unknown;
  try { parsed = JSON.parse(source.CELEBIX_STOREFRONT_COMMERCE_KEYS ?? ""); } catch { unavailable(); }
  if (!Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Array.prototype || parsed.length < 1 || parsed.length > 16) unavailable();
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  const seen = new Set<string>();
  for (const candidate of parsed) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype || Object.keys(candidate).length !== 2 || !Object.hasOwn(candidate, "keyId") || !Object.hasOwn(candidate, "key")) unavailable();
    const { keyId, key } = candidate as { keyId?: unknown; key?: unknown };
    if (typeof keyId !== "string" || !KEY_ID.test(keyId) || seen.has(keyId) || typeof key !== "string" || !TOKEN.test(key)) unavailable();
    const bytes = Buffer.from(key, "base64url");
    if (bytes.byteLength !== 32 || bytes.toString("base64url") !== key) { bytes.fill(0); unavailable(); }
    seen.add(keyId);
    keys.push(Object.freeze({ keyId, key: new Uint8Array(bytes) }));
    bytes.fill(0);
  }
  const activeKeyId = source.CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID!;
  if (!seen.has(activeKeyId)) { for (const entry of keys) entry.key.fill(0); unavailable(); }
  return Object.freeze({ activeKeyId, keys: Object.freeze(keys) });
}

export function createStorefrontCredential(purpose: StorefrontCredentialPurpose, keyring: StorefrontCommerceCredentialKeyring, random: (size: number) => Uint8Array): Readonly<{ value: string; keyId: string; digest: string }> {
  const active = keyring.keys.find(({ keyId }) => keyId === keyring.activeKeyId);
  if (!active) unavailable();
  const randomValue = random(32);
  if (!(randomValue instanceof Uint8Array) || randomValue.byteLength !== 32) unavailable();
  const bytes = Buffer.from(randomValue);
  try {
    const token = bytes.toString("base64url");
    if (!canonicalToken(token)) unavailable();
    return Object.freeze({ value: `${PREFIX[purpose]}.${active.keyId}.${token}`, keyId: active.keyId, digest: digest(purpose, active.keyId, token, active.key) });
  } finally { bytes.fill(0); }
}

export function credentialDigestCandidates(purpose: StorefrontCredentialPurpose, value: string, keyring: StorefrontCommerceCredentialKeyring): readonly Readonly<{ keyId: string; digest: string }>[] {
  const parsed = parseCredential(purpose, value);
  if (!parsed) return Object.freeze([]);
  const selected = keyring.keys.find(({ keyId }) => keyId === parsed.keyId);
  return selected ? Object.freeze([Object.freeze({ keyId: selected.keyId, digest: digest(purpose, selected.keyId, parsed.token, selected.key) })]) : Object.freeze([]);
}

export function credentialDigestMatches(expected: string, candidate: string): boolean {
  if (!DIGEST.test(expected) || !DIGEST.test(candidate)) return false;
  const left = Buffer.from(expected, "hex"), right = Buffer.from(candidate, "hex");
  try { return timingSafeEqual(left, right); } finally { left.fill(0); right.fill(0); }
}

export function readStorefrontCredentialCookie(purpose: StorefrontCredentialPurpose, cookieHeader: string | null): StorefrontCredentialRead {
  if (cookieHeader === null || cookieHeader === "") return Object.freeze({ kind: "missing" });
  if (cookieHeader.length > 4_096 || CONTROL.test(cookieHeader)) return Object.freeze({ kind: "invalid" });
  const matches: string[] = [];
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf("=");
    if (separator > 0 && trimmed.slice(0, separator) === COOKIE[purpose].name) matches.push(trimmed.slice(separator + 1));
  }
  if (matches.length === 0) return Object.freeze({ kind: "missing" });
  if (matches.length !== 1 || parseCredential(purpose, matches[0]!) === null) return Object.freeze({ kind: "invalid" });
  return Object.freeze({ kind: "present", value: matches[0]! });
}

export function serializeStorefrontCredentialCookie(purpose: StorefrontCredentialPurpose, value: string): string {
  if (parseCredential(purpose, value) === null) throw new TypeError("storefront_commerce_credential_invalid");
  const selected = COOKIE[purpose];
  return `${selected.name}=${value}; Path=/; Max-Age=${selected.maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
