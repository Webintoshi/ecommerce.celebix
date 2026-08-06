import { isMerchantActionAllowed, type TenantContext } from "@celebix/saas-contracts";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerShippingRuntime } from "../server-shipping/runtime.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type ShippingHttpDependencies = Readonly<{
  resolveRuntime(): Promise<ServerShippingRuntime | null>;
  now(): Date;
  requestId(): string;
  validateJob(input: Readonly<{
    jobId: string;
    workerId: string;
    runtime: ServerShippingRuntime;
    now: Date;
  }>): Promise<"completed" | "requeued" | "rejected">;
}>;

export type ShippingHttpAuthority = Readonly<{
  runtime: ServerShippingRuntime;
  tenantContext: TenantContext;
  now: Date;
  requestId: string;
}>;

export type ShippingHttpFailure = Readonly<{ code: string; status: number; allow?: string }>;

function exactUrl(request: Request, pathname: string): boolean {
  try {
    const url = new URL(request.url);
    return (url.protocol === "http:" || url.protocol === "https:")
      && url.username === "" && url.password === ""
      && url.pathname === pathname && url.search === "" && url.hash === "";
  } catch { return false; }
}

function hasPrivateHeaders(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (name === "authorization" || name.startsWith("x-celebix") || [
        "x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id",
        "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
      ].includes(name)) return true;
    }
    return false;
  } catch { return true; }
}

function fail(code: string, status: number, allow?: string): ShippingHttpFailure {
  return Object.freeze({ code, status, ...(allow ? { allow } : {}) });
}

export function isShippingHttpFailure(value: ShippingHttpAuthority | ShippingHttpFailure): value is ShippingHttpFailure {
  return Object.hasOwn(value, "code");
}

export async function authorizeShippingRequest(
  dependencies: ShippingHttpDependencies,
  request: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  pathname: string,
): Promise<ShippingHttpAuthority | ShippingHttpFailure> {
  let runtime: ServerShippingRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); } catch { return fail("unavailable", 503); }
  if (runtime === null) return fail("unavailable", 503);
  if (request.method !== method) return fail("method_not_allowed", 405, method);
  if (!exactUrl(request, pathname) || hasPrivateHeaders(request)) return fail("invalid_input", 400);
  if (method !== "GET" && request.headers.get("origin") !== runtime.access.panelOrigin) return fail("origin_denied", 403);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return fail("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return fail("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return fail("unavailable", 503);
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now.getTime()) });
  } catch { return fail("unavailable", 503); }
  if (access.kind === "unauthenticated") return fail("unauthenticated", 401);
  if (access.kind === "unauthorized") return fail("membership_denied", 403);
  if (access.kind !== "authenticated") return fail("unavailable", 503);
  if (access.tenantContext.store.status !== "active") return fail("store_inactive", 403);
  if (access.tenantContext.membership.status !== "active") return fail("membership_denied", 403);
  const action = method === "GET" ? "shipping.read" : "shipping.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return fail("membership_denied", 403);
  if (!access.tenantContext.entitlements.features.includes("integrations")) return fail("feature_not_enabled", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now.getTime()), requestId });
}
