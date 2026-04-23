import { createClient } from "redis";

const APP_SCOPE = "storefront";
const DEFAULT_REDIS_PREFIX = "celebix";
const REDIS_RECONNECT_MAX_DELAY_MS = 1_000;

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

type RedisCacheEntry<T> = {
  value: T;
  ttlMs: number | null;
};

export type RedisLockHandle = {
  key: string;
  token: string;
  scope: string;
};

type RedisClient = ReturnType<typeof createClient>;
type RedisKeyBuilder = (key: string, scope?: string) => string;

let redisClient: RedisClient | null = null;
let redisConnectionPromise: Promise<RedisClient | null> | null = null;
let hasLoggedRedisError = false;

export class RedisLockError extends Error {
  readonly code = "REDIS_LOCKED";

  constructor(message: string) {
    super(message);
    this.name = "RedisLockError";
  }
}

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || process.env.CELEBIX_REDIS_URL?.trim() || "";
}

function getRedisPrefix() {
  return process.env.REDIS_PREFIX?.trim() || process.env.CELEBIX_REDIS_PREFIX?.trim() || DEFAULT_REDIS_PREFIX;
}

function getStoreScope() {
  return process.env.STORE_SLUG?.trim() || process.env.NEXT_PUBLIC_STORE_SLUG?.trim() || "shared";
}

function buildScopedKey(key: string, scope = APP_SCOPE) {
  return [getRedisPrefix(), getStoreScope(), scope, key].filter(Boolean).join(":");
}

function createLockToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function logRedisError(context: string, error: unknown) {
  if (hasLoggedRedisError) {
    return;
  }

  hasLoggedRedisError = true;
  console.error(`[redis:${APP_SCOPE}] ${context}:`, error);
}

async function getRedisClient(): Promise<RedisClient | null> {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisConnectionPromise) {
    return redisConnectionPromise;
  }

  const candidateClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries) {
        return Math.min((retries + 1) * 50, REDIS_RECONNECT_MAX_DELAY_MS);
      },
    },
  });

  candidateClient.on("error", (error) => {
    logRedisError("runtime error", error);
  });

  redisConnectionPromise = candidateClient
    .connect()
    .then(() => {
      redisClient = candidateClient;
      redisConnectionPromise = null;
      hasLoggedRedisError = false;
      return candidateClient;
    })
    .catch((error) => {
      logRedisError("connection failed", error);
      redisConnectionPromise = null;
      redisClient = null;

      try {
        candidateClient.disconnect();
      } catch {
        // Ignore cleanup errors after failed connect attempts.
      }

      return null;
    });

  return redisConnectionPromise;
}

export async function runWithRedisClient<T>(
  operation: string,
  callback: (client: RedisClient, buildKey: RedisKeyBuilder) => Promise<T>,
): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    return await callback(client, buildScopedKey);
  } catch (error) {
    logRedisError(`${operation} failed`, error);
    return null;
  }
}

export function isRedisLockError(error: unknown): error is RedisLockError {
  return error instanceof RedisLockError;
}

export async function tryAcquireRedisLock(
  key: string,
  ttlMs: number,
  scope = APP_SCOPE,
): Promise<RedisLockHandle | false | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const scopedKey = buildScopedKey(`lock:${key}`, scope);
    const token = createLockToken();
    const reserved = await client.set(scopedKey, token, {
      NX: true,
      PX: Math.max(1, ttlMs),
    });

    if (reserved !== "OK") {
      return false;
    }

    return {
      key: scopedKey,
      token,
      scope,
    };
  } catch (error) {
    logRedisError("lock acquire failed", error);
    return null;
  }
}

export async function releaseRedisLock(lock: RedisLockHandle): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lock.key],
      arguments: [lock.token],
    });
  } catch (error) {
    logRedisError("lock release failed", error);
  }
}

function toRateLimitNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getRedisCacheEntry<T>(key: string): Promise<RedisCacheEntry<T> | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const scopedKey = buildScopedKey(`cache:${key}`);
    const [rawValue, rawTtl] = await Promise.all([
      client.get(scopedKey),
      client.pTTL(scopedKey),
    ]);

    if (!rawValue) {
      return null;
    }

    return {
      value: JSON.parse(rawValue) as T,
      ttlMs: rawTtl > 0 ? rawTtl : null,
    };
  } catch (error) {
    logRedisError("cache read failed", error);
    return null;
  }
}

export async function setRedisCacheEntry<T>(key: string, value: T, ttlMs: number): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.set(buildScopedKey(`cache:${key}`), JSON.stringify(value), {
      PX: Math.max(1, ttlMs),
    });
    return true;
  } catch (error) {
    logRedisError("cache write failed", error);
    return false;
  }
}

export async function deleteRedisCacheEntry(key: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.del(buildScopedKey(`cache:${key}`));
  } catch (error) {
    logRedisError("cache delete failed", error);
  }
}

export async function deleteRedisCacheEntriesByPrefix(prefix: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  try {
    const pattern = `${buildScopedKey(`cache:${prefix}`)}*`;
    const batch: string[] = [];

    for await (const matchedKey of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      batch.push(String(matchedKey));

      if (batch.length >= 100) {
        await client.del(batch);
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await client.del(batch);
    }
  } catch (error) {
    logRedisError("cache prefix delete failed", error);
  }
}

export async function consumeRateLimitBucket(
  key: string,
  windowMs: number,
): Promise<{ count: number; resetAt: number } | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.eval(RATE_LIMIT_SCRIPT, {
      keys: [buildScopedKey(`rate-limit:${key}`)],
      arguments: [String(Math.max(1, windowMs))],
    });

    if (!Array.isArray(result)) {
      return null;
    }

    const count = toRateLimitNumber(result[0]);
    const ttlMs = Math.max(0, toRateLimitNumber(result[1]));

    return {
      count,
      resetAt: Date.now() + ttlMs,
    };
  } catch (error) {
    logRedisError("rate limit failed", error);
    return null;
  }
}
