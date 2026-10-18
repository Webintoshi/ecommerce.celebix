import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "nm1" as const;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/u;
export type NativeMarketingIdentity = Readonly<{ storeId: string; deliveryId: string }>;
export type NativeMarketingProviderRequest = Readonly<{
  from: string; to: string; subject: string; html: string; text: string;
  headers: Readonly<{ "List-Unsubscribe": string; "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }>;
  tags: readonly Readonly<{ name: "tenant_id" | "delivery_id"; value: string }>[];
}>;
export type NativeMarketingKeyring = Readonly<{ activeKeyId: string; keys: Readonly<Record<string, Buffer>> }>;
export type NativeMarketingSealedEnvelope = Readonly<{ version: typeof VERSION; keyId: string; bytes: Buffer; digest: string }>;
function invalid(): never { throw new Error("native_marketing_seal_invalid"); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || !value || value.length > max || value !== value.trim() || (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u : CONTROL).test(value)) invalid();
  return value;
}
// Only the renderer's fixed layout CSS may be omitted from forbidden-tag inspection.
// Preserve the original HTML in the request so sealing and retries keep exact bytes.
const RESPONSIVE_STYLESHEET = '<style>@media only screen and (max-width:480px){.email-stack{display:block!important;width:100%!important;box-sizing:border-box}.email-content{padding:24px 16px!important}}</style>';
const RENDERER_HEAD_PREFIX = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>';
function htmlForForbiddenTagInspection(html: string): string {
  const index = html.indexOf(RESPONSIVE_STYLESHEET);
  if (index === -1) return html;
  const titleEnd = html.indexOf('</title>', RENDERER_HEAD_PREFIX.length);
  if (!html.startsWith(RENDERER_HEAD_PREFIX) || titleEnd === -1 || /[<>]/u.test(html.slice(RENDERER_HEAD_PREFIX.length, titleEnd)) || titleEnd + '</title>'.length !== index || !html.startsWith('</head><body ', index + RESPONSIVE_STYLESHEET.length) || html.indexOf(RESPONSIVE_STYLESHEET, index + RESPONSIVE_STYLESHEET.length) !== -1) invalid();
  return html.slice(0, index) + html.slice(index + RESPONSIVE_STYLESHEET.length);
}
export function validateNativeMarketingRequest(value: unknown): NativeMarketingProviderRequest {
  const p = exact(value, ["from", "to", "subject", "html", "text", "headers", "tags"]);
  const from = text(p.from, 320), to = text(p.to, 320), html = text(p.html, 200_000);
  if (!/^.{1,160} <[^<>\s@]+@[^<>\s@]+\.[A-Za-z]{2,63}>$/u.test(from) || !EMAIL.test(to) || /<(?:script|form|iframe|object|embed|link)\b|<\/?style\b|\bdata:/iu.test(htmlForForbiddenTagInspection(html))) invalid();
  const h = exact(p.headers, ["List-Unsubscribe", "List-Unsubscribe-Post"]), unsubscribe = text(h["List-Unsubscribe"], 2_048);
  if (h["List-Unsubscribe-Post"] !== "List-Unsubscribe=One-Click" || !/^<https:\/\/[^<>\s]+\/api\/marketing\/unsubscribe\?token=[A-Za-z0-9_-]{43}>$/u.test(unsubscribe)) invalid();
  const url = new URL(unsubscribe.slice(1, -1));
  if (url.username || url.password || url.port || url.hash || url.searchParams.size !== 1) invalid();
  if (!Array.isArray(p.tags) || p.tags.length !== 2) invalid();
  const tags = p.tags.map((value, index) => {
    const tag = exact(value, ["name", "value"]), name = index === 0 ? "tenant_id" : "delivery_id", id = text(tag.value, 36);
    if (tag.name !== name || !UUID.test(id)) invalid(); return Object.freeze({ name, value: id });
  });
  return Object.freeze({ from, to, subject: text(p.subject, 250), html, text: text(p.text, 100_000, true), headers: Object.freeze({ "List-Unsubscribe": unsubscribe, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }), tags: Object.freeze(tags) });
}
function key(keyring: NativeMarketingKeyring, id: string): Buffer {
  if (!/^[a-z][a-z0-9_-]{2,31}$/u.test(id) || !Object.hasOwn(keyring.keys, id) || !Buffer.isBuffer(keyring.keys[id]) || keyring.keys[id]!.length !== 32) invalid();
  return Buffer.from(keyring.keys[id]!);
}
function aad(id: string, identity: NativeMarketingIdentity): Buffer {
  if (!UUID.test(identity.storeId) || !UUID.test(identity.deliveryId)) invalid();
  return Buffer.from(`celebix-native-marketing:${VERSION}:${id}:${identity.storeId}:${identity.deliveryId}`);
}
function digest(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
export function sealNativeMarketingRequest(request: NativeMarketingProviderRequest, keyring: NativeMarketingKeyring, identity: NativeMarketingIdentity, ivFactory = () => randomBytes(12)): NativeMarketingSealedEnvelope {
  const parsed = validateNativeMarketingRequest(request), keyId = keyring.activeKeyId, selected = key(keyring, keyId), iv = ivFactory();
  const plaintext = Buffer.from(JSON.stringify(parsed));
  try {
    if (!Buffer.isBuffer(iv) || iv.length !== 12 || parsed.tags[0]!.value !== identity.storeId || parsed.tags[1]!.value !== identity.deliveryId) invalid();
    const cipher = createCipheriv("aes-256-gcm", selected, iv); cipher.setAAD(aad(keyId, identity));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from(VERSION), iv, cipher.getAuthTag(), encrypted]);
    return Object.freeze({ version: VERSION, keyId, bytes, digest: digest(bytes) });
  } catch { return invalid(); } finally { selected.fill(0); plaintext.fill(0); }
}
export function openNativeMarketingRequest(envelope: NativeMarketingSealedEnvelope, keyring: NativeMarketingKeyring, identity: NativeMarketingIdentity): NativeMarketingProviderRequest {
  if (envelope.version !== VERSION || !Buffer.isBuffer(envelope.bytes) || envelope.bytes.length < 33 || envelope.bytes.length > 350_000 || !/^[a-f0-9]{64}$/u.test(envelope.digest)) invalid();
  const bytes = Buffer.from(envelope.bytes), selected = key(keyring, envelope.keyId);
  let plaintext: Buffer | undefined;
  try {
    if (bytes.subarray(0, 3).toString() !== VERSION || !timingSafeEqual(Buffer.from(digest(bytes)), Buffer.from(envelope.digest))) invalid();
    const decipher = createDecipheriv("aes-256-gcm", selected, bytes.subarray(3, 15)); decipher.setAAD(aad(envelope.keyId, identity)); decipher.setAuthTag(bytes.subarray(15, 31));
    plaintext = Buffer.concat([decipher.update(bytes.subarray(31)), decipher.final()]);
    const request = validateNativeMarketingRequest(JSON.parse(plaintext.toString()));
    if (request.tags[0]!.value !== identity.storeId || request.tags[1]!.value !== identity.deliveryId) invalid();
    return request;
  } catch { return invalid(); } finally { selected.fill(0); plaintext?.fill(0); bytes.fill(0); }
}
