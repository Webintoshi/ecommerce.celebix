import { isMerchantActionAllowed, normalizeStarterThemeCompositionV3, type TenantContext } from "@celebix/saas-contracts";

import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerStorefrontDesignPreviewRuntime } from "../server-storefront-design-preview/runtime-core.ts";
import { validateStorefrontDesignRequest } from "../storefront-design-http/request-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_JSON_BYTES = 131_072;

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerStorefrontDesignPreviewRuntime | null>; now(): Date; requestId(): string }>;

function response(code: string, status: number, body: Record<string, unknown> = {}): Response {
  return Response.json({ code, ...body }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function privateHeaders(request: Request): boolean {
  try {
    for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"].includes(name)) return true;
    return false;
  } catch { return true; }
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) return null;
  return value as Record<string, unknown>;
}

async function jsonBody(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared === null || !/^[1-9]\d*$/.test(declared) || Number(declared) > MAX_JSON_BYTES) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > MAX_JSON_BYTES) { await reader.cancel().catch(() => undefined); return null; } chunks.push(new Uint8Array(next.value)); }
    const joined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); } catch { return null; } finally { joined.fill(0); }
  } catch { return null; } finally { for (const chunk of chunks) chunk.fill(0); }
}

async function authorize(deps: Dependencies, request: Request): Promise<Readonly<{ runtime: ServerStorefrontDesignPreviewRuntime; tenantContext: TenantContext; now: Date }> | Response> {
  let runtime: ServerStorefrontDesignPreviewRuntime | null;
  try { runtime = await deps.resolveRuntime(); } catch { return response("unavailable", 503); }
  if (!runtime) return response("unavailable", 503);
  const decision = validateStorefrontDesignRequest(request, { method: "POST", pathname: "/api/storefront-design/preview", panelOrigin: runtime.access.panelOrigin });
  if (decision === "method_not_allowed") return response(decision, 405);
  if (decision === "origin_denied") return response(decision, 403);
  if (decision !== "approved" || privateHeaders(request)) return response("invalid_input", 400);
  const cookie = readPersistentPanelSessionCookie(request); if (cookie.kind !== "present") return response("unauthenticated", 401);
  let now: Date, requestId: string; try { now = deps.now(); requestId = deps.requestId(); } catch { return response("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return response("unavailable", 503);
  let access; try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); } catch { return response("unavailable", 503); }
  if (access.kind === "unauthenticated") return response("unauthenticated", 401);
  if (access.kind === "unauthorized") return response("membership_denied", 403);
  if (access.kind !== "authenticated") return response("unavailable", 503);
  const tenantContext = access.tenantContext;
  if (tenantContext.store.status !== "active") return response("store_inactive", 403);
  if (tenantContext.membership.status !== "active" || !isMerchantActionAllowed(tenantContext.membership.role, "configuration.read")) return response("membership_denied", 403);
  if (!approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, tenantContext.store.slug)) return response("origin_denied", 403);
  return Object.freeze({ runtime, tenantContext, now: new Date(now) });
}

export function createStorefrontDesignPreviewHttpHandler(deps: Dependencies) {
  return async function handle(request: Request): Promise<Response> {
    const authorized = await authorize(deps, request); if (authorized instanceof Response) return authorized;
    const parsed = exact(await jsonBody(request), ["composition"]); if (!parsed) return response("invalid_input", 400);
    let composition; try { composition = normalizeStarterThemeCompositionV3(parsed.composition as never); } catch { return response("invalid_input", 400); }
    try {
      const workspace = await authorized.runtime.design.getWorkspace({ tenantContext: authorized.tenantContext, now: authorized.now });
      const resources = await authorized.runtime.loader.load({ tenantContext: authorized.tenantContext, now: authorized.now, workspace, composition });
      return response("ok", 200, { resources });
    } catch { return response("unavailable", 503); }
  };
}
