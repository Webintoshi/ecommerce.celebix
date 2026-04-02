export type SupportedImageMimeType =
  | "image/avif"
  | "image/webp"
  | "image/svg+xml"
  | "image/png"
  | "image/jpeg"
  | "image/gif";

const MIME_BY_EXTENSION: Record<string, SupportedImageMimeType> = {
  avif: "image/avif",
  webp: "image/webp",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
};

export const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = [
  "image/avif",
  "image/webp",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/gif",
] as const;

export const SUPPORTED_IMAGE_ACCEPT = [
  "image/avif",
  "image/webp",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/gif",
  ".avif",
  ".webp",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
].join(",");

export const SUPPORTED_IMAGE_FORMATS_LABEL = "AVIF, WebP, SVG, PNG, JPG/JPEG";
export const SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL = `${SUPPORTED_IMAGE_FORMATS_LABEL}, GIF`;

export function normalizeSupportedImageMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): SupportedImageMimeType | null {
  const normalizedMimeType = (mimeType ?? "").trim().toLocaleLowerCase("en-US");

  if (normalizedMimeType === "image/jpg") {
    return "image/jpeg";
  }

  if (SUPPORTED_IMAGE_MIME_TYPES.includes(normalizedMimeType as SupportedImageMimeType)) {
    return normalizedMimeType as SupportedImageMimeType;
  }

  const normalizedFileName = (fileName ?? "").trim().toLocaleLowerCase("en-US");
  const extensionMatch = normalizedFileName.match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch?.[1];

  if (!extension) {
    return null;
  }

  return MIME_BY_EXTENSION[extension] ?? null;
}

export function isSupportedImageMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): boolean {
  return normalizeSupportedImageMimeType(mimeType, fileName) !== null;
}

export function isSvgImageMimeType(
  mimeType?: string | null,
  fileName?: string | null,
): boolean {
  return normalizeSupportedImageMimeType(mimeType, fileName) === "image/svg+xml";
}

export function getImageFormatLabel(mimeType: SupportedImageMimeType): string {
  switch (mimeType) {
    case "image/svg+xml":
      return "svg";
    case "image/jpeg":
      return "jpg";
    case "image/avif":
      return "avif";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    default:
      return "image";
  }
}
