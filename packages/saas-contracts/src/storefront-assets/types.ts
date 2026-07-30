import type { PublicImageMediaType } from "../storefront/types.ts";

export const STOREFRONT_ASSET_KINDS = Object.freeze(["logo", "hero", "social", "favicon"] as const);
export const STOREFRONT_ASSET_STATUSES = Object.freeze(["active", "archived"] as const);

export type StorefrontAssetKind = (typeof STOREFRONT_ASSET_KINDS)[number];
export type StorefrontAssetStatus = (typeof STOREFRONT_ASSET_STATUSES)[number];

export type StorefrontAsset = Readonly<{
  id: string;
  storeId: string;
  kind: StorefrontAssetKind;
  objectKey: string;
  publicUrl: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width: number;
  height: number;
  byteSize: number;
  status: StorefrontAssetStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  version: number;
}>;
