import { normalizeStorefrontAccountEmail } from "../account/email.ts";

type Environment = Readonly<Record<string, string | undefined>>;
export type CustomerEngagementEmailConfig = Readonly<{ apiKey: string; from: string }>;
export type CustomerEngagementEmail = Readonly<{ to: string; fromLabel?: string; storeName?: string; subject: string; html: string; text: string; replyTo?: string }>;
export type CustomerEngagementEmailResult = Readonly<{ kind: "accepted"; providerMessageId: string } | { kind: "retryable" | "permanent"; code: string }>;
export type CustomerEngagementEmailSender = (message: CustomerEngagementEmail, idempotencyKey: string) => Promise<CustomerEngagementEmailResult>;

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const BODY_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;
const KEY = /^(?:review-request|restock-confirmation|restock-stock)\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RESPONSE_LIMIT = 16_384;
function invalid(): never { throw Error("engagement_email_invalid"); }
function safeText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || CONTROL.test(value)) invalid();
  return value;
}
function safeBody(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maximum || BODY_CONTROL.test(value)) invalid();
  return value;
}
function safeEmail(value: unknown): string {
  try { return normalizeStorefrontAccountEmail(safeText(value, 320)); }
  catch { return invalid(); }
}
function platformSender(value: unknown): string {
  const email = safeEmail(value);
  if (!["@celebix.test", "@celebix.co", "@noreply.celebix.net"].some(suffix => email.endsWith(suffix))) invalid();
  return email;
}
export function parseCustomerEngagementEmailConfig(source: Environment): CustomerEngagementEmailConfig | null {
  const keys = ["CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE", "CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM", "CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY"];
  if (keys.every(key => source[key] === undefined || source[key] === "")) return null;
  try {
    if (source.CELEBIX_STOREFRONT_ACCOUNT_EMAIL_MODE !== "platform_resend") invalid();
    const from = platformSender(source.CELEBIX_STOREFRONT_ACCOUNT_EMAIL_FROM);
    const apiKey = safeText(source.CELEBIX_STOREFRONT_ACCOUNT_RESEND_API_KEY, 256);
    if (!/^re_[A-Za-z0-9_-]{16,200}$/u.test(apiKey)) invalid();
    return Object.freeze({ from, apiKey });
  } catch { throw Error("engagement_email_config_invalid"); }
}
async function boundedResponse(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > RESPONSE_LIMIT) { await reader.cancel(); return null; }
      parts.push(part.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function createCustomerEngagementEmailSender(options: CustomerEngagementEmailConfig & Readonly<{ fetch(request: Request): Promise<Response>; timeoutMs: number }>): CustomerEngagementEmailSender {
  const from = platformSender(options.from), apiKey = safeText(options.apiKey, 256);
  if (!/^re_[A-Za-z0-9_-]{16,200}$/u.test(apiKey) || typeof options.fetch !== "function" || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30_000) invalid();
  return async (message, idempotencyKey) => {
    if (!KEY.test(idempotencyKey)) invalid();
    const to = safeEmail(message.to);
    const label = message.fromLabel ?? message.storeName;
    const safeLabel = label === undefined ? undefined : safeText(label, 160);
    const sender = safeLabel && !/[<>"\\,;]/u.test(safeLabel) ? `${safeLabel} <${from}>` : from;
    const payload = { from: sender, to, subject: safeText(message.subject, 250), html: safeBody(message.html, 200_000), text: safeBody(message.text, 100_000), ...(message.replyTo === undefined ? {} : { reply_to: safeEmail(message.replyTo) }) };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.fetch(new Request("https://api.resend.com/emails", { method: "POST", redirect: "error", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify(payload), signal: controller.signal }));
      const body = await boundedResponse(response);
      if (response.status === 429) return { kind: "retryable", code: "provider_rate_limited" };
      if (response.status >= 500) return { kind: "retryable", code: "provider_unavailable" };
      if (response.status === 409) return body?.name === "concurrent_idempotent_requests" ? { kind: "retryable", code: "provider_request_concurrent" } : { kind: "permanent", code: body?.name === "invalid_idempotent_request" ? "idempotency_payload_conflict" : "provider_conflict" };
      if (response.status === 401 || response.status === 403) return { kind: "permanent", code: "provider_configuration_invalid" };
      if (response.status >= 400 && response.status < 500) return { kind: "permanent", code: "request_invalid" };
      if (response.ok && typeof body?.id === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(body.id)) return { kind: "accepted", providerMessageId: body.id };
      return { kind: "retryable", code: "provider_response_invalid" };
    } catch { return { kind: "retryable", code: "provider_unavailable" }; }
    finally { clearTimeout(timer); }
  };
}
