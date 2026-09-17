import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeStoreAdminInvitationEmail } from "@celebix/saas-contracts";
import type { InvitationEmailRequest } from "./email.ts";
import type { InvitationPayloadKeyring, InvitationSealContext } from "./seal.ts";

export interface InvitationSealedRequest { version: "ar1"; keyId: string; bytes: Buffer; digest: string }
const MAX_BYTES = 65_536;
const PREFIX = 31;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
function invalid(): never { throw new Error("store_admin_invitation_request_seal_invalid"); }
function exact(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.length !== fields.length || keys.some(k => typeof k !== "string" || !fields.includes(k))) invalid();
  if (fields.some(k => !descriptors[k]?.enumerable || !("value" in descriptors[k]!))) invalid();
  return Object.fromEntries(fields.map(k => [k, descriptors[k]!.value]));
}
function request(value: unknown): InvitationEmailRequest {
  const r = exact(value, ["from", "to", "subject", "html", "text"]);
  for (const field of ["from", "to"] as const) if (normalizeStoreAdminInvitationEmail(r[field]) !== r[field]) invalid();
  for (const field of ["subject", "html", "text"] as const) {
    const text = r[field];
    if (typeof text !== "string" || !text || text !== text.trim() || text.length > (field === "subject" ? 250 : MAX_BYTES)) invalid();
    if ((field === "subject" ? /[\u0000-\u001f\u007f-\u009f]/u : /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u).test(text)) invalid();
  }
  return Object.freeze(r) as InvitationEmailRequest;
}
function context(value: unknown): InvitationSealContext {
  const c = exact(value, ["invitationId", "generation"]);
  if (typeof c.invitationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(c.invitationId)) invalid();
  if (typeof c.generation !== "number" || !Number.isSafeInteger(c.generation) || c.generation < 1) invalid();
  return { invitationId: c.invitationId, generation: c.generation };
}
function keyring(value: unknown) {
  const r = exact(value, ["activeKeyId", "keys"]);
  if (typeof r.activeKeyId !== "string" || !KEY_ID.test(r.activeKeyId) || !r.keys || typeof r.keys !== "object") invalid();
  const ids = Reflect.ownKeys(r.keys);
  if (!ids.length || ids.length > 16 || ids.some(id => typeof id !== "string" || !KEY_ID.test(id))) invalid();
  const keys = exact(r.keys, ids as string[]);
  if (!Object.hasOwn(keys, r.activeKeyId) || Object.values(keys).some(k => !Buffer.isBuffer(k) || k.length !== 32)) invalid();
  return { activeKeyId: r.activeKeyId, keys: keys as Record<string, Buffer> };
}
function aad(id: string, c: InvitationSealContext) {
  return Buffer.from(`celebix-store-admin-invitation-request:ar1:${id}:${c.invitationId}:${c.generation}`, "utf8");
}
function digest(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }

export function sealInvitationRequest(value: InvitationEmailRequest, binding: InvitationSealContext, ring: InvitationPayloadKeyring): InvitationSealedRequest {
  let plaintext: Buffer | undefined, key: Buffer | undefined;
  try {
    const parsed = request(value), c = context(binding), r = keyring(ring);
    plaintext = Buffer.from(JSON.stringify(parsed), "utf8");
    if (plaintext.length + PREFIX > MAX_BYTES) invalid();
    key = Buffer.from(r.keys[r.activeKeyId]!);
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    cipher.setAAD(aad(r.activeKeyId, c));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from("ar1"), iv, cipher.getAuthTag(), encrypted]);
    return Object.freeze({ version: "ar1", keyId: r.activeKeyId, bytes, digest: digest(bytes) });
  } catch { return invalid(); }
  finally { plaintext?.fill(0); key?.fill(0); }
}

export function openInvitationRequest(value: InvitationSealedRequest, binding: InvitationSealContext, ring: InvitationPayloadKeyring): InvitationEmailRequest {
  let key: Buffer | undefined, update: Buffer | undefined, final: Buffer | undefined, plaintext: Buffer | undefined;
  try {
    const e = exact(value, ["version", "keyId", "bytes", "digest"]), c = context(binding), r = keyring(ring);
    if (e.version !== "ar1" || typeof e.keyId !== "string" || !KEY_ID.test(e.keyId) || !Object.hasOwn(r.keys, e.keyId)) invalid();
    if (!Buffer.isBuffer(e.bytes) || e.bytes.length <= PREFIX || e.bytes.length > MAX_BYTES || e.bytes.subarray(0, 3).toString() !== "ar1") invalid();
    if (typeof e.digest !== "string" || !/^[a-f0-9]{64}$/u.test(e.digest) || !timingSafeEqual(Buffer.from(e.digest), Buffer.from(digest(e.bytes)))) invalid();
    key = Buffer.from(r.keys[e.keyId]!);
    const decipher = createDecipheriv("aes-256-gcm", key, e.bytes.subarray(3, 15), { authTagLength: 16 });
    decipher.setAAD(aad(e.keyId, c)); decipher.setAuthTag(e.bytes.subarray(15, PREFIX));
    update = decipher.update(e.bytes.subarray(PREFIX)); final = decipher.final(); plaintext = Buffer.concat([update, final]);
    return request(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
  } catch { return invalid(); }
  finally { key?.fill(0); update?.fill(0); final?.fill(0); plaintext?.fill(0); }
}
