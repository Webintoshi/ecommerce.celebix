import type { AnalyticsRepository } from "@celebix/saas-data";
import type { Cache } from "@celebix/saas-cache";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type { UmamiClient } from "../umami-provider/client.ts";
import { createAnalyticsReadCache, type AnalyticsReadCache } from "./cache.ts";
type Approved = ServerPanelAccessRuntime &
  Readonly<{
    readiness: Readonly<{ mode: "approved_staging" }>;
    panelOrigin: string;
  }>;
export type ServerAnalyticsRuntime = Readonly<{
  mode: "approved_staging";
  access: Approved;
  analytics: AnalyticsRepository;
  umami: UmamiClient;
  providerConfigured: boolean;
  cache: AnalyticsReadCache;
  sharedCache: Cache | null;
}>;
const repositories = new WeakMap<
    ServerPanelAccessRuntime,
    AnalyticsRepository
  >(),
  caches = new WeakMap<ServerPanelAccessRuntime, AnalyticsReadCache>(),
  METHODS = [
    "dashboard",
    "commerceTimezone",
    "commerceSnapshot",
    "commerceSettings",
    "paidFunnelSessions",
    "updateCommerceSettings",
    "getConnection",
    "getConnectionAuthority",
    "beginConnection",
    "activateConnection",
    "disableConnection",
  ] as const;
function invalid(): never {
  throw Error("server_analytics_runtime_invalid");
}
const unavailableUmami = Object.freeze({
  async createWebsite(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async getWebsite(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async active(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async summary(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async metrics(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async eventSessions(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async independentEventSessions(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async acquisitionBreakdown(): Promise<never> {
    throw Error("umami_unavailable");
  },
  async eventPropertyValues(): Promise<never> {
    throw Error("umami_unavailable");
  },
}) as UmamiClient;
export function registerServerAnalyticsRepository(
  access: ServerPanelAccessRuntime,
  repository: AnalyticsRepository,
) {
  try {
    if (
      !access ||
      access.readiness.mode !== "approved_staging" ||
      access.panelOrigin === null ||
      repositories.has(access) ||
      !repository ||
      METHODS.some((method) => typeof repository[method] !== "function")
    )
      invalid();
    repositories.set(
      access,
      Object.freeze(
        Object.fromEntries(
          METHODS.map((method) => [
            method,
            repository[method].bind(repository),
          ]),
        ) as unknown as AnalyticsRepository,
      ),
    );
  } catch {
    invalid();
  }
}
export function resolveServerAnalyticsRuntime(
  access: ServerPanelAccessRuntime,
  umami: UmamiClient | null,
  sharedCache: Cache | null = null,
): ServerAnalyticsRuntime | null {
  try {
    if (
      !access ||
      access.readiness.mode !== "approved_staging" ||
      access.panelOrigin === null
    )
      return null;
    const analytics = repositories.get(access);
    if (!analytics) return null;
    let cache = caches.get(access);
    if (!cache) {
      cache = createAnalyticsReadCache({ ttlMs: 30000, maximumEntries: 128 });
      caches.set(access, cache);
    }
    return Object.freeze({
      mode: "approved_staging",
      access: access as Approved,
      analytics,
      umami: umami ?? unavailableUmami,
      providerConfigured: umami !== null,
      cache,
      sharedCache,
    });
  } catch {
    return null;
  }
}
export { createAnalyticsReadCache } from "./cache.ts";
export type { AnalyticsReadCache, AnalyticsReadCacheKey } from "./cache.ts";
