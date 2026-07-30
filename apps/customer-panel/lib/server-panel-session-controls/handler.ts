import "server-only";

import { parseCanonicalAdminHostname } from "@celebix/saas-data";

import { createCrossHostHandoffAutoPostResponse } from "../cross-host-handoff-auto-post.ts";
import type { ServerAdminHostAuthRuntime } from "../server-admin-host-auth/runtime.ts";
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
const HOSTNAME = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const NO_STORE = Object.freeze({ kind: "unavailable" as const });
type ApprovedRuntime = ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>;

type SharedDependencies = Readonly<{
  resolveRuntime(): Promise<ServerPanelAccessRuntime>;
  now(): Date;
}>;

type ActiveStoreDependencies = SharedDependencies & Readonly<{
  operationId(): string;
}>;

type StoreSwitchDependencies = Readonly<{
  resolveRuntime(): Promise<ServerAdminHostAuthRuntime | unknown>;
  operationId(): string;
  randomBytes(size: number): Uint8Array;
  now(): Date;
  maximumBodyBytes: number;
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

function exactHostname(value: unknown): string | null {
  return typeof value === "string" && value.length >= 3 && value.length <= 253 &&
    value === value.trim() && value === value.toLowerCase() && HOSTNAME.test(value)
    ? value
    : null;
}

function canonicalAdminHostname(value: unknown): string | null {
  const candidate = exactHostname(value);
  if (candidate === null) return null;
  try { parseCanonicalAdminHostname(candidate, "production"); return candidate; }
  catch {
    try { parseCanonicalAdminHostname(candidate, "staging"); return candidate; }
    catch { return null; }
  }
}

async function boundedForm(request: Request, maximumBytes: number): Promise<URLSearchParams | null> {
  if (
    request.headers.get("content-type") !== "application/x-www-form-urlencoded" ||
    request.headers.has("transfer-encoding") || request.body === null
  ) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total < 1) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null;
    return new URLSearchParams(text);
  } catch { return null; }
}

function canonicalTenantSwitchRequest(request: Request): Readonly<{ origin: string; hostname: string }> | null {
  if (request.method !== "POST") return null;
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  const requestedHostname = exactHostname(url.hostname);
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    url.pathname !== "/api/session/switch" || url.search || url.hash || requestedHostname === null
  ) return null;
  return Object.freeze({ origin: url.origin, hostname: requestedHostname });
}

function switchFailure(kind: unknown): Response {
  if (kind === "unauthenticated") return json("unauthenticated", 401, deletionHeader());
  if (kind === "membership_denied") return json("membership_denied", 403);
  if (kind === "operation_mismatch" || kind === "handoff_replayed" || kind === "expired" || kind === "durable_authority_invalid") {
    return json("panel_store_switch_rejected", 409);
  }
  return json("panel_session_retry_required", 503);
}

export function createPanelStoreSwitchHandoffHandler(dependencies: StoreSwitchDependencies) {
  if (
    !dependencies || typeof dependencies.resolveRuntime !== "function" ||
    typeof dependencies.operationId !== "function" || typeof dependencies.randomBytes !== "function" ||
    typeof dependencies.now !== "function" || !Number.isSafeInteger(dependencies.maximumBodyBytes) ||
    dependencies.maximumBodyBytes < 128 || dependencies.maximumBodyBytes > 4_096
  ) throw new Error("panel_store_switch_handoff_handler_invalid");

  return async function handlePanelStoreSwitchHandoff(request: Request): Promise<Response> {
    const authority = canonicalTenantSwitchRequest(request);
    if (authority === null) {
      return request.method === "POST"
        ? json("panel_session_request_invalid", 400)
        : json("method_not_allowed", 405, { allow: "POST" });
    }
    if (request.headers.get("origin") !== authority.origin) return json("panel_origin_required", 403);
    if (privateBrowserAuthorityPresent(request)) return json("panel_session_request_invalid", 400);

    let runtime: ServerAdminHostAuthRuntime;
    let now: Date;
    try {
      const resolved = await dependencies.resolveRuntime();
      if (!resolved || typeof resolved !== "object") throw new Error("unavailable");
      runtime = resolved as ServerAdminHostAuthRuntime;
      now = dependencies.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("unavailable");
      const brand = await runtime.adminDomains.resolvePublicBrand({ hostname: authority.hostname, now });
      if (brand.kind !== "resolved") throw new Error("unavailable");
    } catch { return unavailable(); }

    const form = await boundedForm(request, dependencies.maximumBodyBytes);
    if (form === null || form.size !== 1 || form.getAll("destinationStoreId").length !== 1) {
      return json("panel_session_request_invalid", 400);
    }
    const destinationStoreId = form.get("destinationStoreId");
    if (!UUID.test(destinationStoreId ?? "")) {
      return json("panel_session_request_invalid", 400);
    }
    const cookie = readPersistentPanelSessionCookie(request);
    if (cookie.kind === "missing") return json("unauthenticated", 401);
    if (cookie.kind === "invalid") return json("unauthenticated", 401, deletionHeader());
    let destinationHostname: string;
    try {
      const options = await runtime.storeOptions.listForCredential({ credential: cookie.credential, now });
      if (options.kind !== "resolved") return switchFailure(options.kind);
      const selected = options.stores.find((store) => store.storeId === destinationStoreId);
      if (!selected) return json("membership_denied", 403);
      const destination = new URL(selected.canonicalAdminOrigin);
      const parsedHostname = canonicalAdminHostname(destination.hostname);
      if (
        parsedHostname === null || destination.protocol !== "https:" || destination.username || destination.password ||
        destination.port || destination.pathname !== "/" || destination.search || destination.hash ||
        destination.origin !== selected.canonicalAdminOrigin
      ) return json("durable_authority_invalid", 409);
      destinationHostname = parsedHostname;
    } catch { return unavailable(); }
    let operationId: string;
    try { operationId = dependencies.operationId(); } catch { return unavailable(); }
    if (!UUID.test(operationId)) return unavailable();

    let issued;
    try {
      issued = await runtime.handoffs.issueHandoff({
        currentCredential: cookie.credential,
        operationId,
        destinationStoreId: destinationStoreId as string,
        destinationHostname,
        now,
      });
      if (issued.kind === "commit_unknown" && "credential" in issued) {
        issued = await runtime.handoffs.recoverIssuedHandoff({
          operationId,
          credential: issued.credential,
          destinationHostname,
          now,
        });
      }
    } catch { return unavailable(); }
    if (
      (issued.kind !== "handoff_issued" && issued.kind !== "operation_replayed") ||
      !("credential" in issued) || !("destinationOrigin" in issued)
    ) return switchFailure(issued.kind);
    try {
      return createCrossHostHandoffAutoPostResponse({
        destinationOrigin: issued.destinationOrigin,
        handoffCredential: issued.credential,
        randomBytes: dependencies.randomBytes,
      });
    } catch { return unavailable(); }
  };
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
