import type { StorePolicyAdminRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerStorePolicyRuntime = Readonly<{
  access: ApprovedAccess;
  policies: StorePolicyAdminRepository;
}>;

const repositories = new WeakMap<ServerPanelAccessRuntime, StorePolicyAdminRepository>();
const METHODS = Object.freeze(["list", "save"] as const);

function invalid(): never {
  throw new Error("server_store_policy_runtime_invalid");
}

function facade(repository: StorePolicyAdminRepository): StorePolicyAdminRepository {
  if (!repository || typeof repository !== "object" || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(
    METHODS.map((method) => [method, repository[method].bind(repository)]),
  ) as unknown as StorePolicyAdminRepository);
}

export function registerServerStorePolicyRepository(
  access: ServerPanelAccessRuntime,
  repository: StorePolicyAdminRepository,
): void {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerStorePolicyRuntime(access: ServerPanelAccessRuntime): ServerStorePolicyRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const policies = repositories.get(access);
    return policies === undefined ? null : Object.freeze({ access: access as ApprovedAccess, policies });
  } catch { return null; }
}
