import { randomUUID } from "node:crypto";

import { buildCacheEntryKey, buildNamespaceKey, type CacheDataClass } from "./key.ts";
import { createCacheMetrics, snapshotCacheMetrics, type CacheMetrics } from "./metrics.ts";

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setIfAbsent?(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  ping(): Promise<void>;
  close?(): Promise<void>;
}

type Envelope = Readonly<{ schema: "celebix-cache-v1"; value: unknown; negative: boolean }>;

export type ReadThroughInput<T> = Readonly<{
  storeId: string;
  dataClass: CacheDataClass;
  schemaVersion: string;
  scope: string;
  input: unknown;
  parser: (value: unknown) => T;
  load: () => Promise<T>;
  ttlSeconds?: number;
  cacheNull?: boolean;
}>;

export type Cache = Readonly<{
  readThrough<T>(input: ReadThroughInput<T>): Promise<T>;
  rotateNamespace(storeId: string, dataClass: CacheDataClass): Promise<void>;
  ping(): Promise<"healthy" | "degraded">;
  close(): Promise<void>;
  metrics(): CacheMetrics;
}>;

export function createCache(options: Readonly<{
  backend: CacheBackend;
  namespace: string;
  defaultTtlSeconds: number;
  negativeTtlSeconds: number;
  maxPayloadBytes: number;
  random?: () => number;
  randomToken?: () => string;
}>): Cache {
  const metrics = createCacheMetrics();
  const singleflight = new Map<string, Promise<unknown>>();
  const random = options.random ?? Math.random;
  const randomToken = options.randomToken ?? randomUUID;
  const namespaceTtl = 31 * 24 * 60 * 60;

  const ensureNamespaceToken = async (storeId: string, dataClass: CacheDataClass): Promise<string> => {
    const key = buildNamespaceKey(options.namespace, storeId, dataClass);
    const existing = await options.backend.get(key);
    if (existing !== null && /^[a-zA-Z0-9_-]{1,80}$/.test(existing)) return existing;
    const candidate = randomToken();
    if (options.backend.setIfAbsent) {
      const created = await options.backend.setIfAbsent(key, candidate, namespaceTtl);
      if (!created) {
        const raced = await options.backend.get(key);
        if (raced !== null && /^[a-zA-Z0-9_-]{1,80}$/.test(raced)) return raced;
      }
    } else await options.backend.set(key, candidate, namespaceTtl);
    return candidate;
  };

  const readThrough = async <T>(input: ReadThroughInput<T>): Promise<T> => {
    let key: string;
    try {
      const token = await ensureNamespaceToken(input.storeId, input.dataClass);
      key = buildCacheEntryKey({ ...input, namespace: options.namespace, namespaceToken: token });
      const raw = await options.backend.get(key);
      if (raw !== null) {
        if (Buffer.byteLength(raw, "utf8") > options.maxPayloadBytes) {
          await options.backend.delete(key).catch(() => undefined);
        } else {
          try {
            const envelope = JSON.parse(raw) as Partial<Envelope>;
            if (envelope.schema !== "celebix-cache-v1" || typeof envelope.negative !== "boolean") throw new Error("cache_envelope_invalid");
            const parsed = input.parser(envelope.value);
            if (envelope.negative) metrics.negativeHit += 1;
            else metrics.hit += 1;
            return parsed;
          } catch {
            await options.backend.delete(key).catch(() => undefined);
            metrics.error += 1;
          }
        }
      }
      metrics.miss += 1;
    } catch {
      metrics.error += 1;
      metrics.bypass += 1;
      return input.load();
    }

    const active = singleflight.get(key) as Promise<T> | undefined;
    if (active) {
      metrics.singleflightJoin += 1;
      return active;
    }
    const operation = (async () => {
      const value = await input.load();
      if (value === null && input.cacheNull !== true) return value;
      const envelope: Envelope = Object.freeze({ schema: "celebix-cache-v1", value, negative: value === null });
      const serialized = JSON.stringify(envelope);
      if (Buffer.byteLength(serialized, "utf8") <= options.maxPayloadBytes) {
        const baseTtl = value === null ? options.negativeTtlSeconds : (input.ttlSeconds ?? options.defaultTtlSeconds);
        const ttl = Math.max(1, Math.round(baseTtl * (0.9 + 0.2 * Math.min(1, Math.max(0, random())))));
        try {
          await options.backend.set(key, serialized, ttl);
          metrics.write += 1;
        } catch { metrics.error += 1; }
      } else metrics.bypass += 1;
      return value;
    })();
    singleflight.set(key, operation);
    try { return await operation; }
    finally { singleflight.delete(key); }
  };

  return Object.freeze({
    readThrough,
    async rotateNamespace(storeId: string, dataClass: CacheDataClass) {
      try {
        await options.backend.set(buildNamespaceKey(options.namespace, storeId, dataClass), randomToken(), namespaceTtl);
        metrics.invalidation += 1;
      } catch { metrics.error += 1; }
    },
    async ping() {
      try { await options.backend.ping(); return "healthy"; }
      catch { metrics.error += 1; return "degraded"; }
    },
    async close() { await options.backend.close?.().catch(() => undefined); },
    metrics: () => snapshotCacheMetrics(metrics),
  });
}
