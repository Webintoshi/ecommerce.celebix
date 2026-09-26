import { isMerchantActionAllowed, parseToshiConversation, type TenantContext } from "@celebix/saas-contracts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";
import { safeToshiChatError } from "../server-toshi-chat/service.ts";
import type { ServerToshiChatRuntime } from "../server-toshi-chat/runtime.ts";
import { exactRecord, TOSHI_UUID } from "../server-toshi-chat/validation.ts";

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerToshiChatRuntime | null>; now(): Date; requestId(): string }>;
export type ToshiConversationRouteContext = Readonly<{ params: Promise<Readonly<{ conversationId: string }>> }>;
const STATUS: Readonly<Record<string, number>> = { invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, credential_invalid: 401, origin_denied: 403, model_unavailable: 409, rate_limited: 429, quota_exceeded: 429, provider_timeout: 504, provider_unavailable: 503, version_conflict: 409, turn_busy: 409, conversation_limit_reached: 409, operation_mismatch: 409, operation_failed: 409, conversation_not_found: 404, connection_revoked: 409, connection_missing: 409, cancelled: 499, unavailable: 503 };
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function failure(code: string, status = code === "sensitive_input" ? 400 : STATUS[code] ?? 503) { return json({ code: code === "turn_busy" ? "busy" : code === "conversation_limit_reached" ? "context_limit" : code }, status); }
function mapped(error: unknown) { return failure(safeToshiChatError(error).code); }
function requestShape(request: Request, pathname: string) {
  try {
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== pathname || url.search || url.hash) return false;
    for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"].includes(name)) return false;
    return true;
  } catch { return false; }
}
async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || !request.body) throw Error("invalid_input");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > 20480)) throw Error("invalid_input");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 20480) { await reader.cancel(); throw Error("invalid_input"); } chunks.push(next.value); }
    const joined = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); } finally { joined.fill(0); }
  } finally { chunks.forEach(chunk => chunk.fill(0)); reader.releaseLock(); }
}
type Authorized = Readonly<{ runtime: ServerToshiChatRuntime; tenantContext: TenantContext; now: Date }>;
async function authorize(deps: Dependencies, request: Request, method: "GET" | "POST", pathname: string): Promise<Authorized | Response> {
  let runtime: ServerToshiChatRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return failure("unavailable"); }
  if (!runtime) return failure("unavailable");
  if (request.method !== method) return json({ code: "method_not_allowed" }, 405);
  if (method === "POST" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure("origin_denied");
  if (!requestShape(request, pathname)) return failure("invalid_input");
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated");
  const now = deps.now(), requestId = deps.requestId();
  if (!Number.isFinite(now.getTime()) || !TOSHI_UUID.test(requestId)) return failure("unavailable");
  let access;
  try { access = await runtime.access.resolveCredential({ credential: cookie.credential, hostname: request.headers.get("host"), requestId, now }); } catch { return failure("unavailable"); }
  if (access.kind === "unauthenticated") return failure("unauthenticated");
  if (access.kind === "unauthorized") return failure("membership_denied");
  if (access.kind !== "authenticated") return failure("unavailable");
  const tenantContext = access.tenantContext;
  if (method === "POST" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, tenantContext.store.slug)) return failure("origin_denied");
  if (tenantContext.store.status !== "active") return failure("store_inactive");
  if (tenantContext.membership.status !== "active" || !isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) return failure("membership_denied");
  return { runtime, tenantContext, now };
}
export function createToshiChatHttpHandlers(deps: Dependencies) {
  return Object.freeze({
    async list(request: Request) {
      const auth = await authorize(deps, request, "GET", "/api/toshi/conversations"); if (auth instanceof Response) return auth;
      try { return json(await auth.runtime.service.list({ tenantContext: auth.tenantContext, now: auth.now })); } catch (error) { return mapped(error); }
    },
    async get(request: Request, context: ToshiConversationRouteContext) {
      let id: string; try { id = (await context.params).conversationId; } catch { return failure("invalid_input"); }
      if (!TOSHI_UUID.test(id)) return failure("invalid_input");
      const auth = await authorize(deps, request, "GET", `/api/toshi/conversations/${id}`); if (auth instanceof Response) return auth;
      try { return json({ conversation: parseToshiConversation(await auth.runtime.service.get({ tenantContext: auth.tenantContext, now: auth.now, conversationId: id })) }); } catch (error) { return mapped(error); }
    },
    async send(request: Request) {
      const auth = await authorize(deps, request, "POST", "/api/toshi/messages"); if (auth instanceof Response) return auth;
      const operationId = request.headers.get("idempotency-key"); if (!operationId || !TOSHI_UUID.test(operationId)) return failure("invalid_input");
      let parsed;
      try { parsed = exactRecord(await body(request), ["conversationId", "expectedVersion", "text"]); } catch { return failure("invalid_input"); }
      const { conversationId, expectedVersion, text } = parsed;
      if (typeof text !== "string" || !text.trim() || text.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text) || (conversationId !== null && (typeof conversationId !== "string" || !TOSHI_UUID.test(conversationId))) || (conversationId === null ? expectedVersion !== null : !Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0)) return failure("invalid_input");
      try { return json({ conversation: parseToshiConversation(await auth.runtime.service.send({ tenantContext: auth.tenantContext, now: auth.now, operationId, conversationId: conversationId as string | null, expectedVersion: expectedVersion as number | null, text: text.trim(), signal: request.signal })) }); } catch (error) { return mapped(error); }
    },
  });
}
