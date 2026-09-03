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
  destroy?(): void | Promise<void>;
}

class RedisCacheCommandFailure extends Error {
  readonly code: "timeout" | "unavailable";
  constructor(code: "timeout" | "unavailable") { super("redis_cache_command_failed"); this.code = code; }
}

export function createRedisCacheBackend(options: Readonly<{
  client: RedisClientLike;
  connectTimeoutMs?: number;
  commandTimeoutMs: number;
}>): CacheBackend {
  const withDeadline = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RedisCacheCommandFailure("timeout")), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  let connection: Promise<void> | undefined;
  const connect = async (): Promise<void> => {
    if (options.client.isOpen) return;
    connection ??= withDeadline(
      Promise.resolve(options.client.connect()).then(() => undefined),
      options.connectTimeoutMs ?? options.commandTimeoutMs,
    ).catch((error) => {
      connection = undefined;
      if (error instanceof RedisCacheCommandFailure) throw error;
      throw new RedisCacheCommandFailure("unavailable");
    });
    await connection;
  };
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      await connect();
      return await withDeadline(operation(), options.commandTimeoutMs);
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
      try {
        await withDeadline(options.client.quit(), options.commandTimeoutMs);
      } catch {
        try {
          await options.client.destroy?.();
        } catch {
          // The socket may already have closed between quit() and forced cleanup.
        }
      }
      connection = undefined;
    },
  });
}

export function createNodeRedisBackend(config: EnabledCacheConfig): CacheBackend {
  const client = createClient(createNodeRedisClientOptions(config)) as unknown as RedisClientLike;
  return createRedisCacheBackend({ client, connectTimeoutMs: config.connectTimeoutMs, commandTimeoutMs: config.commandTimeoutMs });
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
