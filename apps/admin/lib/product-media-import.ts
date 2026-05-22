import { mirrorRemoteImageToR2, toStorageFolderSlug } from "@/lib/remote-image-mirror";

type JsonObject = Record<string, unknown>;

interface MirrorProductMediaOptions {
    slug?: string;
    productName?: string;
    imageUrls?: string[];
    imagesV2?: JsonObject[];
    variants?: JsonObject[];
}

interface MirrorProductMediaResult {
    imageUrls?: string[];
    imagesV2?: JsonObject[];
    variants?: JsonObject[];
}

function dedupeUrlList(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];

    values.forEach((value) => {
        if (typeof value !== "string") {
            return;
        }

        const normalized = value.trim();
        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        deduped.push(normalized);
    });

    return deduped;
}

function dedupeImagesV2(images: JsonObject[]): JsonObject[] {
    const seen = new Set<string>();
    const deduped = images.filter((image) => {
        const url = typeof image.url === "string" ? image.url.trim() : "";
        if (!url || seen.has(url)) {
            return false;
        }

        seen.add(url);
        return true;
    });

    return deduped.map((image, index) => ({
        ...image,
        is_primary: index === 0,
        sort_order: index,
    }));
}

function dedupeVariantMedia(variants: JsonObject[]): JsonObject[] {
    return variants.map((variant) => {
        const nextVariant = { ...variant };
        if (Array.isArray(nextVariant.images)) {
            nextVariant.images = dedupeUrlList(nextVariant.images as Array<string | null | undefined>);
        }

        return nextVariant;
    });
}

async function mirrorImageUrlToR2(
    sourceUrl: string,
    folder: string,
    fileBase: string,
    cache: Map<string, string>
): Promise<string> {
    return mirrorRemoteImageToR2(sourceUrl, {
        folder,
        fileBase,
        cache,
    });
}

async function mirrorImageUrlToR2BestEffort(
    sourceUrl: string,
    folder: string,
    fileBase: string,
    cache: Map<string, string>
): Promise<string | null> {
    try {
        return await mirrorImageUrlToR2(sourceUrl, folder, fileBase, cache);
    } catch (error) {
        console.warn("Skipping remote image during product import:", {
            sourceUrl,
            folder,
            fileBase,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function mirrorAttributeImageUrls(
    attributes: unknown[],
    folder: string,
    fileBase: string,
    cache: Map<string, string>
): Promise<unknown[]> {
    return Promise.all(
        attributes.map(async (attribute, index) => {
            if (!attribute || typeof attribute !== "object" || Array.isArray(attribute)) {
                return attribute;
            }

            const nextAttribute = { ...(attribute as JsonObject) };
            if (typeof nextAttribute.image_url === "string") {
                nextAttribute.image_url = await mirrorImageUrlToR2BestEffort(
                    nextAttribute.image_url,
                    folder,
                    `${fileBase}-attribute-${index + 1}`,
                    cache
                );
            }

            return nextAttribute;
        })
    );
}

export async function mirrorImportedProductMediaToR2(
    options: MirrorProductMediaOptions
): Promise<MirrorProductMediaResult> {
    const cache = new Map<string, string>();
    const folderSlug = toStorageFolderSlug(options.slug || options.productName || "urun");
    const folderRoot = `products/imported/${folderSlug}`;

    const mirroredImagesV2 = options.imagesV2
        ? (
              await Promise.all(
                  options.imagesV2.map(async (image, index) => {
                      const nextImage = { ...image };
                      if (typeof nextImage.url === "string") {
                          const mirroredUrl = await mirrorImageUrlToR2BestEffort(
                              nextImage.url,
                              folderRoot,
                              `${folderSlug}-${index + 1}`,
                              cache
                          );
                          if (!mirroredUrl) {
                              return null;
                          }

                          nextImage.url = mirroredUrl;
                      }
                      return nextImage;
                  })
              )
          )
              .filter((image): image is JsonObject => Boolean(image))
        : undefined;

    const dedupedImagesV2 = mirroredImagesV2 ? dedupeImagesV2(mirroredImagesV2) : undefined;

    const mirroredImageUrls = options.imageUrls
        ? (
              await Promise.all(
                  options.imageUrls.map((url, index) =>
                      mirrorImageUrlToR2BestEffort(
                          url,
                          folderRoot,
                          `${folderSlug}-${index + 1}`,
                          cache
                      )
                  )
              )
          ).filter((url): url is string => Boolean(url))
        : dedupedImagesV2?.map((image) => String(image.url || "")).filter(Boolean);

    const imageUrls = mirroredImageUrls ? dedupeUrlList(mirroredImageUrls) : undefined;

    const mirroredVariants = options.variants
        ? await Promise.all(
              options.variants.map(async (variant, variantIndex) => {
                  const nextVariant = { ...variant };
                  const variantFolder = `${folderRoot}/variants`;
                  const variantBase = `${folderSlug}-variant-${variantIndex + 1}`;

                  if (Array.isArray(nextVariant.images)) {
                      nextVariant.images = (
                          await Promise.all(
                              nextVariant.images.map((image, imageIndex) =>
                                  typeof image === "string"
                                      ? mirrorImageUrlToR2BestEffort(
                                            image,
                                            variantFolder,
                                            `${variantBase}-${imageIndex + 1}`,
                                            cache
                                        )
                                      : Promise.resolve(image)
                              )
                          )
                      ).filter(Boolean);
                  }

                  if (Array.isArray(nextVariant.attributes)) {
                      nextVariant.attributes = await mirrorAttributeImageUrls(
                          nextVariant.attributes,
                          variantFolder,
                          variantBase,
                          cache
                      );
                  }

                  return nextVariant;
              })
          )
        : undefined;

    const variants = mirroredVariants ? dedupeVariantMedia(mirroredVariants) : undefined;

    return {
        imageUrls,
        imagesV2: dedupedImagesV2,
        variants,
    };
}
