import "server-only";

import type { CatalogRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccessRuntime = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerCatalogRuntime = Readonly<{
  access: ApprovedAccessRuntime;
  catalog: CatalogRepository;
}>;

const repositories = new WeakMap<ServerPanelAccessRuntime, CatalogRepository>();
const METHODS = Object.freeze([
  "createProduct",
  "getDashboardSummary",
  "getProduct",
  "getProductDetails",
  "listProducts",
  "listVariantChoices",
  "updateProduct",
  "archiveProduct",
  "createVariant",
  "updateVariant",
  "archiveVariant",
] as const);

function invalid(): never {
  throw new Error("server_catalog_runtime_invalid");
}

function facade(repository: CatalogRepository): CatalogRepository {
  if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  const projected: CatalogRepository = {
    createProduct: (input) => repository.createProduct(input),
    getDashboardSummary: (input) => repository.getDashboardSummary(input),
    getProduct: (input) => repository.getProduct(input),
    getProductDetails: (input) => repository.getProductDetails(input),
    listProducts: (input) => repository.listProducts(input),
    listVariantChoices: (input) => repository.listVariantChoices(input),
    updateProduct: (input) => repository.updateProduct(input),
    archiveProduct: (input) => repository.archiveProduct(input),
    createVariant: (input) => repository.createVariant(input),
    updateVariant: (input) => repository.updateVariant(input),
    archiveVariant: (input) => repository.archiveVariant(input),
  };
  return Object.freeze(projected);
}

export function registerServerCatalogRepository(
  access: ServerPanelAccessRuntime,
  repository: CatalogRepository,
): void {
  if (
    !access || access.readiness.mode !== "approved_staging" ||
    access.panelOrigin === null || repositories.has(access)
  ) invalid();
  repositories.set(access, facade(repository));
}

export function resolveServerCatalogRuntime(
  access: ServerPanelAccessRuntime,
): ServerCatalogRuntime | null {
  if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
  const catalog = repositories.get(access);
  return catalog === undefined
    ? null
    : Object.freeze({ access: access as ApprovedAccessRuntime, catalog });
}
