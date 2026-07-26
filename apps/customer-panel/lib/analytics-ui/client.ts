import {
  parseAnalyticsConnectionMutationResult,
  parseAnalyticsConnectionView,
  parseAnalyticsMetricResult,
  parseAnalyticsSummary,
  type AnalyticsMetricType,
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
