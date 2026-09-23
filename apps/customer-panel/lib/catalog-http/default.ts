import "server-only";

import { randomUUID } from "node:crypto";
import { resolveDefaultCacheRuntime } from "@celebix/saas-cache";

import { resolveDefaultServerCatalogRuntime } from "../server-catalog/default.ts";
import { resolveDefaultServerMediaRuntime } from "../server-media/default.ts";
import { createCatalogHttpHandlers } from "./handler.ts";

const handlers = createCatalogHttpHandlers({
  resolveRuntime: resolveDefaultServerCatalogRuntime,
  resolveMediaRuntime: resolveDefaultServerMediaRuntime,
  cache: resolveDefaultCacheRuntime().cache,
  now: () => new Date(),
  requestId: randomUUID,
});

type ProductRouteContext = Readonly<{
  params: Promise<Readonly<{ productId: string }>>;
}>;

type VariantRouteContext = Readonly<{
  params: Promise<Readonly<{ productId: string; variantId: string }>>;
}>;

export const handleDefaultCatalogListProducts = (request: Request) => handlers.listProducts(request);
export const handleDefaultCatalogListProductsV2 = (request: Request) => handlers.listProducts(request, "v2");
export const handleDefaultCatalogBulkProducts = handlers.bulkProducts;
export const handleDefaultCatalogListVariantChoices = handlers.listVariantChoices;
export const handleDefaultCatalogCreateProduct = handlers.createProduct;
export const handleDefaultCatalogGetDashboardSummary = handlers.getDashboardSummary;

export async function handleDefaultCatalogGetProduct(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.getProduct(request, productId);
}

export async function handleDefaultCatalogGetProductV2(request: Request, context: ProductRouteContext) {
  const { productId } = await context.params;
  return handlers.getProduct(request, productId, "v2");
}

export async function handleDefaultCatalogUpdateProduct(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.updateProduct(request, productId);
}

export async function handleDefaultCatalogArchiveProduct(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.archiveProduct(request, productId);
}

export async function handleDefaultCatalogRestoreProduct(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.restoreProduct(request, productId);
}

export async function handleDefaultCatalogRemovalEligibility(request: Request, context: ProductRouteContext) { const { productId } = await context.params; return handlers.removalEligibility(request, productId); }
export async function handleDefaultCatalogRemoveProduct(request: Request, context: ProductRouteContext) { const { productId } = await context.params; return handlers.removeProduct(request, productId); }
export async function handleDefaultCatalogGetDeletionImpact(request: Request, context: ProductRouteContext) { const { productId } = await context.params; return handlers.getDeletionImpact(request, productId); }
export async function handleDefaultCatalogDeleteProduct(request: Request, context: ProductRouteContext) { const { productId } = await context.params; return handlers.deleteProduct(request, productId); }

export async function handleDefaultCatalogCreateVariant(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.createVariant(request, productId);
}

export async function handleDefaultCatalogCreateVariantBatch(request: Request, context: ProductRouteContext) {
  const { productId } = await context.params;
  return handlers.createVariantBatch(request, productId);
}

export async function handleDefaultCatalogUpdateVariant(
  request: Request,
  context: VariantRouteContext,
) {
  const { productId, variantId } = await context.params;
  return handlers.updateVariant(request, productId, variantId);
}

export async function handleDefaultCatalogArchiveVariant(
  request: Request,
  context: VariantRouteContext,
) {
  const { productId, variantId } = await context.params;
  return handlers.archiveVariant(request, productId, variantId);
}
