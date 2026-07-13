import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  PANEL_OIDC_CALLBACK_URL,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
  SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION,
} from "../../../../packages/platform-config/src/saas.ts";

import { ownerInternalCallbackJson, projectOwnerInternalCallbackResponse } from "./internal-callback-response.ts";
import {
  assertVerifiedEdgeTrustBoundary,
  type VerifiedEdgeTrustBoundary,
} from "./verified-edge-trust.ts";

const approvals = new WeakSet<object>();
const MAXIMUM_TIMESTAMP_AGE_MS = 60_000;
const MAXIMUM_FUTURE_SKEW_MS = 5_000;
const SUCCESS_PARAMETERS = new Set(["state", "code"]);
const ERROR_PARAMETERS = new Set(["state", "error", "error_description", "error_uri"]);

export type OwnerInternalCallbackGatewayApproval = Readonly<{
  purpose: "phase2b1b2b_owner_internal_callback_gateway";
  environment: "disposable_test" | "approved_staging";
  publicActivation: "disabled_default_route";
  transport: "authenticated_injected_only";
  sessions: "forbidden";
  providerNetworking: "forbidden";
}>;

type GatewayOptions = {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  keys: ReadonlyMap<string, Uint8Array>;
  clock(): Date;
  maximumBodyBytes: number;
  maximumResponseBytes: number;
  edgeTrustBoundary: VerifiedEdgeTrustBoundary;
  callbackHandler(request: Request, edgeTrustContext: unknown): Promise<Response>;
  audit(event: Readonly<Record<string, string>>): void | Promise<void>;
};

function invalid(): never {
  throw new Error("owner_internal_callback_gateway_invalid");
}

export function createOwnerInternalCallbackGatewayApproval(
  environment: "disposable_test" | "approved_staging",
): OwnerInternalCallbackGatewayApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: OwnerInternalCallbackGatewayApproval = {
    purpose: "phase2b1b2b_owner_internal_callback_gateway",
    environment,
    publicActivation: "disabled_default_route",
    transport: "authenticated_injected_only",
    sessions: "forbidden",
    providerNetworking: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

function assertApproval(value: unknown): asserts value is OwnerInternalCallbackGatewayApproval {
  if (!value || typeof value !== "object" || !approvals.has(value)) invalid();
}

function exactOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
      url.search || url.hash || url.origin !== value || url.hostname.includes("*") ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname)
    ) invalid();
    return url.origin;
  } catch {
    return invalid();
  }
}

function bounded(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) invalid();
  return value;
}

function auditSafely(audit: GatewayOptions["audit"], event: Readonly<Record<string, string>>): void {
  try { void Promise.resolve(audit(Object.freeze(event))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function response(code: string, status: number): Response {
  return ownerInternalCallbackJson({ code }, status);
}

function exactHeader(headers: Headers, name: string, pattern: RegExp): string {
  const value = headers.get(name);
  if (value === null || !pattern.test(value)) throw new Error("unauthorized");
  return value;
}

function canonicalSignatureBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("unauthorized");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) throw new Error("unauthorized");
  return bytes;
}

async function boundedRequestBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (!request.body) throw new Error("invalid_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error("too_large");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function validateRawQuery(rawQuery: string): URLSearchParams {
  if (!rawQuery) throw new Error("invalid_callback");
  for (const pair of rawQuery.split("&")) {
    if (!pair) throw new Error("invalid_callback");
    const equals = pair.indexOf("=");
    for (const part of equals < 0 ? [pair] : [pair.slice(0, equals), pair.slice(equals + 1)]) {
      decodeURIComponent(part.replaceAll("+", " "));
    }
  }
  return new URLSearchParams(rawQuery);
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || !value || value !== value.trim() || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error("invalid_callback");
  return value;
}

function exactCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 8_192) throw new Error("invalid_callback");
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    `${url.origin}${url.pathname}` !== PANEL_OIDC_CALLBACK_URL
  ) throw new Error("invalid_callback");
  const marker = value.indexOf("?");
  const rawQuery = marker < 0 ? "" : value.slice(marker + 1);
  const search = validateRawQuery(rawQuery);
  const names = [...search.keys()];
  if (names.some((name, index) => names.indexOf(name) !== index)) throw new Error("invalid_callback");
  const hasCode = search.has("code");
  const hasError = search.has("error");
  if (hasCode === hasError) throw new Error("invalid_callback");
  const allowed = hasError ? ERROR_PARAMETERS : SUCCESS_PARAMETERS;
  if (names.some((name) => !allowed.has(name))) throw new Error("invalid_callback");
  const state = exactSingle(search, "state", 1_024);
  if (state.length < 16) throw new Error("invalid_callback");
  if (hasCode) exactSingle(search, "code", 4_096);
  else {
    exactSingle(search, "error", 256);
    if (search.has("error_description")) exactSingle(search, "error_description", 1_024);
    if (search.has("error_uri")) exactSingle(search, "error_uri", 1_024);
  }
  return value;
}

function parseCanonicalEnvelope(bytes: Uint8Array): string {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_envelope");
  const object = parsed as Record<string, unknown>;
  if (
    Object.keys(object).length !== 2 || object.schemaVersion !== SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION ||
    typeof object.callbackUrl !== "string"
  ) throw new Error("invalid_envelope");
  const callbackUrl = exactCallbackUrl(object.callbackUrl);
  const canonical = JSON.stringify({ schemaVersion: SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION, callbackUrl });
  if (raw !== canonical) throw new Error("invalid_envelope");
  return callbackUrl;
}

export function createDisabledOwnerInternalSelfServeCallbackGateway() {
  return async function disabledOwnerInternalSelfServeCallbackGateway(request: Request): Promise<Response> {
    return request.method === "POST"
      ? response("self_serve_internal_callback_disabled", 503)
      : response("self_serve_internal_callback_method_not_allowed", 405);
  };
}

export function createOwnerInternalSelfServeCallbackGateway(options: GatewayOptions) {
  assertApproval(options?.activationApproval);
  const origin = exactOrigin(options.ownerInternalOrigin);
  const maximumBodyBytes = bounded(options.maximumBodyBytes, 65_536);
  const maximumResponseBytes = bounded(options.maximumResponseBytes, 65_536);
  assertVerifiedEdgeTrustBoundary(options.edgeTrustBoundary);
  if (
    !(options.keys instanceof Map) || options.keys.size < 1 || options.keys.size > 16 || typeof options.clock !== "function" ||
    typeof options.callbackHandler !== "function" || typeof options.audit !== "function"
  ) invalid();
  const keys = new Map<string, Uint8Array>();
  for (const [keyId, secret] of options.keys) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || !(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 64) invalid();
    keys.set(keyId, new Uint8Array(secret));
  }
  const endpoint = `${origin}${SELF_SERVE_INTERNAL_CALLBACK_PATH}`;
  const clock = options.clock;
  const boundary = options.edgeTrustBoundary;
  const callbackHandler = options.callbackHandler;
  const audit = options.audit;

  return async function ownerInternalSelfServeCallbackGateway(request: Request): Promise<Response> {
    let keyId: string;
    let timestampRaw: string;
    let signatureBytes: Uint8Array;
    let timestamp: number;
    try {
      if (request.method !== "POST") return response("self_serve_internal_callback_method_not_allowed", 405);
      const url = new URL(request.url);
      if (url.toString() !== endpoint || url.origin !== origin || url.pathname !== SELF_SERVE_INTERNAL_CALLBACK_PATH || url.search || url.hash) {
        throw new Error("invalid_request");
      }
      if (request.headers.get("content-type") !== "application/json; charset=utf-8") throw new Error("invalid_request");
      keyId = exactHeader(request.headers, "x-celebix-callback-key-id", /^[A-Za-z0-9._-]{1,64}$/);
      timestampRaw = exactHeader(request.headers, "x-celebix-callback-timestamp", /^\d+$/);
      signatureBytes = canonicalSignatureBytes(exactHeader(request.headers, "x-celebix-callback-signature", /^[A-Za-z0-9_-]+$/));
      timestamp = Number(timestampRaw);
      const now = clock();
      if (
        !Number.isSafeInteger(timestamp) || String(timestamp) !== timestampRaw || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
        now.getTime() - timestamp > MAXIMUM_TIMESTAMP_AGE_MS || timestamp - now.getTime() > MAXIMUM_FUTURE_SKEW_MS
      ) throw new Error("unauthorized");
      const declared = request.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new Error("invalid_request");
      if (declared !== null && Number(declared) > maximumBodyBytes) throw new Error("too_large");
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_request";
      const status = code === "too_large" ? 413 : code === "unauthorized" ? 401 : 400;
      auditSafely(audit, { stage: "request_validation", outcome: "rejected" });
      return response(status === 401 ? "self_serve_internal_callback_untrusted" : "self_serve_internal_callback_invalid", status);
    }

    let rawBytes: Uint8Array;
    try { rawBytes = await boundedRequestBytes(request, maximumBodyBytes); }
    catch (error) {
      const status = error instanceof Error && error.message === "too_large" ? 413 : 400;
      auditSafely(audit, { stage: "body_read", outcome: "rejected" });
      return response("self_serve_internal_callback_invalid", status);
    }

    const digest = createHash("sha256").update(rawBytes).digest("hex");
    const secret = keys.get(keyId);
    if (!secret) {
      auditSafely(audit, { stage: "authentication", outcome: "rejected" });
      return response("self_serve_internal_callback_untrusted", 401);
    }
    const expected = createHmac("sha256", secret)
      .update(`celebix-callback-v1\n${timestampRaw}\n${digest}`)
      .digest();
    if (signatureBytes.byteLength !== expected.byteLength || !timingSafeEqual(signatureBytes, expected)) {
      auditSafely(audit, { stage: "authentication", outcome: "rejected" });
      return response("self_serve_internal_callback_untrusted", 401);
    }

    let callbackUrl: string;
    try { callbackUrl = parseCanonicalEnvelope(rawBytes); }
    catch {
      auditSafely(audit, { stage: "envelope_validation", outcome: "rejected" });
      return response("self_serve_internal_callback_invalid", 400);
    }

    try {
      const projected = await boundary.invokeWithVerifiedContext(async (context) => {
        const callbackRequest = new Request(callbackUrl, { method: "GET" });
        const callbackResponse = await callbackHandler(callbackRequest, context);
        return projectOwnerInternalCallbackResponse(callbackResponse, maximumResponseBytes);
      });
      auditSafely(audit, { stage: "callback", outcome: "completed" });
      return projected;
    } catch {
      auditSafely(audit, { stage: "callback", outcome: "failed" });
      return response("self_serve_internal_callback_unavailable", 503);
    }
  };
}
