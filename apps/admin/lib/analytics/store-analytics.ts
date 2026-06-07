import "server-only";

import { maybeListAdminAssignableProducts } from "@/lib/db/light-postgres-read";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import {
  createUmamiClient,
  UmamiApiError,
  type UmamiExpandedMetric,
  type UmamiWebsiteRecord,
} from "@/lib/analytics/umami-client";

type AnalyticsAvailabilityStatus =
  | "available"
  | "partial"
  | "unconfigured"
  | "unauthorized"
  | "website-not-found"
  | "error";

type StoreUmamiConfig = {
  baseUrl: string;
  websiteId: string;
  websiteName: string;
  domains: string[];
  timezone: string;
};

type DateRange = {
  startAt: number;
  endAt: number;
};

type TopMetricItem = {
  label: string;
  path: string;
  visitors: number;
  pageviews: number;
};

type ReferrerItem = {
  source: string;
  visitors: number;
  pageviews: number;
};

type WebsiteScopeSummary = {
  name: string;
  domain: string;
  configuredDomains: string[];
  recordFound: boolean | null;
  matchesConfiguredDomain: boolean | null;
  duplicateCount: number | null;
};

export interface StoreAnalyticsSummary {
  source: "umami";
  availability: {
    status: AnalyticsAvailabilityStatus;
    message: string | null;
  };
  activeUsers: number | null;
  visitorsToday: number | null;
  pageviewsToday: number | null;
  visitors7d: number | null;
  pageviews7d: number | null;
  topPages: TopMetricItem[];
  topProducts: TopMetricItem[];
  referrers: ReferrerItem[];
  website: WebsiteScopeSummary;
  updatedAt: string;
}

const DEFAULT_UMAMI_HOST = "https://analytics.celebix.co";
const DERYCRAFT_WEBSITE_ID = "1b88806d-9d52-4178-8294-53688a506408";
const DERYCRAFT_DOMAINS = ["derycraft.com.tr", "www.derycraft.com.tr"];

function readFirstEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function buildUnavailableSummary(
  status: AnalyticsAvailabilityStatus,
  message: string,
  config: StoreUmamiConfig | null,
): StoreAnalyticsSummary {
  return {
    source: "umami",
    availability: {
      status,
      message,
    },
    activeUsers: null,
    visitorsToday: null,
    pageviewsToday: null,
    visitors7d: null,
    pageviews7d: null,
    topPages: [],
    topProducts: [],
    referrers: [],
    website: {
      name: config?.websiteName || STORE_RUNTIME.name,
      domain: config?.domains[0] || STORE_RUNTIME.storefrontDomain,
      configuredDomains: config?.domains || [STORE_RUNTIME.storefrontDomain],
      recordFound: null,
      matchesConfiguredDomain: null,
      duplicateCount: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function getStoreUmamiConfig(): StoreUmamiConfig | null {
  if (STORE_RUNTIME.slug !== "derycraftcomtr") {
    return null;
  }

  return {
    baseUrl:
      readFirstEnv("UMAMI_BASE_URL", "UMAMI_HOST_URL", "NEXT_PUBLIC_UMAMI_HOST_URL") ||
      DEFAULT_UMAMI_HOST,
    websiteId:
      readFirstEnv(
        "UMAMI_DERYCRAFTCOMTR_WEBSITE_ID",
        "UMAMI_WEBSITE_ID",
        "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
      ) || DERYCRAFT_WEBSITE_ID,
    websiteName: "derycraft.com.tr",
    domains: DERYCRAFT_DOMAINS,
    timezone: "Europe/Istanbul",
  };
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date);

  const valueByType = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");

  return {
    year: valueByType("year"),
    month: valueByType("month"),
    day: valueByType("day"),
    hour: valueByType("hour"),
    minute: valueByType("minute"),
    second: valueByType("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - date.getTime();
}

function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
) {
  const guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function addDays(
  dateParts: { year: number; month: number; day: number },
  days: number,
) {
  const next = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function getTodayRange(timeZone: string): DateRange {
  const now = new Date();
  const today = getParts(now, timeZone);
  const tomorrow = addDays(today, 1);

  return {
    startAt: zonedTimeToUtc(
      {
        year: today.year,
        month: today.month,
        day: today.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime(),
    endAt: zonedTimeToUtc(
      {
        year: tomorrow.year,
        month: tomorrow.month,
        day: tomorrow.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime(),
  };
}

function getRollingDaysRange(days: number, timeZone: string): DateRange {
  const now = new Date();
  const today = getParts(now, timeZone);
  const startDay = addDays(today, -(days - 1));
  const tomorrow = addDays(today, 1);

  return {
    startAt: zonedTimeToUtc(
      {
        year: startDay.year,
        month: startDay.month,
        day: startDay.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime(),
    endAt: zonedTimeToUtc(
      {
        year: tomorrow.year,
        month: tomorrow.month,
        day: tomorrow.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime(),
  };
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanizePagePath(path: string) {
  if (!path || path === "/") {
    return "Ana Sayfa";
  }

  if (path === "/urunler") {
    return "Urunler";
  }

  if (path === "/odeme") {
    return "Odeme";
  }

  if (path.startsWith("/urunler/")) {
    const slug = path.split("/").filter(Boolean).at(-1) || "";
    return slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return path;
}

function normalizeReferrerLabel(value: string) {
  if (!value || value === "(direct)" || value === "direct") {
    return "Direkt";
  }

  return value;
}

function extractProductSlug(path: string): string | null {
  if (!path.startsWith("/urunler/")) {
    return null;
  }

  const slug = path.split("/").filter(Boolean)[1];
  return slug || null;
}

function mapTopPages(metrics: UmamiExpandedMetric[]): TopMetricItem[] {
  return metrics
    .filter((entry) => typeof entry.name === "string" && entry.name.trim().startsWith("/"))
    .slice(0, 10)
    .map((entry) => ({
      label: humanizePagePath(entry.name),
      path: entry.name,
      visitors: normalizeNumber(entry.visitors),
      pageviews: normalizeNumber(entry.pageviews),
    }));
}

async function getProductNameMap(paths: string[]) {
  const slugs = Array.from(
    new Set(paths.map((path) => extractProductSlug(path)).filter((value): value is string => Boolean(value))),
  );

  if (slugs.length === 0) {
    return new Map<string, string>();
  }

  const lightProducts = await maybeListAdminAssignableProducts();
  if (lightProducts) {
    return new Map(
      lightProducts
        .filter((product) => slugs.includes(product.slug))
        .map((product) => [product.slug, product.name]),
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug, name")
    .in("slug", slugs);

  if (error) {
    console.error("Umami analytics product label lookup failed:", error);
    return new Map<string, string>();
  }

  return new Map((data || []).map((row) => [String(row.slug || ""), String(row.name || "")]));
}

async function mapTopProducts(metrics: UmamiExpandedMetric[]): Promise<TopMetricItem[]> {
  const productMetrics = metrics
    .filter((entry) => typeof entry.name === "string" && entry.name.trim().startsWith("/urunler/"))
    .slice(0, 10);

  const namesBySlug = await getProductNameMap(productMetrics.map((entry) => entry.name));

  return productMetrics.map((entry) => {
    const slug = extractProductSlug(entry.name) || "";
    return {
      label: namesBySlug.get(slug) || humanizePagePath(entry.name),
      path: entry.name,
      visitors: normalizeNumber(entry.visitors),
      pageviews: normalizeNumber(entry.pageviews),
    };
  });
}

function mapReferrers(metrics: UmamiExpandedMetric[]): ReferrerItem[] {
  return metrics
    .filter((entry) => typeof entry.name === "string" && entry.name.trim().length > 0)
    .slice(0, 10)
    .map((entry) => ({
      source: normalizeReferrerLabel(entry.name),
      visitors: normalizeNumber(entry.visitors),
      pageviews: normalizeNumber(entry.pageviews),
    }));
}

function buildWebsiteScopeSummary(
  config: StoreUmamiConfig,
  website: UmamiWebsiteRecord | null,
  duplicates: UmamiWebsiteRecord[] | null,
): WebsiteScopeSummary {
  const normalizedConfiguredDomains = config.domains.map((domain) => domain.toLowerCase());
  const websiteDomain = website?.domain?.toLowerCase() || null;

  return {
    name: website?.name || config.websiteName,
    domain: website?.domain || config.domains[0],
    configuredDomains: config.domains,
    recordFound: website ? true : null,
    matchesConfiguredDomain: websiteDomain
      ? normalizedConfiguredDomains.includes(websiteDomain)
      : null,
    duplicateCount: duplicates ? duplicates.length : null,
  };
}

export async function getStoreAnalyticsSummary(): Promise<StoreAnalyticsSummary> {
  const config = getStoreUmamiConfig();

  if (!config) {
    return buildUnavailableSummary(
      "unconfigured",
      "Bu magaza icin Umami website eslemesi tanimli degil.",
      null,
    );
  }

  const apiKey = readFirstEnv("UMAMI_API_KEY");
  const bearerToken = readFirstEnv("UMAMI_API_TOKEN", "UMAMI_TOKEN");
  const username = readFirstEnv("UMAMI_API_USERNAME", "UMAMI_USERNAME");
  const password = readFirstEnv("UMAMI_API_PASSWORD", "UMAMI_PASSWORD");

  if (!apiKey && !bearerToken && !(username && password)) {
    return buildUnavailableSummary(
      "unconfigured",
      "Umami API kimlik bilgileri admin runtime icin tanimli degil.",
      config,
    );
  }

  const client = createUmamiClient({
    baseUrl: config.baseUrl,
    apiKey,
    bearerToken,
    username,
    password,
  });

  const todayRange = getTodayRange(config.timezone);
  const last7DaysRange = getRollingDaysRange(7, config.timezone);

  try {
    const [
      websiteResult,
      websitesResult,
      statsTodayResult,
      stats7dResult,
      topPagesResult,
      referrersResult,
      activeUsersResult,
    ] = await Promise.allSettled([
      client.getWebsite(config.websiteId),
      client.listWebsites(config.domains[0]),
      client.getStats(config.websiteId, todayRange),
      client.getStats(config.websiteId, last7DaysRange),
      client.getExpandedMetrics(config.websiteId, {
        ...last7DaysRange,
        type: "path",
        limit: 10,
      }),
      client.getExpandedMetrics(config.websiteId, {
        ...last7DaysRange,
        type: "referrer",
        limit: 10,
      }),
      client.getActiveVisitors(config.websiteId),
    ]);

    if (websiteResult.status === "rejected" && websiteResult.reason instanceof UmamiApiError) {
      if (websiteResult.reason.code === "unauthorized") {
        return buildUnavailableSummary(
          "unauthorized",
          "Umami API kimlik bilgileri gecersiz veya yetkisiz.",
          config,
        );
      }

      if (websiteResult.reason.code === "not-found") {
        return buildUnavailableSummary(
          "website-not-found",
          "Derycraft website kaydi Umami uzerinde bulunamadi.",
          config,
        );
      }
    }

    const website =
      websiteResult.status === "fulfilled"
        ? websiteResult.value
        : null;

    const duplicateRecords =
      websitesResult.status === "fulfilled"
        ? websitesResult.value.data.filter((entry) =>
            config.domains.includes((entry.domain || "").toLowerCase()),
          )
        : null;

    const topPages =
      topPagesResult.status === "fulfilled"
        ? mapTopPages(topPagesResult.value)
        : [];

    const topProducts =
      topPagesResult.status === "fulfilled"
        ? await mapTopProducts(topPagesResult.value)
        : [];

    const referrers =
      referrersResult.status === "fulfilled"
        ? mapReferrers(referrersResult.value)
        : [];

    const activeUsers =
      activeUsersResult.status === "fulfilled"
        ? normalizeNumber(activeUsersResult.value.visitors)
        : null;

    const visitorsToday =
      statsTodayResult.status === "fulfilled"
        ? normalizeNumber(statsTodayResult.value.visitors)
        : null;

    const pageviewsToday =
      statsTodayResult.status === "fulfilled"
        ? normalizeNumber(statsTodayResult.value.pageviews)
        : null;

    const visitors7d =
      stats7dResult.status === "fulfilled"
        ? normalizeNumber(stats7dResult.value.visitors)
        : null;

    const pageviews7d =
      stats7dResult.status === "fulfilled"
        ? normalizeNumber(stats7dResult.value.pageviews)
        : null;

    const partialFailures = [
      websiteResult,
      websitesResult,
      statsTodayResult,
      stats7dResult,
      topPagesResult,
      referrersResult,
      activeUsersResult,
    ].some((result) => result.status === "rejected");

    return {
      source: "umami",
      availability: {
        status: partialFailures ? "partial" : "available",
        message: partialFailures
          ? "Bazi Umami metrikleri eksik geldi; sayfa guvenli fallback ile gosteriliyor."
          : null,
      },
      activeUsers,
      visitorsToday,
      pageviewsToday,
      visitors7d,
      pageviews7d,
      topPages,
      topProducts,
      referrers,
      website: buildWebsiteScopeSummary(config, website, duplicateRecords),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Store analytics summary failed:", error);

    if (error instanceof UmamiApiError) {
      if (error.code === "missing-auth") {
        return buildUnavailableSummary("unconfigured", error.message, config);
      }

      if (error.code === "unauthorized" || error.code === "login-failed") {
        return buildUnavailableSummary("unauthorized", error.message, config);
      }

      if (error.code === "not-found") {
        return buildUnavailableSummary("website-not-found", error.message, config);
      }

      return buildUnavailableSummary("error", error.message, config);
    }

    return buildUnavailableSummary(
      "error",
      "Umami analytics verileri okunurken beklenmeyen bir hata olustu.",
      config,
    );
  }
}
