import { parsePublicProduct, parsePublicProductV2, type PublicProduct } from "../../../saas-contracts/src/storefront/index.ts";
import type { PostgresClientLike } from "../postgres/pool.ts";

const BATCH_SIZE = 500;
function invalid(): never { throw new TypeError("public_product_review_summary_invalid"); }
function exact(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== keys) invalid();
  return value as Record<string, unknown>;
}

/** Enrich only products already returned by the host-authorized public read. */
export async function hydratePublicProductReviewSummaries<T>(client: PostgresClientLike, payload: T, hostname: string, now: Date): Promise<T> {
  const products = new Map<object, PublicProduct>();
  function collect(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.id === "string" && Array.isArray(object.variants) && Array.isArray(object.media)) {
      products.set(object, Object.hasOwn(object, "seoTitle") ? parsePublicProductV2(object) : parsePublicProduct(object));
      return;
    }
    if (Array.isArray(object.items)) collect(object.items);
    if (Array.isArray(object.productRows)) collect(object.productRows);
  }
  collect(payload);
  if (products.size === 0) return payload;
  const ids = [...new Set([...products.values()].map(product => product.id))];
  const summaries = new Map<string, NonNullable<PublicProduct["reviewSummary"]>>();
  let enabled: boolean | undefined;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const selected = await client.query("SELECT outcome,result_payload FROM saas.public_product_review_summaries($1::text,$2::timestamptz,$3::uuid[])", [hostname, now, batch]);
    if (selected.rows.length !== 1) invalid();
    const row = exact(selected.rows[0], "outcome,result_payload");
    if (row.outcome !== "found") invalid();
    const result = exact(row.result_payload, "enabled,items");
    if (typeof result.enabled !== "boolean" || !Array.isArray(result.items) || result.items.length > batch.length || (enabled !== undefined && enabled !== result.enabled)) invalid();
    enabled = result.enabled;
    if (!enabled) { if (result.items.length !== 0) invalid(); break; }
    for (const entry of result.items) {
      const item = exact(entry, "averageRating,productId,reviewCount");
      if (typeof item.productId !== "string" || !batch.includes(item.productId) || summaries.has(item.productId)) invalid();
      const { averageRating, reviewCount } = item;
      if (typeof averageRating !== "number" || !Number.isFinite(averageRating) || !Number.isSafeInteger(reviewCount) || (reviewCount as number) < 0
        || (reviewCount === 0 ? averageRating !== 0 : averageRating < 1 || averageRating > 5)) invalid();
      summaries.set(item.productId, Object.freeze({ averageRating, reviewCount: reviewCount as number }));
    }
    if (batch.some(id => !summaries.has(id))) invalid();
  }
  function enrich(value: unknown): unknown {
    if (Array.isArray(value)) return Object.freeze(value.map(enrich));
    if (!value || typeof value !== "object") return value;
    const product = products.get(value);
    if (product) {
      const { reviewSummary: _previous, ...base } = product;
      return Object.freeze({ ...base, ...(enabled ? { reviewSummary: summaries.get(product.id)! } : {}) });
    }
    const object = value as Record<string, unknown>;
    return Object.freeze({ ...object, ...(Array.isArray(object.items) ? { items: enrich(object.items) } : {}), ...(Array.isArray(object.productRows) ? { productRows: enrich(object.productRows) } : {}) });
  }
  return enrich(payload) as T;
}
