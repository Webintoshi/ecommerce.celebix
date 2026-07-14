import { createHash } from "node:crypto";

import {
  PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES,
  PANEL_SESSION_COMPLETION_SCHEMA_VERSION,
  PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN,
} from "../../../../packages/platform-config/src/saas.ts";
import {
  signWithAuthenticatedInternalCallbackRequest,
  type AuthenticatedOwnerInternalCallbackRequest,
} from "../self-serve-http/internal-callback-gateway.ts";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ERROR_STATUS = new Map<OwnerPanelSessionFreshLoginCode, 400 | 409 | 503>([
  ["provider_rejected", 400],
  ["callback_replayed", 409],
  ["callback_not_granted", 409],
  ["handoff_rejected", 409],
  ["callback_unavailable", 503],
  ["handoff_unavailable", 503],
]);

export type OwnerPanelSessionFreshLoginCode =
  | "provider_rejected"
  | "callback_replayed"
  | "callback_not_granted"
  | "handoff_rejected"
  | "callback_unavailable"
  | "handoff_unavailable";

export type OwnerPanelSessionHandoffInternalResult = Readonly<
  | {
      status: 200;
      body: Readonly<{
        schemaVersion: 1;
        kind: "session_handoff_ready";
        handoffCredential: string;
        handoffExpiresAt: string;
        redirectPath: "/";
      }>;
    }
  | {
      status: 400 | 409 | 503;
      body: Readonly<{
        schemaVersion: 1;
        kind: "fresh_login_required";
        code: OwnerPanelSessionFreshLoginCode;
        retryable: false;
      }>;
    }
>;

function invalid(): never {
  throw new Error("owner_panel_session_handoff_response_invalid");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid();
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

export function createSessionHandoffReadyResult(
  handoffCredential: string,
  handoffExpiresAt: string,
): OwnerPanelSessionHandoffInternalResult {
  const body = Object.freeze({
    schemaVersion: PANEL_SESSION_COMPLETION_SCHEMA_VERSION,
    kind: "session_handoff_ready" as const,
    handoffCredential: canonicalHandoffCredential(handoffCredential),
    handoffExpiresAt: canonicalTimestamp(handoffExpiresAt),
    redirectPath: "/" as const,
  });
  return Object.freeze({ status: 200 as const, body });
}

export function createFreshLoginRequiredResult(
  code: OwnerPanelSessionFreshLoginCode,
): OwnerPanelSessionHandoffInternalResult {
  const status = ERROR_STATUS.get(code);
  if (!status) invalid();
  const body = Object.freeze({
    schemaVersion: PANEL_SESSION_COMPLETION_SCHEMA_VERSION,
    kind: "fresh_login_required" as const,
    code,
    retryable: false as const,
  });
  return Object.freeze({ status, body });
}

export function canonicalOwnerPanelSessionHandoffResult(
  result: OwnerPanelSessionHandoffInternalResult,
): string {
  if (!result || typeof result !== "object" || !result.body || typeof result.body !== "object") invalid();
  const body = result.body as unknown as Record<string, unknown>;
  let canonical: string;
  if (result.status === 200) {
    exactKeys(body, ["schemaVersion", "kind", "handoffCredential", "handoffExpiresAt", "redirectPath"]);
    if (body.schemaVersion !== 1 || body.kind !== "session_handoff_ready" || body.redirectPath !== "/") invalid();
    canonical = JSON.stringify({
      schemaVersion: 1,
      kind: "session_handoff_ready",
      handoffCredential: canonicalHandoffCredential(body.handoffCredential),
      handoffExpiresAt: canonicalTimestamp(body.handoffExpiresAt),
      redirectPath: "/",
    });
  } else {
    exactKeys(body, ["schemaVersion", "kind", "code", "retryable"]);
    if (body.schemaVersion !== 1 || body.kind !== "fresh_login_required" || body.retryable !== false || typeof body.code !== "string") invalid();
    const status = ERROR_STATUS.get(body.code as OwnerPanelSessionFreshLoginCode);
    if (!status || status !== result.status) invalid();
    canonical = JSON.stringify({ schemaVersion: 1, kind: "fresh_login_required", code: body.code, retryable: false });
  }
  if (new TextEncoder().encode(canonical).byteLength > PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES) invalid();
  return canonical;
}

export function ownerPanelSessionHandoffResponseSignaturePreimage(input: {
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

export function createSignedOwnerPanelSessionHandoffResponse(
  result: OwnerPanelSessionHandoffInternalResult,
  authenticated: AuthenticatedOwnerInternalCallbackRequest,
): Response {
  const body = canonicalOwnerPanelSessionHandoffResult(result);
  const responseBodyDigest = createHash("sha256").update(body, "utf8").digest("hex");
  const preimage = ownerPanelSessionHandoffResponseSignaturePreimage({
    requestTimestamp: authenticated.timestamp,
    requestBodyDigest: authenticated.requestBodyDigest,
    status: result.status,
    responseBodyDigest,
  });
  const signature = signWithAuthenticatedInternalCallbackRequest(authenticated, preimage);
  return new Response(body, {
    status: result.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-celebix-session-response-key-id": authenticated.keyId,
      "x-celebix-session-response-timestamp": authenticated.timestamp,
      "x-celebix-session-response-signature": signature,
    },
  });
}
