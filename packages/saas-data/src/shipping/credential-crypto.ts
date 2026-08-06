import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { types as utilTypes } from "node:util";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type SealedShippingCredential = Readonly<{
  algorithm: "A256GCM";
  ciphertext: string;
  iv: string;
  keyId: string;
  tag: string;
  version: 1;
}>;

export interface ShippingCredentialKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}

type Authority = Readonly<{
  storeId: string;
  profileId: string;
  providerCode: "basit_kargo";
  credentialVersion: number;
}>;

function invalid(): never { throw new TypeError("shipping_credential_crypto_invalid"); }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function selectedAuthority(value: Record<string, unknown>): Authority {
  if (
    typeof value.storeId !== "string" || !UUID.test(value.storeId) ||
    typeof value.profileId !== "string" || !UUID.test(value.profileId) ||
    value.providerCode !== "basit_kargo" ||
    !Number.isSafeInteger(value.credentialVersion) || (value.credentialVersion as number) < 1
  ) invalid();
  return Object.freeze({
    storeId: value.storeId,
    profileId: value.profileId,
    providerCode: "basit_kargo",
    credentialVersion: value.credentialVersion as number,
  });
}

function bytes(value: unknown, minimum: number, maximum: number): Buffer {
  if (!(value instanceof Uint8Array) || value instanceof DataView) invalid();
  const copy = Buffer.from(value);
  if (copy.byteLength < minimum || copy.byteLength > maximum) { copy.fill(0); invalid(); }
  return copy;
}

type SelectedKeys = Readonly<{ activeKeyId: string; byId: Map<string, Buffer> }>;

function wipeKeys(value: SelectedKeys | undefined): void {
  if (!value) return;
  for (const key of value.byId.values()) key.fill(0);
  value.byId.clear();
}

function selectKeys(value: unknown): SelectedKeys {
  const parsed = exact(value, ["activeKeyId", "keys"]);
  if (typeof parsed.activeKeyId !== "string" || !KEY_ID.test(parsed.activeKeyId)) invalid();
  if (!Array.isArray(parsed.keys) || parsed.keys.length < 1 || parsed.keys.length > 16 || utilTypes.isProxy(parsed.keys)) invalid();
  const selected: SelectedKeys = { activeKeyId: parsed.activeKeyId, byId: new Map() };
  try {
    for (const candidate of parsed.keys) {
      const entry = exact(candidate, ["keyId", "key"]);
      if (typeof entry.keyId !== "string" || !KEY_ID.test(entry.keyId)) invalid();
      const key = bytes(entry.key, 32, 32);
      let retained = false;
      try {
        if (selected.byId.has(entry.keyId) || [...selected.byId.values()].some((existing) => timingSafeEqual(existing, key))) invalid();
        selected.byId.set(entry.keyId, key);
        retained = true;
      } finally { if (!retained) key.fill(0); }
    }
    if (!selected.byId.has(selected.activeKeyId)) invalid();
    return selected;
  } catch (error) {
    wipeKeys(selected);
    throw error;
  }
}

function canonicalBase64(value: unknown, exactBytes?: number): string {
  if (typeof value !== "string" || !BASE64URL.test(value)) invalid();
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.byteLength < 1 || decoded.byteLength > 16_384 || decoded.toString("base64url") !== value || (exactBytes !== undefined && decoded.byteLength !== exactBytes)) invalid();
    return value;
  } finally { decoded.fill(0); }
}

function parseEnvelope(value: unknown): SealedShippingCredential {
  const parsed = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1 || typeof parsed.keyId !== "string" || !KEY_ID.test(parsed.keyId)) invalid();
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: canonicalBase64(parsed.ciphertext),
    iv: canonicalBase64(parsed.iv, 12),
    keyId: parsed.keyId,
    tag: canonicalBase64(parsed.tag, 16),
    version: 1,
  });
}

function aad(authority: Authority): Buffer {
  return Buffer.from(JSON.stringify([
    "celebix-shipping-credential", 1, authority.storeId, authority.profileId,
    authority.providerCode, authority.credentialVersion,
  ]), "utf8");
}

export function sealShippingCredential(input: Readonly<{
  plaintext: Uint8Array;
  storeId: string;
  profileId: string;
  providerCode: "basit_kargo";
  credentialVersion: number;
  keyring: ShippingCredentialKeyring;
}>): SealedShippingCredential {
  let plaintext: Buffer | undefined, associated: Buffer | undefined, iv: Buffer | undefined;
  let ciphertext: Buffer | undefined, tag: Buffer | undefined, selected: SelectedKeys | undefined;
  try {
    const parsed = exact(input, ["plaintext", "storeId", "profileId", "providerCode", "credentialVersion", "keyring"]);
    const authority = selectedAuthority(parsed);
    plaintext = bytes(parsed.plaintext, 16, 4_096);
    selected = selectKeys(parsed.keyring);
    const key = selected.byId.get(selected.activeKeyId);
    if (!key) invalid();
    iv = randomBytes(12);
    associated = aad(authority);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(associated);
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    tag = cipher.getAuthTag();
    return Object.freeze({
      algorithm: "A256GCM", ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"),
      keyId: selected.activeKeyId, tag: tag.toString("base64url"), version: 1,
    });
  } catch { return invalid(); }
  finally {
    plaintext?.fill(0); associated?.fill(0); iv?.fill(0); ciphertext?.fill(0); tag?.fill(0); wipeKeys(selected);
  }
}

export function openShippingCredential(input: Readonly<{
  envelope: SealedShippingCredential;
  storeId: string;
  profileId: string;
  providerCode: "basit_kargo";
  credentialVersion: number;
  keyring: ShippingCredentialKeyring;
}>): Uint8Array {
  let selected: SelectedKeys | undefined, associated: Buffer | undefined, ciphertext: Buffer | undefined;
  let iv: Buffer | undefined, tag: Buffer | undefined, plaintext: Buffer | undefined;
  let retained = false;
  try {
    const parsed = exact(input, ["envelope", "storeId", "profileId", "providerCode", "credentialVersion", "keyring"]);
    const authority = selectedAuthority(parsed);
    const envelope = parseEnvelope(parsed.envelope);
    selected = selectKeys(parsed.keyring);
    const key = selected.byId.get(envelope.keyId);
    if (!key) invalid();
    associated = aad(authority);
    ciphertext = Buffer.from(envelope.ciphertext, "base64url");
    iv = Buffer.from(envelope.iv, "base64url");
    tag = Buffer.from(envelope.tag, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(associated);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.byteLength < 16 || plaintext.byteLength > 4_096) invalid();
    retained = true;
    return plaintext;
  } catch { return invalid(); }
  finally {
    associated?.fill(0); ciphertext?.fill(0); iv?.fill(0); tag?.fill(0); wipeKeys(selected);
    if (!retained) plaintext?.fill(0);
  }
}
