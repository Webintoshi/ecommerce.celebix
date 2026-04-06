import { createClient } from "redis";

const APP_SCOPE = "admin";
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

type RedisCacheEntry<T> = {
  value: T;
  ttlMs: number | null;
};

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectionPromise: Promise<RedisClient | null> | null = null;
let hasLoggedRedisError = false;

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || process.env.CELEBIX_REDIS_URL?.trim() || "";
}

function getRedisPrefix() {
  return process.env.REDIS_PREFIX?.trim() || process.env.CELEBIX_REDIS_PREFIX?.trim() || DEFAULT_REDIS_PREFIX;
}

function getStoreScope() {
  return process.env.STORE_SLUG?.trim() || process.env.NEXT_PUBLIC_STORE_SLUG?.trim() || "shared";
}

function buildScopedKey(key: string) {
  return [getRedisPrefix(), getStoreScope(), APP_SCOPE, key].filter(Boolean).join(":");
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
