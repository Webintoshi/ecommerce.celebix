import { isMerchantActionAllowed, type TenantContext } from "@celebix/saas-contracts";
import { STORE_DOMAIN_SERVICE_ERROR_CODES, StoreDomainServiceError } from "@celebix/saas-domain-core";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import {
  approvedPanelMutationOriginForStore,
  hasApprovedPanelMutationOriginShape,
} from "../panel-origin-authority.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerAdminDomainRuntime } from "../server-admin-domains/runtime.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STATUS = Object.freeze({ invalid_input: 400, feature_not_enabled: 403, limit_reached: 409, hostname_already_claimed: 409, stale_version: 409, not_found: 404, operation_mismatch: 409, provider_unavailable: 503 });
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerAdminDomainRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerAdminDomainRuntime; tenantContext: TenantContext; now: Date }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra); headers.set("cache-control", "no-store"); headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function failure(code: string, status: number, extra?: HeadersInit): Response { return json({ code }, status, extra); }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
function exactUrl(request: Request, pathname: string): boolean {
  try { const url = new URL(request.url); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === pathname && !url.search && !url.hash; }
  catch { return false; }
}
function privateHeaders(request: Request): boolean {
  try {
    for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"].includes(name)) return true;
    return false;
  } catch { return true; }
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const selected = value as Record<string, unknown>;
  return Object.keys(selected).sort().join(",") === [...keys].sort().join(",") ? selected : null;
}
async function body(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const declared = request.headers.get("content-length"); if (declared && (!/^\d{1,5}$/u.test(declared) || Number(declared) > 4096)) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 4096) return null; chunks.push(next.value); }
    if (total < 2) return null; const joined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch { return null; }
}
function operationId(request: Request): string | null { const value = request.headers.get("idempotency-key"); return value && UUID.test(value) && !value.includes(",") ? value : null; }
function version(value: unknown): number | null { const parsed = exact(value, ["expectedVersion"]); return parsed && Number.isSafeInteger(parsed.expectedVersion) && (parsed.expectedVersion as number) >= 1 ? parsed.expectedVersion as number : null; }

async function authorize(dependencies: Dependencies, request: Request, method: "GET" | "POST" | "DELETE", pathname: string): Promise<Response | Authorized> {
  let runtime: ServerAdminDomainRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return failure("provider_unavailable", 503); }
  if (!runtime) return failure("provider_unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method !== "GET" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure("origin_denied", 403);
  if (!exactUrl(request, pathname) || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date; let requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return failure("provider_unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure("provider_unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return failure("provider_unavailable", 503); }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401); if (access.kind === "unauthorized") return failure("forbidden", 403); if (access.kind !== "authenticated") return failure("provider_unavailable", 503);
  if (access.tenantContext.store.status !== "active" || access.tenantContext.membership.status !== "active") return failure("forbidden", 403);
  if (
    method !== "GET"
    && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return failure("origin_denied", 403);
  const action = method === "GET" ? "configuration.read" : "configuration.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return failure("forbidden", 403);
  if (!access.tenantContext.entitlements.features.includes("custom_domains")) return failure("feature_not_enabled", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}
function serviceFailure(caught: unknown): Response {
  return caught instanceof StoreDomainServiceError && STORE_DOMAIN_SERVICE_ERROR_CODES.includes(caught.code)
    ? failure(caught.code, STATUS[caught.code]) : failure("provider_unavailable", 503);
}
async function mutation(dependencies: Dependencies, request: Request, method: "POST" | "DELETE", pathname: string, run: (authority: Authorized, parsedVersion: number | null) => Promise<unknown>): Promise<Response> {
  const authority = await authorize(dependencies, request, method, pathname); if (isResponse(authority)) return authority;
  if (operationId(request) === null) return failure("invalid_input", 400);
  const parsedVersion = version(await body(request)); if (parsedVersion === null) return failure("invalid_input", 400);
  try { return json({ domain: await run(authority, parsedVersion) }); } catch (caught) { return serviceFailure(caught); }
}

export function createAdminDomainHttpHandlers(dependencies: Dependencies) {
  return Object.freeze({
    async collection(request: Request): Promise<Response> {
      if (request.method === "GET") {
        const authority = await authorize(dependencies, request, "GET", "/api/admin-domains"); if (isResponse(authority)) return authority;
        try { return json({ items: await authority.runtime.domains.list({ tenantContext: authority.tenantContext, now: authority.now }) }); } catch (caught) { return serviceFailure(caught); }
      }
      const authority = await authorize(dependencies, request, "POST", "/api/admin-domains"); if (isResponse(authority)) return authority;
      const operation = operationId(request); const parsed = exact(await body(request), ["hostname"]);
      if (!operation || !parsed || typeof parsed.hostname !== "string") return failure("invalid_input", 400);
      try { return json({ domain: await authority.runtime.domains.create({ tenantContext: authority.tenantContext, now: authority.now, operationId: operation, hostname: parsed.hostname }) }, 202); }
      catch (caught) { return serviceFailure(caught); }
    },
    recheck(request: Request, domainId: string) {
      if (!UUID.test(domainId)) return Promise.resolve(failure("invalid_input", 400));
      return mutation(dependencies, request, "POST", `/api/admin-domains/${domainId}/recheck`, (authority, expectedVersion) => authority.runtime.domains.requestRecheck({ tenantContext: authority.tenantContext, now: authority.now, domainId, expectedVersion: expectedVersion! }));
    },
    primary(request: Request, domainId: string) {
      if (!UUID.test(domainId)) return Promise.resolve(failure("invalid_input", 400));
      return mutation(dependencies, request, "POST", `/api/admin-domains/${domainId}/primary`, (authority, expectedVersion) => authority.runtime.domains.makePrimary({ tenantContext: authority.tenantContext, now: authority.now, domainId, expectedVersion: expectedVersion! }));
    },
    item(request: Request, domainId: string) {
      if (!UUID.test(domainId)) return Promise.resolve(failure("invalid_input", 400));
      return mutation(dependencies, request, "DELETE", `/api/admin-domains/${domainId}`, (authority, expectedVersion) => authority.runtime.domains.disable({ tenantContext: authority.tenantContext, now: authority.now, domainId, expectedVersion: expectedVersion! }));
    },
  });
}
