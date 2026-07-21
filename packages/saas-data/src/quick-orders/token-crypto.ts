import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PURPOSES = new Set(["link-token", "provider-config", "provider-token"] as const);

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
  if (decoded.toString("base64url") !== value || decoded.byteLength < bytesMinimum || decoded.byteLength > bytesMaximum || (exactBytes !== undefined && decoded.byteLength !== exactBytes)) invalid();
  return value;
}

function copyKey(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) invalid();
  const view = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (view.byteLength !== 32) invalid();
  return Buffer.from(view);
}

function selectKeys(value: unknown): Readonly<{ activeKeyId: string; byId: ReadonlyMap<string, Buffer> }> {
  const parsed = exact(value, ["activeKeyId", "keys"]);
  const activeKeyId = keyId(parsed.activeKeyId);
  const entries = denseArray(parsed.keys, 1, 64);
  const byId = new Map<string, Buffer>();
  const byteValues = new Set<string>();
  for (const entry of entries) {
    const selected = exact(entry, ["keyId", "key"]);
    const selectedId = keyId(selected.keyId);
    const selectedKey = copyKey(selected.key);
    const encodedKey = selectedKey.toString("hex");
    if (byId.has(selectedId) || byteValues.has(encodedKey)) invalid();
    byId.set(selectedId, selectedKey);
    byteValues.add(encodedKey);
  }
  if (!byId.has(activeKeyId)) invalid();
  return { activeKeyId, byId };
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
    if (typeof randomBytes !== "function") invalid();
    const generated = randomBytes(32);
    if (!Buffer.isBuffer(generated) || generated.byteLength !== 32) invalid();
    return Buffer.from(generated).toString("base64url");
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
    const parsed = exact(input, ["plaintext", "purpose", "storeId", "objectId", "digest", "keyring"]);
    if (typeof parsed.plaintext !== "string") invalid();
    const plaintext = Buffer.from(parsed.plaintext, "utf8");
    if (plaintext.byteLength < 1 || plaintext.byteLength > 6_144) invalid();
    const authority = {
      purpose: purpose(parsed.purpose),
      storeId: uuid(parsed.storeId),
      objectId: uuid(parsed.objectId),
      digest: digest(parsed.digest),
    };
    const selected = selectKeys(parsed.keyring);
    const key = selected.byId.get(selected.activeKeyId);
    if (key === undefined) invalid();
    const iv = nodeRandomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), iv);
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
    const parsed = exact(input, ["envelope", "purpose", "storeId", "objectId", "digest", "keyring"]);
    const selectedEnvelope = envelope(parsed.envelope);
    const authority = {
      purpose: purpose(parsed.purpose),
      storeId: uuid(parsed.storeId),
      objectId: uuid(parsed.objectId),
      digest: digest(parsed.digest),
    };
    const selected = selectKeys(parsed.keyring);
    const key = selected.byId.get(selectedEnvelope.keyId);
    if (key === undefined) invalid();
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(selectedEnvelope.iv, "base64url"));
    decipher.setAAD(aad(authority, selectedEnvelope.keyId));
    decipher.setAuthTag(Buffer.from(selectedEnvelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(selectedEnvelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const decoded = plaintext.toString("utf8");
    if (!Buffer.from(decoded, "utf8").equals(plaintext)) invalid();
    return decoded;
  });
}
