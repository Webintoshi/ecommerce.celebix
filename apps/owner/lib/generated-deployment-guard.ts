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
  var __celebixOwnerGeneratedDeploymentLockedUntil: number | undefined;
}

export type DeploymentWindowHandle =
  | {
      kind: "redis";
      lock: RedisLockHandle;
    }
  | {
      kind: "local";
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

function tryAcquireLocalWindow(windowMs: number): DeploymentWindowHandle | false {
  const now = Date.now();
  const currentExpiry = globalThis.__celebixOwnerGeneratedDeploymentLockedUntil ?? 0;

  if (currentExpiry > now) {
    return false;
  }

  const expiresAt = now + windowMs;
  globalThis.__celebixOwnerGeneratedDeploymentLockedUntil = expiresAt;

  return {
    kind: "local",
    expiresAt,
  };
}

export async function reserveGeneratedDeploymentWindow(input: {
  slug: string;
  target: "admin" | "storefront";
}): Promise<DeploymentWindowHandle> {
  const windowMs = getDeploymentWindowMs();
  const redisLock = await tryAcquireRedisLock(GENERATED_DEPLOYMENT_LOCK_KEY, windowMs);

  if (redisLock === false) {
    throw new RedisLockError(buildBusyMessage(input.target, input.slug, windowMs));
  }

  if (redisLock) {
    return {
      kind: "redis",
      lock: redisLock,
    };
  }

  const localLock = tryAcquireLocalWindow(windowMs);

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

  if (globalThis.__celebixOwnerGeneratedDeploymentLockedUntil === handle.expiresAt) {
    globalThis.__celebixOwnerGeneratedDeploymentLockedUntil = 0;
  }
}
