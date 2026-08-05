import type { OrderEmailProviderRequest } from "./seal.ts";

export type OrderEmailSendResult = Readonly<
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "retryable" | "permanent"; code: string }
>;

export type SendOrderEmailOptions = Readonly<{
  apiKey: string;
  idempotencyKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}>;

const ENDPOINT = "https://api.resend.com/emails";
const RESPONSE_LIMIT = 16_384;
const KEY = /^order-email\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DELAYS = Object.freeze([30_000, 120_000, 600_000, 3_600_000, 10_800_000, 21_600_000, 43_200_000] as const);

function invalid(): never { throw new Error("order_email_resend_invalid"); }
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}
function ordinary(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = ordinary(value), allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}
function validateRequest(value: OrderEmailProviderRequest): OrderEmailProviderRequest {
  const parsed = exact(value, ["from", "to", "subject", "html", "text"], ["replyTo"]);
  return Object.freeze({
    from: text(parsed.from, 7, 320), to: text(parsed.to, 3, 320),
    ...(Object.hasOwn(parsed, "replyTo") ? { replyTo: text(parsed.replyTo, 3, 320) } : {}),
    subject: text(parsed.subject, 1, 250), html: text(parsed.html, 1, 200_000), text: text(parsed.text, 1, 100_000),
  });
}

async function boundedBody(response: Response): Promise<string | undefined> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      size += selected.value.byteLength;
      if (size > RESPONSE_LIMIT) { await reader.cancel(); return undefined; }
      chunks.push(selected.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

function providerErrorName(body: string | undefined): string | undefined {
  if (body === undefined || body.length === 0) return undefined;
  try {
    const parsed = ordinary(JSON.parse(body));
    const selected = typeof parsed.name === "string" ? parsed.name : typeof parsed.code === "string" ? parsed.code : undefined;
    return selected && /^[a-z][a-z0-9_]{0,63}$/u.test(selected) ? selected : undefined;
  } catch { return undefined; }
}

function classify(status: number, name: string | undefined): OrderEmailSendResult {
  if (status === 409 && name === "concurrent_idempotent_requests") return Object.freeze({ kind: "retryable", code: "provider_request_concurrent" });
  if (status === 409 && name === "invalid_idempotent_request") return Object.freeze({ kind: "permanent", code: "idempotency_payload_conflict" });
  if (status === 429) return Object.freeze({ kind: "retryable", code: "provider_rate_limited" });
  if (status >= 500) return Object.freeze({ kind: "retryable", code: "provider_unavailable" });
  if (status === 401 || status === 403) return Object.freeze({ kind: "permanent", code: "provider_configuration_invalid" });
  if (status === 409) return Object.freeze({ kind: "permanent", code: "provider_conflict" });
  if (status >= 400 && status < 500) return Object.freeze({ kind: "permanent", code: "request_invalid" });
  return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
}

export function retryDelayMs(attempt: 1 | 2 | 3 | 4 | 5 | 6 | 7): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 7) invalid();
  return DELAYS[attempt - 1]!;
}

export async function sendOrderEmail(
  request: OrderEmailProviderRequest,
  options: SendOrderEmailOptions,
): Promise<OrderEmailSendResult> {
  const selected = validateRequest(request);
  const parsed = exact(options, ["apiKey", "idempotencyKey", "timeoutMs"], ["fetch"]);
  const apiKey = text(parsed.apiKey, 8, 512);
  const idempotencyKey = text(parsed.idempotencyKey, 1, 256);
  if (!KEY.test(idempotencyKey) || !Number.isSafeInteger(parsed.timeoutMs) || (parsed.timeoutMs as number) < 1 || (parsed.timeoutMs as number) > 30_000) invalid();
  const fetchImpl = parsed.fetch === undefined ? fetch : parsed.fetch;
  if (typeof fetchImpl !== "function") invalid();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), parsed.timeoutMs as number);
  try {
    const response = await (fetchImpl as typeof fetch)(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from: selected.from,
        to: [selected.to],
        ...(selected.replyTo ? { reply_to: selected.replyTo } : {}),
        subject: selected.subject,
        html: selected.html,
        text: selected.text,
      }),
      signal: controller.signal,
    });
    const body = await boundedBody(response);
    if (response.ok) {
      if (body === undefined) return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
      try {
        const payload = exact(JSON.parse(body), ["id"]);
        return Object.freeze({ kind: "accepted", providerMessageId: text(payload.id, 1, 256) });
      } catch {
        return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
      }
    }
    return classify(response.status, providerErrorName(body));
  } catch {
    return controller.signal.aborted
      ? Object.freeze({ kind: "retryable", code: "provider_timeout" })
      : Object.freeze({ kind: "retryable", code: "provider_network_error" });
  } finally {
    clearTimeout(timer);
  }
}

