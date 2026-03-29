type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

export function getCachedValue<T>(key: string): T | null {
  const cached = cacheStore.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cacheStore.delete(key);
    return null;
  }
  return cached.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttlMs: number): void {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export async function getOrSetCachedValue<T>(
  key: string,
  ttlMs: number,
  resolver: () => Promise<T>
): Promise<T> {
  const cached = getCachedValue<T>(key);
  if (cached !== null) return cached;

  const value = await resolver();
  setCachedValue(key, value, ttlMs);
  return value;
}
