import { createHash } from "node:crypto";
import type {
  AnalyticsMetricType,
  AnalyticsRange,
  TenantContext,
} from "@celebix/saas-contracts";
import type { ServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { authorizeAnalyticsRequest } from "./request-authority.ts";
import { connectionIntent, operation } from "./request-input.ts";
type Deps = Readonly<{
  resolveRuntime(): Promise<ServerAnalyticsRuntime | null>;
  now(): Date;
  requestId(): string;
  uuid(): string;
}>;
const PATHS = {
  connection: "/api/analytics/connection",
  active: "/api/analytics/active",
  summary: "/api/analytics/summary",
  metrics: "/api/analytics/metrics",
} as const;
function json(value: unknown, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set("cache-control", "no-store");
  h.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers: h });
}
function failure(error: unknown) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "unavailable";
  const status =
    code === "invalid_input"
      ? 400
      : code === "unauthenticated"
        ? 401
        : [
              "membership_denied",
              "store_inactive",
              "feature_not_enabled",
              "hostname_not_found",
            ].includes(code)
          ? 403
          : ["not_configured", "connection_not_found"].includes(code)
            ? 404
            : [
                  "operation_mismatch",
                  "website_id_conflict",
                  "hostname_mismatch",
                  "website_id_mismatch",
                  "stale_operation",
                  "stale_version",
                  "already_configured",
                ].includes(code)
              ? 409
              : 503;
  return json({ code }, status);
}
function exactUrl(request: Request, path: string, query: readonly string[]) {
  try {
    const url = new URL(request.url);
    if (url.pathname !== path || url.hash || url.username || url.password)
      return null;
    const keys = [...url.searchParams.keys()];
    if (
      keys.length !== query.length ||
      keys.some((key, index) => key !== query[index]) ||
      query.some((key) => url.searchParams.getAll(key).length !== 1)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
async function context(
  deps: Deps,
  request: Request,
  method: "GET" | "POST",
  path: string,
  query: readonly string[] = [],
) {
  let runtime: ServerAnalyticsRuntime | null;
  try {
    runtime = await deps.resolveRuntime();
  } catch {
    return { response: json({ code: "unavailable" }, 503) };
  }
  if (!runtime) return { response: json({ code: "unavailable" }, 503) };
  if (request.method !== method)
    return {
      response: json({ code: "method_not_allowed" }, 405, { allow: method }),
    };
  const url = exactUrl(request, path, query);
  if (!url) return { response: json({ code: "invalid_input" }, 400) };
  let now: Date, requestId: string;
  try {
    now = deps.now();
    requestId = deps.requestId();
  } catch {
    return { response: json({ code: "unavailable" }, 503) };
  }
  const auth = await authorizeAnalyticsRequest(
    runtime,
    request,
    requestId,
    now,
    method === "POST",
  );
  if (auth.kind === "response") {
    const body = await auth.response.json();
    return { response: json(body, auth.response.status) };
  }
  return { runtime, tenantContext: auth.tenantContext, now, url };
}
function active(value: { status: string }) {
  if (value.status !== "active")
    throw Object.assign(Error("not_configured"), { code: "not_configured" });
}
function derivedOperationId(operationId: string) {
  const value = createHash("sha256")
    .update(`celebix:analytics:activate:${operationId}`)
    .digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? (error as { code: unknown }).code
    : null;
}
async function connectionCandidates(
  runtime: ServerAnalyticsRuntime,
  tenantContext: TenantContext,
  now: Date,
  deps: Deps,
) {
  try {
    const current = await runtime.analytics.getConnectionAuthority({
      tenantContext,
      now,
    });
    return { connectionId: current.connectionId, websiteId: current.websiteId };
  } catch (error) {
    if (errorCode(error) !== "not_configured") throw error;
    return { connectionId: deps.uuid(), websiteId: deps.uuid() };
  }
}
async function enable(
  runtime: ServerAnalyticsRuntime,
  tenantContext: TenantContext,
  now: Date,
  operationId: string,
  deps: Deps,
) {
  const { connectionId, websiteId } = await connectionCandidates(
      runtime,
      tenantContext,
      now,
      deps,
    ),
    pending = await runtime.analytics.beginConnection({
      tenantContext,
      now,
      operationId,
      connectionId,
      websiteId,
    });
  let website = await runtime.umami.getWebsite(pending.websiteId);
  if (!website) {
    try {
      website = await runtime.umami.createWebsite({
        websiteId: pending.websiteId,
        name: `Celebix ${tenantContext.store.slug}`,
        domain: pending.hostname,
      });
    } catch {
      website = await runtime.umami.getWebsite(pending.websiteId);
      if (!website) throw Error("provider");
    }
  }
  if (website.id !== pending.websiteId || website.domain !== pending.hostname)
    throw Error("provider");
  const result = await runtime.analytics.activateConnection({
    tenantContext,
    now,
    operationId: derivedOperationId(operationId),
    connectionId: pending.connectionId,
    websiteId: pending.websiteId,
    verifiedHostname: pending.hostname,
  });
  runtime.cache.invalidateConnection(pending.connectionId);
  return result;
}
export function createAnalyticsHttpHandlers(deps: Deps) {
  return Object.freeze({
    connection: Object.freeze({
      GET: async (request: Request) => {
        const c = await context(deps, request, "GET", PATHS.connection);
        if (c.response) return c.response;
        try {
          return json(
            await c.runtime!.analytics.getConnection({
              tenantContext: c.tenantContext!,
              now: c.now!,
            }),
          );
        } catch (error) {
          return failure(error);
        }
      },
      POST: async (request: Request) => {
        const c = await context(deps, request, "POST", PATHS.connection);
        if (c.response) return c.response;
        const op = operation(request),
          intent = await connectionIntent(request);
        if (!op || !intent) return json({ code: "invalid_input" }, 400);
        try {
          if (intent.intent === "enable")
            return json(
              await enable(c.runtime!, c.tenantContext!, c.now!, op, deps),
            );
          const authority = await c.runtime!.analytics.getConnectionAuthority({
            tenantContext: c.tenantContext!,
            now: c.now!,
          });
          const result = await c.runtime!.analytics.disableConnection({
            tenantContext: c.tenantContext!,
            now: c.now!,
            operationId: op,
            expectedVersion: intent.expectedVersion,
          });
          c.runtime!.cache.invalidateConnection(authority.connectionId);
          return json(result);
        } catch (error) {
          return failure(error);
        }
      },
    }),
    active: Object.freeze({
      GET: async (request: Request) => {
        const c = await context(deps, request, "GET", PATHS.active);
        if (c.response) return c.response;
        let authority;
        try {
          authority = await c.runtime!.analytics.getConnectionAuthority({
            tenantContext: c.tenantContext!,
            now: c.now!,
          });
          active(authority);
        } catch (error) {
          return failure(error);
        }
        try {
          return json(
            await c.runtime!.umami.active({
              websiteId: authority.websiteId,
              now: c.now!,
            }),
          );
        } catch {
          return json({
            schemaVersion: 1,
            status: "unavailable",
            activeVisitors: null,
            asOf: c.now!.toISOString(),
          });
        }
      },
    }),
    summary: Object.freeze({
      GET: async (request: Request) => {
        const c = await context(deps, request, "GET", PATHS.summary, ["range"]);
        if (c.response) return c.response;
        const range = c.url!.searchParams.get("range") as AnalyticsRange;
        if (!["7d", "30d", "90d"].includes(range))
          return json({ code: "invalid_input" }, 400);
        try {
          const authority = await c.runtime!.analytics.getConnectionAuthority({
            tenantContext: c.tenantContext!,
            now: c.now!,
          });
          active(authority);
          const key = {
              connectionId: authority.connectionId,
              websiteId: authority.websiteId,
              range,
              timezone: "Europe/Istanbul",
              metric: "summary" as const,
            },
            cached = c.runtime!.cache.get(key);
          if (cached) return json(cached);
          const result = await c.runtime!.umami.summary({
            websiteId: authority.websiteId,
            range,
            timezone: "Europe/Istanbul",
            now: c.now!,
          });
          c.runtime!.cache.set(key, result);
          return json(result);
        } catch (error) {
          return failure(error);
        }
      },
    }),
    metrics: Object.freeze({
      GET: async (request: Request) => {
        const c = await context(deps, request, "GET", PATHS.metrics, [
          "range",
          "type",
        ]);
        if (c.response) return c.response;
        const range = c.url!.searchParams.get("range") as AnalyticsRange,
          type = c.url!.searchParams.get("type") as AnalyticsMetricType;
        if (
          !["7d", "30d", "90d"].includes(range) ||
          !["path", "referrer", "device", "country"].includes(type)
        )
          return json({ code: "invalid_input" }, 400);
        try {
          const authority = await c.runtime!.analytics.getConnectionAuthority({
            tenantContext: c.tenantContext!,
            now: c.now!,
          });
          active(authority);
          const key = {
              connectionId: authority.connectionId,
              websiteId: authority.websiteId,
              range,
              timezone: "Europe/Istanbul",
              metric: type,
            },
            cached = c.runtime!.cache.get(key);
          if (cached) return json(cached);
          const result = await c.runtime!.umami.metrics({
            websiteId: authority.websiteId,
            range,
            timezone: "Europe/Istanbul",
            type,
            now: c.now!,
          });
          c.runtime!.cache.set(key, result);
          return json(result);
        } catch (error) {
          return failure(error);
        }
      },
    }),
  });
}
