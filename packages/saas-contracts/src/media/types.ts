import type { PublicImageMediaType } from "../storefront/types.ts";

export const PRODUCT_MEDIA_STATUSES = Object.freeze(["pending", "active", "archived"] as const);
export type ProductMediaStatus = (typeof PRODUCT_MEDIA_STATUSES)[number];

export const PRODUCT_MEDIA_WRITE_STATES = Object.freeze([
  "reserved",
  "uploaded",
  "committed",
  "cleanup_required",
  "deleted",
] as const);
export type ProductMediaWriteState = (typeof PRODUCT_MEDIA_WRITE_STATES)[number];

export type ProductMediaReservation = Readonly<{
  operationId: string;
  mediaId: string;
  productId: string;
  objectKey: string;
  publicUrl: string;
  mediaType: PublicImageMediaType;
  byteSize: number;
  payloadSha256: string;
  state: ProductMediaWriteState;
  version: number;
}>;

export type ProductMedia = Readonly<{
  id: string;
  storeId: string;
  productId: string;
  variantId?: string;
  objectKey: string;
  publicUrl: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width?: number;
  height?: number;
  byteSize: number;
  sortOrder: number;
  status: ProductMediaStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  version: number;
}>;
