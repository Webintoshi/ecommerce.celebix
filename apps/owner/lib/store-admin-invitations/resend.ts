import { normalizeStoreAdminInvitationEmail } from "@celebix/saas-contracts";

import type { InvitationEmailRequest } from "./email.ts";

export type InvitationSendResult = Readonly<
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "retryable" | "permanent"; code: string }
>;

export type SendInvitationEmailOptions = Readonly<{
  apiKey: string;
  idempotencyKey: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}>;

const ENDPOINT = "https://api.resend.com/emails";
const RESPONSE_LIMIT = 16_384;
const API_KEY = /^re_[A-Za-z0-9_-]{6,500}$/u;
const IDEMPOTENCY_KEY = /^store-admin-invitation\/v1\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9][0-9]*)$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const BODY_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;
const PROVIDER_ERROR_NAME = /^[a-z][a-z0-9_]{0,63}$/u;
const DEADLINE = Symbol("invitation-email-deadline");

function invalid(): never {
  throw new Error("store_admin_invitation_resend_invalid");
}
function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    required.some((field) => !keys.includes(field))
    || keys.some((key) => typeof key !== "string" || !allowed.has(key))
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some((key) => typeof key !== "string" || !descriptors[key]?.enumerable || !("value" in descriptors[key]!))) invalid();
  return Object.fromEntries((keys as string[]).map((key) => [key, descriptors[key]!.value]));
}

function canonicalEmail(value: unknown): string {
  const normalized = normalizeStoreAdminInvitationEmail(value);
  if (normalized !== value) invalid();
  return normalized;
}

function text(value: unknown, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || value !== value.trim()
    || CONTROL.test(value)
  ) invalid();
  return value;
}

function body(value: unknown, maximum: number): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || value !== value.trim()
    || BODY_CONTROL.test(value)
  ) invalid();
  return value;
}

function validateRequest(value: InvitationEmailRequest): InvitationEmailRequest {
  try {
    const parsed = exactRecord(value, ["from", "to", "subject", "html", "text"]);
    return Object.freeze({
      from: canonicalEmail(parsed.from),
      to: canonicalEmail(parsed.to),
      subject: text(parsed.subject, 250),
      html: body(parsed.html, 200_000),
      text: body(parsed.text, 100_000),
    });
  } catch {
    return invalid();
  }
}

function validateOptions(value: SendInvitationEmailOptions): Required<SendInvitationEmailOptions> {
  try {
    const parsed = exactRecord(value, ["apiKey", "idempotencyKey", "timeoutMs"], ["fetch"]);
    if (typeof parsed.apiKey !== "string" || !API_KEY.test(parsed.apiKey)) invalid();
    if (typeof parsed.idempotencyKey !== "string" || parsed.idempotencyKey.length > 256) invalid();
    const match = parsed.idempotencyKey.match(IDEMPOTENCY_KEY);
    if (!match || !Number.isSafeInteger(Number(match[2]))) invalid();
    if (typeof parsed.timeoutMs !== "number" || !Number.isSafeInteger(parsed.timeoutMs) || parsed.timeoutMs < 1 || parsed.timeoutMs > 30_000) invalid();
    const fetchImpl = parsed.fetch === undefined ? fetch : parsed.fetch;
    if (typeof fetchImpl !== "function") invalid();
    return Object.freeze({
      apiKey: parsed.apiKey,
      idempotencyKey: parsed.idempotencyKey,
      timeoutMs: parsed.timeoutMs,
      fetch: fetchImpl as typeof fetch,
    });
  } catch {
    return invalid();
  }
}

async function boundedBody(response: Response, deadline: Promise<never>): Promise<string | undefined> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let completed = false;
  try {
    while (true) {
      const selected = await Promise.race([reader.read(), deadline]);
      if (selected.done) {
        completed = true;
        break;
      }
      size += selected.value.byteLength;
      if (size > RESPONSE_LIMIT) return undefined;
      chunks.push(selected.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error === DEADLINE) throw error;
    return undefined;
  } finally {
    if (!completed) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // The caller must never wait for provider-controlled stream cancellation.
      }
    }
    try {
      reader.releaseLock();
    } catch {
      // A hostile stream must not escape the finite adapter result space.
    }
  }
}

function parseProviderObject(bodyValue: string): Record<string, unknown> | undefined {
  if (bodyValue.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(bodyValue);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function accepted(bodyValue: string): InvitationSendResult {
  try {
    const parsed = exactRecord(JSON.parse(bodyValue), ["id"]);
    if (
      typeof parsed.id !== "string"
      || parsed.id.length < 1
      || parsed.id.length > 256
      || parsed.id !== parsed.id.trim()
      || !PRINTABLE_ASCII.test(parsed.id)
    ) invalid();
    return Object.freeze({ kind: "accepted", providerMessageId: parsed.id });
  } catch {
    return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
  }
}

function providerErrorName(payload: Record<string, unknown>): string | undefined | null {
  const value = typeof payload.name === "string"
    ? payload.name
    : typeof payload.code === "string"
      ? payload.code
      : undefined;
  if (value !== undefined && !PROVIDER_ERROR_NAME.test(value)) return null;
  return value;
}

function classify(status: number, name: string | undefined): InvitationSendResult {
  if (status === 409 && name === "concurrent_idempotent_requests") return Object.freeze({ kind: "retryable", code: "provider_request_concurrent" });
  if (status === 409 && name === "invalid_idempotent_request") return Object.freeze({ kind: "permanent", code: "idempotency_payload_conflict" });
  if (status === 401 || status === 403) return Object.freeze({ kind: "permanent", code: "provider_configuration_invalid" });
  if (status === 429) return Object.freeze({ kind: "retryable", code: "provider_rate_limited" });
  if (status >= 500 && status <= 599) return Object.freeze({ kind: "retryable", code: "provider_unavailable" });
  if (status === 409) return Object.freeze({ kind: "permanent", code: "provider_conflict" });
  if (status >= 400 && status <= 499) return Object.freeze({ kind: "permanent", code: "request_invalid" });
  return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
}

export async function sendInvitationEmail(
  request: InvitationEmailRequest,
  options: SendInvitationEmailOptions,
): Promise<InvitationSendResult> {
  const selected = validateRequest(request);
  const parsed = validateOptions(options);
  const controller = new AbortController();
  let rejectDeadline!: (reason: typeof DEADLINE) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const onAbort = () => rejectDeadline(DEADLINE);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), parsed.timeoutMs);

  try {
    const response = await Promise.race([
      parsed.fetch(ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${parsed.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": parsed.idempotencyKey,
        },
        body: JSON.stringify({
          from: selected.from,
          to: [selected.to],
          subject: selected.subject,
          html: selected.html,
          text: selected.text,
        }),
        signal: controller.signal,
      }),
      deadline,
    ]);
    const responseBody = await boundedBody(response, deadline);
    if (responseBody === undefined) return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
    if (response.ok) return accepted(responseBody);
    const providerPayload = parseProviderObject(responseBody);
    if (!providerPayload) return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
    const name = providerErrorName(providerPayload);
    if (name === null) return Object.freeze({ kind: "retryable", code: "provider_response_invalid" });
    return classify(response.status, name);
  } catch {
    return controller.signal.aborted
      ? Object.freeze({ kind: "retryable", code: "provider_timeout" })
      : Object.freeze({ kind: "retryable", code: "provider_network_error" });
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
