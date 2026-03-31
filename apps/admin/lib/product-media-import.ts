import { isCurrentStoreR2Url, isR2Configured, uploadToR2 } from "@/lib/r2";

const REMOTE_IMAGE_TIMEOUT_MS = 25_000;
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;

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

function toFolderSlug(value: string | undefined): string {
    const normalized = (value || "urun")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || "urun";
}

function isRemoteHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function sanitizeFileSegment(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";
}

function extensionFromContentType(contentType: string | null): string {
    const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
    switch (normalized) {
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/png":
            return "png";
        case "image/webp":
            return "webp";
        case "image/avif":
            return "avif";
        case "image/gif":
            return "gif";
        case "image/svg+xml":
            return "svg";
        default:
            return "";
    }
}

function extensionFromUrl(value: string): string {
    try {
        const pathname = new URL(value).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
        return match?.[1]?.toLowerCase() || "";
    } catch {
        return "";
    }
}

function buildImportFileName(sourceUrl: string, fileBase: string, contentType: string | null): string {
    const requestedName = (() => {
        try {
            const pathname = new URL(sourceUrl).pathname;
            return pathname.split("/").filter(Boolean).pop() || "";
        } catch {
            return "";
        }
    })();

    const baseNameFromUrl = requestedName.replace(/\.[^/.]+$/, "");
    const baseName = sanitizeFileSegment(baseNameFromUrl || fileBase);
    const extension = extensionFromContentType(contentType) || extensionFromUrl(sourceUrl) || "jpg";

    return `${baseName}.${extension}`;
}

async function fetchRemoteImage(sourceUrl: string): Promise<{ buffer: Buffer; contentType: string | null; }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

    try {
        const response = await fetch(sourceUrl, {
            headers: {
                accept: "image/*,*/*;q=0.8",
                "user-agent": "CelebixProductImporter/1.0",
            },
            redirect: "follow",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`uzak sunucu ${response.status} dondu`);
        }

        const contentType = response.headers.get("content-type");
        const contentLength = Number(response.headers.get("content-length") || 0);
        if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error(`gorsel boyutu limitin uzerinde (${Math.round(contentLength / 1024 / 1024)} MB)`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) {
            throw new Error("gorsel bos dondu");
        }

        if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
            throw new Error(`gorsel boyutu limitin uzerinde (${Math.round(buffer.length / 1024 / 1024)} MB)`);
        }

        const looksLikeImage =
            (contentType || "").toLowerCase().startsWith("image/") ||
            Boolean(extensionFromUrl(sourceUrl));

        if (!looksLikeImage) {
            throw new Error("URL gecerli bir gorsel donmedi");
        }

        return { buffer, contentType };
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("gorsel indirme zaman asimina ugradi");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function mirrorImageUrlToR2(
    sourceUrl: string,
    folder: string,
    fileBase: string,
    cache: Map<string, string>
): Promise<string> {
    const normalizedUrl = sourceUrl.trim();
    if (!normalizedUrl || !isRemoteHttpUrl(normalizedUrl) || isCurrentStoreR2Url(normalizedUrl)) {
        return normalizedUrl;
    }

    const cached = cache.get(normalizedUrl);
    if (cached) {
        return cached;
    }

    if (!isR2Configured()) {
        throw new Error("Bu magazada R2 ayarlari eksik oldugu icin import gorselleri storage'a tasinamadi.");
    }

    const { buffer, contentType } = await fetchRemoteImage(normalizedUrl);
    const uploadResult = await uploadToR2(
        buffer,
        buildImportFileName(normalizedUrl, fileBase, contentType),
        contentType || "application/octet-stream",
        folder
    );

    if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "R2 upload basarisiz oldu");
    }

    cache.set(normalizedUrl, uploadResult.url);
    return uploadResult.url;
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
                nextAttribute.image_url = await mirrorImageUrlToR2(
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
    const folderRoot = `products/imported/${toFolderSlug(options.slug || options.productName)}`;

    const imagesV2 = options.imagesV2
        ? await Promise.all(
              options.imagesV2.map(async (image, index) => {
                  const nextImage = { ...image };
                  if (typeof nextImage.url === "string") {
                      nextImage.url = await mirrorImageUrlToR2(
                          nextImage.url,
                          folderRoot,
                          `${toFolderSlug(options.slug || options.productName)}-${index + 1}`,
                          cache
                      );
                  }
                  return nextImage;
              })
          )
        : undefined;

    const imageUrls = options.imageUrls
        ? await Promise.all(
              options.imageUrls.map((url, index) =>
                  mirrorImageUrlToR2(
                      url,
                      folderRoot,
                      `${toFolderSlug(options.slug || options.productName)}-${index + 1}`,
                      cache
                  )
              )
          )
        : imagesV2?.map((image) => String(image.url || "")).filter(Boolean);

    const variants = options.variants
        ? await Promise.all(
              options.variants.map(async (variant, variantIndex) => {
                  const nextVariant = { ...variant };
                  const variantFolder = `${folderRoot}/variants`;
                  const variantBase = `${toFolderSlug(options.slug || options.productName)}-variant-${variantIndex + 1}`;

                  if (Array.isArray(nextVariant.images)) {
                      nextVariant.images = await Promise.all(
                          nextVariant.images.map((image, imageIndex) =>
                              typeof image === "string"
                                  ? mirrorImageUrlToR2(image, variantFolder, `${variantBase}-${imageIndex + 1}`, cache)
                                  : Promise.resolve(image)
                          )
                      );
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
