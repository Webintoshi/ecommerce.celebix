import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  MERCHANT_PROVIDER_CAPABILITIES,
  type MerchantProviderCapability,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TYPED_ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get as (this: ArrayBufferView) => string | undefined;
const TYPED_ARRAY_VALUES = Uint8Array.prototype.values;
const TYPED_ARRAY_ITERATOR_NEXT = Object.getPrototypeOf(TYPED_ARRAY_VALUES.call(new Uint8Array()))
  .next as (this: IterableIterator<number>) => IteratorResult<number>;

type InputRecord = Readonly<Record<string, unknown>>;

export type SealedMerchantProviderCredential = Readonly<{
  algorithm: "A256GCM";
  ciphertext: string;
  iv: string;
  keyId: string;
  tag: string;
  version: 1;
}>;

export interface MerchantProviderCredentialKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}

function invalid(): never {
  throw new TypeError("provider_credential_crypto_invalid");
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}

function exact(value: unknown, required: readonly string[]): InputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable || !Number.isSafeInteger(lengthDescriptor.value)) invalid();
  const length = lengthDescriptor.value as number;
  if (length < minimum || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function code(value: unknown): string {
  if (typeof value !== "string" || !PROVIDER_CODE.test(value)) invalid();
  return value;
}

function keyId(value: unknown): string {
  if (typeof value !== "string" || !KEY_ID.test(value)) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function capability(value: unknown): MerchantProviderCapability {
  if (!MERCHANT_PROVIDER_CAPABILITIES.includes(value as never)) invalid();
  return value as MerchantProviderCapability;
}

function credentialVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}

function canonicalBase64url(value: unknown, exactBytes?: number): string {
  if (typeof value !== "string" || value.length === 0 || !BASE64URL.test(value)) invalid();
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.byteLength < 1 || decoded.byteLength > 16_384 || decoded.toString("base64url") !== value || (exactBytes !== undefined && decoded.byteLength !== exactBytes)) invalid();
    return value;
  } finally {
    decoded.fill(0);
  }
}

function copyBytes(value: unknown, minimum: number, maximum: number): Buffer {
  if (typeof value !== "object" || value === null || Reflect.apply(TYPED_ARRAY_TAG_GETTER, value, []) !== "Uint8Array") invalid();
  const iterator = Reflect.apply(TYPED_ARRAY_VALUES, value, []) as IterableIterator<number>;
  const bytes: number[] = [];
  let result: Buffer | undefined;
  let retained = false;
  try {
    while (bytes.length <= maximum) {
      const step = Reflect.apply(TYPED_ARRAY_ITERATOR_NEXT, iterator, []) as IteratorResult<number>;
      if (step.done) break;
      if (!Number.isInteger(step.value) || step.value < 0 || step.value > 255) invalid();
      bytes.push(step.value);
    }
    if (bytes.length < minimum || bytes.length > maximum) invalid();
    const overflow = Reflect.apply(TYPED_ARRAY_ITERATOR_NEXT, iterator, []) as IteratorResult<number>;
    if (!overflow.done) invalid();
    result = Buffer.alloc(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) result[index] = bytes[index]!;
    retained = true;
    return result;
  } finally {
    bytes.fill(0);
    if (!retained) result?.fill(0);
  }
}

type SelectedKeys = Readonly<{ activeKeyId: string; byId: Map<string, Buffer> }>;

function zeroKeys(selected: SelectedKeys | undefined): void {
  if (selected === undefined) return;
  for (const key of selected.byId.values()) key.fill(0);
  selected.byId.clear();
}

function selectKeys(value: unknown): SelectedKeys {
  const parsed = exact(value, ["activeKeyId", "keys"]);
  const activeKeyId = keyId(parsed.activeKeyId);
  const entries = denseArray(parsed.keys, 1, 16);
  const byId = new Map<string, Buffer>();
  const selected = { activeKeyId, byId };
  try {
    for (const entry of entries) {
      const parsedEntry = exact(entry, ["keyId", "key"]);
      const selectedId = keyId(parsedEntry.keyId);
      const selectedKey = copyBytes(parsedEntry.key, 32, 32);
      let retained = false;
      try {
        let duplicateBytes = false;
        for (const existing of byId.values()) duplicateBytes = timingSafeEqual(existing, selectedKey) || duplicateBytes;
        if (byId.has(selectedId) || duplicateBytes) invalid();
        byId.set(selectedId, selectedKey);
        retained = true;
      } finally {
        if (!retained) selectedKey.fill(0);
      }
    }
    if (!byId.has(activeKeyId)) invalid();
    return selected;
  } catch (error) {
    zeroKeys(selected);
    throw error;
  }
}

function envelope(value: unknown): SealedMerchantProviderCredential {
  const parsed = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1) invalid();
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: canonicalBase64url(parsed.ciphertext),
    iv: canonicalBase64url(parsed.iv, 12),
    keyId: keyId(parsed.keyId),
    tag: canonicalBase64url(parsed.tag, 16),
    version: 1,
  });
}

type Authority = Readonly<{
  profileId: string;
  storeId: string;
  providerCode: string;
  capability: MerchantProviderCapability;
  credentialVersion: number;
}>;

function authority(parsed: InputRecord): Authority {
  return Object.freeze({
    profileId: uuid(parsed.profileId),
    storeId: uuid(parsed.storeId),
    providerCode: code(parsed.providerCode),
    capability: capability(parsed.capability),
    credentialVersion: credentialVersion(parsed.credentialVersion),
  });
}

function aad(input: Authority, selectedEnvelopeKeyId: string): Buffer {
  return Buffer.from(JSON.stringify([
    "celebix-provider-credential",
    1,
    input.storeId,
    input.profileId,
    input.providerCode,
    input.capability,
    input.credentialVersion,
    selectedEnvelopeKeyId,
  ]), "utf8");
}

export function sealMerchantProviderCredential(input: Readonly<{
  plaintext: Uint8Array;
  profileId: string;
  storeId: string;
  providerCode: string;
  capability: MerchantProviderCapability;
  credentialVersion: number;
  keyring: MerchantProviderCredentialKeyring;
}>): SealedMerchantProviderCredential {
  return guarded(() => {
    let plaintext: Buffer | undefined;
    let selected: SelectedKeys | undefined;
    let iv: Buffer | undefined;
    let associatedData: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    let tag: Buffer | undefined;
    const ciphertextParts: Buffer[] = [];
    try {
      const parsed = exact(input, ["plaintext", "profileId", "storeId", "providerCode", "capability", "credentialVersion", "keyring"]);
      plaintext = copyBytes(parsed.plaintext, 1, 16_384);
      const selectedAuthority = authority(parsed);
      selected = selectKeys(parsed.keyring);
      const key = selected.byId.get(selected.activeKeyId);
      if (key === undefined) invalid();
      iv = randomBytes(12);
      associatedData = aad(selectedAuthority, selected.activeKeyId);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(associatedData);
      ciphertextParts.push(cipher.update(plaintext));
      ciphertextParts.push(cipher.final());
      ciphertext = Buffer.concat(ciphertextParts);
      tag = cipher.getAuthTag();
      return Object.freeze({
        algorithm: "A256GCM",
        ciphertext: ciphertext.toString("base64url"),
        iv: iv.toString("base64url"),
        keyId: selected.activeKeyId,
        tag: tag.toString("base64url"),
        version: 1,
      });
    } finally {
      plaintext?.fill(0);
      iv?.fill(0);
      associatedData?.fill(0);
      ciphertext?.fill(0);
      tag?.fill(0);
      for (const part of ciphertextParts) part.fill(0);
      zeroKeys(selected);
    }
  });
}

export function openMerchantProviderCredential(input: Readonly<{
  envelope: SealedMerchantProviderCredential;
  profileId: string;
  storeId: string;
  providerCode: string;
  capability: MerchantProviderCapability;
  credentialVersion: number;
  keyring: MerchantProviderCredentialKeyring;
}>): Uint8Array {
  return guarded(() => {
    let selected: SelectedKeys | undefined;
    let iv: Buffer | undefined;
    let tag: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    let associatedData: Buffer | undefined;
    let plaintext: Buffer | undefined;
    const plaintextParts: Buffer[] = [];
    try {
      const parsed = exact(input, ["envelope", "profileId", "storeId", "providerCode", "capability", "credentialVersion", "keyring"]);
      const selectedEnvelope = envelope(parsed.envelope);
      const selectedAuthority = authority(parsed);
      selected = selectKeys(parsed.keyring);
      const key = selected.byId.get(selectedEnvelope.keyId);
      if (key === undefined) invalid();
      iv = Buffer.from(selectedEnvelope.iv, "base64url");
      tag = Buffer.from(selectedEnvelope.tag, "base64url");
      ciphertext = Buffer.from(selectedEnvelope.ciphertext, "base64url");
      associatedData = aad(selectedAuthority, selectedEnvelope.keyId);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(associatedData);
      decipher.setAuthTag(tag);
      plaintextParts.push(decipher.update(ciphertext));
      plaintextParts.push(decipher.final());
      plaintext = Buffer.concat(plaintextParts);
      const output = new Uint8Array(plaintext.byteLength);
      output.set(plaintext);
      return output;
    } finally {
      iv?.fill(0);
      tag?.fill(0);
      ciphertext?.fill(0);
      associatedData?.fill(0);
      plaintext?.fill(0);
      for (const part of plaintextParts) part.fill(0);
      zeroKeys(selected);
    }
  });
}
