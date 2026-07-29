import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerCatalogOnboardingRuntime } from "../server-catalog-onboarding/default.ts";
import { createCatalogOnboardingHttpHandlers } from "./handler.ts";

const handlers = createCatalogOnboardingHttpHandlers({
  resolveRuntime: resolveDefaultServerCatalogOnboardingRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type ProductRouteContext = Readonly<{ params: Promise<Readonly<{ productId: string }>> }>;

export const handleDefaultCatalogOnboardingOptions = handlers.getOptions;
export const handleDefaultCatalogOnboardingCreateProduct = handlers.createProduct;
export const handleDefaultCatalogOnboardingListCategories = handlers.listCategories;
export const handleDefaultCatalogOnboardingCreateCategory = handlers.createCategory;

export async function handleDefaultCatalogOnboardingGetProductEditor(request: Request, context: ProductRouteContext) {
  return handlers.getProductEditor(request, (await context.params).productId);
}

export async function handleDefaultCatalogOnboardingUpdateMerchandising(request: Request, context: ProductRouteContext) {
  return handlers.updateMerchandising(request, (await context.params).productId);
}

export async function handleDefaultCatalogOnboardingPublishAfterMedia(request: Request, context: ProductRouteContext) {
  return handlers.publishAfterMedia(request, (await context.params).productId);
}

export async function handleDefaultCatalogOnboardingUpdateCategory(request: Request, context: Readonly<{ params: Promise<Readonly<{ categoryId: string }>> }>) {
  return handlers.updateCategory(request, (await context.params).categoryId);
}

export async function handleDefaultCatalogOnboardingArchiveCategory(request: Request, context: Readonly<{ params: Promise<Readonly<{ categoryId: string }>> }>) {
  return handlers.archiveCategory(request, (await context.params).categoryId);
}
