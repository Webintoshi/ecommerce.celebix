import type { ShippingAdminRepository, ShippingWorkflowRepository } from "@celebix/saas-data";
import type { BasitKargoCredential, ShippingProviderAdapter } from "@celebix/shipping-adapters";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerShippingRuntime = Readonly<{
  access: ApprovedAccess;
  admin: ShippingAdminRepository;
  workflow: ShippingWorkflowRepository;
  adapter: ShippingProviderAdapter<BasitKargoCredential>;
  generateId: () => string;
}>;

const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerShippingRuntime>();
const ADMIN_METHODS = Object.freeze(["current", "setup", "saveConnection", "selectResources", "revokeConnection"] as const);
const WORKFLOW_METHODS = Object.freeze(["claimValidation", "openClaimedCredential", "completeValidation", "failValidation"] as const);
const ADAPTER_METHODS = Object.freeze([
  "parseCredential", "verifyCredential", "listBrands", "listSenderAddresses", "listHandlers",
  "quotePackages", "createShipment", "getShipment", "cancelShipment", "createReturnShipment", "downloadLabel",
] as const);

function invalid(): never { throw new Error("server_shipping_runtime_invalid"); }

function facade<T extends object>(value: T, methods: readonly string[]): T {
  if (!value || typeof value !== "object" || methods.some((method) => typeof (value as Record<string, unknown>)[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(methods.map((method) => [method, (value as Record<string, Function>)[method]!.bind(value)]))) as T;
}

export function registerServerShippingRuntime(
  access: ServerPanelAccessRuntime,
  admin: ShippingAdminRepository,
  workflow: ShippingWorkflowRepository,
  adapter: ShippingProviderAdapter<BasitKargoCredential>,
  generateId: () => string,
): void {
  if (
    !access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || RUNTIMES.has(access) ||
    !adapter || adapter.providerCode !== "basit_kargo" || ADAPTER_METHODS.some((method) => typeof adapter[method] !== "function") ||
    typeof generateId !== "function"
  ) invalid();
  RUNTIMES.set(access, Object.freeze({
    access: access as ApprovedAccess,
    admin: facade(admin, ADMIN_METHODS),
    workflow: facade(workflow, WORKFLOW_METHODS),
    adapter,
    generateId,
  }));
}

export function resolveServerShippingRuntime(access: ServerPanelAccessRuntime): ServerShippingRuntime | null {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
  return RUNTIMES.get(access) ?? null;
}
