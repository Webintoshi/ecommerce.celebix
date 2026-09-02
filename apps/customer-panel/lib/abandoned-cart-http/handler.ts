import { parseAbandonedCartDetail, parseAbandonedCartListItem, parseAbandonedCartMutationResult, parseAbandonedCartSummary, type TenantContext } from "@celebix/saas-contracts";
import { AbandonedCartRepositoryError, type AbandonedCartErrorCode } from "@celebix/saas-data";

import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerAbandonedCartRuntime } from "../server-abandoned-carts/runtime.ts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { createAbandonedCartRequestAuthorityValidator, type AbandonedCartRequestExpectation } from "./request-authority.ts";
import { readAbandonedCartListInput, readAbandonedCartMutationInput, readAbandonedCartPathId } from "./request-input.ts";

const BASE = "/api/orders/abandoned-carts";
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ERROR_STATUS: Readonly<Record<AbandonedCartErrorCode, number>> = Object.freeze({ invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, cart_not_found: 404, invalid_transition: 409, version_conflict: 409, operation_replayed: 409, operation_mismatch: 409, durable_authority_invalid: 409, unavailable: 503 });

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerAbandonedCartRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerAbandonedCartRuntime; tenantContext: TenantContext; now: Date }>;

function json(value: unknown, status: number, headers?: HeadersInit): Response { const result = new Headers(headers); result.set("cache-control", "no-store"); result.set("x-content-type-options", "nosniff"); return Response.json(value, { status, headers: result }); }
function error(code: string, status: number, headers?: HeadersInit): Response { return json({ code }, status, headers); }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
function privateAuthority(request: Request): boolean { try { for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"].includes(name)) return true; return false; } catch { return true; } }

function repositoryError(value: unknown): Response {
  try { if (!(value instanceof AbandonedCartRepositoryError) || !Object.hasOwn(ERROR_STATUS, value.code)) return error("unavailable", 503); return error(value.code, ERROR_STATUS[value.code]); } catch { return error("unavailable", 503); }
}

async function authorize(dependencies: Dependencies, request: Request, expectation: AbandonedCartRequestExpectation): Promise<Response | Authorized> {
  let runtime: ServerAbandonedCartRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (runtime === null) return error("unavailable", 503);
  let decision; try { decision = createAbandonedCartRequestAuthorityValidator({ panelOrigin: runtime.access.panelOrigin }).validate(request, expectation); } catch { return error("unavailable", 503); }
  if (decision === "method_not_allowed") return error("method_not_allowed", 405, { allow: expectation.method });
  if (decision === "origin_denied") return error("origin_denied", 403);
  if (decision !== "approved" || privateAuthority(request)) return error("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== "present") return error("unauthenticated", 401);
  let now: Date; let requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !REQUEST_ID.test(requestId)) return error("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return error("unavailable", 503); }
  try {
    if (access.kind === "unauthenticated") return error("unauthenticated", 401);
    if (access.kind === "unauthorized") return error("membership_denied", 403);
    if (access.kind !== "authenticated") return error("unavailable", 503);
    if (expectation.method === "POST" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)) return error("origin_denied", 403);
    return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
  } catch { return error("unavailable", 503); }
}

async function execute(operation: () => Promise<unknown>, parser: (value: unknown) => unknown): Promise<Response> { try { return json(parser(await operation()), 200); } catch (caught) { return repositoryError(caught); } }

export function createAbandonedCartHttpHandlers(dependencies: Dependencies) {
  try { if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function") throw new Error(); } catch { throw new Error("abandoned_cart_http_handler_invalid"); }
  const mutation = async (request: Request, rawId: unknown, leaf: "recovered" | "archive") => {
    const cartId = readAbandonedCartPathId(rawId); if (cartId === null) return error("invalid_input", 400);
    const authorized = await authorize(dependencies, request, { method: "POST", pathname: `${BASE}/${cartId}/${leaf}`, query: "forbidden" }); if (isResponse(authorized)) return authorized;
    const input = await readAbandonedCartMutationInput(request); if (input.kind !== "valid") return error("invalid_input", 400);
    return execute(() => leaf === "recovered" ? authorized.runtime.abandonedCarts.markRecovered({ tenantContext: authorized.tenantContext, now: authorized.now, cartId, operationId: input.operationId, expectedVersion: input.expectedVersion }) : authorized.runtime.abandonedCarts.archive({ tenantContext: authorized.tenantContext, now: authorized.now, cartId, operationId: input.operationId, expectedVersion: input.expectedVersion }), parseAbandonedCartMutationResult);
  };
  return Object.freeze({
    async getSummary(request: Request) { const authorized = await authorize(dependencies, request, { method: "GET", pathname: `${BASE}/summary`, query: "forbidden" }); return isResponse(authorized) ? authorized : execute(() => authorized.runtime.abandonedCarts.getSummary({ tenantContext: authorized.tenantContext, now: authorized.now }), parseAbandonedCartSummary); },
    async list(request: Request) { const authorized = await authorize(dependencies, request, { method: "GET", pathname: BASE, query: "allowed" }); if (isResponse(authorized)) return authorized; const input = readAbandonedCartListInput(request); if (input.kind !== "valid") return error("invalid_input", 400); return execute(() => authorized.runtime.abandonedCarts.list({ tenantContext: authorized.tenantContext, now: authorized.now, ...input.value }), (value) => { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(); const record = value as Record<string, unknown>; if (!Array.isArray(record.items) || (Object.keys(record).sort().join(",") !== "items" && Object.keys(record).sort().join(",") !== "items,nextCursor") || (record.nextCursor !== undefined && (typeof record.nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(record.nextCursor)))) throw new TypeError(); return Object.freeze({ items: Object.freeze(record.items.map(parseAbandonedCartListItem)), ...(record.nextCursor === undefined ? {} : { nextCursor: record.nextCursor }) }); }); },
    async get(request: Request, rawId: unknown) { const cartId = readAbandonedCartPathId(rawId); if (cartId === null) return error("invalid_input", 400); const authorized = await authorize(dependencies, request, { method: "GET", pathname: `${BASE}/${cartId}`, query: "forbidden" }); return isResponse(authorized) ? authorized : execute(() => authorized.runtime.abandonedCarts.get({ tenantContext: authorized.tenantContext, now: authorized.now, cartId }), parseAbandonedCartDetail); },
    markRecovered(request: Request, rawId: unknown) { return mutation(request, rawId, "recovered"); },
    archive(request: Request, rawId: unknown) { return mutation(request, rawId, "archive"); },
  });
}
