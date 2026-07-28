import "server-only";

import type { CatalogOnboardingRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerCatalogOnboardingRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  onboarding: CatalogOnboardingRepository;
}>;

const repositories = new WeakMap<ServerPanelAccessRuntime, CatalogOnboardingRepository>();
const METHODS = Object.freeze([
  "getOptions", "createProduct", "getProductEditor", "updateMerchandising", "publishAfterMedia",
] as const);

function invalid(): never { throw new Error("server_catalog_onboarding_runtime_invalid"); }

function facade(repository: CatalogOnboardingRepository): CatalogOnboardingRepository {
  if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  const selected: CatalogOnboardingRepository = {
    getOptions: (input) => repository.getOptions(input),
    createProduct: (input) => repository.createProduct(input),
    getProductEditor: (input) => repository.getProductEditor(input),
    updateMerchandising: (input) => repository.updateMerchandising(input),
    publishAfterMedia: (input) => repository.publishAfterMedia(input),
  };
  return Object.freeze(selected);
}

export function registerServerCatalogOnboardingRepository(
  access: ServerPanelAccessRuntime,
  repository: CatalogOnboardingRepository,
): void {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid();
  repositories.set(access, facade(repository));
}

export function resolveServerCatalogOnboardingRuntime(
  access: ServerPanelAccessRuntime,
): ServerCatalogOnboardingRuntime | null {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
  const onboarding = repositories.get(access);
  return onboarding === undefined ? null : Object.freeze({ access: access as ApprovedAccessRuntime, onboarding });
}
