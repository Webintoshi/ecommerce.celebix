import {
  ANALYTICS_PERIODS,
  parseAnalyticsDashboard,
  parseAnalyticsConnectionMutationResult,
  parseAnalyticsConnectionView,
  parseAnalyticsMetricResult,
  parseAnalyticsSummary,
  type AnalyticsMetricType,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type AnalyticsRange,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Fetch = typeof globalThis.fetch;

function invalid(): never { throw new Error("analytics_api_response_invalid"); }
function origin() { return typeof location !== "undefined" ? location.origin : "http://localhost"; }

export function createAnalyticsBrowserApi(fetcher: Fetch = fetch) {
  async function call<T>(path: string, init: RequestInit, parser: (value: unknown) => T): Promise<T> {
    const response = await fetcher(new Request(`${origin()}${path}`, { ...init, credentials: "same-origin", cache: "no-store" }));
    let value: unknown;
    try { value = await response.json(); } catch { return invalid(); }
    if (!response.ok) throw new Error("analytics_api_unavailable");
    try { return parser(value); } catch { return invalid(); }
  }
  function key(value: string) {
    if (!UUID.test(value)) throw new Error("analytics_api_input_invalid");
    return value;
  }
  return Object.freeze({
    connection(signal?: AbortSignal) { return call("/api/analytics/connection", { method: "GET", signal }, parseAnalyticsConnectionView); },
    enable(input: { idempotencyKey: string }, signal?: AbortSignal) { return call("/api/analytics/connection", { method: "POST", signal, headers: { "content-type": "application/json", "idempotency-key": key(input.idempotencyKey) }, body: JSON.stringify({ intent: "enable" }) }, parseAnalyticsConnectionMutationResult); },
    disable(input: { idempotencyKey: string; expectedVersion: number }, signal?: AbortSignal) {
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("analytics_api_input_invalid");
      return call("/api/analytics/connection", { method: "POST", signal, headers: { "content-type": "application/json", "idempotency-key": key(input.idempotencyKey) }, body: JSON.stringify({ intent: "disable", expectedVersion: input.expectedVersion }) }, parseAnalyticsConnectionMutationResult);
    },
    summary(range: AnalyticsRange, signal?: AbortSignal) {
      if (!["7d", "30d", "90d"].includes(range)) throw new Error("analytics_api_input_invalid");
      return call(`/api/analytics/summary?range=${range}`, { method: "GET", signal }, parseAnalyticsSummary);
    },
    metrics(range: AnalyticsRange, type: AnalyticsMetricType, signal?: AbortSignal) {
      if (!["7d", "30d", "90d"].includes(range) || !["path", "referrer", "device", "country"].includes(type)) throw new Error("analytics_api_input_invalid");
      return call(`/api/analytics/metrics?range=${range}&type=${type}`, { method: "GET", signal }, parseAnalyticsMetricResult);
    },
  });
}

const DASHBOARD_CODES = ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid", "unavailable"] as const;
type DashboardCode = (typeof DASHBOARD_CODES)[number];
type DashboardFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export class AnalyticsApiError extends Error { constructor(readonly code: DashboardCode, readonly status: number) { super(code); this.name = "AnalyticsApiError"; } }
function dashboardPeriod(value: AnalyticsPeriod): AnalyticsPeriod { if (!ANALYTICS_PERIODS.includes(value)) throw new TypeError("analytics_client_invalid"); return value; }
function dashboardCode(value: unknown): DashboardCode { return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>).code === "string" && DASHBOARD_CODES.includes((value as Record<string, unknown>).code as DashboardCode) ? (value as Record<string, unknown>).code as DashboardCode : "unavailable"; }
async function readDashboardJson(response: Response): Promise<unknown> { if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new AnalyticsApiError("unavailable", response.status || 503); try { return await response.json(); } catch { throw new AnalyticsApiError("unavailable", 503); } }
export function createAnalyticsApi(fetcher: DashboardFetch = fetch) {
  async function request(path: string): Promise<Readonly<AnalyticsDashboard>> { try { const response = await fetcher(path, { credentials: "same-origin", cache: "no-store" }); const value = await readDashboardJson(response); if (!response.ok) throw new AnalyticsApiError(dashboardCode(value), response.status); try { return parseAnalyticsDashboard(value); } catch { throw new AnalyticsApiError("unavailable", 503); } } catch (error) { if (error instanceof AnalyticsApiError) throw error; throw new AnalyticsApiError("unavailable", 503); } }
  async function download(path: string): Promise<string> { try { const response = await fetcher(path, { credentials: "same-origin", cache: "no-store" }); if (!response.ok || response.headers.get("content-type") !== "text/csv; charset=utf-8" || response.headers.get("content-disposition") !== "attachment; filename=\"merchant-analytics.csv\"") throw new AnalyticsApiError("unavailable", response.status || 503); return await response.text(); } catch (error) { if (error instanceof AnalyticsApiError) throw error; throw new AnalyticsApiError("unavailable", 503); } }
  return Object.freeze({ dashboard(value: AnalyticsPeriod) { return request(`/api/analytics/dashboard?period=${encodeURIComponent(dashboardPeriod(value))}`); }, export(value: AnalyticsPeriod, format: "csv" | "json") { if (format !== "csv" && format !== "json") throw new TypeError("analytics_client_invalid"); return format === "json" ? request(`/api/analytics/export?period=${encodeURIComponent(dashboardPeriod(value))}&format=json`) : download(`/api/analytics/export?period=${encodeURIComponent(dashboardPeriod(value))}&format=csv`); } });
}
export const analyticsApi = createAnalyticsApi();
