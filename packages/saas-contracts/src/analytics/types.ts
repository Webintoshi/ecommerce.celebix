export const ANALYTICS_RANGES = Object.freeze(["7d", "30d", "90d"] as const);
export const ANALYTICS_METRIC_TYPES = Object.freeze(["path", "referrer", "device", "country"] as const);
export const ANALYTICS_CONNECTION_STATUSES = Object.freeze(["pending", "active", "disabled", "failed"] as const);

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export type AnalyticsMetricType = (typeof ANALYTICS_METRIC_TYPES)[number];
export type AnalyticsConnectionStatus = (typeof ANALYTICS_CONNECTION_STATUSES)[number];

export type AnalyticsConnectionView = Readonly<{
  schemaVersion: 1;
  provider: "umami";
  status: AnalyticsConnectionStatus;
  configured: boolean;
  hostname: string | null;
  version: number | null;
  lastVerifiedAt: string | null;
}>;

export type AnalyticsPoint = Readonly<{ at: string; value: number }>;

export type AnalyticsSummary = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  asOf: string;
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTimeSeconds: number;
  activeVisitors: number;
  bounceRateBasisPoints: number;
  averageVisitSeconds: number;
  comparison: Readonly<{ pageviews: number; visitors: number; visits: number; bounces: number }> | null;
  pageviewsSeries: readonly AnalyticsPoint[];
  visitsSeries: readonly AnalyticsPoint[];
}>;

export type AnalyticsMetricRow = Readonly<{ label: string; value: number }>;

export type AnalyticsMetricResult = Readonly<{
  schemaVersion: 1;
  range: AnalyticsRange;
  type: AnalyticsMetricType;
  asOf: string;
  items: readonly AnalyticsMetricRow[];
}>;

export type AnalyticsConnectionMutationResult = Readonly<{
  status: AnalyticsConnectionStatus;
  version: number;
  updatedAt: string;
  replayed: boolean;
}>;
