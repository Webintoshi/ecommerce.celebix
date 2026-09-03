import { createClient } from "redis";

import type { CacheBackend } from "./cache.ts";
import type { EnabledCacheConfig } from "./config.ts";

export interface RedisClientLike {
  readonly isOpen: boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

class RedisCacheCommandFailure extends Error {
  readonly code: "timeout" | "unavailable";
  constructor(code: "timeout" | "unavailable") { super("redis_cache_command_failed"); this.code = code; }
}

export function createRedisCacheBackend(options: Readonly<{
  client: RedisClientLike;
  commandTimeoutMs: number;
}>): CacheBackend {
  let connection: Promise<void> | undefined;
  const connect = async (): Promise<void> => {
    if (options.client.isOpen) return;
    connection ??= Promise.resolve(options.client.connect()).then(() => undefined).catch(() => {
      connection = undefined;
      throw new RedisCacheCommandFailure("unavailable");
    });
    await connection;
  };
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      await connect();
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          operation(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RedisCacheCommandFailure("timeout")), options.commandTimeoutMs); }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      if (error instanceof RedisCacheCommandFailure) throw error;
      throw new RedisCacheCommandFailure("unavailable");
    }
  };
  options.client.on("error", () => undefined);
  return Object.freeze({
    get: (key: string) => bounded(() => options.client.get(key)),
    set: async (key: string, value: string, ttlSeconds: number) => { await bounded(() => options.client.set(key, value, { EX: ttlSeconds })).then(() => undefined); },
    setIfAbsent: async (key: string, value: string, ttlSeconds: number) => (await bounded(() => options.client.set(key, value, { EX: ttlSeconds, NX: true }))) === "OK",
    delete: async (key: string) => { await bounded(() => options.client.del(key)).then(() => undefined); },
    ping: async () => { await bounded(() => options.client.ping()).then(() => undefined); },
    close: async () => {
      if (!options.client.isOpen) return;
      await options.client.quit().catch(() => undefined);
      connection = undefined;
    },
  });
}

export function createNodeRedisBackend(config: EnabledCacheConfig): CacheBackend {
  const client = createClient(createNodeRedisClientOptions(config)) as unknown as RedisClientLike;
  return createRedisCacheBackend({ client, commandTimeoutMs: config.commandTimeoutMs });
}

export function createNodeRedisClientOptions(config: EnabledCacheConfig) {
  return {
    url: config.url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: config.connectTimeoutMs,
      keepAlive: true,
      keepAliveInitialDelay: 60_000,
      reconnectStrategy: (retries: number) => Math.min(50 * 2 ** Math.min(retries, 5), 1_000),
    },
  };
}
