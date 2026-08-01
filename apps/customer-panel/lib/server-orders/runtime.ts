import type { OrderRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerOrdersRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  orders: OrderRepository;
}>;

const repositories = new WeakMap<ServerPanelAccessRuntime, OrderRepository>();
const METHODS = Object.freeze([
  "getDashboardSummary",
  "listOrders",
  "getOrder",
  "getOrderNeighbors",
  "transitionStatus",
  "transitionPayment",
  "updateShipping",
  "addNote",
  "archiveNote",
  "listDrafts",
  "getDraft",
  "createDraft",
  "updateDraft",
  "archiveDraft",
  "convertDraft",
] as const);

function invalid(): never {
  throw new Error("server_orders_runtime_invalid");
}

function facade(repository: OrderRepository): OrderRepository {
  try {
    if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
    const methods = Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)])) as unknown as OrderRepository;
    return Object.freeze(methods);
  } catch { return invalid(); }
}

export function registerServerOrderRepository(
  access: ServerPanelAccessRuntime,
  repository: OrderRepository,
): void {
  try {
    if (
      !access || access.readiness.mode !== "approved_staging" ||
      access.panelOrigin === null || repositories.has(access)
    ) invalid();
    repositories.set(access, facade(repository));
  } catch { invalid(); }
}

export function resolveServerOrdersRuntime(
  access: ServerPanelAccessRuntime,
): ServerOrdersRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    const orders = repositories.get(access);
    return orders === undefined
      ? null
      : Object.freeze({ access: access as ApprovedAccessRuntime, orders });
  } catch { return null; }
}
