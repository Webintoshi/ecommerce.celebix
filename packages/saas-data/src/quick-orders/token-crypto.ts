import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PURPOSES = new Set(["link-token", "provider-config", "provider-token"] as const);
const TYPED_ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get as (this: ArrayBufferView) => string | undefined;
const TYPED_ARRAY_VALUES = Uint8Array.prototype.values;
const TYPED_ARRAY_ITERATOR_NEXT = Object.getPrototypeOf(TYPED_ARRAY_VALUES.call(new Uint8Array()))
  .next as (this: IterableIterator<number>) => IteratorResult<number>;

export type SealedEnvelope = Readonly<{
  algorithm: "A256GCM";
  ciphertext: string;
  iv: string;
  keyId: string;
  tag: string;
  version: 1;
}>;

export interface QuickLinkKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}

type Purpose = "link-token" | "provider-config" | "provider-token";
type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("quick_link_crypto_invalid");
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

function boundedString(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function keyId(value: unknown): string {
  return boundedString(value, 1, 128);
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function purpose(value: unknown): Purpose {
  if (typeof value !== "string" || !PURPOSES.has(value as Purpose)) invalid();
  return value as Purpose;
}

function canonicalBase64url(value: unknown, bytesMinimum: number, bytesMaximum: number, exactBytes?: number): string {
  if (typeof value !== "string" || !BASE64URL.test(value)) invalid();
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.toString("base64url") !== value || decoded.byteLength < bytesMinimum || decoded.byteLength > bytesMaximum || (exactBytes !== undefined && decoded.byteLength !== exactBytes)) invalid();
    return value;
  } finally {
    decoded.fill(0);
  }
}

function copyKey(value: unknown): Buffer {
  if (typeof value !== "object" || value === null) invalid();
  if (Reflect.apply(TYPED_ARRAY_TAG_GETTER, value, []) !== "Uint8Array") invalid();
  const iterator = Reflect.apply(TYPED_ARRAY_VALUES, value, []) as IterableIterator<number>;
  const copy = Buffer.alloc(32);
  let retained = false;
  try {
    for (let index = 0; index < 32; index += 1) {
      const step = Reflect.apply(TYPED_ARRAY_ITERATOR_NEXT, iterator, []) as IteratorResult<number>;
      if (step.done || !Number.isInteger(step.value) || step.value < 0 || step.value > 255) invalid();
      copy[index] = step.value;
    }
    const overflow = Reflect.apply(TYPED_ARRAY_ITERATOR_NEXT, iterator, []) as IteratorResult<number>;
    if (!overflow.done) invalid();
    retained = true;
    return copy;
  } finally {
    if (!retained) copy.fill(0);
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
  const entries = denseArray(parsed.keys, 1, 64);
  const byId = new Map<string, Buffer>();
  const selected = { activeKeyId, byId };
  try {
    for (const entry of entries) {
      const parsedEntry = exact(entry, ["keyId", "key"]);
      const selectedId = keyId(parsedEntry.keyId);
      const selectedKey = copyKey(parsedEntry.key);
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

function aad(input: Readonly<{ purpose: Purpose; storeId: string; objectId: string; digest: string }>, selectedEnvelopeKeyId: string): Buffer {
  return Buffer.from(JSON.stringify([
    "celebix-quick-link", 1, input.purpose, input.storeId,
    input.objectId, input.digest, selectedEnvelopeKeyId,
  ]), "utf8");
}

function envelope(value: unknown): SealedEnvelope {
  const parsed = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1) invalid();
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: canonicalBase64url(parsed.ciphertext, 1, 6_144),
    iv: canonicalBase64url(parsed.iv, 12, 12, 12),
    keyId: keyId(parsed.keyId),
    tag: canonicalBase64url(parsed.tag, 16, 16, 16),
    version: 1,
  });
}

export function generateQuickLinkToken(randomBytes: (size: number) => Buffer = nodeRandomBytes): string {
  return guarded(() => {
    let generated: Buffer | undefined;
    let copy: Buffer | undefined;
    try {
      if (typeof randomBytes !== "function") invalid();
      generated = randomBytes(32);
      if (!Buffer.isBuffer(generated) || generated.byteLength !== 32) invalid();
      copy = Buffer.from(generated);
      return copy.toString("base64url");
    } finally {
      copy?.fill(0);
      if (Buffer.isBuffer(generated)) generated.fill(0);
    }
  });
}

export function digestQuickLinkToken(token: string): string {
  return guarded(() => createHash("sha256").update(canonicalBase64url(token, 32, 32, 32), "utf8").digest("hex"));
}

export function sealQuickLinkSecret(input: Readonly<{
  plaintext: string;
  purpose: Purpose;
  storeId: string;
  objectId: string;
  digest: string;
  keyring: QuickLinkKeyring;
}>): SealedEnvelope {
  return guarded(() => {
    let plaintext: Buffer | undefined;
    let selected: SelectedKeys | undefined;
    try {
      const parsed = exact(input, ["plaintext", "purpose", "storeId", "objectId", "digest", "keyring"]);
      if (typeof parsed.plaintext !== "string") invalid();
      plaintext = Buffer.from(parsed.plaintext, "utf8");
      if (plaintext.byteLength < 1 || plaintext.byteLength > 6_144) invalid();
      const authority = {
        purpose: purpose(parsed.purpose),
        storeId: uuid(parsed.storeId),
        objectId: uuid(parsed.objectId),
        digest: digest(parsed.digest),
      };
      selected = selectKeys(parsed.keyring);
      const key = selected.byId.get(selected.activeKeyId);
      if (key === undefined) invalid();
      const iv = nodeRandomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(authority, selected.activeKeyId));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
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
      zeroKeys(selected);
    }
  });
}

export function openQuickLinkSecret(input: Readonly<{
  envelope: SealedEnvelope;
  purpose: Purpose;
  storeId: string;
  objectId: string;
  digest: string;
  keyring: QuickLinkKeyring;
}>): string {
  return guarded(() => {
    let selected: SelectedKeys | undefined;
    let plaintext: Buffer | undefined;
    let roundtrip: Buffer | undefined;
    const plaintextParts: Buffer[] = [];
    try {
      const parsed = exact(input, ["envelope", "purpose", "storeId", "objectId", "digest", "keyring"]);
      const selectedEnvelope = envelope(parsed.envelope);
      const authority = {
        purpose: purpose(parsed.purpose),
        storeId: uuid(parsed.storeId),
        objectId: uuid(parsed.objectId),
        digest: digest(parsed.digest),
      };
      selected = selectKeys(parsed.keyring);
      const key = selected.byId.get(selectedEnvelope.keyId);
      if (key === undefined) invalid();
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(selectedEnvelope.iv, "base64url"));
      decipher.setAAD(aad(authority, selectedEnvelope.keyId));
      decipher.setAuthTag(Buffer.from(selectedEnvelope.tag, "base64url"));
      plaintextParts.push(decipher.update(Buffer.from(selectedEnvelope.ciphertext, "base64url")));
      plaintextParts.push(decipher.final());
      plaintext = Buffer.concat(plaintextParts);
      const decoded = plaintext.toString("utf8");
      roundtrip = Buffer.from(decoded, "utf8");
      if (!roundtrip.equals(plaintext)) invalid();
      return decoded;
    } finally {
      roundtrip?.fill(0);
      plaintext?.fill(0);
      for (const part of plaintextParts) part.fill(0);
      zeroKeys(selected);
    }
  });
}
