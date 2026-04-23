import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { Product, ProductVariant } from "@/types/product";

type LegacyProductImage = string | { url?: string | null };

type ProductWithLegacyImages = Product & {
  images_v2?: LegacyProductImage[];
};

type VariantWithAttributeImages = ProductVariant & {
  attributes?: Array<{ image_url?: string | null }>;
};

function collectImageUrls(images: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return images
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => {
      if (!image || seen.has(image)) {
        return false;
      }

      seen.add(image);
      return true;
    });
}

function getLegacyProductImages(product: ProductWithLegacyImages) {
  const legacyImagesV2 =
    Array.isArray(product.imagesV2) && product.imagesV2.length > 0
      ? product.imagesV2.map((image) => image?.url ?? "")
      : [];

  const legacyImagesSnakeCase = Array.isArray(product.images_v2)
    ? product.images_v2.map((image) =>
        typeof image === "string" ? image : image?.url ?? ""
      )
    : [];

  return [...legacyImagesV2, ...legacyImagesSnakeCase];
}

export function getResolvedProductImages(
  product: ProductWithLegacyImages,
  variant?: ProductVariant | null
) {
  const variantWithAttributeImages = variant as VariantWithAttributeImages | undefined;
  const variantImages = Array.isArray(variant?.images) ? variant.images : [];
  const attributeImages = Array.isArray(variantWithAttributeImages?.attributes)
    ? variantWithAttributeImages.attributes.map((attribute) => attribute.image_url ?? "")
    : [];
  const productImages =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : getLegacyProductImages(product);

  return collectImageUrls([...variantImages, ...attributeImages, ...productImages]);
}

export function getPrimaryResolvedProductImage(
  product: ProductWithLegacyImages,
  variant?: ProductVariant | null
) {
  return getResolvedProductImages(product, variant)[0] ?? "";
}
