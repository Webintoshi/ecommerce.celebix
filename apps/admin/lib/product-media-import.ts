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

    const imagesV2 = options.imagesV2
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
              .map((image, index) => ({
                  ...image,
                  is_primary: index === 0,
                  sort_order: index,
              }))
        : undefined;

    const imageUrls = options.imageUrls
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
        : imagesV2?.map((image) => String(image.url || "")).filter(Boolean);

    const variants = options.variants
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

    return {
        imageUrls,
        imagesV2,
        variants,
    };
}
