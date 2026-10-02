import { exactStorefrontContentInput, storefrontContentUuid } from "../storefront-content/validation.ts";
import { boundedInteger, documentId, normalizeCatalogSearchQuery, searchFailure } from "./common.ts";
import type { CatalogSearchDocument, CatalogSearchJob } from "./types.ts";

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || (value.length > maximum && Array.from(value).length > maximum) || (!allowEmpty && value.length === 0) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) searchFailure();
  return value;
}
function identifiers(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 1000) searchFailure();
  return Object.freeze([...new Set(value.map((item) => normalizeCatalogSearchQuery(text(item, 2048))))]);
}
export function parseCatalogSearchDocument(value: unknown, storeId: string, productId: string): CatalogSearchDocument {
  const parsed = exactStorefrontContentInput(value, ["id", "storeId", "productId", "title", "searchText", "skus", "barcodes"], ["slug"], "unavailable");
  if (parsed.id !== documentId(storeId, productId) || parsed.storeId !== storeId || parsed.productId !== productId) searchFailure();
  return Object.freeze({
    id: documentId(storeId, productId), storeId, productId,
    title: text(parsed.title, 4096), searchText: normalizeCatalogSearchQuery(text(parsed.searchText, 100_000, true)),
    skus: identifiers(parsed.skus), barcodes: identifiers(parsed.barcodes),
    ...(parsed.slug === undefined ? {} : { slug: text(parsed.slug, 512) }),
  });
}
export function parseCatalogSearchJob(value: unknown): CatalogSearchJob {
  const parsed = exactStorefrontContentInput(value, ["storeId", "productId", "generation", "document"], [], "unavailable");
  const storeId = storefrontContentUuid(parsed.storeId, "unavailable"), productId = storefrontContentUuid(parsed.productId, "unavailable");
  return Object.freeze({ storeId, productId, generation: boundedInteger(parsed.generation, 1, Number.MAX_SAFE_INTEGER), document: parsed.document === null ? null : parseCatalogSearchDocument(parsed.document, storeId, productId) });
}
export function parseCatalogSearchJobs(value: unknown, limit: number): readonly CatalogSearchJob[] {
  if (!Array.isArray(value) || value.length > limit) searchFailure();
  const result = value.map(parseCatalogSearchJob);
  if (new Set(result.map((job) => documentId(job.storeId, job.productId))).size !== result.length) searchFailure();
  return Object.freeze(result);
}
