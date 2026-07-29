import {
  ANALYTICS_METRIC_TYPES,
  parseAnalyticsConnectionView,
  parseAnalyticsMetricResult,
  parseAnalyticsSummary,
  type AnalyticsConnectionView,
  type AnalyticsMetricResult,
  type AnalyticsMetricType,
  type AnalyticsRange,
  type AnalyticsSummary,
} from "@celebix/saas-contracts";

export interface AnalyticsBrowserApi {
  connection(signal?: AbortSignal): Promise<AnalyticsConnectionView>;
  summary(
    range: AnalyticsRange,
    signal?: AbortSignal,
  ): Promise<AnalyticsSummary>;
  metrics(
    range: AnalyticsRange,
    type: AnalyticsMetricType,
    signal?: AbortSignal,
  ): Promise<AnalyticsMetricResult>;
}

export type AnalyticsPresentationModel = Readonly<{
  state: "loading" | "loaded" | "empty" | "disabled" | "error";
  summary: AnalyticsSummary | null;
  metrics: Readonly<Record<AnalyticsMetricType, AnalyticsMetricResult | null>>;
}>;

function emptyMetrics(): Readonly<Record<AnalyticsMetricType, null>> {
  return Object.freeze({
    path: null,
    referrer: null,
    device: null,
    country: null,
  });
}

function state(
  value: AnalyticsPresentationModel["state"],
): AnalyticsPresentationModel {
  return Object.freeze({
    state: value,
    summary: null,
    metrics: emptyMetrics(),
  });
}

function invalid(): never {
  throw new Error("analytics_presentation_invalid");
}

export const loadingAnalyticsPresentation = () => state("loading");
export const disabledAnalyticsPresentation = () => state("disabled");
export const errorAnalyticsPresentation = () => state("error");

function hasData(
  summary: AnalyticsSummary,
  metrics: Readonly<Record<AnalyticsMetricType, AnalyticsMetricResult | null>>,
): boolean {
  return (
    summary.pageviews > 0 ||
    summary.visitors > 0 ||
    summary.visits > 0 ||
    summary.activeVisitors > 0 ||
    summary.pageviewsSeries.length > 0 ||
    Object.values(metrics).some((metric) => (metric?.items.length ?? 0) > 0)
  );
}

export async function loadAnalyticsPresentation(
  api: AnalyticsBrowserApi,
  range: AnalyticsRange,
  signal: AbortSignal,
): Promise<AnalyticsPresentationModel> {
  if (
    !api ||
    !["7d", "30d", "90d"].includes(range) ||
    !(signal instanceof AbortSignal)
  )
    invalid();
  const connection = parseAnalyticsConnectionView(await api.connection(signal));
  if (!connection.configured || connection.status !== "active")
    return disabledAnalyticsPresentation();

  const [summaryValue, metricResults] = await Promise.all([
    api.summary(range, signal),
    Promise.allSettled(
      ANALYTICS_METRIC_TYPES.map((type) => api.metrics(range, type, signal)),
    ),
  ]);
  let summary: AnalyticsSummary;
  try {
    summary = parseAnalyticsSummary(summaryValue);
    if (summary.range !== range) invalid();
  } catch {
    return invalid();
  }
  const metrics = Object.freeze(
    Object.fromEntries(
      ANALYTICS_METRIC_TYPES.map((type, index) => {
        const result = metricResults[index];
        if (!result || result.status === "rejected") return [type, null];
        try {
          const parsed = parseAnalyticsMetricResult(result.value);
          return [
            type,
            parsed.type === type && parsed.range === range ? parsed : null,
          ];
        } catch {
          return [type, null];
        }
      }),
    ) as Record<AnalyticsMetricType, AnalyticsMetricResult | null>,
  );
  return Object.freeze({
    state: hasData(summary, metrics) ? "loaded" : "empty",
    summary,
    metrics,
  });
}
