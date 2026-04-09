import { createClient } from "redis";

const APP_SCOPE = "owner";
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

function buildScopedKey(key: string) {
  return [getRedisPrefix(), APP_SCOPE, key].filter(Boolean).join(":");
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
