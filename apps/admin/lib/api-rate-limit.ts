import type { NextRequest } from "next/server";

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitRecord>();

function cleanupExpiredEntries(now: number) {
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const existing = rateLimitStore.get(input.key);
  if (!existing || existing.resetAt <= now) {
    const nextRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + input.windowMs,
    };
    rateLimitStore.set(input.key, nextRecord);

    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, input.limit - nextRecord.count),
      resetAt: nextRecord.resetAt,
    };
  }

  existing.count += 1;
  rateLimitStore.set(input.key, existing);

  return {
    allowed: existing.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt,
  };
}
