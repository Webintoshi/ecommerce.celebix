export type CacheMetrics = Readonly<{
  hit: number;
  miss: number;
  negativeHit: number;
  bypass: number;
  error: number;
  write: number;
  invalidation: number;
  singleflightJoin: number;
}>;

export type MutableCacheMetrics = { -readonly [K in keyof CacheMetrics]: number };

export function createCacheMetrics(): MutableCacheMetrics {
  return { hit: 0, miss: 0, negativeHit: 0, bypass: 0, error: 0, write: 0, invalidation: 0, singleflightJoin: 0 };
}

export function snapshotCacheMetrics(metrics: MutableCacheMetrics): CacheMetrics {
  return Object.freeze({ ...metrics });
}
