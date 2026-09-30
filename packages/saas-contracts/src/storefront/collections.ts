import { parsePublicProduct } from "./validation.ts";
import type { PublicProduct, PublicStorefrontAsset } from "./types.ts";

export type PublicCatalogCollection = Readonly<{ id: string; name: string; slug: string; description?: string; cover?: PublicStorefrontAsset }>;
export type PublicCollectionPage = Readonly<{ collection: PublicCatalogCollection; items: readonly PublicProduct[]; total: number; nextOffset: number | null }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid(): never { throw new TypeError("public_collection_contract_invalid"); }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
 if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
 const object = value as Record<string, unknown>;
 if (required.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => ![...required, ...optional].includes(key))) invalid();
 return object;
}
function text(value: unknown, max: number, pattern?: RegExp): string {
 if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || (pattern && !pattern.test(value))) invalid();
 return value;
}
function description(value: unknown): string {
 if (typeof value !== "string" || !value || value !== value.trim() || value.length > 2000 || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid();
 return value;
}
function cover(value: unknown): PublicStorefrontAsset {
 const asset = exact(value, ["url", "altText", "mediaType", "width", "height"]);
 const mediaType = asset.mediaType;
 if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp") invalid();
 const url = new URL(text(asset.url, 2048));
 const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/png" ? "png" : "webp";
 const path = new RegExp(`^/stores/[0-9a-f-]{36}/storefront/collection/[0-9a-f-]{36}\\.${extension}$`);
 if (url.protocol !== "https:" || !["media.celebix.site", "media.saas-staging.celebix.site"].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !path.test(url.pathname)) invalid();
 if (typeof asset.altText !== "string" || asset.altText.length > 500 || /[\u0000-\u001f\u007f]/.test(asset.altText)) invalid();
 for (const dimension of [asset.width, asset.height]) if (!Number.isSafeInteger(dimension) || (dimension as number) < 1 || (dimension as number) > 8192) invalid();
 return Object.freeze({ url: url.toString(), altText: asset.altText, mediaType, width: asset.width as number, height: asset.height as number });
}
export function parsePublicCollectionPage(value: unknown): PublicCollectionPage {
 const parsed = exact(value, ["collection", "items", "total", "nextOffset"]);
 const resource = exact(parsed.collection, ["id", "name", "slug"], ["description", "cover"]);
 if (!Array.isArray(parsed.items) || parsed.items.length > 48 || !Number.isSafeInteger(parsed.total) || (parsed.total as number) < parsed.items.length || (parsed.nextOffset !== null && (!Number.isSafeInteger(parsed.nextOffset) || (parsed.nextOffset as number) < 1 || (parsed.nextOffset as number) > 10000))) invalid();
 return Object.freeze({
  collection: Object.freeze({ id: text(resource.id, 36, UUID), name: text(resource.name, 120), slug: text(resource.slug, 120, /^[a-z0-9]+(?:-[a-z0-9]+)*$/), ...(resource.description !== undefined ? { description: description(resource.description) } : {}), ...(resource.cover !== undefined ? { cover: cover(resource.cover) } : {}) }),
  items: Object.freeze(parsed.items.map(parsePublicProduct)), total: parsed.total as number, nextOffset: parsed.nextOffset as number | null,
 });
}
