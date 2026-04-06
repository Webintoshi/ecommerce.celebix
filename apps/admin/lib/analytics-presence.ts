import "server-only";

import { runWithRedisClient } from "@/lib/redis";

const LIVE_ANALYTICS_SCOPE = "analytics";
const PRESENCE_TTL_MS = 5 * 60 * 1000;
const SESSION_PERSIST_TTL_MS = 60 * 1000;

const BOT_USER_AGENTS = [
  "bot",
  "spider",
  "crawler",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "telegrambot",
  "applebot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "rogerbot",
  "screaming frog",
];

type ActivePresenceInput = {
  sessionId: string;
  path?: string;
  userAgent?: string;
  deviceType?: string;
};

type ActivePresenceRecord = {
  sessionId: string;
  path: string;
  userAgent: string;
  deviceType: string;
  updatedAt: number;
  expiresAt: number;
};

export type LivePresenceSnapshot = {
  liveVisitors: number;
  devices: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  topPages: Array<{ url: string; count: number }>;
};

function toText(value: string | undefined) {
  return value?.trim() || "";
}

function toTimestamp(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDeviceType(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mobile" || normalized === "tablet" || normalized === "desktop") {
    return normalized;
  }

  return "desktop";
}

export function isAnalyticsBot(userAgent: string | undefined) {
  if (!userAgent) {
    return false;
  }

  const normalizedUserAgent = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => normalizedUserAgent.includes(bot));
}

export function isAnalyticsAdminPath(path: string | undefined) {
  if (!path) {
    return false;
  }

  const normalizedPath = path.toLowerCase();
  return (
    normalizedPath.startsWith("/admin") ||
    normalizedPath.startsWith("/api") ||
    normalizedPath.startsWith("/_")
  );
}

function parsePresenceRecord(
  rawRecord: Record<string, string>,
  fallbackSessionId: string,
): ActivePresenceRecord | null {
  if (Object.keys(rawRecord).length === 0) {
    return null;
  }

  const now = Date.now();
  return {
    sessionId: rawRecord.sessionId || fallbackSessionId,
    path: toText(rawRecord.path),
    userAgent: toText(rawRecord.userAgent),
    deviceType: normalizeDeviceType(rawRecord.deviceType),
    updatedAt: toTimestamp(rawRecord.updatedAt, now),
    expiresAt: toTimestamp(rawRecord.expiresAt, now + PRESENCE_TTL_MS),
  };
}

export async function upsertActivePresence(input: ActivePresenceInput): Promise<{
  tracked: boolean;
  shouldPersistSession: boolean;
}> {
  if (!input.sessionId) {
    return { tracked: false, shouldPersistSession: true };
  }

  const result = await runWithRedisClient("presence upsert", async (client, buildKey) => {
    const now = Date.now();
    const expiresAt = now + PRESENCE_TTL_MS;
    const sessionKey = buildKey(`presence:session:${input.sessionId}`, LIVE_ANALYTICS_SCOPE);
    const sessionIndexKey = buildKey("presence:sessions", LIVE_ANALYTICS_SCOPE);
    const persistKey = buildKey(`presence:persist:${input.sessionId}`, LIVE_ANALYTICS_SCOPE);

    await client
      .multi()
      .hSet(sessionKey, {
        sessionId: input.sessionId,
        path: toText(input.path),
        userAgent: toText(input.userAgent),
        deviceType: normalizeDeviceType(input.deviceType),
        updatedAt: String(now),
        expiresAt: String(expiresAt),
      })
      .pExpire(sessionKey, PRESENCE_TTL_MS)
      .zAdd(sessionIndexKey, [{ score: expiresAt, value: input.sessionId }])
      .exec();

    const persistReservation = await client.set(persistKey, String(now), {
      NX: true,
      PX: SESSION_PERSIST_TTL_MS,
    });

    return {
      shouldPersistSession: persistReservation === "OK",
    };
  });

  if (!result) {
    return { tracked: false, shouldPersistSession: true };
  }

  return {
    tracked: true,
    shouldPersistSession: result.shouldPersistSession,
  };
}

export async function updateActivePresencePath(sessionId: string, path: string): Promise<void> {
  if (!sessionId || !path) {
    return;
  }

  await runWithRedisClient("presence path update", async (client, buildKey) => {
    const now = Date.now();
    const expiresAt = now + PRESENCE_TTL_MS;
    const sessionKey = buildKey(`presence:session:${sessionId}`, LIVE_ANALYTICS_SCOPE);
    const sessionIndexKey = buildKey("presence:sessions", LIVE_ANALYTICS_SCOPE);
    const exists = await client.exists(sessionKey);

    if (!exists) {
      return;
    }

    await client
      .multi()
      .hSet(sessionKey, {
        path: toText(path),
        updatedAt: String(now),
        expiresAt: String(expiresAt),
      })
      .pExpire(sessionKey, PRESENCE_TTL_MS)
      .zAdd(sessionIndexKey, [{ score: expiresAt, value: sessionId }])
      .exec();
  });
}

export async function getActivePresenceSnapshot(): Promise<LivePresenceSnapshot | null> {
  return runWithRedisClient("presence snapshot", async (client, buildKey) => {
    const now = Date.now();
    const sessionIndexKey = buildKey("presence:sessions", LIVE_ANALYTICS_SCOPE);

    await client.zRemRangeByScore(sessionIndexKey, 0, now);

    const sessionIds = await client.zRangeByScore(sessionIndexKey, now, "+inf");
    if (sessionIds.length === 0) {
      return {
        liveVisitors: 0,
        devices: { mobile: 0, desktop: 0, tablet: 0 },
        topPages: [],
      };
    }

    const lookup = client.multi();
    for (const sessionId of sessionIds) {
      lookup.hGetAll(buildKey(`presence:session:${sessionId}`, LIVE_ANALYTICS_SCOPE));
    }
    const rawResults = await lookup.exec();

    const staleSessionIds: string[] = [];
    const presenceRecords: ActivePresenceRecord[] = [];

    sessionIds.forEach((sessionId, index) => {
      const rawRecord = rawResults?.[index];
      if (!rawRecord || typeof rawRecord !== "object") {
        staleSessionIds.push(sessionId);
        return;
      }

      const parsedRecord = parsePresenceRecord(rawRecord as Record<string, string>, sessionId);
      if (!parsedRecord || parsedRecord.expiresAt <= now) {
        staleSessionIds.push(sessionId);
        return;
      }

      presenceRecords.push(parsedRecord);
    });

    if (staleSessionIds.length > 0) {
      await client.zRem(sessionIndexKey, staleSessionIds);
    }

    const humanPresence = presenceRecords.filter(
      (record) => !isAnalyticsBot(record.userAgent) && !isAnalyticsAdminPath(record.path),
    );

    const pageGroups: Record<string, number> = {};
    humanPresence.forEach((record) => {
      if (!record.path) {
        return;
      }

      pageGroups[record.path] = (pageGroups[record.path] || 0) + 1;
    });

    return {
      liveVisitors: humanPresence.length,
      devices: {
        mobile: humanPresence.filter((record) => record.deviceType === "mobile").length,
        desktop: humanPresence.filter((record) => record.deviceType === "desktop").length,
        tablet: humanPresence.filter((record) => record.deviceType === "tablet").length,
      },
      topPages: Object.entries(pageGroups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([url, count]) => ({ url, count })),
    };
  });
}
