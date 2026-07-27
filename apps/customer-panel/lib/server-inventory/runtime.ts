import type { InventoryRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerInventoryRuntime = Readonly<{
  access: ApprovedAccess;
  inventory: InventoryRepository;
}>;

const METHODS = Object.freeze([
  "listLocations", "saveLocation", "archiveLocation", "recoverLocationOperation", "listBalances", "listPurchaseOrders", "getPurchaseOrder", "savePurchaseOrder",
  "transitionPurchaseOrder", "receivePurchaseOrder", "listCounts", "getCount", "saveCount",
  "startCount", "commitCount", "cancelCount", "listTransfers", "getTransfer", "saveTransfer",
  "dispatchTransfer", "receiveTransfer", "cancelTransfer",
] as const);
const repositories = new WeakMap<ServerPanelAccessRuntime, InventoryRepository>();

function invalid(): never { throw new Error("server_inventory_runtime_invalid"); }

function facade(repository: InventoryRepository): InventoryRepository {
  try {
    if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
    return Object.freeze(Object.fromEntries(
      METHODS.map((method) => [method, repository[method].bind(repository)]),
    )) as unknown as InventoryRepository;
  } catch { return invalid(); }
}

export function registerServerInventoryRepository(
  access: ServerPanelAccessRuntime,
  repository: InventoryRepository,
): void {
  try {
    if (
      !access || access.readiness.mode !== "approved_staging" ||
      access.panelOrigin === null || repositories.has(access)
    ) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerInventoryRuntime(access: ServerPanelAccessRuntime): ServerInventoryRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const inventory = repositories.get(access);
    return inventory
      ? Object.freeze({ access: access as ApprovedAccess, inventory })
      : null;
  } catch { return null; }
}
