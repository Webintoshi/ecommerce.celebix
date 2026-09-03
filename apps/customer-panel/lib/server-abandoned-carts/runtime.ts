import type { AbandonedCartRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerAbandonedCartRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  abandonedCarts: AbandonedCartRepository;
}>;

const repositories = new WeakMap<ServerPanelAccessRuntime, AbandonedCartRepository>();
const METHODS = Object.freeze(["getSummary", "list", "get", "issueRecoveryLink", "recordRecoveryAttempt", "markRecovered", "archive"] as const);

function invalid(): never { throw new Error("server_abandoned_cart_runtime_invalid"); }

function facade(repository: AbandonedCartRepository): AbandonedCartRepository {
  try {
    if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
    return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)])) as unknown as AbandonedCartRepository);
  } catch { return invalid(); }
}

export function registerServerAbandonedCartRepository(access: ServerPanelAccessRuntime, repository: AbandonedCartRepository): void {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerAbandonedCartRuntime(access: ServerPanelAccessRuntime): ServerAbandonedCartRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const abandonedCarts = repositories.get(access);
    return abandonedCarts === undefined ? null : Object.freeze({ access: access as ApprovedAccessRuntime, abandonedCarts });
  } catch { return null; }
}
