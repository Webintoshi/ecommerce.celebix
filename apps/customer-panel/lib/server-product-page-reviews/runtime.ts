import type { ProductPageReviewRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";

export type ServerProductPageReviewRuntime = ServerCatalogAdminRuntime & Readonly<{ productPageReviews: ProductPageReviewRepository }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, ProductPageReviewRepository>();
export function registerServerProductPageReviewRepository(access: ServerPanelAccessRuntime, repository: ProductPageReviewRepository): void {
  if (!access || access.readiness.mode !== "approved_staging" || !repository || ["settings", "saveSettings"].some(method => typeof repository[method as keyof ProductPageReviewRepository] !== "function") || repositories.has(access)) throw new Error("product_page_review_runtime_invalid");
  repositories.set(access, repository);
}
export function resolveServerProductPageReviewRuntime(access: ServerPanelAccessRuntime): ServerProductPageReviewRuntime | null {
  const catalog = resolveServerCatalogAdminRuntime(access), repository = repositories.get(access);
  return catalog && repository ? Object.freeze({ ...catalog, productPageReviews: repository }) : null;
}
