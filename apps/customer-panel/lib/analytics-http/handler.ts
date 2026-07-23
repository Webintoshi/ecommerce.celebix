import { parseAnalyticsDashboard, type AnalyticsPeriod, type TenantContext } from "@celebix/saas-contracts";
import { ANALYTICS_ERROR_CODES, AnalyticsRepositoryError, type AnalyticsErrorCode } from "@celebix/saas-data";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";

const DASHBOARD_PATH = "/api/analytics/dashboard", EXPORT_PATH = "/api/analytics/export";
const PRIVATE_HEADERS = new Set(["authorization", "x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url"]);
const STATUS: Readonly<Record<AnalyticsErrorCode, number>> = Object.freeze({ invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, durable_authority_invalid: 409, unavailable: 503 });
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerAnalyticsRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerAnalyticsRuntime; tenantContext: TenantContext; now: Date }>;
type Query = Readonly<{ period: AnalyticsPeriod; format?: "csv" | "json" }>;
const MAX_RAW_QUERY_BYTES = 64;
function response(value: unknown, status = 200, headers?: HeadersInit) { const output = new Headers(headers); output.set("cache-control", "no-store"); output.set("x-content-type-options", "nosniff"); return Response.json(value, { status, headers: output }); }
function error(code: string, status: number, headers?: HeadersInit) { return response({ code }, status, headers); }
function privateHeaders(request: Request): boolean { try { for (const [name] of request.headers) if (PRIVATE_HEADERS.has(name) || name.startsWith("x-celebix")) return true; return false; } catch { return true; } }
function query(request: Request, allowFormat: boolean): Query | null {
  let url: URL; try { url = new URL(request.url); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || (allowFormat ? url.pathname !== EXPORT_PATH : url.pathname !== DASHBOARD_PATH)) return null;
  const raw = url.search.slice(1);
  if (!raw || raw.length > MAX_RAW_QUERY_BYTES || !/^[\x21-\x7e]+$/.test(raw)) return null;
  const dashboardMatch = /^period=(today|week|month|year)$/.exec(raw);
  if (!allowFormat) return dashboardMatch ? Object.freeze({ period: dashboardMatch[1] as AnalyticsPeriod }) : null;
  const exportMatch = /^period=(today|week|month|year)&format=(csv|json)$/.exec(raw);
  return exportMatch ? Object.freeze({ period: exportMatch[1] as AnalyticsPeriod, format: exportMatch[2] as "csv" | "json" }) : null;
}
function noBody(request: Request): boolean { return request.body === null && request.headers.get("content-length") === null && request.headers.get("transfer-encoding") === null && request.headers.get("content-type") === null; }
function isResponse(value: unknown): value is Response { return value instanceof Response; }
async function authorize(dependencies: Dependencies, request: Request, allowFormat: boolean): Promise<Response | Readonly<{ authorized: Authorized; query: Query }>> {
  if (request.method !== "GET") return error("method_not_allowed", 405, { allow: "GET" });
  const parsed = query(request, allowFormat); if (!parsed || !noBody(request) || privateHeaders(request)) return error("invalid_input", 400);
  let cookie; try { cookie = readOrderPanelSessionCookie(request); } catch { return error("unauthenticated", 401); } if (cookie.kind !== "present") return error("unauthenticated", 401);
  let runtime: ServerAnalyticsRuntime | null; try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); } if (!runtime) return error("unavailable", 503);
  let now: Date, requestId: string; try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); } if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) return error("unavailable", 503);
  let access: ServerPanelAccessResult; try { access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) }); } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401); if (access.kind === "unauthorized") return error("membership_denied", 403); if (access.kind !== "authenticated") return error("unavailable", 503);
  return Object.freeze({ authorized: Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) }), query: parsed });
}
function repositoryError(errorValue: unknown): Response { if (errorValue instanceof AnalyticsRepositoryError && ANALYTICS_ERROR_CODES.includes(errorValue.code)) return error(errorValue.code, STATUS[errorValue.code]); return error("unavailable", 503); }
function csv(dashboard: ReturnType<typeof parseAnalyticsDashboard>): Response { const body = "bucket_start,orders,revenue_cents\r\n" + dashboard.series.map((point) => `${point.startsAt},${point.orders},${point.revenueCents}\r\n`).join(""); return new Response(body, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="merchant-analytics.csv"', "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
export function createAnalyticsHttpHandlers(dependencies: Dependencies) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function") throw new Error("analytics_http_handler_invalid");
  async function run(request: Request, exporting: boolean): Promise<Response> { const authorization = await authorize(dependencies, request, exporting); if (isResponse(authorization)) return authorization; try { const dashboard = parseAnalyticsDashboard(await authorization.authorized.runtime.analytics.dashboard({ tenantContext: authorization.authorized.tenantContext, now: authorization.authorized.now, period: authorization.query.period })); if (exporting && authorization.query.format === "csv") return csv(dashboard); return response(dashboard, 200, exporting ? { "content-disposition": 'attachment; filename="merchant-analytics.json"' } : undefined); } catch (errorValue) { return repositoryError(errorValue); } }
  return Object.freeze({ dashboard(request: Request) { return run(request, false); }, export(request: Request) { return run(request, true); } });
}
