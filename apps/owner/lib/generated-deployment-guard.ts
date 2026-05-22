import "server-only";

import {
  RedisLockError,
  releaseRedisLock,
  tryAcquireRedisLock,
  type RedisLockHandle,
} from "@/lib/redis";

const DEFAULT_DEPLOYMENT_WINDOW_MS = 15 * 60 * 1000;
const MIN_DEPLOYMENT_WINDOW_MS = 60 * 1000;
const MAX_DEPLOYMENT_WINDOW_MS = 60 * 60 * 1000;
const GENERATED_DEPLOYMENT_LOCK_KEY = "generated-deployment-window";

declare global {
  var __celebixOwnerGeneratedDeploymentLocks: Map<string, number> | undefined;
}

export type DeploymentWindowHandle =
  | {
      kind: "redis";
      lock: RedisLockHandle;
    }
  | {
      kind: "local";
      key: string;
      expiresAt: number;
    };

function getDeploymentWindowMs() {
  const raw = Number(process.env.OWNER_GENERATED_DEPLOYMENT_COOLDOWN_MS?.trim());

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_DEPLOYMENT_WINDOW_MS;
  }

  return Math.min(MAX_DEPLOYMENT_WINDOW_MS, Math.max(MIN_DEPLOYMENT_WINDOW_MS, Math.round(raw)));
}

function formatWindowMinutes(windowMs: number) {
  return Math.max(1, Math.ceil(windowMs / 60000));
}

function buildBusyMessage(target: "admin" | "storefront", slug: string, windowMs: number) {
  const minutes = formatWindowMinutes(windowMs);
  return `${slug} icin ${target} deployment baslatilamadi. Owner ayni anda birden fazla generated deployment baslatmayacak sekilde kilitli. Yaklasik ${minutes} dakika sonra tekrar deneyin.`;
}

function buildGeneratedDeploymentLockKey(input: {
  slug: string;
  target: "admin" | "storefront";
}) {
  return `${GENERATED_DEPLOYMENT_LOCK_KEY}:v2:${input.target}:${input.slug}`;
}

function getLocalDeploymentLocks() {
  if (!globalThis.__celebixOwnerGeneratedDeploymentLocks) {
    globalThis.__celebixOwnerGeneratedDeploymentLocks = new Map<string, number>();
  }

  return globalThis.__celebixOwnerGeneratedDeploymentLocks;
}

function tryAcquireLocalWindow(key: string, windowMs: number): DeploymentWindowHandle | false {
  const now = Date.now();
  const currentExpiry = getLocalDeploymentLocks().get(key) ?? 0;

  if (currentExpiry > now) {
    return false;
  }

  const expiresAt = now + windowMs;
  getLocalDeploymentLocks().set(key, expiresAt);

  return {
    kind: "local",
    key,
    expiresAt,
  };
}

export async function reserveGeneratedDeploymentWindow(input: {
  slug: string;
  target: "admin" | "storefront";
}): Promise<DeploymentWindowHandle> {
  const windowMs = getDeploymentWindowMs();
  const lockKey = buildGeneratedDeploymentLockKey(input);
  const redisLock = await tryAcquireRedisLock(lockKey, windowMs);

  if (redisLock === false) {
    throw new RedisLockError(buildBusyMessage(input.target, input.slug, windowMs));
  }

  if (redisLock) {
    return {
      kind: "redis",
      lock: redisLock,
    };
  }

  const localLock = tryAcquireLocalWindow(lockKey, windowMs);

  if (!localLock) {
    throw new RedisLockError(buildBusyMessage(input.target, input.slug, windowMs));
  }

  return localLock;
}

export async function releaseGeneratedDeploymentWindow(handle: DeploymentWindowHandle | null): Promise<void> {
  if (!handle) {
    return;
  }

  if (handle.kind === "redis") {
    await releaseRedisLock(handle.lock);
    return;
  }

  const locks = getLocalDeploymentLocks();
  if (locks.get(handle.key) === handle.expiresAt) {
    locks.delete(handle.key);
  }
}
