import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerCatalogRuntime } from "../server-catalog/default.ts";
import { createCatalogHttpHandlers } from "./handler.ts";

const handlers = createCatalogHttpHandlers({
  resolveRuntime: resolveDefaultServerCatalogRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type ProductRouteContext = Readonly<{
  params: Promise<Readonly<{ productId: string }>>;
}>;

type VariantRouteContext = Readonly<{
  params: Promise<Readonly<{ productId: string; variantId: string }>>;
}>;

export const handleDefaultCatalogListProducts = handlers.listProducts;
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

export async function handleDefaultCatalogCreateVariant(
  request: Request,
  context: ProductRouteContext,
) {
  const { productId } = await context.params;
  return handlers.createVariant(request, productId);
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
