import {
  parseAnalyticsSafeDimension,
  type AnalyticsMetricResult,
  type AnalyticsMetricType,
  type AnalyticsRange,
  type AnalyticsSummary,
  type AnalyticsActiveVisitors,
} from "@celebix/saas-contracts";
import type { UmamiPrivateApiConfig } from "./config.ts";
import {
  inputHostname,
  inputName,
  inputUuid,
  parseLogin,
  parseActiveVisitors,
  parseMetrics,
  parseSummaryParts,
  parseWebsite,
  type UmamiWebsite,
} from "./parsers.ts";
import { readUmamiJson } from "./response.ts";
export type UmamiFetch = (request: Request) => Promise<Response>;
export class UmamiProviderError extends Error {
  constructor(
    readonly code:
      | "umami_provider_input_invalid"
      | "umami_provider_timeout"
      | "umami_provider_response_invalid"
      | "umami_provider_response_too_large"
      | "umami_provider_unavailable",
  ) {
    super(code);
    this.name = "UmamiProviderError";
  }
}
export interface UmamiClient {
  createWebsite(
    input: Readonly<{ websiteId: string; name: string; domain: string }>,
  ): Promise<UmamiWebsite>;
  getWebsite(websiteId: string): Promise<UmamiWebsite | null>;
  active(
    input: Readonly<{ websiteId: string; now: Date }>,
  ): Promise<AnalyticsActiveVisitors>;
  summary(
    input: Readonly<{
      websiteId: string;
      range: AnalyticsRange;
      timezone: string;
      now: Date;
      start?: Date;
      end?: Date;
    }>,
  ): Promise<AnalyticsSummary>;
  metrics(
    input: Readonly<{
      websiteId: string;
      range: AnalyticsRange;
      timezone: string;
      type: AnalyticsMetricType;
      now: Date;
      start?: Date;
      end?: Date;
    }>,
  ): Promise<AnalyticsMetricResult>;
  independentEventSessions(
    input: Readonly<{
      websiteId: string;
      start: Date;
      end: Date;
      eventNames: readonly string[];
      filters?: Readonly<{
        device?: string;
        source?: string;
        campaign?: string;
        currency?: string;
        productId?: string;
        categoryId?: string;
      }>;
    }>,
  ): Promise<
    Readonly<{ items: readonly Readonly<{ label: string; value: number }>[] }>
  >;
  eventSessions(
    input: Readonly<{
      websiteId: string;
      start: Date;
      end: Date;
      eventNames: readonly string[];
      verifiedPurchases?: readonly Readonly<{
        anonymousSessionRef: string;
        occurredAt: string;
      }>[];
      filters?: Readonly<{
        device?: string;
        source?: string;
        campaign?: string;
        currency?: string;
        productId?: string;
        categoryId?: string;
      }>;
    }>,
  ): Promise<
    Readonly<{ items: readonly Readonly<{ label: string; value: number }>[] }>
  >;
  acquisitionBreakdown(
    input: Readonly<{
      websiteId: string;
      start: Date;
      end: Date;
      filters?: Readonly<{
        device?: string;
        source?: string;
        campaign?: string;
      }>;
    }>,
  ): Promise<
    Readonly<{
      items: readonly Readonly<{
        source: string;
        medium: string;
        campaign: string | null;
        visitors: number;
        pageviews: number;
        productViews: number;
        addsToCart: number;
        checkouts: number;
      }>[];
    }>
  >;
  eventPropertyValues(
    input: Readonly<{
      websiteId: string;
      start: Date;
      end: Date;
      eventName: "product_view" | "add_to_cart";
      propertyName: "product_id";
      productIds: readonly string[];
      filters?: Readonly<{
        device?: string;
        source?: string;
        campaign?: string;
        currency?: string;
        categoryId?: string;
      }>;
    }>,
  ): Promise<
    Readonly<{ items: readonly Readonly<{ label: string; value: number }>[] }>
  >;
}
type Audit = (
  event: Readonly<{
    operation: string;
    outcome: "completed" | "rejected" | "unavailable";
  }>,
) => void | Promise<void>;
function provider(error: unknown): UmamiProviderError {
  if (error instanceof UmamiProviderError) return error;
  if (
    error instanceof Error &&
    [
      "umami_provider_input_invalid",
      "umami_provider_timeout",
      "umami_provider_response_invalid",
      "umami_provider_response_too_large",
      "umami_provider_unavailable",
    ].includes(error.message)
  )
    return new UmamiProviderError(error.message as UmamiProviderError["code"]);
  return new UmamiProviderError("umami_provider_unavailable");
}
const FUNNEL_EVENTS = new Set([
  "product_view",
  "add_to_cart",
  "view_cart",
  "begin_checkout",
  "payment_method_selected",
  "purchase",
]);
const MAX_FUNNEL_EVENTS_PER_STEP = 10_000;
const MAX_FUNNEL_PAGES_PER_STEP = 10;
const MAX_FUNNEL_PIVOT_QUERIES = 10;
const MIN_FUNNEL_PARTITION_MILLISECONDS = 60 * 60 * 1000;
function funnelPivotPage(value: unknown, expectedPage: number) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new UmamiProviderError("umami_provider_response_invalid");
  const response = value as Record<string, unknown>,
    count = Number(response.count),
    page = Number(response.page),
    pageSize = Number(response.pageSize);
  if (
    !Array.isArray(response.data) ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 100_000_000 ||
    page !== expectedPage ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000 ||
    response.data.length > pageSize
  )
    throw new UmamiProviderError("umami_provider_response_invalid");
  const rows = response.data.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new UmamiProviderError("umami_provider_response_invalid");
    const row = entry as Record<string, unknown>,
      keys = row.propertyKeys,
      values = row.propertyValues;
    inputUuid(row.sessionId);
    if (
      !Array.isArray(keys) ||
      !Array.isArray(values) ||
      keys.length !== values.length ||
      keys.length > 100 ||
      keys.some((key) => typeof key !== "string") ||
      values.some(
        (item) =>
          typeof item !== "string" &&
          typeof item !== "number" &&
          typeof item !== "boolean" &&
          item !== null,
      )
    )
      throw new UmamiProviderError("umami_provider_response_invalid");
    const sessionIndex = keys.indexOf("anonymous_session_ref"),
      anonymousSessionRef =
        sessionIndex < 0 ? null : String(values[sessionIndex]),
      createdAt =
        typeof row.createdAt === "string" &&
        Number.isFinite(Date.parse(row.createdAt))
          ? Date.parse(row.createdAt)
          : null;
    if (
      anonymousSessionRef !== null &&
      !/^h1_[0-9a-f]{64}$/.test(anonymousSessionRef)
    )
      throw new UmamiProviderError("umami_provider_response_invalid");
    return Object.freeze({ anonymousSessionRef, createdAt });
  });
  return Object.freeze({ rows: Object.freeze(rows), count, pageSize });
}
type SafeProviderFilters = Readonly<{
  device?: string;
  source?: string;
  campaign?: string;
  currency?: string;
  productId?: string;
  categoryId?: string;
}>;
function providerFilters(
  filters: SafeProviderFilters = {},
): Readonly<Record<string, string>> {
  if (
    !filters ||
    typeof filters !== "object" ||
    Array.isArray(filters) ||
    Object.keys(filters).some(
      (key) =>
        ![
          "device",
          "source",
          "campaign",
          "currency",
          "productId",
          "categoryId",
        ].includes(key),
    )
  )
    throw new UmamiProviderError("umami_provider_input_invalid");
  const safeDimension = (value: unknown, maximum = 128) =>
    value === undefined
      ? undefined
      : typeof value === "string" &&
          value.length >= 1 &&
          value.length <= maximum &&
          value === value.trim() &&
          !/[\u0000-\u001f\u007f]/.test(value)
        ? value
        : (() => {
            throw new UmamiProviderError("umami_provider_input_invalid");
          })();
  const device = safeDimension(filters.device, 32);
  let source: string | undefined, campaign: string | undefined;
  try {
    source =
      filters.source === undefined
        ? undefined
        : parseAnalyticsSafeDimension(filters.source);
    campaign =
      filters.campaign === undefined
        ? undefined
        : parseAnalyticsSafeDimension(filters.campaign);
  } catch {
    throw new UmamiProviderError("umami_provider_input_invalid");
  }
  if (filters.productId !== undefined) inputUuid(filters.productId);
  if (filters.categoryId !== undefined) inputUuid(filters.categoryId);
  if (filters.currency !== undefined && !/^[A-Z]{3}$/.test(filters.currency))
    throw new UmamiProviderError("umami_provider_input_invalid");
  const output: Record<string, string> = {};
  if (device) output.device = device;
  if (source) output.utmSource = source;
  if (campaign) output.utmCampaign = campaign;
  return Object.freeze(output);
}
function providerStepFilters(
  filters: SafeProviderFilters = {},
): readonly Readonly<{ property: string; operator: "eq"; value: string }>[] {
  const output: Array<
    Readonly<{ property: string; operator: "eq"; value: string }>
  > = [];
  if (filters.productId)
    output.push(
      Object.freeze({
        property: "product_id",
        operator: "eq",
        value: inputUuid(filters.productId),
      }),
    );
  if (filters.categoryId)
    output.push(
      Object.freeze({
        property: "category_id",
        operator: "eq",
        value: inputUuid(filters.categoryId),
      }),
    );
  if (filters.currency)
    output.push(
      Object.freeze({
        property: "currency",
        operator: "eq",
        value: filters.currency,
      }),
    );
  return Object.freeze(output);
}
function funnelRows(value: unknown, eventNames: readonly string[]) {
  if (!Array.isArray(value) || value.length !== eventNames.length)
    throw new UmamiProviderError("umami_provider_response_invalid");
  let previous = Number.MAX_SAFE_INTEGER;
  return Object.freeze(
    value.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new UmamiProviderError("umami_provider_response_invalid");
      const row = entry as Record<string, unknown>,
        visitors = Number(row.visitors);
      if (
        row.type !== "event" ||
        row.value !== eventNames[index] ||
        !Number.isSafeInteger(visitors) ||
        visitors < 0 ||
        visitors > previous
      )
        throw new UmamiProviderError("umami_provider_response_invalid");
      previous = visitors;
      return Object.freeze({ label: eventNames[index]!, value: visitors });
    }),
  );
}
function independentSessions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new UmamiProviderError("umami_provider_response_invalid");
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new UmamiProviderError("umami_provider_response_invalid");
  const visits = Number((data as Record<string, unknown>).visits);
  if (!Number.isSafeInteger(visits) || visits < 0)
    throw new UmamiProviderError("umami_provider_response_invalid");
  return visits;
}
function eventValueRows(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum)
    throw new UmamiProviderError("umami_provider_response_too_large");
  const seen = new Set<string>();
  return Object.freeze(
    value.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new UmamiProviderError("umami_provider_response_invalid");
      const row = entry as Record<string, unknown>,
        label = inputUuid(row.value),
        total = Number(row.total);
      if (!Number.isSafeInteger(total) || total < 0 || seen.has(label))
        throw new UmamiProviderError("umami_provider_response_invalid");
      seen.add(label);
      return Object.freeze({ label, value: total });
    }),
  );
}
type BreakdownRow = Readonly<{
  source: string;
  medium: string;
  campaign: string | null;
  visitors: number;
  pageviews: number;
}>;
function breakdownRows(
  value: unknown,
  maximum: number,
): readonly BreakdownRow[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new UmamiProviderError("umami_provider_response_invalid");
  const seen = new Set<string>();
  return Object.freeze(
    value.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        throw new UmamiProviderError("umami_provider_response_invalid");
      const row = entry as Record<string, unknown>,
        source = row.utmSource ?? row.utm_source ?? null,
        medium = row.utmMedium ?? row.utm_medium ?? null,
        campaign = row.utmCampaign ?? row.utm_campaign ?? null,
        visitors = Number(row.visitors),
        pageviews = Number(row.views);
      if (
        (source !== null && typeof source !== "string") ||
        (medium !== null && typeof medium !== "string") ||
        (campaign !== null && typeof campaign !== "string") ||
        !Number.isSafeInteger(visitors) ||
        visitors < 0 ||
        !Number.isSafeInteger(pageviews) ||
        pageviews < 0
      )
        throw new UmamiProviderError("umami_provider_response_invalid");
      const normalized = Object.freeze({
          source: source || "direct",
          medium: medium || "none",
          campaign: campaign || null,
          visitors,
          pageviews,
        }),
        key = `${normalized.source}\u0000${normalized.medium}\u0000${normalized.campaign ?? ""}`;
      if (seen.has(key))
        throw new UmamiProviderError("umami_provider_response_invalid");
      seen.add(key);
      return normalized;
    }),
  );
}
function stableDate(value: unknown) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new UmamiProviderError("umami_provider_input_invalid");
  return new Date(value);
}
function timezone(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 100 ||
    value !== value.trim()
  )
    throw new UmamiProviderError("umami_provider_input_invalid");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
  } catch {
    throw new UmamiProviderError("umami_provider_input_invalid");
  }
  return value;
}
function range(value: unknown): AnalyticsRange {
  if (value !== "7d" && value !== "30d" && value !== "90d")
    throw new UmamiProviderError("umami_provider_input_invalid");
  return value;
}
function metric(value: unknown): AnalyticsMetricType {
  if (
    !["path", "referrer", "device", "country", "event"].includes(String(value))
  )
    throw new UmamiProviderError("umami_provider_input_invalid");
  return value as AnalyticsMetricType;
}
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 4)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
export function createUmamiClient(
  config: UmamiPrivateApiConfig,
  dependencies: { fetch: UmamiFetch; audit?: Audit },
): UmamiClient {
  if (
    !config ||
    config.mode !== "approved_staging" ||
    typeof dependencies?.fetch !== "function"
  )
    throw new UmamiProviderError("umami_provider_unavailable");
  const selected = Object.freeze({ ...config }),
    fetcher = dependencies.fetch,
    audit = dependencies.audit ?? (() => undefined),
    semaphore = new Semaphore();
  let token: string | null = null,
    loginPromise: Promise<string> | null = null;
  function observe(
    operation: string,
    outcome: "completed" | "rejected" | "unavailable",
  ) {
    try {
      void Promise.resolve(audit(Object.freeze({ operation, outcome }))).catch(
        () => undefined,
      );
    } catch {}
  }
  async function raw(
    method: string,
    path: string,
    body: unknown,
    authorization?: string,
    deadlineAt?: number,
  ) {
    return semaphore.run(async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const headers = new Headers({ accept: "application/json" });
        if (authorization)
          headers.set("authorization", `Bearer ${authorization}`);
        let encoded: string | undefined;
        if (body !== undefined) {
          encoded = JSON.stringify(body);
          headers.set("content-type", "application/json");
        }
        const request = new Request(`${selected.apiBaseUrl}${path}`, {
          method,
          headers,
          body: encoded,
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
        const remaining = deadlineAt
          ? Math.min(selected.timeoutMs, deadlineAt - Date.now())
          : selected.timeoutMs;
        if (remaining <= 0)
          throw new UmamiProviderError("umami_provider_timeout");
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new UmamiProviderError("umami_provider_timeout"));
          }, remaining);
        });
        return await Promise.race([fetcher(request), timeout]);
      } catch (error) {
        throw provider(error);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });
  }
  async function login(deadlineAt?: number) {
    if (token) return token;
    if (loginPromise) return loginPromise;
    loginPromise = (async () => {
      const response = await raw(
        "POST",
        "/api/auth/login",
        { username: selected.username, password: selected.password },
        undefined,
        deadlineAt,
      );
      if (response.status < 200 || response.status >= 300)
        throw new UmamiProviderError("umami_provider_unavailable");
      return parseLogin(
        await readUmamiJson(response, selected.maximumResponseBytes),
      );
    })()
      .then((value) => {
        token = value;
        return value;
      })
      .catch((error) => {
        throw provider(error);
      })
      .finally(() => {
        loginPromise = null;
      });
    return loginPromise;
  }
  async function request(
    method: string,
    path: string,
    body: unknown,
    retry: boolean,
    allow404 = false,
    deadlineAt?: number,
  ): Promise<unknown | null> {
    const firstToken = await login(deadlineAt);
    let response = await raw(method, path, body, firstToken, deadlineAt);
    if (allow404 && response.status === 404) return null;
    if (response.status === 401 && retry) {
      if (token === firstToken) token = null;
      const next = await login(deadlineAt);
      response = await raw(method, path, body, next, deadlineAt);
      if (allow404 && response.status === 404) return null;
    }
    if (response.status < 200 || response.status >= 300)
      throw new UmamiProviderError("umami_provider_unavailable");
    return readUmamiJson(response, selected.maximumResponseBytes);
  }
  function params(input: {
    range: AnalyticsRange;
    timezone: string;
    now: Date;
    start?: Date;
    end?: Date;
  }) {
    const days = { "7d": 7, "30d": 30, "90d": 90 }[input.range],
      end = input.end ? stableDate(input.end).getTime() : input.now.getTime(),
      start = input.start
        ? stableDate(input.start).getTime()
        : end - days * 86400000;
    if (start >= end || end > input.now.getTime())
      throw new UmamiProviderError("umami_provider_input_invalid");
    return new URLSearchParams({
      startAt: String(start),
      endAt: String(end),
      unit: "day",
      timezone: input.timezone,
    }).toString();
  }
  const client: UmamiClient = {
    async createWebsite(
      input: Readonly<{ websiteId: string; name: string; domain: string }>,
    ) {
      try {
        const value = parseWebsite(
          await request(
            "POST",
            "/api/websites",
            {
              id: inputUuid(input?.websiteId),
              name: inputName(input?.name),
              domain: inputHostname(input?.domain),
            },
            false,
          ),
        );
        observe("create_website", "completed");
        return value;
      } catch (error) {
        const safe = provider(error);
        observe(
          "create_website",
          safe.code.includes("input") || safe.code.includes("response")
            ? "rejected"
            : "unavailable",
        );
        throw safe;
      }
    },
    async getWebsite(websiteId: string) {
      try {
        const id = inputUuid(websiteId),
          value = await request(
            "GET",
            `/api/websites/${id}`,
            undefined,
            true,
            true,
          );
        if (value === null) return null;
        const parsed = parseWebsite(value);
        if (parsed.id !== id)
          throw new UmamiProviderError("umami_provider_response_invalid");
        return parsed;
      } catch (error) {
        throw provider(error);
      }
    },
    async summary(
      input: Readonly<{
        websiteId: string;
        range: AnalyticsRange;
        timezone: string;
        now: Date;
        start?: Date;
        end?: Date;
      }>,
    ) {
      try {
        const id = inputUuid(input?.websiteId),
          selectedRange = range(input?.range),
          zone = timezone(input?.timezone),
          now = stableDate(input?.now),
          query = params({
            range: selectedRange,
            timezone: zone,
            now,
            start: input.start,
            end: input.end,
          });
        const [stats, series, active] = await Promise.all([
          request("GET", `/api/websites/${id}/stats?${query}`, undefined, true),
          request(
            "GET",
            `/api/websites/${id}/pageviews?${query}`,
            undefined,
            true,
          ),
          request("GET", `/api/websites/${id}/active`, undefined, true),
        ]);
        return parseSummaryParts(stats, series, active, {
          range: selectedRange,
          timezone: zone,
          now,
        });
      } catch (error) {
        throw provider(error);
      }
    },
    async active(input) {
      try {
        const id = inputUuid(input?.websiteId),
          now = stableDate(input?.now);
        return parseActiveVisitors(
          await request("GET", `/api/websites/${id}/active`, undefined, true),
          now,
        );
      } catch (error) {
        throw provider(error);
      }
    },
    async metrics(
      input: Readonly<{
        websiteId: string;
        range: AnalyticsRange;
        timezone: string;
        type: AnalyticsMetricType;
        now: Date;
        start?: Date;
        end?: Date;
      }>,
    ) {
      try {
        const id = inputUuid(input?.websiteId),
          selectedRange = range(input?.range),
          zone = timezone(input?.timezone),
          selectedType = metric(input?.type),
          now = stableDate(input?.now),
          query = params({
            range: selectedRange,
            timezone: zone,
            now,
            start: input.start,
            end: input.end,
          });
        const value = await request(
          "GET",
          `/api/websites/${id}/metrics?${query}&type=${selectedType}`,
          undefined,
          true,
        );
        return parseMetrics(value, {
          range: selectedRange,
          type: selectedType,
          now,
          maximumRows: selected.maximumMetricRows,
        });
      } catch (error) {
        throw provider(error);
      }
    },
    async independentEventSessions(input) {
      try {
        const id = inputUuid(input?.websiteId),
          start = stableDate(input?.start),
          end = stableDate(input?.end);
        if (
          start >= end ||
          !Array.isArray(input?.eventNames) ||
          input.eventNames.length < 1 ||
          input.eventNames.length > 6 ||
          new Set(input.eventNames).size !== input.eventNames.length ||
          input.eventNames.some((name) => !FUNNEL_EVENTS.has(name))
        )
          throw new UmamiProviderError("umami_provider_input_invalid");
        const filters = providerFilters(input.filters),
          stepFilters = providerStepFilters(input.filters),
          base = new URLSearchParams({
            startAt: String(start.getTime()),
            endAt: String(end.getTime()),
          });
        for (const [key, value] of Object.entries(filters))
          base.set(key, value);
        for (const [ordinal, filter] of stepFilters.entries())
          base.set(
            `epf${ordinal}`,
            `1.${filter.operator}.${filter.property}.${filter.value}`,
          );
        const items = await Promise.all(
          input.eventNames.map(async (label) => {
            const query = new URLSearchParams(base);
            query.set("event", label);
            const value = await request(
              "GET",
              `/api/websites/${id}/events/stats?${query}`,
              undefined,
              true,
            );
            return Object.freeze({ label, value: independentSessions(value) });
          }),
        );
        return Object.freeze({ items: Object.freeze(items) });
      } catch (error) {
        throw provider(error);
      }
    },
    async eventSessions(input) {
      try {
        const id = inputUuid(input?.websiteId),
          start = stableDate(input?.start),
          end = stableDate(input?.end),
          deadlineAt = Date.now() + Math.min(selected.timeoutMs * 2, 8_000);
        if (
          start >= end ||
          !Array.isArray(input?.eventNames) ||
          input.eventNames.length < 1 ||
          input.eventNames.length > 6 ||
          new Set(input.eventNames).size !== input.eventNames.length ||
          input.eventNames.some((name) => !FUNNEL_EVENTS.has(name))
        )
          throw new UmamiProviderError("umami_provider_input_invalid");
        const filters = providerFilters(input.filters),
          stepFilters = providerStepFilters(input.filters),
          nativeFunnel = async (eventNames: readonly string[]) => {
            const value = await request(
              "POST",
              "/api/reports/funnel",
              {
                websiteId: id,
                type: "funnel",
                filters,
                parameters: {
                  startDate: start.toISOString(),
                  endDate: end.toISOString(),
                  steps: eventNames.map((value) => ({
                    type: "event",
                    value,
                    ...(stepFilters.length ? { filters: stepFilters } : {}),
                  })),
                  window: 60,
                },
              },
              true,
            );
            return funnelRows(value, eventNames);
          };
        if (input.eventNames.includes("purchase")) {
          if (
            input.eventNames.at(-1) !== "purchase" ||
            !Array.isArray(input.verifiedPurchases) ||
            input.verifiedPurchases.length > 10_000
          )
            throw new UmamiProviderError("umami_provider_input_invalid");
          if (
            input.verifiedPurchases.length === 0 &&
            input.eventNames.length > 2
          ) {
            const browserEvents = input.eventNames.slice(0, -1),
              items = await nativeFunnel(browserEvents);
            return Object.freeze({
              items: Object.freeze([
                ...items,
                Object.freeze({ label: "purchase", value: 0 }),
              ]),
            });
          }
          let pivotQueries = 0;
          const load = async (eventName: string) => {
            const moments = new Map<string, number[]>();
            if (eventName === "purchase") {
              for (const purchase of input.verifiedPurchases ?? []) {
                const occurredAt = Date.parse(purchase?.occurredAt ?? "");
                if (
                  !purchase ||
                  typeof purchase !== "object" ||
                  !/^h1_[0-9a-f]{64}$/.test(purchase.anonymousSessionRef) ||
                  !Number.isFinite(occurredAt) ||
                  occurredAt < start.getTime() ||
                  occurredAt >= end.getTime()
                )
                  throw new UmamiProviderError("umami_provider_input_invalid");
                const values = moments.get(purchase.anonymousSessionRef) ?? [];
                values.push(occurredAt);
                moments.set(purchase.anonymousSessionRef, values);
              }
              return moments;
            }
            const readRange = async (
              rangeStart: Date,
              rangeEnd: Date,
            ): Promise<void> => {
              const readPage = async (page: number) => {
                pivotQueries += 1;
                if (pivotQueries > MAX_FUNNEL_PIVOT_QUERIES)
                  throw new UmamiProviderError(
                    "umami_provider_response_too_large",
                  );
                const query = new URLSearchParams({
                  startAt: String(rangeStart.getTime()),
                  endAt: String(rangeEnd.getTime()),
                  eventName,
                  page: String(page),
                  pageSize: "1000",
                });
                for (const [key, value] of Object.entries(filters))
                  query.set(key, value);
                for (const filter of stepFilters)
                  query.set(
                    `pf_${filter.property}`,
                    `1.${filter.operator}.${filter.value}`,
                  );
                return funnelPivotPage(
                  await request(
                    "GET",
                    `/api/websites/${id}/event-data-pivot?${query.toString()}`,
                    undefined,
                    true,
                    false,
                    deadlineAt,
                  ),
                  page,
                );
              };
              let page = 1,
                parsed = await readPage(page);
              if (parsed.count > MAX_FUNNEL_EVENTS_PER_STEP) {
                if (
                  rangeEnd.getTime() - rangeStart.getTime() <=
                  MIN_FUNNEL_PARTITION_MILLISECONDS
                )
                  throw new UmamiProviderError(
                    "umami_provider_response_too_large",
                  );
                const midpoint = new Date(
                  rangeStart.getTime() +
                    Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 2),
                );
                await readRange(rangeStart, midpoint);
                await readRange(midpoint, rangeEnd);
                return;
              }
              for (;;) {
                for (const row of parsed.rows) {
                  if (!row.anonymousSessionRef || row.createdAt === null)
                    continue;
                  const values = moments.get(row.anonymousSessionRef) ?? [];
                  values.push(row.createdAt);
                  moments.set(row.anonymousSessionRef, values);
                }
                if (page * parsed.pageSize >= parsed.count) break;
                page += 1;
                if (page > MAX_FUNNEL_PAGES_PER_STEP)
                  throw new UmamiProviderError(
                    "umami_provider_response_too_large",
                  );
                parsed = await readPage(page);
              }
            };
            await readRange(start, end);
            for (const values of moments.values())
              values.sort((left, right) => left - right);
            return moments;
          };
          const stages = await Promise.all(input.eventNames.map(load));
          let cohort = new Map<string, number>();
          for (const [reference, moments] of stages[0] ?? [])
            if (moments[0] !== undefined) cohort.set(reference, moments[0]);
          const items = [
            Object.freeze({ label: input.eventNames[0]!, value: cohort.size }),
          ];
          for (let index = 1; index < stages.length; index += 1) {
            const next = new Map<string, number>(),
              stage = stages[index]!;
            for (const [reference, prior] of cohort) {
              const matched = stage
                .get(reference)
                ?.find((time) => time >= prior);
              if (matched !== undefined) next.set(reference, matched);
            }
            cohort = next;
            items.push(
              Object.freeze({
                label: input.eventNames[index]!,
                value: cohort.size,
              }),
            );
          }
          return Object.freeze({ items: Object.freeze(items) });
        }
        const items = await nativeFunnel(input.eventNames);
        return Object.freeze({ items: Object.freeze(items) });
      } catch (error) {
        throw provider(error);
      }
    },
    async acquisitionBreakdown(input) {
      try {
        const id = inputUuid(input?.websiteId),
          start = stableDate(input?.start),
          end = stableDate(input?.end);
        if (start >= end)
          throw new UmamiProviderError("umami_provider_input_invalid");
        const baseFilters = providerFilters(input.filters),
          fields = ["utmSource", "utmMedium", "utmCampaign"];
        const query = (event?: string) =>
          request(
            "POST",
            "/api/reports/breakdown",
            {
              websiteId: id,
              type: "breakdown",
              filters: { ...baseFilters, ...(event ? { event } : {}) },
              parameters: {
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                fields,
              },
            },
            true,
          );
        const [base, views, adds, checkouts] = await Promise.all([
          query(),
          query("product_view"),
          query("add_to_cart"),
          query("begin_checkout"),
        ]);
        const groups = new Map<
          string,
          {
            source: string;
            medium: string;
            campaign: string | null;
            visitors: number;
            pageviews: number;
            productViews: number;
            addsToCart: number;
            checkouts: number;
          }
        >();
        const merge = (
          rows: readonly BreakdownRow[],
          kind: "base" | "productViews" | "addsToCart" | "checkouts",
        ) => {
          for (const row of rows) {
            const key = `${row.source}\u0000${row.medium}\u0000${row.campaign ?? ""}`,
              current = groups.get(key) ?? {
                source: row.source,
                medium: row.medium,
                campaign: row.campaign,
                visitors: 0,
                pageviews: 0,
                productViews: 0,
                addsToCart: 0,
                checkouts: 0,
              };
            if (kind === "base") {
              current.visitors = row.visitors;
              current.pageviews = row.pageviews;
            } else current[kind] = row.visitors;
            groups.set(key, current);
          }
        };
        merge(breakdownRows(base, selected.maximumMetricRows), "base");
        merge(breakdownRows(views, selected.maximumMetricRows), "productViews");
        merge(breakdownRows(adds, selected.maximumMetricRows), "addsToCart");
        merge(
          breakdownRows(checkouts, selected.maximumMetricRows),
          "checkouts",
        );
        return Object.freeze({
          items: Object.freeze(
            [...groups.values()]
              .sort(
                (left, right) =>
                  right.visitors - left.visitors ||
                  left.source.localeCompare(right.source) ||
                  left.medium.localeCompare(right.medium) ||
                  (left.campaign ?? "").localeCompare(right.campaign ?? ""),
              )
              .map((row) => Object.freeze(row)),
          ),
        });
      } catch (error) {
        throw provider(error);
      }
    },
    async eventPropertyValues(input) {
      try {
        const id = inputUuid(input?.websiteId),
          start = stableDate(input?.start),
          end = stableDate(input?.end),
          productIds = Array.isArray(input?.productIds)
            ? input.productIds.map(inputUuid)
            : [];
        if (
          start >= end ||
          (input.eventName !== "product_view" &&
            input.eventName !== "add_to_cart") ||
          input.propertyName !== "product_id" ||
          productIds.length > 100 ||
          new Set(productIds).size !== productIds.length
        )
          throw new UmamiProviderError("umami_provider_input_invalid");
        const filters = input.filters ?? {},
          globalFilters = providerFilters(filters),
          stepFilters = providerStepFilters(filters),
          deadlineAt = Date.now() + Math.min(selected.timeoutMs * 2, 8_000),
          selectedProducts = new Set(productIds);
        const batches: string[][] = [];
        for (let index = 0; index < productIds.length; index += 25)
          batches.push(productIds.slice(index, index + 25));
        const rows = (
          await Promise.all(
            batches.map(async (batch) => {
              const query = new URLSearchParams({
                  startAt: String(start.getTime()),
                  endAt: String(end.getTime()),
                  event: input.eventName,
                  eventName: input.eventName,
                  propertyName: input.propertyName,
                }),
                productExpression = `^(${batch.join("|")})$`;
              for (const [key, value] of Object.entries(globalFilters))
                query.set(key, value);
              // Supply both legacy and current Umami property-filter encodings.
              // Each expresses the same AND condition; no per-product request or
              // top-100 whole-store truncation can hide a current-page product.
              query.set("pf_product_id", `1.re.${productExpression}`);
              query.set("epf1", `1.re.product_id.${productExpression}`);
              for (const [offset, filter] of stepFilters.entries()) {
                query.set(
                  `pf_${filter.property}`,
                  `1.${filter.operator}.${filter.value}`,
                );
                query.set(
                  `epf${offset + 2}`,
                  `1.${filter.operator}.${filter.property}.${filter.value}`,
                );
              }
              return eventValueRows(
                await request(
                  "GET",
                  `/api/websites/${id}/event-data/values?${query.toString()}`,
                  undefined,
                  true,
                  false,
                  deadlineAt,
                ),
                100,
              );
            }),
          )
        ).flat();
        const items = rows
          .filter((row) => selectedProducts.has(row.label))
          .sort(
            (left, right) =>
              right.value - left.value || left.label.localeCompare(right.label),
          );
        if (items.length > selected.maximumMetricRows)
          throw new UmamiProviderError("umami_provider_response_too_large");
        return Object.freeze({ items: Object.freeze(items) });
      } catch (error) {
        throw provider(error);
      }
    },
  };
  return Object.freeze(client);
}
