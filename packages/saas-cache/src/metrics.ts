export type CacheMetrics = Readonly<{
  redis_cache_hit_total: number;
  redis_cache_miss_total: number;
  redis_cache_set_total: number;
  redis_cache_error_total: number;
  redis_cache_timeout_total: number;
  redis_cache_invalidations_total: number;
  redis_cache_bypass_total: number;
  redis_cache_payload_rejected_total: number;
  redis_cache_negative_hit_total: number;
  redis_cache_singleflight_join_total: number;
  scopes: Readonly<Record<string, Readonly<{ hit: number; miss: number; set: number; error: number; bypass: number }>>>;
}>;

export type MutableCacheMetrics = {
  hit: number; miss: number; set: number; error: number; timeout: number; invalidation: number; bypass: number;
  payloadRejected: number; negativeHit: number; singleflightJoin: number;
};

export function createCacheMetrics(): MutableCacheMetrics {
  return { hit: 0, miss: 0, set: 0, error: 0, timeout: 0, invalidation: 0, bypass: 0, payloadRejected: 0, negativeHit: 0, singleflightJoin: 0 };
}

export function snapshotCacheMetrics(metrics: MutableCacheMetrics, scopes: CacheMetrics["scopes"]): CacheMetrics {
  return Object.freeze({
    redis_cache_hit_total: metrics.hit,
    redis_cache_miss_total: metrics.miss,
    redis_cache_set_total: metrics.set,
    redis_cache_error_total: metrics.error,
    redis_cache_timeout_total: metrics.timeout,
    redis_cache_invalidations_total: metrics.invalidation,
    redis_cache_bypass_total: metrics.bypass,
    redis_cache_payload_rejected_total: metrics.payloadRejected,
    redis_cache_negative_hit_total: metrics.negativeHit,
    redis_cache_singleflight_join_total: metrics.singleflightJoin,
    scopes,
  });
}
