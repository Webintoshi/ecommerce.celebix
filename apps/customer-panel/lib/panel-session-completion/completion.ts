import { PANEL_HOME_URL } from "../../../../packages/platform-config/src/saas.ts";
import {
  validateBrowserBoundPanelCompletionRequest,
  validateCustomerPanelCallbackAuthority,
} from "../self-serve-callback-edge/callback-request.ts";
import { PANEL_BROWSER_BINDING_DELETION_COOKIE } from "../panel-browser-binding/cookie.ts";
import { assertPanelSessionCompletionApproval } from "./activation.ts";
import { serializePersistentPanelSessionCookie } from "./cookie.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_SESSION_MS = 8 * 60 * 60_000;
const MAXIMUM_HANDOFF_MS = 10 * 60_000;

type CompletionAudit = (event: Readonly<{
  stage: "callback" | "transport" | "redemption" | "browser_response";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

type PublicFailureCode =
  | "panel_session_fresh_login_required"
  | "panel_session_provider_rejected"
  | "panel_session_transport_unavailable"
  | "panel_session_redemption_failed"
  | "panel_session_callback_invalid";

function invalid(): never {
  throw new Error("panel_session_completion_invalid");
}

function auditSafely(audit: CompletionAudit, event: Parameters<CompletionAudit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function now(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function failure(code: PublicFailureCode, status: 400 | 409 | 503): Response {
  return new Response(JSON.stringify({ code, retryable: false, freshLoginRequired: true }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "set-cookie": PANEL_BROWSER_BINDING_DELETION_COOKIE,
    },
  });
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  const actual = Object.keys(row);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) invalid();
  return row;
}

function credential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("v1.")) invalid();
  const separator = value.length - 44;
  if (separator <= 3 || value[separator] !== ".") invalid();
  const keyId = value.slice(3, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function handoffCredential(value: unknown): string {
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

function timestamp(value: unknown): { iso: string; milliseconds: number } {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return { iso: value, milliseconds };
}

function successfulRedemption(value: unknown, trustedNow: Date): { credential: string; issuedAt: string; expiresAt: string } {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) invalid();
  const result = exact(value, ["kind", "credential", "session"]);
  if (result.kind !== "session_issued" && result.kind !== "session_replayed") invalid();
  if (!result.session || typeof result.session !== "object" || !Object.isFrozen(result.session)) invalid();
  const session = exact(result.session, [
    "sessionId", "familyId", "principalId", "activeStoreId", "version", "issuedAt", "rotatedAt", "expiresAt",
  ]);
  for (const key of ["sessionId", "familyId", "principalId", "activeStoreId"] as const) {
    if (typeof session[key] !== "string" || !UUID.test(session[key] as string)) invalid();
  }
  if (!Number.isSafeInteger(session.version) || Number(session.version) < 1) invalid();
  const issuedAt = timestamp(session.issuedAt);
  const rotatedAt = timestamp(session.rotatedAt);
  const expiresAt = timestamp(session.expiresAt);
  if (
    issuedAt.milliseconds > trustedNow.getTime() || issuedAt.milliseconds > rotatedAt.milliseconds ||
    rotatedAt.milliseconds >= expiresAt.milliseconds || expiresAt.milliseconds <= trustedNow.getTime() ||
    expiresAt.milliseconds > issuedAt.milliseconds + MAXIMUM_SESSION_MS
  ) invalid();
  return { credential: credential(result.credential), issuedAt: issuedAt.iso, expiresAt: expiresAt.iso };
}

function internalResult(value: unknown, clock: () => Date): Record<string, unknown> {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) invalid();
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1) invalid();
  if (row.kind === "session_handoff_ready") {
    exact(row, ["schemaVersion", "kind", "handoffCredential", "handoffExpiresAt", "redirectPath"]);
    if (row.redirectPath !== "/") invalid();
    handoffCredential(row.handoffCredential);
    const trustedNow = now(clock).getTime();
    const expiresAt = timestamp(row.handoffExpiresAt).milliseconds;
    if (expiresAt <= trustedNow || expiresAt > trustedNow + MAXIMUM_HANDOFF_MS) invalid();
    return row;
  }
  exact(row, ["schemaVersion", "kind", "code", "retryable"]);
  if (row.kind !== "fresh_login_required" || row.retryable !== false || typeof row.code !== "string") invalid();
  return row;
}

export function createPanelSessionCompletionHandler(options: {
  activationApproval: unknown;
  publicCallbackAuthority: string;
  panelHomeAuthority?: string;
  maximumQueryBytes: number;
  transport: { complete(callbackUrl: string, browserBindingCredential: string): Promise<unknown> };
  redeemer: {
    redeemHandoff(input: { credential: string }): Promise<unknown>;
    recoverRedemption(input: { credential: string }): Promise<unknown>;
  };
  clock(): Date;
  audit: CompletionAudit;
}) {
  assertPanelSessionCompletionApproval(options?.activationApproval);
  let authority: string;
  try { authority = validateCustomerPanelCallbackAuthority(options.publicCallbackAuthority); }
  catch { return invalid(); }
  const panelHomeAuthority = options.panelHomeAuthority ?? PANEL_HOME_URL;
  try {
    const home = new URL(panelHomeAuthority);
    if (home.protocol !== "https:" || home.username || home.password || home.port ||
        home.pathname !== "/" || home.search || home.hash || home.toString() !== panelHomeAuthority ||
        home.origin !== new URL(authority).origin) invalid();
  } catch { return invalid(); }
  if (!Number.isSafeInteger(options.maximumQueryBytes) || options.maximumQueryBytes < 1 || options.maximumQueryBytes > 16_384) invalid();
  if (
    !options.transport || typeof options.transport.complete !== "function" || !options.redeemer ||
    typeof options.redeemer.redeemHandoff !== "function" || typeof options.redeemer.recoverRedemption !== "function" ||
    typeof options.clock !== "function" || typeof options.audit !== "function"
  ) invalid();
  now(options.clock);
  const maximumQueryBytes = options.maximumQueryBytes;
  const transport = options.transport;
  const redeemer = options.redeemer;
  const clock = options.clock;
  const audit = options.audit;

  return async function panelSessionCompletionHandler(request: Request): Promise<Response> {
    let callback;
    try { callback = validateBrowserBoundPanelCompletionRequest(request, authority, maximumQueryBytes); }
    catch {
      auditSafely(audit, { stage: "callback", outcome: "rejected" });
      return failure("panel_session_callback_invalid", 400);
    }

    let result: Record<string, unknown>;
    try {
      result = internalResult(await transport.complete(
        callback.callbackUrl,
        callback.browserBindingCredential,
      ), clock);
    }
    catch {
      auditSafely(audit, { stage: "transport", outcome: "unavailable" });
      return failure("panel_session_transport_unavailable", 503);
    }
    if (callback.kind === "provider_error") {
      auditSafely(audit, { stage: "callback", outcome: "rejected" });
      return failure("panel_session_provider_rejected", 400);
    }
    if (result.kind === "fresh_login_required") {
      auditSafely(audit, { stage: "callback", outcome: "rejected" });
      return result.code === "provider_rejected"
        ? failure("panel_session_provider_rejected", 400)
        : failure("panel_session_fresh_login_required", 409);
    }

    const handoffCredential = String(result.handoffCredential);
    let redeemed: unknown;
    try {
      redeemed = await redeemer.redeemHandoff({ credential: handoffCredential });
      if (redeemed && typeof redeemed === "object" && (redeemed as Record<string, unknown>).kind === "commit_unknown") {
        redeemed = await redeemer.recoverRedemption({ credential: handoffCredential });
      }
      const trustedNow = now(clock);
      const session = successfulRedemption(redeemed, trustedNow);
      const cookie = serializePersistentPanelSessionCookie({
        credential: session.credential,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        now: trustedNow,
      });
      auditSafely(audit, { stage: "redemption", outcome: "completed" });
      const headers = new Headers({
        location: panelHomeAuthority,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
      headers.append("set-cookie", cookie);
      headers.append("set-cookie", PANEL_BROWSER_BINDING_DELETION_COOKIE);
      const response = new Response(null, {
        status: 303,
        headers,
      });
      auditSafely(audit, { stage: "browser_response", outcome: "completed" });
      return response;
    } catch {
      auditSafely(audit, { stage: "redemption", outcome: "rejected" });
      return failure("panel_session_redemption_failed", 409);
    }
  };
}
