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

export async function handleDefaultCatalogOnboardingGetProductEditor(request: Request, context: ProductRouteContext) {
  return handlers.getProductEditor(request, (await context.params).productId);
}

export async function handleDefaultCatalogOnboardingUpdateMerchandising(request: Request, context: ProductRouteContext) {
  return handlers.updateMerchandising(request, (await context.params).productId);
}

export async function handleDefaultCatalogOnboardingPublishAfterMedia(request: Request, context: ProductRouteContext) {
  return handlers.publishAfterMedia(request, (await context.params).productId);
}
