import type { NativeMarketingWorkflowRepository } from "@celebix/saas-data";
import { Webhook } from "svix";

export type VerifiedNativeMarketingProviderEvent = Readonly<
  | { kind: "ignored" }
  | {
      kind: "supported";
      providerEventId: string;
      providerMessageId: string;
      type: "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained" | "suppressed";
      occurredAt: string;
      safeReasonCode?: string;
    }
>;

export type NativeMarketingWebhookHandlerOptions = Readonly<{
  secret: string;
  repository: Pick<NativeMarketingWorkflowRepository, "recordProviderEvent">;
  now(): Date;
}>;

const MAXIMUM_BODY_BYTES = 65_536;
const TYPES = Object.freeze({
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
} as const);
const REASONS: Readonly<Partial<Record<(typeof TYPES)[keyof typeof TYPES], string>>> = Object.freeze({
  delayed: "delivery_delayed", failed: "provider_failed", bounced: "hard_bounce",
  complained: "complained", suppressed: "suppressed",
});

function invalid(): never { throw new Error("native_marketing_webhook_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}
function bounded(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) invalid();
  return value;
}
function header(source: Headers | Readonly<Record<string, string>>, name: string): string {
  const selected = source instanceof Headers ? source.get(name) : source[name];
  return bounded(selected, 1, 1_024);
}
function timestamp(value: unknown): string {
  const selected = bounded(value, 20, 40);
  const parsed = new Date(selected);
  if (!Number.isFinite(parsed.getTime())) invalid();
  return parsed.toISOString();
}

export function verifyNativeMarketingWebhook(
  rawBody: string,
  headers: Headers | Readonly<Record<string, string>>,
  secret: string,
): VerifiedNativeMarketingProviderEvent {
  if (typeof rawBody !== "string" || Buffer.byteLength(rawBody, "utf8") > MAXIMUM_BODY_BYTES || !/^whsec_[^\s]{6,}$/u.test(secret)) invalid();
  const providerEventId = header(headers, "svix-id");
  const verificationHeaders = {
    "svix-id": providerEventId,
    "svix-timestamp": header(headers, "svix-timestamp"),
    "svix-signature": header(headers, "svix-signature"),
  };
  let verified: unknown;
  try { verified = new Webhook(secret).verify(rawBody, verificationHeaders); }
  catch { return invalid(); }
  const event = record(verified);
  if (typeof event.type !== "string" || !Object.hasOwn(TYPES, event.type)) return Object.freeze({ kind: "ignored" });
  const selectedType = TYPES[event.type as keyof typeof TYPES];
  const data = record(event.data);
  // Resend emits send-API tag arrays as an object in webhook payloads.
  // Tags identify this workflow only; the database still resolves authority by provider message id.
  const tags = data.tags;
  if (typeof tags !== "object" || tags === null || Array.isArray(tags)) return Object.freeze({ kind: "ignored" });
  const native = tags as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (typeof native.tenant_id !== "string" || !uuid.test(native.tenant_id) || typeof native.delivery_id !== "string" || !uuid.test(native.delivery_id)) return Object.freeze({ kind: "ignored" });
  const safeReasonCode = REASONS[selectedType];
  return Object.freeze({
    kind: "supported",
    providerEventId,
    providerMessageId: bounded(data.email_id, 1, 256),
    type: selectedType,
    occurredAt: timestamp(event.created_at),
    ...(safeReasonCode ? { safeReasonCode } : {}),
  });
}

async function rawBody(request: Request): Promise<string | undefined> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAXIMUM_BODY_BYTES)) return undefined;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      size += selected.value.byteLength;
      if (size > MAXIMUM_BODY_BYTES) { await reader.cancel(); return undefined; }
      chunks.push(selected.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { return undefined; }
  finally { reader.releaseLock(); }
}

function response(status: 200 | 400 | 503): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } });
}

export function createNativeMarketingWebhookHandler(options: NativeMarketingWebhookHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") return response(400);
    const body = await rawBody(request);
    if (body === undefined) return response(400);
    let event: VerifiedNativeMarketingProviderEvent;
    try { event = verifyNativeMarketingWebhook(body, request.headers, options.secret); }
    catch { return response(400); }
    if (event.kind === "ignored") return response(200);
    const receivedAt = options.now();
    if (!(receivedAt instanceof Date) || !Number.isFinite(receivedAt.getTime())) return response(503);
    try {
      await options.repository.recordProviderEvent({
        providerEventId: event.providerEventId, providerMessageId: event.providerMessageId,
        type: event.type, occurredAt: new Date(event.occurredAt), receivedAt: new Date(receivedAt.getTime()),
        ...(event.safeReasonCode ? { safeReasonCode: event.safeReasonCode } : {}),
      });
      return response(200);
    } catch { return response(503); }
  };
}
