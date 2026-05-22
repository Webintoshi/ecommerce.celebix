import "server-only";

import {
  RedisLockError,
  releaseRedisLock,
  tryAcquireRedisLock,
  type RedisLockHandle,
} from "@/lib/redis";

const DEFAULT_PROVISIONING_WINDOW_MS = 10 * 60 * 1000;
const MIN_PROVISIONING_WINDOW_MS = 60 * 1000;
const MAX_PROVISIONING_WINDOW_MS = 60 * 60 * 1000;

declare global {
  var __celebixOwnerStoreProvisioningLocks: Map<string, number> | undefined;
}

export type StoreProvisioningWindowHandle =
  | {
      kind: "redis";
      lock: RedisLockHandle;
    }
  | {
      kind: "local";
      slug: string;
      expiresAt: number;
    };

function getProvisioningWindowMs() {
  const raw = Number(process.env.OWNER_PROVISIONING_LOCK_TTL_MS?.trim());

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_PROVISIONING_WINDOW_MS;
  }

  return Math.min(MAX_PROVISIONING_WINDOW_MS, Math.max(MIN_PROVISIONING_WINDOW_MS, Math.round(raw)));
}

function getLocalProvisioningLocks() {
  if (!globalThis.__celebixOwnerStoreProvisioningLocks) {
    globalThis.__celebixOwnerStoreProvisioningLocks = new Map<string, number>();
  }

  return globalThis.__celebixOwnerStoreProvisioningLocks;
}

function formatWindowMinutes(windowMs: number) {
  return Math.max(1, Math.ceil(windowMs / 60000));
}

function buildBusyMessage(
  slug: string,
  mode: "create" | "repair",
  windowMs: number,
  actionLabel?: string,
) {
  const minutes = formatWindowMinutes(windowMs);
  const action = actionLabel?.trim() || (mode === "repair" ? "repair" : "provisioning");
  return `${slug} icin ${action} akisi zaten calisiyor. Yaklasik ${minutes} dakika sonra tekrar deneyin.`;
}

function tryAcquireLocalWindow(
  slug: string,
  windowMs: number,
): StoreProvisioningWindowHandle | false {
  const locks = getLocalProvisioningLocks();
  const now = Date.now();
  const currentExpiry = locks.get(slug) ?? 0;

  if (currentExpiry > now) {
    return false;
  }

  const expiresAt = now + windowMs;
  locks.set(slug, expiresAt);

  return {
    kind: "local",
    slug,
    expiresAt,
  };
}

export async function reserveStoreProvisioningWindow(input: {
  slug: string;
  mode: "create" | "repair";
  actionLabel?: string;
}): Promise<StoreProvisioningWindowHandle> {
  const windowMs = getProvisioningWindowMs();
  const redisLock = await tryAcquireRedisLock(`store-provisioning:${input.slug}`, windowMs);

  if (redisLock === false) {
    throw new RedisLockError(buildBusyMessage(input.slug, input.mode, windowMs, input.actionLabel));
  }

  if (redisLock) {
    return {
      kind: "redis",
      lock: redisLock,
    };
  }

  const localWindow = tryAcquireLocalWindow(input.slug, windowMs);

  if (!localWindow) {
    throw new RedisLockError(buildBusyMessage(input.slug, input.mode, windowMs, input.actionLabel));
  }

  return localWindow;
}

export async function releaseStoreProvisioningWindow(
  handle: StoreProvisioningWindowHandle | null,
): Promise<void> {
  if (!handle) {
    return;
  }

  if (handle.kind === "redis") {
    await releaseRedisLock(handle.lock);
    return;
  }

  const locks = getLocalProvisioningLocks();
  const currentExpiry = locks.get(handle.slug);

  if (currentExpiry === handle.expiresAt) {
    locks.delete(handle.slug);
  }
}
