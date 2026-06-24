import "server-only";

import {
  resolveUmamiConfigFromEnv,
  type UmamiConfig,
  type UmamiConfigPresence,
} from "@/lib/analytics/umami-config";
import { STORE_RUNTIME } from "@/lib/store-runtime";

type UmamiAggregateResult = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
};

type UmamiExpandedMetric = {
  name?: string;
  visitors?: number;
  pageviews?: number;
  visits?: number;
  bounces?: number;
  totaltime?: number;
};

type UmamiRealtimePayload = {
  countries?: Record<string, number>;
  urls?: Record<string, number>;
  referrers?: Record<string, number>;
};

export type UmamiMetricBreakdownItem = {
  label: string;
  visitors: number;
  pageviews: number;
  visits: number;
  bounces: number;
  totalTime: number;
};

export type UmamiRealtimeSnapshot = {
  activeVisitors: number;
  devices: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  topPages: Array<{ url: string; count: number }>;
  topReferrers: Array<{ label: string; count: number }>;
  topCountries: Array<{ label: string; count: number }>;
  topBrowsers: Array<{ label: string; count: number }>;
};

function getUmamiConfig(): UmamiConfig | null {
  return resolveUmamiConfigFromEnv({
    env: process.env,
    storeSlug: STORE_RUNTIME.slug,
  }).config;
}

export function isUmamiConfigured(): boolean {
  return Boolean(getUmamiConfig());
}

export function getUmamiConfigPresence(): UmamiConfigPresence {
  return resolveUmamiConfigFromEnv({
    env: process.env,
    storeSlug: STORE_RUNTIME.slug,
  }).presence;
}

async function umamiFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T | null> {
  const config = getUmamiConfig();

  if (!config) {
    return null;
  }

  const url = new URL(`${config.baseUrl}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

function toTimestamp(value: string): number {
  return new Date(value).getTime();
}

function normalizeMapEntries(
  map: Record<string, number> | undefined,
  emptyLabel: string,
  limit = 3,
): Array<{ label: string; count: number }> {
  if (!map) {
    return [];
  }

  return Object.entries(map)
    .map(([label, count]) => ({
      label: label && label.trim().length > 0 ? label : emptyLabel,
      count: Number(count || 0),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function normalizeExpandedMetrics(
  metrics: UmamiExpandedMetric[] | null,
  limit = 3,
): UmamiMetricBreakdownItem[] {
  if (!metrics) {
    return [];
  }

  return metrics
    .map((metric) => ({
      label: metric.name?.trim() || "Bilinmiyor",
      visitors: Number(metric.visitors || 0),
      pageviews: Number(metric.pageviews || 0),
      visits: Number(metric.visits || 0),
      bounces: Number(metric.bounces || 0),
      totalTime: Number(metric.totaltime || 0),
    }))
    .filter((metric) => metric.visitors > 0 || metric.pageviews > 0 || metric.visits > 0)
    .slice(0, limit);
}

function normalizeDeviceCounts(metrics: UmamiMetricBreakdownItem[]) {
  return metrics.reduce(
    (acc, metric) => {
      const label = metric.label.toLocaleLowerCase("tr");
      const count = metric.visitors || metric.visits || metric.pageviews || 0;

      if (label.includes("tablet") || label.includes("ipad")) {
        acc.tablet += count;
      } else if (label.includes("mobile") || label.includes("telefon") || label.includes("android")) {
        acc.mobile += count;
      } else {
        acc.desktop += count;
      }

      return acc;
    },
    {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    },
  );
}

export async function fetchUmamiAggregate(params: {
  startDate: string;
  endDate: string;
}): Promise<UmamiAggregateResult | null> {
  const config = getUmamiConfig();

  if (!config) {
    return null;
  }

  return umamiFetch<UmamiAggregateResult>(`/api/websites/${config.websiteId}/stats`, {
    startAt: toTimestamp(params.startDate),
    endAt: toTimestamp(params.endDate),
  });
}

export async function fetchUmamiRealtimeSnapshot(): Promise<UmamiRealtimeSnapshot | null> {
  const config = getUmamiConfig();

  if (!config) {
    return null;
  }

  const endAt = Date.now();
  const startAt = endAt - 30 * 60 * 1000;

  const [active, realtime, devices, browsers] = await Promise.all([
    umamiFetch<{ visitors?: number }>(`/api/websites/${config.websiteId}/active`),
    umamiFetch<UmamiRealtimePayload>(`/api/realtime/${config.websiteId}`),
    umamiFetch<UmamiExpandedMetric[]>(`/api/websites/${config.websiteId}/metrics/expanded`, {
      startAt,
      endAt,
      type: "device",
      limit: 10,
    }),
    umamiFetch<UmamiExpandedMetric[]>(`/api/websites/${config.websiteId}/metrics/expanded`, {
      startAt,
      endAt,
      type: "browser",
      limit: 5,
    }),
  ]);

  const deviceMetrics = normalizeExpandedMetrics(devices, 10);

  return {
    activeVisitors: Number(active?.visitors || 0),
    devices: normalizeDeviceCounts(deviceMetrics),
    topPages: normalizeMapEntries(realtime?.urls, "Ana Sayfa", 5).map((item) => ({
      url: item.label,
      count: item.count,
    })),
    topReferrers: normalizeMapEntries(realtime?.referrers, "Direkt", 3),
    topCountries: normalizeMapEntries(realtime?.countries, "Bilinmiyor", 3),
    topBrowsers: normalizeExpandedMetrics(browsers, 3).map((metric) => ({
      label: metric.label,
      count: metric.visitors || metric.visits || metric.pageviews,
    })),
  };
}
