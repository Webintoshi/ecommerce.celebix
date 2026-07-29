import "server-only";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { serializePersistentPanelSessionDeletionCookie } from "../panel-session-completion/cookie.ts";
import {
  PANEL_ACTIVE_STORE_SESSION_CONTROL_PATH,
  PANEL_LOGOUT_SESSION_CONTROL_PATH,
  createPanelSessionControlRequestAuthorityValidator,
} from "./request-authority.ts";
import {
  parseActiveStoreSelectionRequest,
  parsePanelSessionLogoutRequest,
  readPersistentPanelSessionCookie,
} from "./request-input.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NO_STORE = Object.freeze({ kind: "unavailable" as const });
type ApprovedRuntime = ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>;

type SharedDependencies = Readonly<{
  resolveRuntime(): Promise<ServerPanelAccessRuntime>;
  now(): Date;
}>;

type ActiveStoreDependencies = SharedDependencies & Readonly<{
  operationId(): string;
}>;

function json(code: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ code }, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(headers ?? {}),
    },
  });
}

function unavailable(): Response {
  return json("panel_session_retry_required", 503);
}

function privateBrowserAuthorityPresent(request: Request): boolean {
  return request.headers.has("authorization") ||
    request.headers.has("x-celebix-session") ||
    request.headers.has("x-panel-session-credential");
}

async function approvedRuntime(dependencies: SharedDependencies): Promise<ApprovedRuntime | null> {
  let runtime: ServerPanelAccessRuntime;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return null; }
  return runtime.readiness.mode === "approved_staging" && runtime.panelOrigin !== null
    ? runtime as ApprovedRuntime
    : null;
}

function authorityFailure(decision: string): Response | null {
  if (decision === "approved") return null;
  if (decision === "method_not_allowed") return json("method_not_allowed", 405, { allow: "POST" });
  if (decision === "origin_denied") return json("panel_origin_required", 403);
  return json("panel_session_request_invalid", 400);
}

function deletionHeader(): HeadersInit {
  return { "set-cookie": serializePersistentPanelSessionDeletionCookie() };
}

function validNow(dependencies: SharedDependencies): Date | null {
  let now: Date;
  try { now = dependencies.now(); } catch { return null; }
  return now instanceof Date && Number.isFinite(now.getTime()) ? new Date(now) : null;
}

export function createPanelActiveStoreHandler(dependencies: ActiveStoreDependencies) {
  if (
    !dependencies || typeof dependencies.resolveRuntime !== "function" ||
    typeof dependencies.operationId !== "function" || typeof dependencies.now !== "function"
  ) throw new Error("panel_active_store_handler_invalid");
  return async function handlePanelActiveStore(request: Request): Promise<Response> {
    const runtime = await approvedRuntime(dependencies);
    if (runtime === null) return unavailable();
    let validator;
    try {
      validator = createPanelSessionControlRequestAuthorityValidator({
        panelOrigin: runtime.panelOrigin,
        pathname: PANEL_ACTIVE_STORE_SESSION_CONTROL_PATH,
      });
    } catch { return unavailable(); }
    const authorityDenied = authorityFailure(validator.validate(request));
    if (authorityDenied) return authorityDenied;
    if (privateBrowserAuthorityPresent(request)) return json("panel_session_request_invalid", 400);
    const input = await parseActiveStoreSelectionRequest(request);
    if (input.kind !== "valid") return json("panel_session_request_invalid", 400);
    const cookie = readPersistentPanelSessionCookie(request);
    if (cookie.kind === "missing") return json("unauthenticated", 401);
    if (cookie.kind === "invalid") return json("unauthenticated", 401, deletionHeader());
    let operationId: string;
    try { operationId = dependencies.operationId(); } catch { return unavailable(); }
    const now = validNow(dependencies);
    if (!UUID.test(operationId) || now === null) return unavailable();
    let result: Awaited<ReturnType<ServerPanelAccessRuntime["rotateCredential"]>> = NO_STORE;
    try {
      result = await runtime.rotateCredential({
        currentCredential: cookie.credential,
        operationId,
        requestedStoreId: input.storeId,
        now,
      });
    } catch { return unavailable(); }
    if (result.kind === "rotated") {
      if (result.activeStoreId !== input.storeId) return json("durable_authority_invalid", 409);
      return Response.json({ ok: true, activeStoreId: result.activeStoreId }, {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "set-cookie": result.replacementCookie,
        },
      });
    }
    if (result.kind === "unauthenticated") return json("unauthenticated", 401, deletionHeader());
    if (result.kind === "membership_denied") return json("membership_denied", 403);
    if (result.kind === "operation_mismatch") return json("operation_conflict", 409);
    if (result.kind === "durable_authority_invalid") return json("durable_authority_invalid", 409);
    return unavailable();
  };
}

export function createPanelSessionLogoutHandler(dependencies: SharedDependencies) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function") {
    throw new Error("panel_session_logout_handler_invalid");
  }
  return async function handlePanelSessionLogout(request: Request): Promise<Response> {
    const runtime = await approvedRuntime(dependencies);
    if (runtime === null) return unavailable();
    let validator;
    try {
      validator = createPanelSessionControlRequestAuthorityValidator({
        panelOrigin: runtime.panelOrigin,
        pathname: PANEL_LOGOUT_SESSION_CONTROL_PATH,
      });
    } catch { return unavailable(); }
    const authorityDenied = authorityFailure(validator.validate(request));
    if (authorityDenied) return authorityDenied;
    if (privateBrowserAuthorityPresent(request)) return json("panel_session_request_invalid", 400);
    const input = await parsePanelSessionLogoutRequest(request);
    if (input.kind !== "valid") return json("panel_session_request_invalid", 400);
    const cookie = readPersistentPanelSessionCookie(request);
    if (cookie.kind === "missing") return new Response(null, { status: 204, headers: deletionHeader() });
    if (cookie.kind === "invalid") return json("unauthenticated", 401, deletionHeader());
    const now = validNow(dependencies);
    if (now === null) return unavailable();
    let result;
    try {
      result = await runtime.revokeCredential({ credential: cookie.credential, reason: "logout", now });
    } catch { return unavailable(); }
    if (result.kind === "revoked" || result.kind === "unauthenticated") {
      return new Response(null, { status: 204, headers: deletionHeader() });
    }
    if (result.kind === "durable_authority_invalid") return json("durable_authority_invalid", 409);
    return unavailable();
  };
}
