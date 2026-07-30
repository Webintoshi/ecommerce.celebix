import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN,
  PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
  PANEL_OIDC_CALLBACK_URL,
} from "../../../../packages/platform-config/src/saas.ts";
import { createInternalHmacRequestAuthorityValidator } from "../self-serve-auth-authority/internal-request-authority.ts";
import type { PostgresPanelBrowserBindingRepository } from "./postgres-repository.ts";

const approvals = new WeakSet<object>();
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_TIMESTAMP_AGE_MS = 60_000;
const MAXIMUM_FUTURE_SKEW_MS = 5_000;

export type PanelBrowserBindingInternalGatewayApproval = Readonly<{
  purpose: "phase2b2b2a1_owner_browser_binding_gateway";
  environment: "disposable_test" | "approved_staging";
  defaultRoute: "disabled";
  browserResponse: "forbidden";
  providerNetworking: "forbidden";
}>;

type Audit = (event: Readonly<{
  stage: "request_validation" | "authentication" | "envelope" | "binding" | "response";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function invalid(): never { throw new Error("panel_browser_binding_internal_gateway_invalid"); }

export function createPanelBrowserBindingInternalGatewayApproval(
  environment: "disposable_test" | "approved_staging",
): PanelBrowserBindingInternalGatewayApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: PanelBrowserBindingInternalGatewayApproval = {
    purpose: "phase2b2b2a1_owner_browser_binding_gateway",
    environment,
    defaultRoute: "disabled",
    browserResponse: "forbidden",
    providerNetworking: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

function assertApproval(value: unknown): void {
  if (!value || typeof value !== "object" || !approvals.has(value) || !Object.isFrozen(value)) invalid();
}

function origin(value: unknown): string {
  if (typeof value !== "string") invalid();
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
      url.search || url.hash || url.origin !== value || url.hostname.includes("*")
    ) invalid();
    return url.origin;
  } catch { return invalid(); }
}

function copyKeys(value: unknown): ReadonlyMap<string, Uint8Array> {
  if (!(value instanceof Map) || value.size < 1 || value.size > 16) invalid();
  const copied = new Map<string, Uint8Array>();
  for (const [keyId, secret] of value) {
    if (typeof keyId !== "string" || !KEY_ID.test(keyId) || !(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 64) invalid();
    copied.set(keyId, new Uint8Array(secret));
  }
  return copied;
}

function trustedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function canonicalSignature(value: string | null): Uint8Array {
  if (value === null || !TOKEN.test(value)) throw new Error("unauthorized");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) throw new Error("unauthorized");
  return bytes;
}

function exactHeader(headers: Headers, name: string, pattern: RegExp): string {
  const value = headers.get(name);
  if (value === null || !pattern.test(value)) throw new Error("invalid_request");
  return value;
}

async function boundedBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  if (!request.body) throw new Error("invalid_request");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new Error("invalid_request");
  if (declared !== null && Number(declared) > maximumBytes) throw new Error("too_large");
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
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function canonicalBootstrapCredential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("bs1.")) invalid();
  const separator = value.length - 44;
  if (separator <= 4 || value[separator] !== ".") invalid();
  const keyId = value.slice(4, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function canonicalBindingCredential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("pb1.")) invalid();
  const token = value.slice(4);
  if (!TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (values.length !== 1 || !value || value.trim() !== value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}

function canonicalProviderUrl(value: unknown, callbackAuthority: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 16_384 || value.trim() !== value) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.toString() !== value) invalid();
  if (exactSingle(url.searchParams, "state", 1_024).length < 16) invalid();
  if (exactSingle(url.searchParams, "redirect_uri", 2_048) !== callbackAuthority ||
      exactSingle(url.searchParams, "response_type", 32) !== "code" ||
      exactSingle(url.searchParams, "response_mode", 32) !== "query") invalid();
  return value;
}

function parseEnvelope(bytes: Uint8Array, callbackAuthority: string): {
  schemaVersion: 1;
  bootstrapCredential: string;
  providerAuthorizationUrl: string;
  browserBindingCredential: string;
} | { schemaVersion: 3; browserBindingCredential: string; destinationHostname: string } {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
  const body = parsed as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.join(",") === "schemaVersion,browserBindingCredential,destinationHostname" && body.schemaVersion === 3) {
    if (typeof body.destinationHostname !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.admin(?:\.saas-staging)?\.celebix\.site$/.test(body.destinationHostname)) invalid();
    const envelope = {
      schemaVersion: 3 as const,
      browserBindingCredential: canonicalBindingCredential(body.browserBindingCredential),
      destinationHostname: body.destinationHostname,
    };
    if (JSON.stringify(envelope) !== raw) invalid();
    return Object.freeze(envelope);
  }
  if (keys.length !== 4 || keys.some((key, index) => key !== [
    "schemaVersion", "bootstrapCredential", "providerAuthorizationUrl", "browserBindingCredential",
  ][index]) || body.schemaVersion !== 1) invalid();
  const envelope = {
    schemaVersion: 1,
    bootstrapCredential: canonicalBootstrapCredential(body.bootstrapCredential),
    providerAuthorizationUrl: canonicalProviderUrl(body.providerAuthorizationUrl, callbackAuthority),
    browserBindingCredential: canonicalBindingCredential(body.browserBindingCredential),
  };
  if (JSON.stringify(envelope) !== raw) invalid();
  return Object.freeze({
    schemaVersion: 1 as const,
    bootstrapCredential: envelope.bootstrapCredential,
    providerAuthorizationUrl: envelope.providerAuthorizationUrl,
    browserBindingCredential: envelope.browserBindingCredential,
  });
}

function auditSafely(audit: Audit, event: Parameters<Audit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function unsignedFailure(status: number): Response {
  return new Response('{"schemaVersion":1,"kind":"browser_binding_rejected","code":"browser_binding_request_invalid","retryable":false}', {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function signedResponse(input: {
  status: number;
  body: Record<string, unknown>;
  keyId: string;
  timestamp: string;
  requestBodyDigest: string;
  secret: Uint8Array;
}): Response {
  const body = JSON.stringify(input.body);
  const responseBodyDigest = createHash("sha256").update(body, "utf8").digest("hex");
  const preimage = [
    PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
    input.timestamp,
    input.requestBodyDigest,
    String(input.status),
    responseBodyDigest,
  ].join("\n");
  const signature = createHmac("sha256", input.secret).update(preimage, "utf8").digest("base64url");
  return new Response(body, {
    status: input.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-celebix-browser-bootstrap-response-key-id": input.keyId,
      "x-celebix-browser-bootstrap-response-timestamp": input.timestamp,
      "x-celebix-browser-bootstrap-response-signature": signature,
    },
  });
}

export function createOwnerPanelBrowserBindingInternalGateway(options: {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  panelCallbackAuthority?: string;
  keys: ReadonlyMap<string, Uint8Array>;
  clock(): Date;
  maximumBodyBytes: number;
  repository: Pick<PostgresPanelBrowserBindingRepository, "bindBrowserCredential">;
  returningLogin?: { start(browserBindingCredential: string, destinationHostname: string): Promise<Readonly<
    | { kind: "panel_login_ready"; providerAuthorizationUrl: string; browserBindingExpiresAt: string }
    | { kind: "panel_login_unavailable"; retryable: false }
  >> };
  audit: Audit;
}) {
  assertApproval(options?.activationApproval);
  origin(options.ownerInternalOrigin);
  const panelCallbackAuthority = options.panelCallbackAuthority ?? PANEL_OIDC_CALLBACK_URL;
  try {
    const callback = new URL(panelCallbackAuthority);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.port ||
        callback.pathname !== "/auth/callback" || callback.search || callback.hash ||
        `${callback.origin}${callback.pathname}` !== panelCallbackAuthority) invalid();
  } catch { return invalid(); }
  const keys = copyKeys(options.keys);
  if (!Number.isSafeInteger(options.maximumBodyBytes) || options.maximumBodyBytes < 1 || options.maximumBodyBytes > 16_384 ||
      typeof options.clock !== "function" || !options.repository || typeof options.repository.bindBrowserCredential !== "function" ||
      typeof options.audit !== "function") invalid();
  trustedNow(options.clock);
  const requestAuthority = createInternalHmacRequestAuthorityValidator({
    pathname: PANEL_BROWSER_BINDING_INTERNAL_PATH,
  });
  const maximumBodyBytes = options.maximumBodyBytes;
  const clock = options.clock;
  const bindBrowserCredential = options.repository.bindBrowserCredential.bind(options.repository);
  const audit = options.audit;

  return async function ownerPanelBrowserBindingInternalGateway(request: Request): Promise<Response> {
    let keyId: string;
    let timestamp: string;
    let signature: Uint8Array;
    let bytes: Uint8Array;
    let requestBodyDigest: string;
    let secret: Uint8Array;
    try {
      const authorityDecision = requestAuthority.validate(request);
      if (authorityDecision === "method_not_allowed") throw new Error("method");
      if (authorityDecision !== "approved") throw new Error("request");
      if (request.headers.get("content-type") !== "application/json; charset=utf-8" || request.headers.has("authorization") || request.headers.has("cookie")) throw new Error("request");
      for (const name of request.headers.keys()) {
        if (name.startsWith("x-celebix-") && ![
          "x-celebix-browser-bootstrap-key-id", "x-celebix-browser-bootstrap-timestamp", "x-celebix-browser-bootstrap-signature",
        ].includes(name)) throw new Error("request");
      }
      keyId = exactHeader(request.headers, "x-celebix-browser-bootstrap-key-id", KEY_ID);
      timestamp = exactHeader(request.headers, "x-celebix-browser-bootstrap-timestamp", /^\d{13}$/);
      signature = canonicalSignature(request.headers.get("x-celebix-browser-bootstrap-signature"));
      const timestampNumber = Number(timestamp);
      const current = trustedNow(clock).getTime();
      if (current - timestampNumber > MAXIMUM_TIMESTAMP_AGE_MS || timestampNumber - current > MAXIMUM_FUTURE_SKEW_MS) throw new Error("unauthorized");
      bytes = await boundedBytes(request, maximumBodyBytes);
      requestBodyDigest = createHash("sha256").update(bytes).digest("hex");
      const resolved = keys.get(keyId);
      if (!resolved) throw new Error("unauthorized");
      secret = resolved;
      const expected = createHmac("sha256", secret)
        .update(`${PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN}\n${timestamp}\n${requestBodyDigest}`, "utf8")
        .digest();
      if (signature.byteLength !== expected.byteLength || !timingSafeEqual(signature, expected)) throw new Error("unauthorized");
      auditSafely(audit, { stage: "authentication", outcome: "completed" });
    } catch (error) {
      auditSafely(audit, { stage: "authentication", outcome: "rejected" });
      const status = error instanceof Error && error.message === "method" ? 405 :
        error instanceof Error && error.message === "too_large" ? 413 :
        error instanceof Error && error.message === "unauthorized" ? 401 : 400;
      return unsignedFailure(status);
    }

    let envelope: ReturnType<typeof parseEnvelope>;
    try { envelope = parseEnvelope(bytes, panelCallbackAuthority); }
    catch {
      auditSafely(audit, { stage: "envelope", outcome: "rejected" });
      return signedResponse({
        status: 400,
        body: { schemaVersion: 1, kind: "browser_binding_rejected", code: "browser_binding_request_invalid", retryable: false },
        keyId, timestamp, requestBodyDigest, secret,
      });
    }

    if (envelope.schemaVersion === 3) {
      if (!options.returningLogin || typeof options.returningLogin.start !== "function") {
        return signedResponse({
          status: 503,
          body: { schemaVersion: 2, kind: "panel_login_rejected", code: "panel_login_unavailable", retryable: false },
          keyId, timestamp, requestBodyDigest, secret,
        });
      }
      try {
        const result = await options.returningLogin.start(envelope.browserBindingCredential, envelope.destinationHostname);
        if (result.kind !== "panel_login_ready") throw new Error("unavailable");
        const providerAuthorizationUrl = canonicalProviderUrl(result.providerAuthorizationUrl, panelCallbackAuthority);
        const expires = new Date(result.browserBindingExpiresAt);
        const current = trustedNow(clock).getTime();
        if (!Number.isFinite(expires.getTime()) || expires.toISOString() !== result.browserBindingExpiresAt || expires.getTime() <= current || expires.getTime() > current + 15 * 60_000) invalid();
        return signedResponse({
          status: 200,
          body: { schemaVersion: 2, kind: "panel_login_ready", providerAuthorizationUrl, browserBindingExpiresAt: result.browserBindingExpiresAt },
          keyId, timestamp, requestBodyDigest, secret,
        });
      } catch {
        return signedResponse({
          status: 503,
          body: { schemaVersion: 2, kind: "panel_login_rejected", code: "panel_login_unavailable", retryable: false },
          keyId, timestamp, requestBodyDigest, secret,
        });
      }
    }

    let result;
    try {
      const at = trustedNow(clock);
      result = await bindBrowserCredential({
        bootstrapCredential: envelope.bootstrapCredential,
        providerAuthorizationUrl: envelope.providerAuthorizationUrl,
        browserBindingCredential: envelope.browserBindingCredential,
        now: at,
        expiresAt: new Date(at.getTime() + 15 * 60_000),
      });
    } catch {
      result = { kind: "unavailable" as const };
    }

    if (result.kind === "browser_binding_created" || result.kind === "browser_binding_replayed") {
      if (result.providerAuthorizationUrl !== envelope.providerAuthorizationUrl) {
        result = { kind: "durable_authority_invalid" as const };
      } else {
        auditSafely(audit, { stage: "binding", outcome: "completed" });
        return signedResponse({
          status: 200,
          body: {
            schemaVersion: 1,
            kind: "browser_binding_ready",
            providerAuthorizationUrl: result.providerAuthorizationUrl,
            browserBindingExpiresAt: result.expiresAt,
          },
          keyId, timestamp, requestBodyDigest, secret,
        });
      }
    }

    const mapping: Record<string, { status: 400 | 401 | 409 | 503; code: string }> = {
      unauthenticated: { status: 401, code: "browser_binding_unauthenticated" },
      expired: { status: 409, code: "browser_binding_expired" },
      operation_mismatch: { status: 409, code: "browser_binding_conflict" },
      durable_authority_invalid: { status: 409, code: "browser_binding_authority_invalid" },
      commit_unknown: { status: 503, code: "browser_binding_unavailable" },
      unavailable: { status: 503, code: "browser_binding_unavailable" },
    };
    const failure = mapping[result.kind] ?? mapping.durable_authority_invalid;
    auditSafely(audit, { stage: "binding", outcome: failure.status === 503 ? "unavailable" : "rejected" });
    return signedResponse({
      status: failure.status,
      body: { schemaVersion: 1, kind: "browser_binding_rejected", code: failure.code, retryable: false },
      keyId, timestamp, requestBodyDigest, secret,
    });
  };
}
