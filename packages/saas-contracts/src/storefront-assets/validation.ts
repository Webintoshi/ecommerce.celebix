import { STOREFRONT_ASSET_KINDS, STOREFRONT_ASSET_STATUSES, type StorefrontAsset, type StorefrontAssetKind, type StorefrontAssetStatus } from "./types.ts";
import type { PublicImageMediaType } from "../storefront/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MEDIA = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);

function invalid(): never { throw new TypeError("storefront_asset_contract_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some((key) => {
    const descriptor = descriptors[key as string];
    return !descriptor || !descriptor.enumerable || !("value" in descriptor);
  })) invalid();
  return Object.fromEntries((keys as string[]).map((key) => [key, descriptors[key]!.value]));
}
function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function timestamp(value: unknown): string {
  const selected = text(value, 24, 24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  if (new Date(selected).toISOString() !== selected) invalid();
  return selected;
}

export function parseStorefrontAsset(value: unknown): StorefrontAsset {
  const parsed = record(value);
  const required = ["id", "storeId", "kind", "objectKey", "publicUrl", "mediaType", "altText", "width", "height", "byteSize", "status", "createdAt", "updatedAt", "version"];
  const allowed = new Set([...required, "archivedAt"]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  const id = text(parsed.id, 36, 36, UUID), storeId = text(parsed.storeId, 36, 36, UUID);
  const kind = text(parsed.kind, 4, 8) as StorefrontAssetKind;
  if (!STOREFRONT_ASSET_KINDS.includes(kind)) invalid();
  const mediaType = text(parsed.mediaType, 9, 10) as PublicImageMediaType;
  if (!MEDIA.includes(mediaType)) invalid();
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice(6);
  const objectKey = text(parsed.objectKey, 1, 512);
  if (objectKey !== `stores/${storeId}/storefront/${kind}/${id}.${extension}`) invalid();
  const publicUrl = text(parsed.publicUrl, 1, 2048);
  let url: URL;
  try { url = new URL(publicUrl); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== `/${objectKey}` || url.toString() !== publicUrl) invalid();
  const status = text(parsed.status, 6, 8) as StorefrontAssetStatus;
  if (!STOREFRONT_ASSET_STATUSES.includes(status)) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt);
  const archivedAt = Object.hasOwn(parsed, "archivedAt") ? timestamp(parsed.archivedAt) : undefined;
  if (updatedAt < createdAt || (status === "archived") !== (archivedAt !== undefined)) invalid();
  return Object.freeze({ id, storeId, kind, objectKey, publicUrl, mediaType, altText: text(parsed.altText, 0, 500), width: integer(parsed.width, 1, 8192), height: integer(parsed.height, 1, 8192), byteSize: integer(parsed.byteSize, 1, 5_242_880), status, createdAt, updatedAt, ...(archivedAt ? { archivedAt } : {}), version: integer(parsed.version, 1) });
}
