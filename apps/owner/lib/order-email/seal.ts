import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "oe1" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/u;
const FROM = /^.{1,160} <[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}>$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const FORBIDDEN_HTML = /<(?:script|style|form|iframe|object|embed|link)\b|\bdata:/iu;

export type OrderEmailProviderRequest = Readonly<{
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}>;

export type OrderEmailKeyring = Readonly<{
  activeKeyId: string;
  keys: Readonly<Record<string, Buffer>>;
}>;

export type OrderEmailSealedEnvelope = Readonly<{
  version: typeof VERSION;
  keyId: string;
  bytes: Buffer;
  digest: string;
}>;

function invalid(): never {
  throw new Error("order_email_seal_invalid");
}

function ordinary(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = ordinary(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function bounded(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}

function parseRequest(value: unknown): OrderEmailProviderRequest {
  const parsed = exact(value, ["from", "to", "subject", "html", "text"], ["replyTo"]);
  const html = bounded(parsed.html, 1, 200_000);
  if (FORBIDDEN_HTML.test(html)) invalid();
  return Object.freeze({
    from: bounded(parsed.from, 7, 320, FROM),
    to: bounded(parsed.to, 3, 320, EMAIL),
    ...(Object.hasOwn(parsed, "replyTo") ? { replyTo: bounded(parsed.replyTo, 3, 320, EMAIL) } : {}),
    subject: bounded(parsed.subject, 1, 250),
    html,
    text: bounded(parsed.text, 1, 100_000),
  });
}

function selectedKey(keyring: OrderEmailKeyring, keyId: string): Buffer {
  const parsed = exact(keyring, ["activeKeyId", "keys"]);
  bounded(parsed.activeKeyId, 3, 32, KEY_ID);
  const keys = ordinary(parsed.keys);
  if (!Object.hasOwn(keys, keyId) || !KEY_ID.test(keyId) || !Buffer.isBuffer(keys[keyId]) || (keys[keyId] as Buffer).length !== 32) invalid();
  return Buffer.from(keys[keyId] as Buffer);
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function associatedData(keyId: string): Buffer {
  return Buffer.from(`celebix-order-email:${VERSION}:${keyId}`, "utf8");
}

export function sealOrderEmailRequest(
  request: OrderEmailProviderRequest,
  keyring: OrderEmailKeyring,
  ivFactory: () => Buffer = () => randomBytes(IV_BYTES),
): OrderEmailSealedEnvelope {
  const parsed = parseRequest(request);
  const keyId = bounded(keyring.activeKeyId, 3, 32, KEY_ID);
  const key = selectedKey(keyring, keyId);
  const iv = ivFactory();
  if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) { key.fill(0); invalid(); }
  const plaintext = Buffer.from(JSON.stringify(parsed), "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(associatedData(keyId));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from(VERSION), Buffer.from(iv), cipher.getAuthTag(), encrypted]);
    return Object.freeze({ version: VERSION, keyId, bytes, digest: digest(bytes) });
  } catch {
    return invalid();
  } finally {
    plaintext.fill(0);
    key.fill(0);
  }
}

export function openOrderEmailRequest(
  envelope: OrderEmailSealedEnvelope,
  keyring: OrderEmailKeyring,
): OrderEmailProviderRequest {
  const parsed = exact(envelope, ["version", "keyId", "bytes", "digest"]);
  if (parsed.version !== VERSION || !Buffer.isBuffer(parsed.bytes) || parsed.bytes.length < 3 + IV_BYTES + TAG_BYTES + 2) invalid();
  const bytes = Buffer.from(parsed.bytes);
  const expectedDigest = bounded(parsed.digest, 64, 64, /^[a-f0-9]{64}$/u);
  const actualDigest = digest(bytes);
  if (!timingSafeEqual(Buffer.from(expectedDigest), Buffer.from(actualDigest))) invalid();
  if (bytes.subarray(0, 3).toString("utf8") !== VERSION) invalid();
  const keyId = bounded(parsed.keyId, 3, 32, KEY_ID);
  const key = selectedKey(keyring, keyId);
  const iv = bytes.subarray(3, 3 + IV_BYTES);
  const tag = bytes.subarray(3 + IV_BYTES, 3 + IV_BYTES + TAG_BYTES);
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(associatedData(keyId));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(bytes.subarray(3 + IV_BYTES + TAG_BYTES)), decipher.final()]);
    return parseRequest(JSON.parse(plaintext.toString("utf8")));
  } catch {
    return invalid();
  } finally {
    plaintext?.fill(0);
    key.fill(0);
    bytes.fill(0);
  }
}
