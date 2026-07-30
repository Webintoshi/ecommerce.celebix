import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN,
  PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
  PANEL_OIDC_CALLBACK_URL,
} from "../../../../packages/platform-config/src/saas.ts";
import { canonicalPanelBrowserBindingCredential } from "../panel-browser-binding/credential-codec.ts";
import { assertPanelBrowserBindingBootstrapApproval } from "./activation.ts";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const FAILURE_STATUS = new Map<string, number>([
  ["browser_binding_request_invalid", 400],
  ["browser_binding_unauthenticated", 401],
  ["browser_binding_expired", 409],
  ["browser_binding_conflict", 409],
  ["browser_binding_authority_invalid", 409],
  ["browser_binding_unavailable", 503],
]);

export type PanelBrowserBindingInternalResult = Readonly<
  | {
      schemaVersion: 1;
      kind: "browser_binding_ready";
      providerAuthorizationUrl: string;
      browserBindingExpiresAt: string;
    }
  | {
      schemaVersion: 1;
      kind: "browser_binding_rejected";
      code: string;
      retryable: false;
    }
>;

export type PanelReturningLoginInternalResult = Readonly<
  | {
      kind: "panel_login_ready";
      providerAuthorizationUrl: string;
      browserBindingExpiresAt: string;
    }
  | { kind: "panel_login_unavailable"; retryable: false }
>;

type Audit = (event: Readonly<{
  stage: "request" | "response_authentication" | "response_projection";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function invalid(): never { throw new Error("panel_browser_binding_transport_unavailable"); }

function exactOrigin(value: unknown): string {
  if (typeof value !== "string") invalid();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
        url.search || url.hash || url.origin !== value || url.hostname.includes("*")) invalid();
    return url.origin;
  } catch { return invalid(); }
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
  if (exactSingle(url.searchParams, "state", 1_024).length < 16 ||
      exactSingle(url.searchParams, "redirect_uri", 2_048) !== callbackAuthority ||
      exactSingle(url.searchParams, "response_type", 32) !== "code" ||
      exactSingle(url.searchParams, "response_mode", 32) !== "query") invalid();
  return value;
}

function trustedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return value;
}

function canonicalSignature(value: string | null): Uint8Array {
  if (value === null || !TOKEN.test(value)) invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) invalid();
  return bytes;
}

async function boundedBytes(response: Response, maximumBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) invalid();
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maximumBytes)) invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("deadline"));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
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
  } finally { if (abort) signal.removeEventListener("abort", abort); }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid();
}

function parseResult(
  raw: string,
  status: number,
  expectedProviderUrl: string,
  callbackAuthority: string,
  clock: () => Date,
): PanelBrowserBindingInternalResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return invalid(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
  const body = parsed as Record<string, unknown>;
  let result: PanelBrowserBindingInternalResult;
  if (status === 200) {
    exactKeys(body, ["schemaVersion", "kind", "providerAuthorizationUrl", "browserBindingExpiresAt"]);
    if (body.schemaVersion !== 1 || body.kind !== "browser_binding_ready") invalid();
    const providerAuthorizationUrl = canonicalProviderUrl(body.providerAuthorizationUrl, callbackAuthority);
    if (providerAuthorizationUrl !== expectedProviderUrl) invalid();
    const browserBindingExpiresAt = timestamp(body.browserBindingExpiresAt);
    const remaining = Date.parse(browserBindingExpiresAt) - trustedNow(clock).getTime();
    if (remaining < 1_000 || remaining > 15 * 60_000) invalid();
    result = Object.freeze({ schemaVersion: 1, kind: "browser_binding_ready", providerAuthorizationUrl, browserBindingExpiresAt });
  } else {
    exactKeys(body, ["schemaVersion", "kind", "code", "retryable"]);
    if (body.schemaVersion !== 1 || body.kind !== "browser_binding_rejected" || body.retryable !== false || typeof body.code !== "string") invalid();
    if (FAILURE_STATUS.get(body.code) !== status) invalid();
    result = Object.freeze({ schemaVersion: 1, kind: "browser_binding_rejected", code: body.code, retryable: false });
  }
  if (JSON.stringify(result) !== raw) invalid();
  return result;
}

function parseLoginResult(
  raw: string,
  status: number,
  callbackAuthority: string,
  clock: () => Date,
): PanelReturningLoginInternalResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return invalid(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid();
  const body = parsed as Record<string, unknown>;
  let result: PanelReturningLoginInternalResult;
  if (status === 200) {
    exactKeys(body, ["schemaVersion", "kind", "providerAuthorizationUrl", "browserBindingExpiresAt"]);
    if (body.schemaVersion !== 2 || body.kind !== "panel_login_ready") invalid();
    const providerAuthorizationUrl = canonicalProviderUrl(body.providerAuthorizationUrl, callbackAuthority);
    const browserBindingExpiresAt = timestamp(body.browserBindingExpiresAt);
    const remaining = Date.parse(browserBindingExpiresAt) - trustedNow(clock).getTime();
    if (remaining < 1_000 || remaining > 15 * 60_000) invalid();
    result = Object.freeze({ kind: "panel_login_ready", providerAuthorizationUrl, browserBindingExpiresAt });
  } else {
    exactKeys(body, ["schemaVersion", "kind", "code", "retryable"]);
    if (
      body.schemaVersion !== 2 || body.kind !== "panel_login_rejected" ||
      body.code !== "panel_login_unavailable" || body.retryable !== false || status !== 503
    ) invalid();
    result = Object.freeze({ kind: "panel_login_unavailable", retryable: false });
  }
  const canonical = result.kind === "panel_login_ready"
    ? { schemaVersion: 2, ...result }
    : { schemaVersion: 2, kind: "panel_login_rejected", code: result.kind, retryable: false };
  if (JSON.stringify(canonical) !== raw) invalid();
  return result;
}

function auditSafely(audit: Audit, event: Parameters<Audit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

export function createAuthenticatedPanelBrowserBindingTransport(options: {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  panelCallbackAuthority?: string;
  activeKeyId: string;
  activeSecret: Uint8Array;
  fetch(request: Request): Promise<Response>;
  clock(): Date;
  deadlineMs: number;
  maximumResponseBytes: number;
  audit: Audit;
}) {
  assertPanelBrowserBindingBootstrapApproval(options?.activationApproval);
  const ownerOrigin = exactOrigin(options.ownerInternalOrigin);
  const panelCallbackAuthority = options.panelCallbackAuthority ?? PANEL_OIDC_CALLBACK_URL;
  if (!KEY_ID.test(options.activeKeyId) || !(options.activeSecret instanceof Uint8Array) ||
      options.activeSecret.byteLength < 32 || options.activeSecret.byteLength > 64 ||
      typeof options.fetch !== "function" || typeof options.clock !== "function" || typeof options.audit !== "function" ||
      !Number.isSafeInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 60_000 ||
      !Number.isSafeInteger(options.maximumResponseBytes) || options.maximumResponseBytes < 1 || options.maximumResponseBytes > 16_384) invalid();
  trustedNow(options.clock);
  const endpoint = `${ownerOrigin}${PANEL_BROWSER_BINDING_INTERNAL_PATH}`;
  const keyId = options.activeKeyId;
  const secret = new Uint8Array(options.activeSecret);
  const fetch = options.fetch;
  const clock = options.clock;
  const deadlineMs = options.deadlineMs;
  const maximumResponseBytes = options.maximumResponseBytes;
  const audit = options.audit;

  async function exchange(body: string): Promise<{ raw: string; status: number }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const bodyBytes = new TextEncoder().encode(body);
      const requestBodyDigest = createHash("sha256").update(bodyBytes).digest("hex");
      if (!DIGEST.test(requestBodyDigest)) invalid();
      const requestTimestamp = String(trustedNow(clock).getTime());
      if (!/^\d{13}$/.test(requestTimestamp)) invalid();
      const signature = createHmac("sha256", secret)
        .update(`${PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN}\n${requestTimestamp}\n${requestBodyDigest}`, "utf8")
        .digest("base64url");
      const request = new Request(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-celebix-browser-bootstrap-key-id": keyId,
          "x-celebix-browser-bootstrap-timestamp": requestTimestamp,
          "x-celebix-browser-bootstrap-signature": signature,
        },
        body,
        redirect: "manual",
        credentials: "omit",
      });
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, deadlineMs);
      });
      const response = await Promise.race([fetch(new Request(request, { signal: controller.signal })), deadline]);
      if (!(response instanceof Response) || response.redirected || response.status >= 300 && response.status < 400 ||
          response.url !== endpoint || response.headers.get("content-type") !== "application/json; charset=utf-8" ||
          response.headers.get("cache-control") !== "no-store" || response.headers.has("set-cookie") || response.headers.has("location") ||
          ![200, 400, 401, 409, 503].includes(response.status)) invalid();
      if (response.headers.get("x-celebix-browser-bootstrap-response-key-id") !== keyId ||
          response.headers.get("x-celebix-browser-bootstrap-response-timestamp") !== requestTimestamp) invalid();
      const responseSignature = canonicalSignature(response.headers.get("x-celebix-browser-bootstrap-response-signature"));
      const rawBytes = await boundedBytes(response, maximumResponseBytes, controller.signal);
      const responseBodyDigest = createHash("sha256").update(rawBytes).digest("hex");
      const preimage = [
        PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
        requestTimestamp,
        requestBodyDigest,
        String(response.status),
        responseBodyDigest,
      ].join("\n");
      const expected = createHmac("sha256", secret).update(preimage, "utf8").digest();
      if (responseSignature.byteLength !== expected.byteLength || !timingSafeEqual(responseSignature, expected)) invalid();
      auditSafely(audit, { stage: "response_authentication", outcome: "completed" });
      return { raw: new TextDecoder("utf-8", { fatal: true }).decode(rawBytes), status: response.status };
    } catch {
      auditSafely(audit, { stage: "response_authentication", outcome: "rejected" });
      return invalid();
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }

  return Object.freeze({
    async bind(input: {
      bootstrapCredential: string;
      providerAuthorizationUrl: string;
      browserBindingCredential: string;
    }): Promise<PanelBrowserBindingInternalResult> {
      const providerAuthorizationUrl = canonicalProviderUrl(input.providerAuthorizationUrl, panelCallbackAuthority);
      const body = JSON.stringify({
        schemaVersion: 1,
        bootstrapCredential: canonicalBootstrapCredential(input?.bootstrapCredential),
        providerAuthorizationUrl,
        browserBindingCredential: canonicalPanelBrowserBindingCredential(input.browserBindingCredential),
      });
      const response = await exchange(body);
      const result = parseResult(response.raw, response.status, providerAuthorizationUrl, panelCallbackAuthority, clock);
      auditSafely(audit, { stage: "response_projection", outcome: "completed" });
      return result;
    },

    async start(input: { browserBindingCredential: string }): Promise<PanelReturningLoginInternalResult> {
      const body = JSON.stringify({
        schemaVersion: 2,
        browserBindingCredential: canonicalPanelBrowserBindingCredential(input?.browserBindingCredential),
      });
      const response = await exchange(body);
      const result = parseLoginResult(response.raw, response.status, panelCallbackAuthority, clock);
      auditSafely(audit, { stage: "response_projection", outcome: "completed" });
      return result;
    },
  });
}
