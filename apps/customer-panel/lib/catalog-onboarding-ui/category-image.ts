/** Center framing for the category media pipeline. No file is changed until upload. */
export function categoryImageFrame(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
    throw new TypeError("category_image_dimensions_invalid");
  }
  const ratio = 3 / 4;
  const sourceWidth = Math.min(width, height * ratio);
  const sourceHeight = Math.min(height, width / ratio);
  const scale = Math.max(1, Math.min(512, Math.floor(sourceWidth / 3), Math.floor(sourceHeight / 4)));
  return Object.freeze({
    sourceX: (width - sourceWidth) / 2,
    sourceY: (height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    width: scale * 3,
    height: scale * 4,
  });
}

export function categoryImageFileError(file: Pick<File, "type" | "size">): string | undefined {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "JPG, PNG veya WebP seçin.";
  if (file.size < 1 || file.size > 5_242_880) return "Görsel en fazla 5 MB olabilir.";
  return undefined;
}
