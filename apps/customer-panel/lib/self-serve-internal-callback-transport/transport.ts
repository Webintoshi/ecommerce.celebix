import { createHash, createHmac } from "node:crypto";

import {
  PANEL_OIDC_CALLBACK_URL,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
  SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION,
} from "../../../../packages/platform-config/src/saas.ts";
import { assertCustomerPanelCallbackEdgeApproval } from "../self-serve-callback-edge/edge.ts";
import { projectSafeCallbackResponse } from "../self-serve-callback-edge/safe-response.ts";

type TransportOptions = {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  activeKeyId: string;
  activeSecret: Uint8Array;
  fetch(request: Request): Promise<Response>;
  clock(): Date;
  deadlineMs: number;
  maximumResponseBytes: number;
  audit(event: Readonly<Record<string, string>>): void | Promise<void>;
};

function invalid(): never {
  throw new Error("owner_callback_transport_invalid");
}

export function validateOwnerInternalCallbackOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
      url.search || url.hash || url.origin !== value || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname) ||
      url.hostname.includes("*")
    ) invalid();
    return url.origin;
  } catch {
    return invalid();
  }
}

function auditSafely(audit: TransportOptions["audit"], event: Readonly<Record<string, string>>): void {
  try { void Promise.resolve(audit(Object.freeze(event))).catch(() => undefined); }
  catch { /* Auditing cannot affect transport control flow. */ }
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || !value || value !== value.trim() || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) invalid();
  return value;
}

function exactPublicCallbackUrl(callbackUrl: string): string {
  if (typeof callbackUrl !== "string" || callbackUrl.length < 1 || callbackUrl.length > 8_192) invalid();
  let url: URL;
  try { url = new URL(callbackUrl); }
  catch { return invalid(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    `${url.origin}${url.pathname}` !== PANEL_OIDC_CALLBACK_URL
  ) invalid();
  const marker = callbackUrl.indexOf("?");
  const rawQuery = marker < 0 ? "" : callbackUrl.slice(marker + 1);
  if (!rawQuery) invalid();
  for (const pair of rawQuery.split("&")) {
    if (!pair) invalid();
    const equals = pair.indexOf("=");
    for (const part of equals < 0 ? [pair] : [pair.slice(0, equals), pair.slice(equals + 1)]) {
      try { decodeURIComponent(part.replaceAll("+", " ")); }
      catch { return invalid(); }
    }
  }
  const search = new URLSearchParams(rawQuery);
  const names = [...search.keys()];
  if (names.some((name, index) => names.indexOf(name) !== index)) invalid();
  const hasCode = search.has("code");
  const hasError = search.has("error");
  if (hasCode === hasError) invalid();
  const allowed = hasError
    ? new Set(["state", "error", "error_description", "error_uri"])
    : new Set(["state", "code"]);
  if (names.some((name) => !allowed.has(name))) invalid();
  const state = exactSingle(search, "state", 1_024);
  if (state.length < 16) invalid();
  if (hasCode) exactSingle(search, "code", 4_096);
  else {
    exactSingle(search, "error", 256);
    if (search.has("error_description")) exactSingle(search, "error_description", 1_024);
    if (search.has("error_uri")) exactSingle(search, "error_uri", 1_024);
  }
  return callbackUrl;
}

export function canonicalInternalCallbackEnvelope(callbackUrl: string): string {
  return JSON.stringify({
    schemaVersion: SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION,
    callbackUrl: exactPublicCallbackUrl(callbackUrl),
  });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

export function internalCallbackSignaturePreimage(timestamp: string, digest: string): string {
  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(digest)) invalid();
  return `celebix-callback-v1\n${timestamp}\n${digest}`;
}

export type AuthenticatedInternalCallbackRequest = Readonly<{
  request: Request;
  keyId: string;
  timestamp: string;
  requestBodyDigest: string;
}>;

export async function createAuthenticatedInternalCallbackRequest(input: {
  endpoint: string;
  callbackUrl: string;
  activeKeyId: string;
  activeSecret: Uint8Array;
  clock(): Date;
}): Promise<AuthenticatedInternalCallbackRequest> {
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint); }
  catch { return invalid(); }
  if (
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash ||
    endpoint.pathname !== SELF_SERVE_INTERNAL_CALLBACK_PATH || endpoint.toString() !== input.endpoint
  ) invalid();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.activeKeyId)) invalid();
  if (!(input.activeSecret instanceof Uint8Array) || input.activeSecret.byteLength < 32 || input.activeSecret.byteLength > 64) invalid();
  if (typeof input.clock !== "function") invalid();
  const secret = new Uint8Array(input.activeSecret);
  const body = canonicalInternalCallbackEnvelope(input.callbackUrl);
  const bytes = new TextEncoder().encode(body);
  const now = input.clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  const timestamp = String(now.getTime());
  if (!/^\d{13}$/.test(timestamp)) invalid();
  const requestBodyDigest = await sha256Hex(bytes);
  const signature = createHmac("sha256", secret)
    .update(internalCallbackSignaturePreimage(timestamp, requestBodyDigest))
    .digest("base64url");
  const request = new Request(input.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-celebix-callback-key-id": input.activeKeyId,
      "x-celebix-callback-timestamp": timestamp,
      "x-celebix-callback-signature": signature,
    },
    body,
    redirect: "manual",
    credentials: "omit",
  });
  return Object.freeze({ request, keyId: input.activeKeyId, timestamp, requestBodyDigest });
}

export function createAuthenticatedOwnerCallbackTransport(options: TransportOptions) {
  assertCustomerPanelCallbackEdgeApproval(options?.activationApproval);
  const ownerOrigin = validateOwnerInternalCallbackOrigin(options.ownerInternalOrigin);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(options.activeKeyId)) invalid();
  if (!(options.activeSecret instanceof Uint8Array) || options.activeSecret.byteLength < 32 || options.activeSecret.byteLength > 64) invalid();
  if (
    typeof options.fetch !== "function" || typeof options.clock !== "function" || typeof options.audit !== "function" ||
    !Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 60_000 ||
    !Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1 || options.maximumResponseBytes > 65_536
  ) invalid();
  const keyId = options.activeKeyId;
  const secret = new Uint8Array(options.activeSecret);
  const endpoint = `${ownerOrigin}${SELF_SERVE_INTERNAL_CALLBACK_PATH}`;
  const injectedFetch = options.fetch;
  const clock = options.clock;
  const deadlineMs = options.deadlineMs;
  const maximumResponseBytes = options.maximumResponseBytes;
  const audit = options.audit;

  return Object.freeze({
    async forward(callbackUrl: string): Promise<Response> {
      const signed = await createAuthenticatedInternalCallbackRequest({
        endpoint,
        callbackUrl,
        activeKeyId: keyId,
        activeSecret: secret,
        clock,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      try {
        const request = new Request(signed.request, { signal: controller.signal });
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("deadline"));
          }, deadlineMs);
        });
        const response = await Promise.race([injectedFetch(request), deadline]);
        if (!(response instanceof Response) || response.redirected || response.status >= 300 && response.status < 400 || response.url !== endpoint) {
          throw new Error("invalid_response");
        }
        const projected = await projectSafeCallbackResponse(response, maximumResponseBytes);
        auditSafely(audit, { stage: "owner_transport", outcome: "completed" });
        return projected;
      } catch {
        auditSafely(audit, { stage: "owner_transport", outcome: "unknown" });
        throw new Error("owner_callback_transport_unavailable");
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  });
}
