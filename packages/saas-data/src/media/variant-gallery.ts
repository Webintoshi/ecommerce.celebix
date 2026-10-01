import type { ProductVariantGallery, ProductVariantGalleryAssignment } from "../../../saas-contracts/src/media/variant-gallery.ts";
import type { MediaAuthorityInput } from "./types.ts";

export type ListProductVariantGalleryInput = MediaAuthorityInput & Readonly<{ productId: string }>;
export type SaveProductVariantGalleryInput = ListProductVariantGalleryInput & Readonly<{
  operationId: string;
  expectedVersion: number;
  assignments: readonly ProductVariantGalleryAssignment[];
}>;
export interface ProductVariantGalleryRepository {
  listVariantGallery(input: ListProductVariantGalleryInput): Promise<ProductVariantGallery>;
  saveVariantGallery(input: SaveProductVariantGalleryInput): Promise<Readonly<{ gallery: ProductVariantGallery; replayed: boolean }>>;
}
