import type { PublicImageMediaType } from "../storefront/types.ts";

export const PRODUCT_MEDIA_STATUSES = Object.freeze(["pending", "active", "archived"] as const);
export type ProductMediaStatus = (typeof PRODUCT_MEDIA_STATUSES)[number];

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
