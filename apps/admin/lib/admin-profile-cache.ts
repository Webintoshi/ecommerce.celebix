import type { UserRole } from "@/lib/permissions";

const ADMIN_PROFILE_CACHE_TTL_MS = 30_000;

export type CachedAdminProfile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  task_definition: string | null;
};

type CachedEntry = {
  value: CachedAdminProfile;
  expiresAt: number;
};

const adminProfileCache = new Map<string, CachedEntry>();

function getStoreScopedCacheKey(userId: string) {
  const storeSlug =
    process.env.STORE_SLUG?.trim() ||
    process.env.NEXT_PUBLIC_STORE_SLUG?.trim() ||
    "shared";

  return `${storeSlug}:${userId}`;
}

function deleteExpiredEntries(now: number) {
  for (const [key, entry] of adminProfileCache.entries()) {
    if (entry.expiresAt <= now) {
      adminProfileCache.delete(key);
    }
  }
}

export function readCachedAdminProfile(userId: string): CachedAdminProfile | null {
  const now = Date.now();
  deleteExpiredEntries(now);

  const entry = adminProfileCache.get(getStoreScopedCacheKey(userId));
  if (!entry || entry.expiresAt <= now) {
    return null;
  }

  return entry.value;
}

export function writeCachedAdminProfile(profile: CachedAdminProfile) {
  adminProfileCache.set(getStoreScopedCacheKey(profile.id), {
    value: profile,
    expiresAt: Date.now() + ADMIN_PROFILE_CACHE_TTL_MS,
  });
}
