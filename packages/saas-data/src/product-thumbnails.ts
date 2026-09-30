import type { PostgresClientLike } from "./postgres/pool.ts";

export type ProductThumbnailReference =
  | Readonly<{ key: string; productId: string; variantId?: string | null }>
  | Readonly<{ key: string; orderId: string; orderItemId: string }>;
export type ProductThumbnailScope = "pos" | "orders" | "analytics";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function unavailable(): never { throw new Error("Product thumbnail lookup unavailable"); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(descriptors, key)) || Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !allowed.has(key))) unavailable();
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || !descriptor.enumerable) unavailable();
    result[key] = descriptor.value;
  }
  return result;
}
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) unavailable(); return value; }
function imageUrl(value: unknown, storeId: string, productId?: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) unavailable();
  let url: URL;
  try { url = new URL(value); } catch { unavailable(); }
  const path = /^\/stores\/([^/]+)\/products\/([^/]+)\/([^/]+)\.(?:jpg|png|webp)$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.toString() !== value || !path || path[1] !== storeId || (productId !== undefined && path[2] !== productId)) unavailable();
  uuid(path[2]); uuid(path[3]);
  return value;
}

// Use the caller's existing transaction and authority; the RPC grants no catalog or table access.
export async function resolveProductThumbnails(
  client: PostgresClientLike,
  authorityValues: readonly unknown[],
  scope: ProductThumbnailScope,
  references: readonly ProductThumbnailReference[],
): Promise<ReadonlyMap<string, string | null>> {
  if (authorityValues.length !== 7 || !["pos", "orders", "analytics"].includes(scope) || !Array.isArray(references) || references.length > 5000) unavailable();
  const storeId = uuid(authorityValues[0]);
  const requested = new Map<string, ProductThumbnailReference>();
  for (const reference of references) {
    const parsed = scope === "orders" ? record(reference, ["key", "orderId", "orderItemId"]) : record(reference, ["key", "productId"], ["variantId"]);
    if (typeof parsed.key !== "string" || parsed.key.length < 1 || parsed.key.length > 160 || parsed.key !== parsed.key.trim() || /[\u0000-\u001f\u007f]/.test(parsed.key) || requested.has(parsed.key)) unavailable();
    const clean: ProductThumbnailReference = scope === "orders"
      ? { key: parsed.key, orderId: uuid(parsed.orderId), orderItemId: uuid(parsed.orderItemId) }
      : { key: parsed.key, productId: uuid(parsed.productId), ...(parsed.variantId === undefined ? {} : { variantId: parsed.variantId === null ? null : uuid(parsed.variantId) }) };
    requested.set(clean.key, clean);
  }
  if (requested.size === 0) return new Map();
  const result = await client.query(
    "SELECT outcome,result_payload FROM saas.merchant_product_images($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::jsonb)",
    [...authorityValues, scope, JSON.stringify([...requested.values()])],
  );
  if (result.rows.length !== 1) unavailable();
  const row = record(result.rows[0], ["outcome", "result_payload"]);
  if (row.outcome !== "found") unavailable();
  const payload = record(row.result_payload, ["images"]);
  if (!Array.isArray(payload.images) || payload.images.length > requested.size) unavailable();
  const images = new Map<string, string | null>([...requested.keys()].map(key => [key, null]));
  const seen = new Set<string>();
  for (const value of payload.images) {
    const item = record(value, ["key", "imageUrl"]);
    if (typeof item.key !== "string" || !requested.has(item.key) || seen.has(item.key)) unavailable();
    const reference = requested.get(item.key)!;
    images.set(item.key, imageUrl(item.imageUrl, storeId, "productId" in reference ? reference.productId : undefined));
    seen.add(item.key);
  }
  return images;
}
