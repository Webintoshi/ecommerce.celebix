import type { Cache, CacheBackend } from "./cache.ts";
import { createCache } from "./cache.ts";
import { parseCacheConfig, type EnabledCacheConfig } from "./config.ts";
import { createNodeRedisBackend } from "./redis-client.ts";
import type { CacheMetrics } from "./metrics.ts";

export type CacheHealth = "disabled" | "healthy" | "degraded";
export type CacheDependencySnapshot = Readonly<{ status: CacheHealth; metrics: CacheMetrics | null }>;

export type CacheRuntime = Readonly<{
  enabled: boolean;
  required: boolean;
  configurationError: boolean;
  cache: Cache | null;
  ttl: Readonly<{ catalogSeconds: number; settingsSeconds: number }> | null;
  health(): Promise<CacheHealth>;
}>;

const disabledRuntime = (configurationError: boolean): CacheRuntime => Object.freeze({
  enabled: false,
  required: false,
  configurationError,
  cache: null,
  ttl: null,
  health: async () => configurationError ? "degraded" : "disabled",
});

export function createCacheRuntime(options: Readonly<{
  source: Readonly<Record<string, string | undefined>>;
  createBackend?: (config: EnabledCacheConfig) => CacheBackend;
}>): CacheRuntime {
  let config;
  try { config = parseCacheConfig(options.source); }
  catch {
    if (options.source.REDIS_CACHE_REQUIRED === "true") throw new Error("redis_cache_configuration_invalid");
    return disabledRuntime(true);
  }
  if (!config.enabled) return disabledRuntime(false);
  const backend = (options.createBackend ?? createNodeRedisBackend)(config);
  const cache = createCache({
    backend,
    namespace: config.namespace,
    defaultTtlSeconds: config.ttl.defaultSeconds,
    negativeTtlSeconds: config.ttl.negativeSeconds,
    maxPayloadBytes: config.maxPayloadBytes,
  });
  return Object.freeze({
    enabled: true,
    required: config.required,
    configurationError: false,
    cache,
    ttl: Object.freeze({ catalogSeconds: config.ttl.catalogSeconds, settingsSeconds: config.ttl.settingsSeconds }),
    health: () => cache.ping(),
  });
}

const runtimeSymbol = Symbol.for("celebix.saas-cache.runtime.v1");
type RuntimeGlobal = typeof globalThis & { [runtimeSymbol]?: CacheRuntime };

export function resolveDefaultCacheRuntime(): CacheRuntime {
  const shared = globalThis as RuntimeGlobal;
  shared[runtimeSymbol] ??= createCacheRuntime({ source: process.env });
  return shared[runtimeSymbol];
}

export async function closeDefaultCacheRuntime(): Promise<void> {
  const shared = globalThis as RuntimeGlobal;
  await shared[runtimeSymbol]?.cache?.close();
  delete shared[runtimeSymbol];
}

export async function cacheDependencySnapshot(runtime: CacheRuntime = resolveDefaultCacheRuntime()): Promise<CacheDependencySnapshot> {
  const status = await runtime.health().catch(() => "degraded" as const);
  return Object.freeze({ status, metrics: runtime.cache?.metrics() ?? null });
}
