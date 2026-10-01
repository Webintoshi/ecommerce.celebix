import type { PublicProduct, PublicProductMedia } from "./types.ts";

/** Public media contains active images only; gallery assignments never create media. */
export function resolvePublicProductVariantMedia(
  product: Pick<PublicProduct, "id" | "media" | "variants">,
  variantId?: string | null,
): readonly PublicProductMedia[] {
  const media = product.media.filter((image) => image.productId === product.id);
  const ordered = [...media].sort((left, right) => left.sortOrder - right.sortOrder);
  const fallback = ordered;
  const variant = product.variants.find(({ id }) => id === variantId);
  if (!variant) return Object.freeze(fallback);
  if (variant.mediaIds !== undefined) {
    const byId = new Map(media.map((image) => [image.id, image]));
    const assigned = variant.mediaIds.flatMap((id) => {
      const image = byId.get(id);
      return image ? [image] : [];
    });
    return Object.freeze(assigned.length ? assigned : fallback);
  }
  const legacy = ordered.filter((image) => image.variantId === variant.id);
  return Object.freeze(legacy.length ? legacy : fallback);
}

/** Keep the current photo across variant changes even when its gallery position changes. */
export function resolveProductGallerySelection(
  images: readonly Readonly<{ id: string }>[],
  currentMediaId: string | null,
): string | null {
  return images.some(({ id }) => id === currentMediaId) ? currentMediaId : images[0]?.id ?? null;
}
