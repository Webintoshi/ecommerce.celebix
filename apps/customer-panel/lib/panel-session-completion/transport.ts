import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  PANEL_OIDC_CALLBACK_URL,
  PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES,
  PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
} from "../../../../packages/platform-config/src/saas.ts";
import { validateCustomerPanelCallbackUrl } from "../self-serve-callback-edge/callback-request.ts";
import {
  createAuthenticatedInternalCallbackRequest,
  validateOwnerInternalCallbackOrigin,
} from "../self-serve-internal-callback-transport/transport.ts";
import { assertPanelSessionCompletionApproval } from "./activation.ts";

const DIGEST = /^[a-f0-9]{64}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const ERROR_STATUS = new Map<PanelSessionCompletionFreshLoginCode, 400 | 409 | 503>([
  ["provider_rejected", 400],
  ["callback_replayed", 409],
  ["callback_not_granted", 409],
  ["handoff_rejected", 409],
  ["callback_unavailable", 503],
  ["handoff_unavailable", 503],
]);

export type PanelSessionCompletionFreshLoginCode =
  | "provider_rejected"
  | "callback_replayed"
  | "callback_not_granted"
  | "handoff_rejected"
  | "callback_unavailable"
  | "handoff_unavailable";

export type PanelSessionCompletionInternalResult = Readonly<
  | {
      schemaVersion: 1;
      kind: "session_handoff_ready";
      handoffCredential: string;
      handoffExpiresAt: string;
      redirectPath: "/";
    }
  | {
      schemaVersion: 1;
      kind: "fresh_login_required";
      code: PanelSessionCompletionFreshLoginCode;
      retryable: false;
    }
>;

type TransportAudit = (event: Readonly<{
  stage: "request" | "response_authentication" | "response_projection";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function invalid(): never {
  throw new Error("panel_session_completion_transport_invalid");
}

function unavailable(): never {
  throw new Error("panel_session_completion_transport_unavailable");
}

function auditSafely(audit: TransportAudit, event: Parameters<TransportAudit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function canonicalHandoffCredential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("h1.")) invalid();
  const separator = value.length - 44;
  if (separator <= 3 || value[separator] !== ".") invalid();
  const keyId = value.slice(3, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid();
}

function parseCanonicalResult(raw: string, status: number): PanelSessionCompletionInternalResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return invalid(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
  const body = parsed as Record<string, unknown>;
  let result: PanelSessionCompletionInternalResult;
  if (status === 200) {
    exactKeys(body, ["schemaVersion", "kind", "handoffCredential", "handoffExpiresAt", "redirectPath"]);
    if (body.schemaVersion !== 1 || body.kind !== "session_handoff_ready" || body.redirectPath !== "/") invalid();
    result = Object.freeze({
      schemaVersion: 1,
      kind: "session_handoff_ready",
      handoffCredential: canonicalHandoffCredential(body.handoffCredential),
      handoffExpiresAt: canonicalTimestamp(body.handoffExpiresAt),
      redirectPath: "/",
    });
  } else {
    exactKeys(body, ["schemaVersion", "kind", "code", "retryable"]);
    if (body.schemaVersion !== 1 || body.kind !== "fresh_login_required" || body.retryable !== false || typeof body.code !== "string") invalid();
    const expectedStatus = ERROR_STATUS.get(body.code as PanelSessionCompletionFreshLoginCode);
    if (!expectedStatus || expectedStatus !== status) invalid();
    result = Object.freeze({
      schemaVersion: 1,
      kind: "fresh_login_required",
      code: body.code as PanelSessionCompletionFreshLoginCode,
      retryable: false,
    });
  }
  if (JSON.stringify(result) !== raw) invalid();
  return result;
}

async function boundedBytes(response: Response, maximumBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) invalid();
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maximumBytes)) invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new Error("deadline"));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) invalid();
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (rejectAbort) signal.removeEventListener("abort", rejectAbort);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function canonicalSignature(value: string | null): Uint8Array {
  if (value === null || !/^[A-Za-z0-9_-]{43}$/.test(value)) invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) invalid();
  return bytes;
}

export function panelSessionHandoffResponseSignaturePreimage(input: {
  requestTimestamp: string;
  requestBodyDigest: string;
  status: number;
  responseBodyDigest: string;
}): string {
  if (
    !/^\d{13}$/.test(input.requestTimestamp) || !DIGEST.test(input.requestBodyDigest) ||
    ![200, 400, 409, 503].includes(input.status) || !DIGEST.test(input.responseBodyDigest)
  ) invalid();
  return [
    PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN,
    input.requestTimestamp,
    input.requestBodyDigest,
    String(input.status),
    input.responseBodyDigest,
  ].join("\n");
}

export function createAuthenticatedPanelSessionCompletionTransport(options: {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  activeKeyId: string;
  activeSecret: Uint8Array;
  fetch(request: Request): Promise<Response>;
  clock(): Date;
  deadlineMs: number;
  maximumResponseBytes: number;
  audit: TransportAudit;
}) {
  assertPanelSessionCompletionApproval(options?.activationApproval);
  const ownerOrigin = validateOwnerInternalCallbackOrigin(options.ownerInternalOrigin);
  if (!KEY_ID.test(options.activeKeyId)) invalid();
  if (!(options.activeSecret instanceof Uint8Array) || options.activeSecret.byteLength < 32 || options.activeSecret.byteLength > 64) invalid();
  if (
    typeof options.fetch !== "function" || typeof options.clock !== "function" || typeof options.audit !== "function" ||
    !Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 60_000 ||
    !Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1 ||
    options.maximumResponseBytes > PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES
  ) invalid();
  const endpoint = `${ownerOrigin}${SELF_SERVE_INTERNAL_CALLBACK_PATH}`;
  const keyId = options.activeKeyId;
  const secret = new Uint8Array(options.activeSecret);
  const fetch = options.fetch;
  const clock = options.clock;
  const deadlineMs = options.deadlineMs;
  const maximumResponseBytes = options.maximumResponseBytes;
  const audit = options.audit;

  return Object.freeze({
    async complete(callbackUrl: string): Promise<PanelSessionCompletionInternalResult> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      try {
        const callback = validateCustomerPanelCallbackUrl(callbackUrl, PANEL_OIDC_CALLBACK_URL, 16_384);
        const signed = await createAuthenticatedInternalCallbackRequest({
          endpoint,
          callbackUrl: callback.callbackUrl,
          activeKeyId: keyId,
          activeSecret: secret,
          clock,
        });
        const request = new Request(signed.request, { signal: controller.signal });
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, deadlineMs);
        });
        const response = await Promise.race([fetch(request), deadline]);
        if (
          !(response instanceof Response) || response.redirected || response.status >= 300 && response.status < 400 ||
          response.url !== endpoint || response.headers.get("content-type") !== "application/json; charset=utf-8" ||
          response.headers.get("cache-control") !== "no-store" || response.headers.has("set-cookie") || response.headers.has("location")
        ) invalid();
        const responseKeyId = response.headers.get("x-celebix-session-response-key-id");
        const responseTimestamp = response.headers.get("x-celebix-session-response-timestamp");
        if (responseKeyId !== signed.keyId || responseTimestamp !== signed.timestamp) invalid();
        const signature = canonicalSignature(response.headers.get("x-celebix-session-response-signature"));
        const rawBytes = await boundedBytes(response, maximumResponseBytes, controller.signal);
        const responseBodyDigest = createHash("sha256").update(rawBytes).digest("hex");
        const preimage = panelSessionHandoffResponseSignaturePreimage({
          requestTimestamp: signed.timestamp,
          requestBodyDigest: signed.requestBodyDigest,
          status: response.status,
          responseBodyDigest,
        });
        const expected = createHmac("sha256", secret).update(preimage, "utf8").digest();
        if (signature.byteLength !== expected.byteLength || !timingSafeEqual(signature, expected)) invalid();
        auditSafely(audit, { stage: "response_authentication", outcome: "completed" });
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
        const result = parseCanonicalResult(raw, response.status);
        auditSafely(audit, { stage: "response_projection", outcome: "completed" });
        return result;
      } catch {
        auditSafely(audit, { stage: "response_authentication", outcome: "rejected" });
        return unavailable();
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  });
}
