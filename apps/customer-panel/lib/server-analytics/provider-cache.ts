import type { Cache } from "@celebix/saas-cache";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEGMENT = /^[a-z][a-z0-9-]{0,79}$/;

export function readAnalyticsProviderCache<T>(
  input: Readonly<{
    cache: Cache | null;
    storeId: string;
    websiteId: string;
    scope: string;
    ttlSeconds: 30 | 60;
    start: Date;
    end: Date;
    timezone: string;
    currency: string | null;
    filters: Readonly<Record<string, unknown>>;
    parser(value: unknown): T;
    load(): Promise<T>;
  }>,
): Promise<T> {
  if (
    !UUID.test(input.storeId) ||
    !UUID.test(input.websiteId) ||
    !SEGMENT.test(input.scope) ||
    ![30, 60].includes(input.ttlSeconds) ||
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.start >= input.end ||
    typeof input.timezone !== "string" ||
    input.timezone.length < 1 ||
    input.timezone.length > 64 ||
    (input.currency !== null && !/^[A-Z]{3}$/.test(input.currency))
  )
    return Promise.reject(new Error("analytics_provider_cache_input_invalid"));
  if (!input.cache) return input.load();
  return input.cache.readThrough({
    storeId: input.storeId,
    dataClass: "analytics",
    schemaVersion: "v1",
    scope: input.scope,
    input: Object.freeze({
      websiteId: input.websiteId,
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      timezone: input.timezone,
      currency: input.currency,
      filters: input.filters,
    }),
    parser: input.parser,
    load: input.load,
    ttlSeconds: input.ttlSeconds,
  });
}
