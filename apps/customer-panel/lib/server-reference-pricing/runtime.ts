import type { ReferencePricingRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerReferencePricingRuntime = Readonly<{
  access: ApprovedAccess;
  referencePricing: ReferencePricingRepository;
}>;

const METHODS = Object.freeze([
  "listDefinitions", "list", "get", "getPolicy", "previewPolicy", "preview",
  "define", "saveSet", "activate", "savePolicy",
] as const);
const repositories = new WeakMap<ServerPanelAccessRuntime, ReferencePricingRepository>();

function invalid(): never { throw new Error("server_reference_pricing_runtime_invalid"); }

function facade(repository: ReferencePricingRepository): ReferencePricingRepository {
  try {
    if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
    return Object.freeze(Object.fromEntries(
      METHODS.map((method) => [method, repository[method].bind(repository)]),
    )) as unknown as ReferencePricingRepository;
  } catch { return invalid(); }
}

export function registerServerReferencePricingRepository(
  access: ServerPanelAccessRuntime,
  repository: ReferencePricingRepository,
): void {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid();
  repositories.set(access, facade(repository));
}

export function resolveServerReferencePricingRuntime(access: ServerPanelAccessRuntime): ServerReferencePricingRuntime | null {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
  const referencePricing = repositories.get(access);
  return referencePricing
    ? Object.freeze({ access: access as ApprovedAccess, referencePricing })
    : null;
}
