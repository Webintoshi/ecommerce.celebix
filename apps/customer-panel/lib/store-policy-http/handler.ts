import {
  FIXED_STOREFRONT_POLICIES,
  isMerchantActionAllowed,
  type StorefrontPolicyKey,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  STOREFRONT_CONTENT_ERROR_CODES,
  StorefrontContentRepositoryError,
  type StorePolicyAdminPage,
} from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import {
  approvedPanelMutationOriginForStore,
  hasApprovedPanelMutationOriginShape,
} from "../panel-origin-authority.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerStorePolicyRuntime } from "../server-store-policy/runtime.ts";

const MAXIMUM_BODY_BYTES = 110_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const STATUS = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  not_found: 404,
  version_conflict: 409,
  operation_mismatch: 409,
  operation_not_found: 404,
  membership_denied: 403,
  durable_authority_invalid: 409,
  store_inactive: 403,
  feature_not_enabled: 403,
  commit_unknown: 503,
  unavailable: 503,
} satisfies Readonly<Record<(typeof STOREFRONT_CONTENT_ERROR_CODES)[number], number>>);

type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerStorePolicyRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type Authorized = Readonly<{ runtime: ServerStorePolicyRuntime; tenantContext: TenantContext; now: Date }>;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function failure(code: string, status: number, extra?: HeadersInit): Response {
  return json({ code }, status, extra);
}
function isResponse(value: unknown): value is Response { return value instanceof Response; }

function privateHeaders(request: Request): boolean {
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

function exactUrl(request: Request, pathname: string): boolean {
  try {
    const url = new URL(request.url);
    return (url.protocol === "http:" || url.protocol === "https:")
      && !url.username && !url.password && url.pathname === pathname && url.search === "" && url.hash === "";
  } catch { return false; }
}

function policyKey(value: unknown): StorefrontPolicyKey | null {
  return FIXED_STOREFRONT_POLICIES.find(({ key }) => key === value)?.key ?? null;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}

async function boundedJson(request: Request): Promise<unknown | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let joined: Uint8Array | undefined;
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 2) return null;
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch { return null; }
  finally { joined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

function mutation(value: unknown): Readonly<{ operationId: string; expectedVersion: number; body: string; status: "draft" | "published" }> | null {
  const parsed = exact(value, ["operationId", "expectedVersion", "body", "status"]);
  if (!parsed || typeof parsed.operationId !== "string" || !UUID.test(parsed.operationId)
    || !Number.isSafeInteger(parsed.expectedVersion) || (parsed.expectedVersion as number) < 1
    || typeof parsed.body !== "string" || parsed.body !== parsed.body.trim()
    || Buffer.byteLength(parsed.body, "utf8") > 100_000 || CONTROL.test(parsed.body)
    || (parsed.status !== "draft" && parsed.status !== "published")
    || (parsed.status === "published" && Buffer.byteLength(parsed.body, "utf8") === 0)) return null;
  return Object.freeze({ operationId: parsed.operationId, expectedVersion: parsed.expectedVersion as number, body: parsed.body, status: parsed.status });
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  method: "GET" | "PATCH",
  pathname: string,
): Promise<Response | Authorized> {
  let runtime: ServerStorePolicyRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); } catch { return failure("unavailable", 503); }
  if (runtime === null) return failure("unavailable", 503);
  if (request.method !== method) return failure("method_not_allowed", 405, { allow: method });
  if (method === "PATCH" && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure("origin_denied", 403);
  if (!exactUrl(request, pathname) || privateHeaders(request)) return failure("invalid_input", 400);
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return failure("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return failure("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure("unavailable", 503);
  let access: ServerPanelAccessResult;
  try { access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) }); }
  catch { return failure("unavailable", 503); }
  if (access.kind === "unauthenticated") return failure("unauthenticated", 401);
  if (access.kind === "unauthorized") return failure("membership_denied", 403);
  if (access.kind !== "authenticated") return failure("unavailable", 503);
  if (access.tenantContext.store.status !== "active") return failure("store_inactive", 403);
  if (access.tenantContext.membership.status !== "active") return failure("membership_denied", 403);
  if (
    method === "PATCH"
    && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return failure("origin_denied", 403);
  const action = method === "GET" ? "content.read" : "content.manage";
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) return failure("membership_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function repositoryFailure(error: unknown): Response {
  return error instanceof StorefrontContentRepositoryError && STOREFRONT_CONTENT_ERROR_CODES.includes(error.code)
    ? failure(error.code, STATUS[error.code])
    : failure("unavailable", 503);
}

async function list(runtime: ServerStorePolicyRuntime, tenantContext: TenantContext, now: Date): Promise<readonly StorePolicyAdminPage[]> {
  return runtime.policies.list({ tenantContext, now });
}

export function createStorePolicyHttpHandlers(dependencies: Dependencies) {
  return Object.freeze({
    async collection(request: Request): Promise<Response> {
      const authority = await authorize(dependencies, request, "GET", "/api/storefront-policies");
      if (isResponse(authority)) return authority;
      try { return json({ items: await list(authority.runtime, authority.tenantContext, authority.now) }); }
      catch (error) { return repositoryFailure(error); }
    },
    async item(request: Request, rawKey: string): Promise<Response> {
      const key = policyKey(rawKey);
      if (key === null) return failure("invalid_input", 400);
      const pathname = `/api/storefront-policies/${key}`;
      if (request.method === "GET") {
        const authority = await authorize(dependencies, request, "GET", pathname);
        if (isResponse(authority)) return authority;
        try {
          const page = (await list(authority.runtime, authority.tenantContext, authority.now)).find((candidate) => candidate.key === key);
          return page ? json(page) : failure("not_found", 404);
        } catch (error) { return repositoryFailure(error); }
      }
      const authority = await authorize(dependencies, request, "PATCH", pathname);
      if (isResponse(authority)) return authority;
      const body = mutation(await boundedJson(request));
      if (body === null) return failure("invalid_input", 400);
      try {
        return json(await authority.runtime.policies.save({ tenantContext: authority.tenantContext, now: authority.now, key, ...body }));
      } catch (error) { return repositoryFailure(error); }
    },
  });
}
