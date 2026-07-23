import type { PricingRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
export type ServerPricingRuntime = Readonly<{ access: ApprovedAccess; pricing: PricingRepository }>;
const METHODS = Object.freeze(["list", "get", "save", "activate", "archive", "preview"] as const);
const repositories = new WeakMap<ServerPanelAccessRuntime, PricingRepository>();
function invalid(): never { throw new Error("server_pricing_runtime_invalid"); }
function facade(repository: PricingRepository): PricingRepository {
  try { if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid(); return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)]))) as unknown as PricingRepository; } catch { return invalid(); }
}
export function registerServerPricingRepository(access: ServerPanelAccessRuntime, repository: PricingRepository): void {
  try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid(); repositories.set(access, facade(repository)); } catch { invalid(); }
}
export function resolveServerPricingRuntime(access: ServerPanelAccessRuntime): ServerPricingRuntime | null {
  try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null; const pricing = repositories.get(access); return pricing ? Object.freeze({ access: access as ApprovedAccess, pricing }) : null; } catch { return null; }
}
