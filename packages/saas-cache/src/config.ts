export type DisabledCacheConfig = Readonly<{ enabled: false }>;

export type EnabledCacheConfig = Readonly<{
  enabled: true;
  required: boolean;
  url: string;
  namespace: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  ttl: Readonly<{
    defaultSeconds: number;
    catalogSeconds: number;
    settingsSeconds: number;
    negativeSeconds: number;
  }>;
  maxPayloadBytes: number;
}>;

export type CacheConfig = DisabledCacheConfig | EnabledCacheConfig;

function invalid(): never {
  throw new Error("redis_cache_configuration_invalid");
}

function exactBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return invalid();
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return invalid();
  return parsed;
}

export function parseCacheConfig(source: Readonly<Record<string, string | undefined>>): CacheConfig {
  if (!exactBoolean(source.REDIS_CACHE_ENABLED, false)) return Object.freeze({ enabled: false });
  try {
    const url = new URL(source.REDIS_CACHE_URL ?? "");
    if ((url.protocol !== "redis:" && url.protocol !== "rediss:") || url.hostname === "" || url.password === "") return invalid();
    const namespace = source.REDIS_CACHE_NAMESPACE ?? "";
    if (!/^[a-z0-9][a-z0-9:_-]{2,63}$/i.test(namespace)) return invalid();
    return Object.freeze({
      enabled: true,
      required: exactBoolean(source.REDIS_CACHE_REQUIRED, false),
      url: url.toString(),
      namespace,
      connectTimeoutMs: boundedInteger(source.REDIS_CACHE_CONNECT_TIMEOUT_MS, 250, 50, 2_000),
      commandTimeoutMs: boundedInteger(source.REDIS_CACHE_COMMAND_TIMEOUT_MS, 150, 25, 5_000),
      ttl: Object.freeze({
        defaultSeconds: boundedInteger(source.REDIS_CACHE_DEFAULT_TTL_SECONDS, 60, 1, 3_600),
        catalogSeconds: boundedInteger(source.REDIS_CACHE_CATALOG_TTL_SECONDS, 45, 1, 3_600),
        settingsSeconds: boundedInteger(source.REDIS_CACHE_SETTINGS_TTL_SECONDS, 120, 1, 3_600),
        negativeSeconds: boundedInteger(source.REDIS_CACHE_NEGATIVE_TTL_SECONDS, 5, 1, 60),
      }),
      maxPayloadBytes: boundedInteger(source.REDIS_CACHE_MAX_PAYLOAD_BYTES, 262_144, 1_024, 1_048_576),
    });
  } catch {
    return invalid();
  }
}
