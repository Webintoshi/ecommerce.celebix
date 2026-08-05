import { isIP } from "node:net";

import type { OrderEmailKeyring } from "./seal.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/u;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/u;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/u;

export type OrderEmailConfig = Readonly<{
  database: Readonly<{ url: string; name: string }>;
  deliveryMode: "test" | "live";
  workerId: string;
  resendApiKey: string;
  senderEmail: string;
  webhookSecret: string;
  keyring: OrderEmailKeyring;
  testRecipient?: string;
}>;

function invalid(): never { throw new Error("order_email_config_invalid"); }
function required(source: Environment, name: string, maximum = 4_096): string {
  const value = source[name];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}
function email(value: string): string { return EMAIL.test(value) ? value.toLowerCase() : invalid(); }
function isPrivateHost(value: string): boolean {
  const kind = isIP(value);
  if (kind === 0) return !value.includes(".") || value.endsWith(".internal") || value.endsWith(".local");
  if (kind === 6) return value === "::1" || value.toLowerCase().startsWith("fc") || value.toLowerCase().startsWith("fd");
  const [first, second] = value.split(".").map(Number);
  return first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
function database(source: Environment): OrderEmailConfig["database"] {
  const value = required(source, "CELEBIX_SAAS_DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.username || !parsed.password || !parsed.hostname || parsed.hash || parsed.searchParams.size !== 1 || parsed.searchParams.get("sslmode") !== "verify-full" || parsed.pathname !== `/${name}` || !DATABASE.test(name) || !isPrivateHost(parsed.hostname) || parsed.toString() !== value) invalid();
  return Object.freeze({ url: value, name });
}
function keyring(source: Environment): OrderEmailKeyring {
  const raw = required(source, "CELEBIX_ORDER_EMAIL_PAYLOAD_KEYRING", 8_192);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalid(); }
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 8) invalid();
  const keys: Record<string, Buffer> = Object.create(null) as Record<string, Buffer>;
  const seen = new Set<string>();
  for (const [id, encoded] of entries) {
    if (!KEY_ID.test(id) || typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) invalid();
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== encoded) { decoded.fill(0); invalid(); }
    const fingerprint = decoded.toString("hex");
    if (seen.has(fingerprint)) { decoded.fill(0); invalid(); }
    seen.add(fingerprint); keys[id] = decoded;
  }
  const activeKeyId = required(source, "CELEBIX_ORDER_EMAIL_ACTIVE_KEY_ID", 32);
  if (!KEY_ID.test(activeKeyId) || !Object.hasOwn(keys, activeKeyId)) {
    for (const key of Object.values(keys)) key.fill(0);
    invalid();
  }
  return Object.freeze({ activeKeyId, keys: Object.freeze(keys) });
}

export function resolveOrderEmailWorkerMode(source: Environment): "enabled" | "disabled" {
  const selected = source.CELEBIX_ORDER_EMAIL_WORKER_ENABLED;
  if (selected === undefined || selected === "false") return "disabled";
  if (selected === "true") return "enabled";
  return invalid();
}

export function parseOrderEmailConfig(source: Environment): OrderEmailConfig {
  if (resolveOrderEmailWorkerMode(source) !== "enabled") invalid();
  const deliveryMode = required(source, "CELEBIX_ORDER_EMAIL_DELIVERY_MODE", 8);
  if (deliveryMode !== "test" && deliveryMode !== "live") invalid();
  const workerId = required(source, "CELEBIX_ORDER_EMAIL_WORKER_ID", 128);
  if (!WORKER.test(workerId)) invalid();
  const resendApiKey = required(source, "CELEBIX_ORDER_EMAIL_RESEND_API_KEY", 512);
  const webhookSecret = required(source, "CELEBIX_ORDER_EMAIL_RESEND_WEBHOOK_SECRET", 512);
  if (!/^re_[^\s]{6,}$/u.test(resendApiKey) || !/^whsec_[^\s]{6,}$/u.test(webhookSecret)) invalid();
  const selectedKeyring = keyring(source);
  const testRecipient = deliveryMode === "test" ? email(required(source, "CELEBIX_ORDER_EMAIL_TEST_RECIPIENT", 320)) : undefined;
  return Object.freeze({
    database: database(source), deliveryMode, workerId, resendApiKey,
    senderEmail: email(required(source, "CELEBIX_ORDER_EMAIL_FROM", 320)), webhookSecret,
    keyring: selectedKeyring, ...(testRecipient ? { testRecipient } : {}),
  });
}

