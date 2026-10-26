import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type Environment = Readonly<Record<string, string | undefined>>;
const MAX_PAYLOAD_BYTES = 1_048_576;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^[0-9a-f]{64}$/;

function keyBytes(value: Buffer): Buffer {
  if (!Buffer.isBuffer(value) || value.byteLength !== 32) throw new TypeError("platform_commerce_key_invalid");
  return Buffer.from(value);
}

function readKey(env: Environment, name: string): Buffer {
  try {
    const raw = env[name];
    if (typeof raw !== "string" || !KEY_PATTERN.test(raw)) throw new Error();
    const key = Buffer.from(raw, "base64url");
    if (key.byteLength !== 32 || key.toString("base64url") !== raw) throw new Error();
    return key;
  } catch { throw new TypeError("platform_commerce_key_invalid"); }
}

export function readCommerceBridgeKey(env: Environment = process.env): Buffer {
  return readKey(env, "CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL");
}

export function readCommerceDataKey(env: Environment = process.env): Buffer {
  return readKey(env, "CELEBIX_PLATFORM_COMMERCE_DATA_KEY_B64URL");
}

export function commerceDigest(value: string): string {
  if (typeof value !== "string") throw new TypeError("platform_commerce_digest_invalid");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function aad(context: string): Buffer {
  if (typeof context !== "string" || !context.length || context.length > 512 || /[\u0000-\u001f\u007f-\u009f]/.test(context)) throw new Error();
  return Buffer.from(JSON.stringify(["celebix-platform-commerce", 1, context]), "utf8");
}

function decode(value: unknown, expectedBytes?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (expectedBytes !== undefined && bytes.byteLength !== expectedBytes)) throw new Error();
  return bytes;
}

export function sealCommercePayload(value: unknown, key: Buffer, context: string): string {
  let plaintext: Buffer | undefined;
  let secret: Buffer | undefined;
  try {
    secret = keyBytes(key);
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new Error();
    plaintext = Buffer.from(serialized, "utf8");
    if (plaintext.byteLength > MAX_PAYLOAD_BYTES) throw new Error();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", secret, iv, { authTagLength: 16 });
    cipher.setAAD(aad(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") });
  } catch { throw new TypeError("platform_commerce_payload_invalid"); }
  finally { plaintext?.fill(0); secret?.fill(0); }
}

export function unsealCommercePayload(sealed: string, key: Buffer, context: string): unknown {
  let plaintext: Buffer | undefined;
  let secret: Buffer | undefined;
  try {
    secret = keyBytes(key);
    if (typeof sealed !== "string" || sealed.length > 1_500_000) throw new Error();
    const envelope = JSON.parse(sealed) as Record<string, unknown>;
    if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)
      || envelope.v !== 1 || Object.keys(envelope).length !== 4
      || Object.keys(envelope).some((name) => !["v", "iv", "tag", "ciphertext"].includes(name))
      || JSON.stringify(envelope) !== sealed) throw new Error();
    const iv = decode(envelope.iv, 12), tag = decode(envelope.tag, 16), ciphertext = decode(envelope.ciphertext);
    if (ciphertext.byteLength > MAX_PAYLOAD_BYTES) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", secret, iv, { authTagLength: 16 });
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown;
  } catch { throw new TypeError("platform_commerce_payload_invalid"); }
  finally { plaintext?.fill(0); secret?.fill(0); }
}

export function isCommerceBridgeTimestampFresh(timestamp: string, now: Date): boolean {
  if (typeof timestamp !== "string" || !/^(0|[1-9][0-9]{0,11})$/.test(timestamp)
    || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const seconds = Number(timestamp);
  return Number.isSafeInteger(seconds) && Math.abs(Math.floor(now.getTime() / 1000) - seconds) <= 300;
}

export function verifyCommerceBridgeSignature(input: Readonly<{
  key: Buffer;
  timestamp: string;
  signature: string;
  body: Uint8Array;
  now: Date;
}>): boolean {
  let secret: Buffer | undefined;
  try {
    if (!isCommerceBridgeTimestampFresh(input.timestamp, input.now)
      || typeof input.signature !== "string" || !SIGNATURE.test(input.signature)
      || !(input.body instanceof Uint8Array)) return false;
    secret = keyBytes(input.key);
    const expected = createHmac("sha256", secret).update(`${input.timestamp}.`, "utf8").update(input.body).digest();
    return timingSafeEqual(Buffer.from(input.signature, "hex"), expected);
  } catch { return false; }
  finally { secret?.fill(0); }
}
