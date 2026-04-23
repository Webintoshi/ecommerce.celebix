import {
  deleteRedisCacheEntriesByPrefix,
  deleteRedisCacheEntry,
  getRedisCacheEntry,
  setRedisCacheEntry,
} from "@/lib/redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

function setLocalCachedValue<T>(key: string, value: T, ttlMs: number) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlMs),
  });
}

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
  setLocalCachedValue(key, value, ttlMs);
  void setRedisCacheEntry(key, value, ttlMs);
}

export function deleteCachedValue(key: string): void {
  cacheStore.delete(key);
  void deleteRedisCacheEntry(key);
}

export function deleteCachedValuesByPrefix(prefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }

  void deleteRedisCacheEntriesByPrefix(prefix);
}

export async function getOrSetCachedValue<T>(
  key: string,
  ttlMs: number,
  resolver: () => Promise<T>
): Promise<T> {
  const cached = getCachedValue<T>(key);
  if (cached !== null) return cached;

  const redisCached = await getRedisCacheEntry<T>(key);
  if (redisCached !== null) {
    setLocalCachedValue(key, redisCached.value, redisCached.ttlMs ?? ttlMs);
    return redisCached.value;
  }

  const value = await resolver();
  setCachedValue(key, value, ttlMs);
  return value;
}
