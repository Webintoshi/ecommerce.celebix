import type { PublicImageMediaType, PublicProduct, PublicProductMedia, PublicProductVariant, PublicStorefront } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DESCRIPTION_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);

function invalid(): never { throw new TypeError("storefront_contract_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}
function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}
function description(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 10_000 || value !== value.trim() || DESCRIPTION_CONTROL.test(value)) invalid();
  return value;
}
function uuid(value: unknown): string { return string(value, 36, 36, UUID); }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function optionalInteger(parsed: Record<string, unknown>, key: string, minimum: number, maximum: number): number | undefined {
  return Object.hasOwn(parsed, key) ? integer(parsed[key], minimum, maximum) : undefined;
}
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function mediaType(value: unknown): PublicImageMediaType {
  if (typeof value !== "string" || !MEDIA_TYPES.includes(value as PublicImageMediaType)) invalid();
  return value as PublicImageMediaType;
}
function httpsUrl(value: unknown, maximum = 2048): string {
  const raw = string(value, 1, maximum);
  let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== raw) invalid();
  return raw;
}
function hostname(value: unknown): string { return string(value, 3, 253, HOSTNAME); }
function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = record(value);
  if (Object.keys(parsed).length > 32) invalid();
  const output: Record<string, string> = {};
  for (const [key, nested] of Object.entries(parsed)) output[string(key, 1, 64)] = string(nested, 0, 256);
  return Object.freeze(output);
}

export function parsePublicStorefront(value: unknown): PublicStorefront {
  const parsed = exact(value, ["schemaVersion", "id", "name", "slug", "hostname", "primaryHostname", "canonicalUrl", "currency", "locale", "themeKey"]);
  const selectedHostname = hostname(parsed.hostname);
  const primaryHostname = hostname(parsed.primaryHostname);
  const canonicalUrl = httpsUrl(parsed.canonicalUrl);
  if (parsed.schemaVersion !== 1 || parsed.currency !== "TRY" || parsed.locale !== "tr" || canonicalUrl !== `https://${selectedHostname}/`) invalid();
  return Object.freeze({ schemaVersion: 1, id: uuid(parsed.id), name: string(parsed.name, 1, 160), slug: string(parsed.slug, 3, 63, SLUG), hostname: selectedHostname, primaryHostname, canonicalUrl, currency: "TRY", locale: "tr", themeKey: string(parsed.themeKey, 1, 80) });
}

export function parsePublicProductMedia(value: unknown): PublicProductMedia {
  const parsed = exact(value, ["id", "productId", "url", "mediaType", "altText", "sortOrder"], ["variantId", "width", "height"]);
  const width = optionalInteger(parsed, "width", 1, 8192);
  const height = optionalInteger(parsed, "height", 1, 8192);
  if ((width === undefined) !== (height === undefined)) invalid();
  return Object.freeze({ id: uuid(parsed.id), productId: uuid(parsed.productId), ...(Object.hasOwn(parsed, "variantId") ? { variantId: uuid(parsed.variantId) } : {}), url: httpsUrl(parsed.url), mediaType: mediaType(parsed.mediaType), altText: string(parsed.altText, 0, 500), ...(width === undefined ? {} : { width, height }), sortOrder: integer(parsed.sortOrder, 0, 15) });
}

export function parsePublicProductVariant(value: unknown): PublicProductVariant {
  const parsed = exact(value, ["id", "title", "priceCents", "stockTracking", "stockQuantity", "available", "attributes"], ["sku", "compareAtCents"]);
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = optionalInteger(parsed, "compareAtCents", priceCents, Number.MAX_SAFE_INTEGER);
  return Object.freeze({ id: uuid(parsed.id), title: string(parsed.title, 1, 200), ...(Object.hasOwn(parsed, "sku") ? { sku: string(parsed.sku, 1, 64, SKU) } : {}), priceCents, ...(compareAtCents === undefined ? {} : { compareAtCents }), stockTracking: boolean(parsed.stockTracking), stockQuantity: integer(parsed.stockQuantity, 0), available: boolean(parsed.available), attributes: attributes(parsed.attributes) });
}

export function parsePublicProduct(value: unknown): PublicProduct {
  const parsed = exact(value, ["id", "slug", "title", "currency", "status", "priceCents", "available", "variants", "media"], ["description", "compareAtCents"]);
  if (parsed.currency !== "TRY" || parsed.status !== "active" || !Array.isArray(parsed.variants) || !Array.isArray(parsed.media) || parsed.variants.length < 1 || parsed.variants.length > 100 || parsed.media.length > 16) invalid();
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = optionalInteger(parsed, "compareAtCents", priceCents, Number.MAX_SAFE_INTEGER);
  const variants = Object.freeze(parsed.variants.map(parsePublicProductVariant));
  const media = Object.freeze(parsed.media.map(parsePublicProductMedia));
  for (let index = 1; index < media.length; index += 1) if (media[index - 1]!.sortOrder >= media[index]!.sortOrder) invalid();
  const id = uuid(parsed.id);
  if (media.some((item) => item.productId !== id)) invalid();
  return Object.freeze({ id, slug: string(parsed.slug, 3, 100, SLUG), title: string(parsed.title, 1, 200), ...(Object.hasOwn(parsed, "description") ? { description: description(parsed.description) } : {}), currency: "TRY", status: "active", priceCents, ...(compareAtCents === undefined ? {} : { compareAtCents }), available: boolean(parsed.available), variants, media });
}
