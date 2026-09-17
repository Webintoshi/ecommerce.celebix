import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { normalizeStoreAdminInvitationEmail } from "@celebix/saas-contracts";
import { buildStoreAdminInvitationUrl, digestStoreAdminInvitationToken } from "./token.ts";

const VERSION = "ai1" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX_BYTES = 3 + IV_BYTES + TAG_BYTES;
const MAX_PLAINTEXT_BYTES = 8192;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ANGLE_BRACKET = /[<>]/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export interface InvitationSealContext {
  invitationId: string;
  generation: number;
}

export interface InvitationPayloadKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, Buffer>>;
}

export interface InvitationSealedPayload {
  version: typeof VERSION;
  keyId: string;
  bytes: Buffer;
  digest: string;
}

export interface InvitationDeliveryPayload {
  token: string;
  recipient: string;
  sender: string;
  displayName: string;
  storeName: string;
  role: "admin" | "editor" | "analyst";
  expiresAt: string;
  acceptanceOrigin: string;
}

function invalid(): never {
  throw new Error("store_admin_invitation_seal_invalid");
}

function exactRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (fields.some((field) => !descriptors[field]?.enumerable || !("value" in descriptors[field]!))) invalid();
  return Object.fromEntries(fields.map((field) => [field, descriptors[field]!.value]));
}

function boundedName(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value !== value.trim() || CONTROL.test(value) || ANGLE_BRACKET.test(value)) invalid();
  return value;
}

function contextValue(value: unknown): InvitationSealContext {
  const parsed = exactRecord(value, ["invitationId", "generation"]);
  if (typeof parsed.invitationId !== "string" || !UUID.test(parsed.invitationId)) invalid();
  if (typeof parsed.generation !== "number" || !Number.isSafeInteger(parsed.generation) || parsed.generation < 1) invalid();
  return Object.freeze({ invitationId: parsed.invitationId, generation: parsed.generation });
}

function keyIdValue(value: unknown): string {
  if (typeof value !== "string" || !KEY_ID.test(value)) invalid();
  return value;
}

function keyringValue(value: unknown): { activeKeyId: string; keys: Record<string, Buffer> } {
  const parsed = exactRecord(value, ["activeKeyId", "keys"]);
  const activeKeyId = keyIdValue(parsed.activeKeyId);
  if (typeof parsed.keys !== "object" || parsed.keys === null || Array.isArray(parsed.keys)) invalid();
  const prototype = Object.getPrototypeOf(parsed.keys);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(parsed.keys);
  const ids = Reflect.ownKeys(parsed.keys);
  if (ids.length === 0 || ids.some((id) => typeof id !== "string" || !KEY_ID.test(id))) invalid();
  const keys: Record<string, Buffer> = {};
  for (const id of ids as string[]) {
    const descriptor = descriptors[id];
    if (!descriptor?.enumerable || !("value" in descriptor) || !Buffer.isBuffer(descriptor.value) || descriptor.value.length !== 32) invalid();
    keys[id] = descriptor.value;
  }
  if (!Object.hasOwn(keys, activeKeyId)) invalid();
  return { activeKeyId, keys };
}

function selectedKey(keyring: unknown, keyId: string): Buffer {
  const parsed = keyringValue(keyring);
  if (!Object.hasOwn(parsed.keys, keyId)) invalid();
  return Buffer.from(parsed.keys[keyId]!);
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string") invalid();
  const probeToken = Buffer.alloc(32).toString("base64url");
  try {
    buildStoreAdminInvitationUrl(value, probeToken);
    return value;
  } catch {
    return invalid();
  }
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const canonical = value.includes(".") ? value : `${value.slice(0, -1)}.000Z`;
  const date = new Date(canonical);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) invalid();
  return canonical;
}

function parsePayload(value: unknown): InvitationDeliveryPayload {
  const parsed = exactRecord(value, ["token", "recipient", "sender", "displayName", "storeName", "role", "expiresAt", "acceptanceOrigin"]);
  if (typeof parsed.token !== "string") invalid();
  digestStoreAdminInvitationToken(parsed.token);
  const recipient = normalizeStoreAdminInvitationEmail(parsed.recipient);
  const sender = normalizeStoreAdminInvitationEmail(parsed.sender);
  if (parsed.recipient !== recipient || parsed.sender !== sender) invalid();
  if (parsed.role !== "admin" && parsed.role !== "editor" && parsed.role !== "analyst") invalid();
  return Object.freeze({
    token: parsed.token,
    recipient,
    sender,
    displayName: boundedName(parsed.displayName),
    storeName: boundedName(parsed.storeName),
    role: parsed.role,
    expiresAt: timestamp(parsed.expiresAt),
    acceptanceOrigin: canonicalOrigin(parsed.acceptanceOrigin),
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function aad(keyId: string, context: InvitationSealContext): Buffer {
  return Buffer.from(`celebix-store-admin-invitation:${VERSION}:${keyId}:${context.invitationId}:${context.generation}`, "utf8");
}

export function sealInvitationDeliveryPayload(
  payload: InvitationDeliveryPayload,
  context: InvitationSealContext,
  keyring: InvitationPayloadKeyring,
): InvitationSealedPayload {
  let plaintext: Buffer | undefined;
  let key: Buffer | undefined;
  try {
    const parsedPayload = parsePayload(payload);
    const parsedContext = contextValue(context);
    const parsedKeyring = keyringValue(keyring);
    const keyId = parsedKeyring.activeKeyId;
    key = Buffer.from(parsedKeyring.keys[keyId]!);
    plaintext = Buffer.from(JSON.stringify(parsedPayload), "utf8");
    if (plaintext.length > MAX_PLAINTEXT_BYTES) invalid();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(keyId, parsedContext));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from(VERSION, "utf8"), iv, cipher.getAuthTag(), encrypted]);
    return Object.freeze({ version: VERSION, keyId, bytes, digest: sha256(bytes) });
  } catch {
    return invalid();
  } finally {
    plaintext?.fill(0);
    key?.fill(0);
  }
}

export function openInvitationDeliveryPayload(
  envelope: InvitationSealedPayload,
  context: InvitationSealContext,
  keyring: InvitationPayloadKeyring,
): InvitationDeliveryPayload {
  let bytes: Buffer | undefined;
  let updatedPlaintext: Buffer | undefined;
  let finalPlaintext: Buffer | undefined;
  let plaintext: Buffer | undefined;
  let key: Buffer | undefined;
  try {
    const parsedEnvelope = exactRecord(envelope, ["version", "keyId", "bytes", "digest"]);
    const parsedContext = contextValue(context);
    if (parsedEnvelope.version !== VERSION || !Buffer.isBuffer(parsedEnvelope.bytes)) invalid();
    if (parsedEnvelope.bytes.length <= PREFIX_BYTES || parsedEnvelope.bytes.length > PREFIX_BYTES + MAX_PLAINTEXT_BYTES) invalid();
    const expectedDigest = parsedEnvelope.digest;
    if (typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/u.test(expectedDigest)) invalid();
    const actualDigest = sha256(parsedEnvelope.bytes);
    if (!timingSafeEqual(Buffer.from(expectedDigest, "ascii"), Buffer.from(actualDigest, "ascii"))) invalid();
    if (parsedEnvelope.bytes.subarray(0, 3).toString("utf8") !== VERSION) invalid();
    const keyId = keyIdValue(parsedEnvelope.keyId);
    key = selectedKey(keyring, keyId);
    bytes = Buffer.from(parsedEnvelope.bytes);
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(3, 3 + IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(keyId, parsedContext));
    decipher.setAuthTag(bytes.subarray(3 + IV_BYTES, PREFIX_BYTES));
    updatedPlaintext = decipher.update(bytes.subarray(PREFIX_BYTES));
    finalPlaintext = decipher.final();
    plaintext = Buffer.concat([updatedPlaintext, finalPlaintext]);
    if (plaintext.length > MAX_PLAINTEXT_BYTES) invalid();
    return parsePayload(JSON.parse(plaintext.toString("utf8")));
  } catch {
    return invalid();
  } finally {
    plaintext?.fill(0);
    finalPlaintext?.fill(0);
    updatedPlaintext?.fill(0);
    key?.fill(0);
    bytes?.fill(0);
  }
}
