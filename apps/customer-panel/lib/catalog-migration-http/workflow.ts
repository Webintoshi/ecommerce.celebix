import type { CatalogMigrationBatchResult, CatalogMigrationJob, CatalogMigrationProduct } from "@celebix/saas-data";
import type { WooCommerceMigrationManifest } from "../catalog-import/woocommerce-migration.ts";

export interface WooCommerceMigrationApi {
  begin(value: Readonly<{ sourceDigest: string; totalProducts: number; totalMedia: number; categories: readonly unknown[]; brands: readonly unknown[] }>, operationId: string): Promise<CatalogMigrationJob>;
  batch(jobId: string, value: Readonly<{ sourceDigest: string; products: readonly CatalogMigrationProduct[] }>, operationId: string): Promise<CatalogMigrationBatchResult>;
  media(jobId: string, value: Readonly<{ sourceProductId: string; ordinal: number; sourceUrl: string; altText: string }>, operationId: string): Promise<unknown>;
  status(jobId: string): Promise<CatalogMigrationJob>;
}
export type WooCommerceMigrationProgress = Readonly<{ phase: "products" | "media"; completed: number; total: number }>;

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
}
async function products(manifest: WooCommerceMigrationManifest): Promise<readonly CatalogMigrationProduct[]> {
  return Object.freeze(await Promise.all(manifest.products.map(async (product) => {
    if (product.variants.length !== 1) throw new Error("woocommerce_migration_workflow_invalid");
    const variant = product.variants[0]!;
    return Object.freeze({
      sourceProductId: product.sourceProductId, title: product.title, slug: product.slug,
      ...(product.description === undefined ? {} : { description: product.description }), status: product.status,
      categorySlugs: product.categorySlugs, brandSlugs: product.brandSlugs,
      variant, sourceImageDigests: Object.freeze(await Promise.all(product.sourceImages.map(digest))),
    });
  })));
}
async function mediaPool(items: readonly Readonly<{ sourceProductId: string; ordinal: number; sourceUrl: string; altText: string }>[], run: (item: typeof items[number]) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() { for (;;) { const index = next++; const item = items[index]; if (!item) return; try { await run(item); } catch {} } }
  await Promise.all([worker(), worker()]);
}

export async function runWooCommerceMigration(
  manifest: WooCommerceMigrationManifest,
  api: WooCommerceMigrationApi,
  uuid: () => string,
  progress: (value: WooCommerceMigrationProgress) => void = () => undefined,
): Promise<CatalogMigrationJob> {
  const compiled = await products(manifest);
  let current = await api.begin({ sourceDigest: manifest.sourceDigest, totalProducts: compiled.length, totalMedia: manifest.mediaCount, categories: manifest.categories, brands: manifest.brands }, uuid());
  if (current.sourceDigest !== manifest.sourceDigest || current.totalProducts !== compiled.length || current.totalMedia !== manifest.mediaCount) throw new Error("woocommerce_migration_workflow_invalid");
  let offset = 0;
  for (const batchIds of manifest.batches) {
    const batch = compiled.slice(offset, offset + batchIds.length);
    if (batch.length !== batchIds.length || batch.some((product, index) => product.sourceProductId !== batchIds[index])) throw new Error("woocommerce_migration_workflow_invalid");
    const end = offset + batch.length;
    if (current.importedProducts < end) {
      if (current.importedProducts !== offset) throw new Error("woocommerce_migration_workflow_invalid");
      current = await api.batch(current.jobId, { sourceDigest: manifest.sourceDigest, products: batch }, uuid());
    }
    offset = end; progress(Object.freeze({ phase: "products", completed: current.importedProducts, total: current.totalProducts }));
  }
  const mediaItems = Object.freeze(manifest.products.flatMap((product) => product.sourceImages.map((sourceUrl, ordinal) => Object.freeze({ sourceProductId: product.sourceProductId, ordinal, sourceUrl, altText: product.title }))));
  let attempted = 0;
  await mediaPool(mediaItems, async (item) => { try { await api.media(current.jobId, item, uuid()); } finally { attempted += 1; progress(Object.freeze({ phase: "media", completed: attempted, total: mediaItems.length })); } });
  current = await api.status(current.jobId);
  if (current.sourceDigest !== manifest.sourceDigest || current.importedProducts !== compiled.length
    || !["completed", "completed_with_failures"].includes(current.status)
    || current.committedMedia + current.failedMedia !== current.totalMedia) throw new Error("woocommerce_migration_workflow_invalid");
  return current;
}
