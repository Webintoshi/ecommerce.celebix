export const DEFAULT_IMAGE_TRANSFORMATION_URL = "https://images.celebix.co";

export function resolveImageTransformationUrl(configuredValue?: string | null): string {
  const normalizedValue = configuredValue?.trim().replace(/\/+$/, "");
  return normalizedValue || DEFAULT_IMAGE_TRANSFORMATION_URL;
}

export function getConfiguredImageTransformationUrl(): string {
  return resolveImageTransformationUrl(
    process.env.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL ??
      process.env.CELEBIX_IMAGE_TRANSFORMATION_URL,
  );
}
