import { PRODUCT_MEDIA_CLEANUP_STATES, PRODUCT_MEDIA_STATUSES, PRODUCT_MEDIA_WRITE_STATES, type ProductMedia, type ProductMediaLifecycle, type ProductMediaReservation, type ProductMediaStatus, type ProductMediaWriteState } from "./types.ts";
import type { PublicImageMediaType } from "../storefront/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);
function invalid(): never { throw new TypeError("media_contract_invalid"); }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) invalid(); return value as Record<string, unknown>; }
function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string { if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid(); return value; }
function uuid(value: unknown): string { return string(value, 36, 36, UUID); }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid(); return value as number; }
function timestamp(value: unknown): string { const raw = string(value, 24, 24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); if (new Date(raw).toISOString() !== raw) invalid(); return raw; }

export function parseProductMedia(value: unknown): ProductMedia {
  const parsed = record(value);
  const required = ["id", "storeId", "productId", "objectKey", "publicUrl", "mediaType", "altText", "byteSize", "sortOrder", "status", "createdAt", "updatedAt", "version"];
  const allowed = new Set([...required, "variantId", "width", "height", "archivedAt"]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  const id = uuid(parsed.id), storeId = uuid(parsed.storeId), productId = uuid(parsed.productId);
  const mediaType = string(parsed.mediaType, 9, 10) as PublicImageMediaType;
  if (!MEDIA_TYPES.includes(mediaType)) invalid();
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
  const objectKey = string(parsed.objectKey, 1, 512);
  if (objectKey !== `stores/${storeId}/products/${productId}/${id}.${extension}`) invalid();
  const publicUrl = string(parsed.publicUrl, 1, 2048);
  let url: URL; try { url = new URL(publicUrl); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !url.pathname.endsWith(`/${objectKey}`) || url.toString() !== publicUrl) invalid();
  const status = string(parsed.status, 6, 8) as ProductMediaStatus;
  if (!PRODUCT_MEDIA_STATUSES.includes(status)) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt);
  const archivedAt = Object.hasOwn(parsed, "archivedAt") ? timestamp(parsed.archivedAt) : undefined;
  if (updatedAt < createdAt || (status === "archived") !== (archivedAt !== undefined)) invalid();
  const width = Object.hasOwn(parsed, "width") ? integer(parsed.width, 1, 8192) : undefined;
  const height = Object.hasOwn(parsed, "height") ? integer(parsed.height, 1, 8192) : undefined;
  if ((width === undefined) !== (height === undefined)) invalid();
  return Object.freeze({ id, storeId, productId, ...(Object.hasOwn(parsed, "variantId") ? { variantId: uuid(parsed.variantId) } : {}), objectKey, publicUrl, mediaType, altText: string(parsed.altText, 0, 500), ...(width === undefined ? {} : { width, height }), byteSize: integer(parsed.byteSize, 1, 5_242_880), sortOrder: integer(parsed.sortOrder, 0, 15), status, createdAt, updatedAt, ...(archivedAt === undefined ? {} : { archivedAt }), version: integer(parsed.version, 1) });
}

export function parseProductMediaReservation(value: unknown, expectedStoreId: string): ProductMediaReservation {
  const parsed = record(value);
  const required = ["operationId", "mediaId", "productId", "objectKey", "publicUrl", "mediaType", "byteSize", "payloadSha256", "state", "version"];
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).length !== required.length) invalid();
  const storeId = uuid(expectedStoreId);
  const operationId = uuid(parsed.operationId);
  const mediaId = uuid(parsed.mediaId);
  const productId = uuid(parsed.productId);
  const mediaType = string(parsed.mediaType, 9, 10) as PublicImageMediaType;
  if (!MEDIA_TYPES.includes(mediaType)) invalid();
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
  const objectKey = string(parsed.objectKey, 1, 512);
  if (objectKey !== `stores/${storeId}/products/${productId}/${mediaId}.${extension}`) invalid();
  const publicUrl = string(parsed.publicUrl, 1, 2048);
  let url: URL;
  try { url = new URL(publicUrl); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !url.pathname.endsWith(`/${objectKey}`) || url.toString() !== publicUrl) invalid();
  const payloadSha256 = string(parsed.payloadSha256, 64, 64, /^[a-f0-9]{64}$/);
  const state = string(parsed.state, 7, 16) as ProductMediaWriteState;
  if (!PRODUCT_MEDIA_WRITE_STATES.includes(state)) invalid();
  return Object.freeze({
    operationId,
    mediaId,
    productId,
    objectKey,
    publicUrl,
    mediaType,
    byteSize: integer(parsed.byteSize, 1, 5_242_880),
    payloadSha256,
    state,
    version: integer(parsed.version, 1),
  });
}

export function parseProductMediaLifecycle(value: unknown): ProductMediaLifecycle {
  const parsed = record(value);
  const required = ["id", "productId", "mediaType", "altText", "byteSize", "sortOrder", "status", "cleanupState", "createdAt", "updatedAt", "version"];
  const allowed = new Set([...required, "variantId", "publicUrl", "width", "height", "archivedAt", "retentionExpiresAt"]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  const status = string(parsed.status, 6, 8);
  const cleanupState = string(parsed.cleanupState, 6, 14);
  if (!["active", "archived"].includes(status) || !PRODUCT_MEDIA_CLEANUP_STATES.includes(cleanupState as ProductMediaLifecycle["cleanupState"])) invalid();
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt);
  const archivedAt = Object.hasOwn(parsed, "archivedAt") ? timestamp(parsed.archivedAt) : undefined;
  const retentionExpiresAt = Object.hasOwn(parsed, "retentionExpiresAt") ? timestamp(parsed.retentionExpiresAt) : undefined;
  if (updatedAt < createdAt) invalid();
  if (status === "active" ? cleanupState !== "active" || archivedAt !== undefined || retentionExpiresAt !== undefined : cleanupState === "active" || archivedAt === undefined || retentionExpiresAt === undefined || retentionExpiresAt < archivedAt) invalid();
  const publicUrl = Object.hasOwn(parsed, "publicUrl") ? string(parsed.publicUrl, 1, 2048) : undefined;
  if ((cleanupState === "object_deleted") === (publicUrl !== undefined)) invalid();
  if (publicUrl !== undefined) { let url: URL; try { url = new URL(publicUrl); } catch { return invalid(); } if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== publicUrl) invalid(); }
  const mediaType = string(parsed.mediaType, 9, 10) as PublicImageMediaType;
  if (!MEDIA_TYPES.includes(mediaType)) invalid();
  const width = Object.hasOwn(parsed, "width") ? integer(parsed.width, 1, 8192) : undefined;
  const height = Object.hasOwn(parsed, "height") ? integer(parsed.height, 1, 8192) : undefined;
  if ((width === undefined) !== (height === undefined)) invalid();
  return Object.freeze({
    id: uuid(parsed.id), productId: uuid(parsed.productId),
    ...(Object.hasOwn(parsed, "variantId") ? { variantId: uuid(parsed.variantId) } : {}),
    ...(publicUrl === undefined ? {} : { publicUrl }), mediaType, altText: string(parsed.altText, 0, 500),
    ...(width === undefined ? {} : { width, height }), byteSize: integer(parsed.byteSize, 1, 5_242_880),
    sortOrder: integer(parsed.sortOrder, 0, 15), status: status as ProductMediaLifecycle["status"],
    cleanupState: cleanupState as ProductMediaLifecycle["cleanupState"], createdAt, updatedAt,
    ...(archivedAt === undefined ? {} : { archivedAt }), ...(retentionExpiresAt === undefined ? {} : { retentionExpiresAt }),
    version: integer(parsed.version, 1),
  });
}
